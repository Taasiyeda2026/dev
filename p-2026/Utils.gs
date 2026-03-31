var Utils = (function () {
  function normalize(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function isEmpty(value) {
    return normalize(value) === '';
  }

  function toKey(value) {
    return normalize(value).toLowerCase();
  }

  function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function safeJson(value) {
    try { return JSON.stringify(value || {}); } catch (err) { return '{}'; }
  }

  function safeMessage(message) {
    return { success: false, message: message || 'הפעולה לא הושלמה.' };
  }

  function readTable(sheetName, required) {
    var sheet = getSheet(sheetName, required);
    if (!sheet) return { sheet: null, headers: [], displayHeaders: [], rows: [], rowNumbers: [] };

    var headers = getRowValues(sheet, CONFIG.STRUCTURE.HEADER_ROW);
    var displayHeaders = getRowValues(sheet, CONFIG.STRUCTURE.DISPLAY_ROW);
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastCol < 1 || lastRow < CONFIG.STRUCTURE.DATA_START_ROW) {
      return { sheet: sheet, headers: headers, displayHeaders: displayHeaders, rows: [], rowNumbers: [] };
    }

    var numRows = lastRow - CONFIG.STRUCTURE.DATA_START_ROW + 1;
    var all = sheet.getRange(CONFIG.STRUCTURE.DATA_START_ROW, 1, numRows, lastCol).getValues();
    var rows = [];
    var rowNumbers = [];
    all.forEach(function (row, i) {
      if (row.some(function (cell) { return !isEmpty(cell); })) {
        rows.push(row);
        rowNumbers.push(CONFIG.STRUCTURE.DATA_START_ROW + i);
      }
    });

    return { sheet: sheet, headers: headers, displayHeaders: displayHeaders, rows: rows, rowNumbers: rowNumbers };
  }

  function appendRow(sheetName, row) {
    var sheet = getSheet(sheetName, true);
    var next = Math.max(sheet.getLastRow() + 1, CONFIG.STRUCTURE.DATA_START_ROW);
    sheet.getRange(next, 1, 1, row.length).setValues([row]);
    return next;
  }

  function updateRow(sheetName, rowNumber, row) {
    var sheet = getSheet(sheetName, true);
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    return true;
  }

  function resolveIndex(headers, aliases) {
    var map = {};
    headers.forEach(function (h, i) { map[toKey(h)] = i; });
    for (var i = 0; i < aliases.length; i += 1) {
      var idx = map[toKey(aliases[i])];
      if (idx !== undefined) return idx;
    }
    return -1;
  }

  function ensureEditRequestsSheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.EDIT_REQUESTS);
    if (!sheet) sheet = ss.insertSheet(CONFIG.SHEETS.EDIT_REQUESTS);

    var headers = CONFIG.EDIT_REQUESTS_COLUMNS.SYSTEM;
    var display = CONFIG.EDIT_REQUESTS_COLUMNS.DISPLAY;
    sheet.getRange(CONFIG.STRUCTURE.HEADER_ROW, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(CONFIG.STRUCTURE.DISPLAY_ROW, 1, 1, display.length).setValues([display]);

    if (sheet.getLastColumn() > headers.length) {
      sheet.deleteColumns(headers.length + 1, sheet.getLastColumn() - headers.length);
    }

    return { sheetName: CONFIG.SHEETS.EDIT_REQUESTS, columns: headers.length };
  }

  function getSheet(sheetName, required) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet && required) throw new Error('missing_sheet');
    return sheet;
  }

  function getRowValues(sheet, rowNumber) {
    var cols = sheet.getLastColumn();
    if (cols < 1) return [];
    return sheet.getRange(rowNumber, 1, 1, cols).getValues()[0].map(normalize);
  }

  return {
    normalize: normalize,
    isEmpty: isEmpty,
    toKey: toKey,
    asObject: asObject,
    nowIso: nowIso,
    safeJson: safeJson,
    safeMessage: safeMessage,
    readTable: readTable,
    appendRow: appendRow,
    updateRow: updateRow,
    resolveIndex: resolveIndex,
    ensureEditRequestsSheet: ensureEditRequestsSheet
  };
})();
