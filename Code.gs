/**
 * Zoom Scheduler Web App (Google Apps Script)
 * Sheets:
 *  - data (schedule)
 *  - Potential
 */

const CONFIG = {
  scheduleSheet: 'data',
  potentialSheet: 'Potential',
  timezone: Session.getScriptTimeZone() || 'Asia/Jerusalem',
  zooms: [
    { name: 'Zoom1', link: 'https://zoom.us/j/6023602336?omn=96962875568' },
    { name: 'Zoom2', link: 'https://zoom.us/j/7601360450?omn=98989531483' },
    { name: 'Zoom3', link: 'https://zoom.us/j/5274325600?omn=96368524491' }
  ],
  allowedSlots: new Set([
    '08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00',
    '12:00-13:00', '13:00-14:00', '14:00-15:00', '15:00-16:00',
    '08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00'
  ])
};

function doGet(e) {
  try {
    const action = clean_(e && e.parameter && e.parameter.action).toLowerCase();
    if (action === 'schedule') {
      return jsonResponse({ success: true, data: readAllRows_(CONFIG.scheduleSheet) });
    }
    if (action === 'potential') {
      return jsonResponse({ success: true, data: readAllRows_(CONFIG.potentialSheet) });
    }
    return jsonResponse({ success: false, reason: 'invalid action' }, 400);
  } catch (err) {
    return jsonResponse({ success: false, reason: err.message }, 500);
  }
}

function doPost(e) {
  try {
    const payload = getRequestPayload_(e);
    const action = clean_(payload.action).toLowerCase();

    if (action === 'assign') {
      return jsonResponse(assignZoom(payload.id));
    }
    if (action === 'updatepotential') {
      return jsonResponse(updatePotential_(payload));
    }
    if (action === 'delete') {
      return jsonResponse(deleteRowById_(payload.sheet || CONFIG.scheduleSheet, payload.id));
    }
    if (action === 'clear') {
      return jsonResponse(clearSheet_(payload.sheet || CONFIG.scheduleSheet));
    }

    return jsonResponse({ success: false, reason: 'invalid action' }, 400);
  } catch (err) {
    return jsonResponse({ success: false, reason: err.message }, 500);
  }
}

function doOptions() {
  return jsonResponse({ success: true, message: 'ok' });
}

function assignZoom(potentialId) {
  const potential = getPotentialRowById(potentialId);
  if (!potential) return { success: false, reason: 'potential not found' };
  if (asBoolean_(potential.completed)) return { success: false, reason: 'already completed' };

  const date = normalizeDateString_(potential.date);
  const instructor = clean_(potential.employee);
  const school = clean_(potential.school);
  const course = clean_(potential.program);

  const roundedStart = roundStartTime(potential.startTime);
  const roundedEnd = roundEndTime(potential.endTime);
  if (!roundedStart || !roundedEnd) return { success: false, reason: 'invalid time' };

  const slotKey = roundedStart + '-' + roundedEnd;
  if (!CONFIG.allowedSlots.has(slotKey)) {
    return { success: false, reason: 'invalid allowed slot' };
  }

  const startMin = parseTime(roundedStart);
  const endMin = parseTime(roundedEnd);
  if (endMin <= startMin) return { success: false, reason: 'invalid time range' };

  const scheduleRows = readAllRows_(CONFIG.scheduleSheet).map(normalizeScheduleRow_);
  if (hasConflict(scheduleRows, {
    date: date,
    startTime: roundedStart,
    endTime: roundedEnd,
    instructor: instructor
  }, 'instructor')) {
    return { success: false, reason: 'instructor conflict' };
  }

  const zoomCandidate = getAvailableZoom(scheduleRows, {
    date: date,
    startTime: roundedStart,
    endTime: roundedEnd,
    instructor: instructor
  });

  if (!zoomCandidate) return { success: false, reason: 'no available slot' };

  const scheduleId = clean_(potential.id) || newId_();
  appendScheduleRow_({
    id: scheduleId,
    date: date,
    startTime: roundedStart,
    endTime: roundedEnd,
    instructor: instructor,
    zoom: zoomCandidate.name,
    zoomLink: zoomCandidate.link,
    school: school,
    course: course,
    updatedAt: nowStamp_()
  });

  updatePotentialBySheetRow_(potential._rowNumber, {
    completed: true,
    updatedAt: nowStamp_()
  });

  return { success: true, zoom: zoomCandidate.name };
}

function getPotentialRowById(id) {
  const wanted = clean_(id);
  if (!wanted) return null;
  const rows = readAllRows_(CONFIG.potentialSheet);
  for (var i = 0; i < rows.length; i++) {
    if (clean_(rows[i].id) === wanted) return rows[i];
  }
  return null;
}

function roundStartTime(value) {
  const minutes = parseTime(value);
  if (minutes == null) return '';
  const rounded = Math.floor(minutes / 60) * 60;
  return formatTime(rounded);
}

function roundEndTime(value) {
  const minutes = parseTime(value);
  if (minutes == null) return '';
  const rounded = Math.ceil(minutes / 60) * 60;
  return formatTime(rounded);
}

function parseTime(value) {
  return parseTime_(value);
}

function formatTime(minutes) {
  return formatTime_(minutes);
}

function getAvailableZoom(scheduleRows, candidate) {
  const preferredZoom = getInstructorAdjacentZoom_(scheduleRows, candidate);
  if (preferredZoom && !hasConflict(scheduleRows, candidate, 'zoom', preferredZoom)) {
    return CONFIG.zooms.find(function(z) { return z.name === preferredZoom; }) || null;
  }

  for (var i = 0; i < CONFIG.zooms.length; i++) {
    const zoom = CONFIG.zooms[i];
    if (!hasConflict(scheduleRows, candidate, 'zoom', zoom.name)) {
      return zoom;
    }
  }
  return null;
}

function hasConflict(scheduleRows, candidate, type, forcedValue) {
  const cStart = parseTime(candidate.startTime);
  const cEnd = parseTime(candidate.endTime);
  if (cStart == null || cEnd == null) return true;

  for (var i = 0; i < scheduleRows.length; i++) {
    const row = scheduleRows[i];
    if (clean_(row.date) !== clean_(candidate.date)) continue;

    const rStart = parseTime(row.startTime);
    const rEnd = parseTime(row.endTime);
    if (rStart == null || rEnd == null) continue;

    const overlap = cStart < rEnd && cEnd > rStart;
    if (!overlap) continue;

    if (type === 'instructor' && clean_(row.instructor) === clean_(candidate.instructor)) {
      return true;
    }
    if (type === 'zoom') {
      const zoomName = clean_(forcedValue || candidate.zoom);
      if (zoomName && clean_(row.zoom) === zoomName) return true;
    }
  }
  return false;
}

function clean_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseTime_(value) {
  if (value instanceof Date) {
    return value.getHours() * 60 + value.getMinutes();
  }
  const s = clean_(value);
  if (!s) return null;

  const iso = s.match(/T(\d{2}):(\d{2})/);
  if (iso) {
    const hIso = Number(iso[1]);
    const mIso = Number(iso[2]);
    if (Number.isFinite(hIso) && Number.isFinite(mIso)) return hIso * 60 + mIso;
  }

  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;

  const h = Number(m[1]);
  const mins = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mins)) return null;
  if (h < 0 || h > 24 || mins < 0 || mins > 59) return null;
  if (h === 24 && mins !== 0) return null;
  return h * 60 + mins;
}

function formatTime_(minutes) {
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
}

function newId_() {
  return Utilities.getUuid();
}

function jsonResponse(payload, statusCode) {
  const body = {
    status: statusCode || 200,
    headers: corsHeaders_(),
    ...payload
  };
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function corsHeaders_() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function getRequestPayload_(e) {
  if (!e) return {};
  let body = {};
  if (e.postData && e.postData.contents) {
    const raw = clean_(e.postData.contents);
    if (raw) {
      try { body = JSON.parse(raw); } catch (err) { body = {}; }
    }
  }
  return Object.assign({}, e.parameter || {}, body);
}

function readAllRows_(sheetName) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];

  const headers = values[0].map(function(h) { return clean_(h); });
  const rows = [];
  for (var r = 1; r < values.length; r++) {
    const row = {};
    for (var c = 0; c < headers.length; c++) {
      row[headers[c]] = values[r][c];
    }
    row._rowNumber = r + 1;
    rows.push(row);
  }
  return rows;
}

function appendScheduleRow_(payload) {
  const sheet = getSheet_(CONFIG.scheduleSheet);
  const headerMap = getHeaderMap_(sheet);
  const row = new Array(sheet.getLastColumn()).fill('');

  Object.keys(payload).forEach(function(key) {
    const idx = headerMap[key];
    if (idx !== undefined) row[idx] = payload[key];
  });

  sheet.appendRow(row);
}

function updatePotentialBySheetRow_(rowNumber, fields) {
  const sheet = getSheet_(CONFIG.potentialSheet);
  const headerMap = getHeaderMap_(sheet);

  Object.keys(fields).forEach(function(key) {
    const idx = headerMap[key];
    if (idx !== undefined) {
      sheet.getRange(rowNumber, idx + 1).setValue(fields[key]);
    }
  });
}

function updatePotential_(payload) {
  const row = getPotentialRowById(payload.id);
  if (!row) return { success: false, reason: 'potential not found' };

  const allowed = ['date', 'authority', 'school', 'program', 'employee', 'startTime', 'endTime', 'notes', 'completed'];
  const updates = {};

  allowed.forEach(function(key) {
    if (payload[key] !== undefined) updates[key] = payload[key];
  });
  updates.updatedAt = nowStamp_();

  updatePotentialBySheetRow_(row._rowNumber, updates);
  return { success: true };
}

function deleteRowById_(sheetName, id) {
  const sheet = getSheet_(sheetName);
  const rows = readAllRows_(sheetName);
  const wanted = clean_(id);
  if (!wanted) return { success: false, reason: 'missing id' };

  for (var i = 0; i < rows.length; i++) {
    if (clean_(rows[i].id) === wanted) {
      sheet.deleteRow(rows[i]._rowNumber);
      return { success: true };
    }
  }
  return { success: false, reason: 'id not found' };
}

function clearSheet_(sheetName) {
  const sheet = getSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return { success: true, cleared: 0 };

  const cleared = lastRow - 1;
  sheet.getRange(2, 1, cleared, lastCol).clearContent();
  return { success: true, cleared: cleared };
}

function getInstructorAdjacentZoom_(scheduleRows, candidate) {
  const candidateStart = parseTime(candidate.startTime);
  const candidateEnd = parseTime(candidate.endTime);
  if (candidateStart == null || candidateEnd == null) return '';

  for (var i = 0; i < scheduleRows.length; i++) {
    const row = scheduleRows[i];
    if (clean_(row.date) !== clean_(candidate.date)) continue;
    if (clean_(row.instructor) !== clean_(candidate.instructor)) continue;

    const rowStart = parseTime(row.startTime);
    const rowEnd = parseTime(row.endTime);
    if (rowStart == null || rowEnd == null) continue;

    if (rowEnd === candidateStart || rowStart === candidateEnd) {
      return clean_(row.zoom);
    }
  }
  return '';
}

function normalizeScheduleRow_(row) {
  return {
    id: clean_(row.id),
    date: normalizeDateString_(row.date),
    startTime: normalizeTimeValue_(row.startTime),
    endTime: normalizeTimeValue_(row.endTime),
    instructor: clean_(row.instructor),
    zoom: clean_(row.zoom),
    zoomLink: clean_(row.zoomLink),
    school: clean_(row.school),
    course: clean_(row.course),
    updatedAt: row.updatedAt
  };
}

function normalizeDateString_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, CONFIG.timezone, 'yyyy-MM-dd');
  }
  const str = clean_(value);
  if (!str) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const d = ('0' + dmy[1]).slice(-2);
    const m = ('0' + dmy[2]).slice(-2);
    return dmy[3] + '-' + m + '-' + d;
  }

  return str;
}

function normalizeTimeValue_(value) {
  const minutes = parseTime(value);
  return minutes == null ? clean_(value) : formatTime(minutes);
}

function getSheet_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('sheet not found: ' + sheetName);
  return sheet;
}

function getHeaderMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  for (var i = 0; i < headers.length; i++) {
    const key = clean_(headers[i]);
    if (key) map[key] = i;
  }
  return map;
}

function nowStamp_() {
  return Utilities.formatDate(new Date(), CONFIG.timezone, "yyyy-MM-dd'T'HH:mm:ss");
}

function asBoolean_(value) {
  if (value === true) return true;
  const normalized = clean_(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}
