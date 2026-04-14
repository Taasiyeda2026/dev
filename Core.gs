function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      service: 'p-2026-backend',
      message: 'Apps Script פועל כ-API בלבד. הממשק נמצא ב-Frontend של GitHub.'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var action = '';
  var payload = {};

  // Try URLSearchParams first (what the frontend sends)
  var params = e && e.parameter ? e.parameter : {};
  action = Utils.normalize(params.action || '');
  payload = buildPayloadFromParams_(params);

  // If no action found in params — try JSON body (future use)
  if (!action) {
    try {
      var body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
      action = Utils.normalize(body.action || '');
      if (!Object.keys(payload).length) {
        payload = Utils.asObject(body.payload, {});
      }
    } catch (err) {
      // Not valid JSON — continue with what we have
    }
  }

  var result = routeAction_(action, payload);
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildPayloadFromParams_(params) {
  var payload = {};
  if (!params) return payload;

  Object.keys(params).forEach(function(key) {
    if (key.indexOf('payload.') !== 0) return;
    var path = key.substring('payload.'.length);
    if (!path) return;
    setByPath_(payload, path.split('.'), params[key]);
  });

  return payload;
}

function setByPath_(target, segments, value) {
  if (!segments || !segments.length) return;
  var current = target;

  for (var i = 0; i < segments.length; i += 1) {
    var seg = segments[i];
    var isLast = i === segments.length - 1;
    var nextSeg = segments[i + 1];
    var nextIsIndex = /^\d+$/.test(nextSeg || '');

    if (isLast) {
      current[seg] = value;
      return;
    }

    if (!current[seg] || typeof current[seg] !== 'object') {
      current[seg] = nextIsIndex ? [] : {};
    }
    current = current[seg];
  }
}

function routeAction_(action, payload) {
  // ── Auth ────────────────────────────────────────────────────────────────────────────
  if (action === 'loginAction')              return loginAction(payload.userId, payload.code);
  if (action === 'logoutAction')             return logoutAction();
  if (action === 'getSessionProfileAction')  return getSessionProfileAction();

  // ── Dashboard ─────────────────────────────────────────────────────────────────────────
  if (action === 'getDashboardDataAction')   return getDashboardDataAction();

  // ── Activities (data sheet) ───────────────────────────────────────────────────────────
  if (action === 'getMyCoursesDataAction')   return getMyCoursesDataAction(payload);
  if (action === 'getSheetRows')             return getSheetRowsAction(payload);
  if (action === 'updateCourse')             return updateCourseAction(payload);
  if (action === 'createDataMasterRecordAction') return createDataMasterRecordAction(payload);

  // ── Operations / requests ──────────────────────────────────────────────────────────────
  if (action === 'submitEditRequestAction')  return submitEditRequestAction(payload);
  if (action === 'getMyRequestsDataAction')  return getMyRequestsDataAction(payload);
  if (action === 'getApprovalsDataAction')   return getApprovalsDataAction(payload);
  if (action === 'getEdenViewDataAction')    return getEdenViewDataAction(payload);
  if (action === 'approveRequestAction')     return approveRequestAction(payload);
  if (action === 'rejectRequestAction')      return rejectRequestAction(payload);
  if (action === 'createEditRequest')        return createEditRequestAction(payload);

  // ── Meetings ────────────────────────────────────────────────────────────────────────────
  if (action === 'getCourseMeetingsAction')  return getCourseMeetingsAction(payload);
  if (action === 'updateCourseMeetingAction') return updateCourseMeetingAction(payload);

  // ── Finance ───────────────────────────────────────────────────────────────────────────
  if (action === 'getFinanceDataAction')     return getFinanceDataAction(payload);
  if (action === 'getFinanceArchiveDataAction') return getFinanceArchiveDataAction(payload);
  if (action === 'updateFinanceStatusAction') return updateFinanceStatusAction(payload);
  if (action === 'syncFinanceAction')        return syncFinanceAction(payload);

  // ── Contacts ────────────────────────────────────────────────────────────────────────
  if (action === 'getContactsDataAction')    return getContactsDataAction(payload);

  // ── Lists ────────────────────────────────────────────────────────────────────────────
  if (action === 'getAllListsAction')         return getAllListsAction(payload);
  if (action === 'getListByNameAction')       return getListByNameAction(payload);

  // ── Settings ──────────────────────────────────────────────────────────────────────────
  if (action === 'getAllSettingsAction')      return getAllSettingsAction(payload);
  if (action === 'getSettingAction')          return getSettingAction(payload);

  return { success: false, message: 'פעולה לא נתמכת.' };
}

// ── Auth ──────────────────────────────────────────────────────────────────────────────────
// Auth
function loginAction(userId, code)     { return Logic.login(userId, code); }
function logoutAction()                { return Logic.logout(); }
function getSessionProfileAction()     { return Logic.getSessionProfile(); }

// ── Dashboard ───────────────────────────────────────────────────────────────────────────────
// Dashboard
function getDashboardDataAction()      { return Logic.getDashboardData(); }

// ── Activities ────────────────────────────────────────────────────────────────────────────────
// Activities
function getMyCoursesDataAction(f)     { return Logic.getMyCoursesData(f || {}); }
function getSheetRowsAction(p)         { return Logic.getSheetRows(p || {}); }
function updateCourseAction(p)         { return Logic.updateCourse(p || {}); }
function createDataMasterRecordAction(p){ return Logic.createDataMasterRecord(p || {}); }

// ── Operations / requests ───────────────────────────────────────────────────────────────────
// Operations / requests
function submitEditRequestAction(p)    { return Logic.submitEditRequest(p || {}); }
function getMyRequestsDataAction(p)    { return Logic.getMyRequestsData(p || {}); }
function getApprovalsDataAction(p)     { return Logic.getApprovalsData(p || {}); }
function getEdenViewDataAction(p)      { return Logic.getEdenViewData(p || {}); }
function approveRequestAction(p)       { return Logic.approveRequest(p || {}); }
function rejectRequestAction(p)        { return Logic.rejectRequest(p || {}); }
function createEditRequestAction(p)    { return Logic.createEditRequest(p || {}); }

// ── Meetings ───────────────────────────────────────────────────────────────────────────────
// Meetings
function getCourseMeetingsAction(p)    { return Logic.getCourseMeetings(p || {}); }
function updateCourseMeetingAction(p)  { return Logic.updateCourseMeeting(p || {}); }

// ── Finance ───────────────────────────────────────────────────────────────────────────────
// Finance
function getFinanceDataAction(p)       { return Logic.getFinanceData(p || {}); }
function getFinanceArchiveDataAction(p){ return Logic.getFinanceArchiveData(p || {}); }
function updateFinanceStatusAction(p)  { return Logic.updateFinanceStatus(p || {}); }
function syncFinanceAction(p)          { return Logic.syncFinance(p || {}); }

// ── Contacts ─────────────────────────────────────────────────────────────────────────────
// Contacts
function getContactsDataAction(p)      { return Logic.getContactsData(p || {}); }

// ── Lists ────────────────────────────────────────────────────────────────────────────────
// Lists
function getAllListsAction(p)           { return Logic.getAllLists(p || {}); }
function getListByNameAction(p)        { return Logic.getListByName((p || {}).listName || ''); }

// ── Settings ──────────────────────────────────────────────────────────────────────────────
// Settings
function getAllSettingsAction(p)        { return Logic.getAllSettings(p || {}); }
function getSettingAction(p)           { return { success: true, value: Logic.getSetting((p || {}).key, (p || {}).fallback) }; }


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('תחזוקה')
    .addItem('רענון FINANCE', 'rebuildFinanceSheet')
    .addToUi();
}

function rebuildFinanceSheet() {
  return Logic.rebuildFinanceSheet();
}
