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

  function asObject(value, fallback) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : (fallback || {});
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function safeMessage(message) {
    return { success: false, message: message || 'הפעולה לא בוצעה.' };
  }

  function safeJson(value) {
    try {
      return JSON.stringify(value || {});
    } catch (err) {
      return '{}';
    }
  }

  function parseJson(value) {
    try {
      return JSON.parse(normalize(value) || '{}');
    } catch (err) {
      return {};
    }
  }

  function getSheet(sheetName, required) {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet && required) throw new Error('missing_sheet_' + sheetName);
    return sheet;
  }

  function resolveIndex(headers, aliases) {
    var list = Array.isArray(aliases) ? aliases : [aliases];
    var map = {};
    headers.forEach(function (header, index) {
      map[toKey(header)] = index;
    });
    for (var i = 0; i < list.length; i += 1) {
      var found = map[toKey(list[i])];
      if (found !== undefined) return found;
    }
    return -1;
  }

  function readTable(sheetName, required) {
    var sheet = getSheet(sheetName, required);
    if (!sheet) return { sheet: null, headers: [], displayHeaders: [], rows: [], rowNumbers: [] };

    var lastColumn = sheet.getLastColumn();
    var lastRow = sheet.getLastRow();
    if (lastColumn < 1) return { sheet: sheet, headers: [], displayHeaders: [], rows: [], rowNumbers: [] };

    var headers = sheet.getRange(CONFIG.STRUCTURE.HEADER_ROW, 1, 1, lastColumn).getValues()[0].map(normalize);
    var displayHeaders = sheet.getRange(CONFIG.STRUCTURE.DISPLAY_ROW, 1, 1, lastColumn).getValues()[0].map(normalize);

    if (lastRow < CONFIG.STRUCTURE.DATA_START_ROW) {
      return { sheet: sheet, headers: headers, displayHeaders: displayHeaders, rows: [], rowNumbers: [] };
    }

    var numRows = lastRow - CONFIG.STRUCTURE.DATA_START_ROW + 1;
    var all = sheet.getRange(CONFIG.STRUCTURE.DATA_START_ROW, 1, numRows, lastColumn).getValues();
    var rows = [];
    var rowNumbers = [];

    all.forEach(function (row, offset) {
      var hasValue = row.some(function (cell) { return !isEmpty(cell); });
      if (!hasValue) return;
      rows.push(row);
      rowNumbers.push(CONFIG.STRUCTURE.DATA_START_ROW + offset);
    });

    return { sheet: sheet, headers: headers, displayHeaders: displayHeaders, rows: rows, rowNumbers: rowNumbers };
  }

  function rowsToObjects(table) {
    return table.rows.map(function (row, i) {
      var obj = { _rowNumber: table.rowNumbers[i] };
      table.headers.forEach(function (header, j) {
        obj[header] = row[j];
      });
      return obj;
    });
  }

  function appendRow(sheetName, rowValues) {
    var sheet = getSheet(sheetName, true);
    var rowNumber = Math.max(sheet.getLastRow() + 1, CONFIG.STRUCTURE.DATA_START_ROW);
    sheet.getRange(rowNumber, 1, 1, rowValues.length).setValues([rowValues]);
    return rowNumber;
  }

  function updateRow(sheetName, rowNumber, rowValues) {
    var sheet = getSheet(sheetName, true);
    sheet.getRange(rowNumber, 1, 1, rowValues.length).setValues([rowValues]);
    return rowNumber;
  }

  function ensureEditRequestsSheet() {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName(CONFIG.SHEETS.EDIT_REQUESTS);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(CONFIG.SHEETS.EDIT_REQUESTS);
    }

    var width = CONFIG.EDIT_REQUESTS_HEADER_ROW.length;
    if (sheet.getMaxColumns() < width) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
    }

    sheet.getRange(CONFIG.STRUCTURE.HEADER_ROW, 1, 1, width).setValues([CONFIG.EDIT_REQUESTS_HEADER_ROW]);
    sheet.getRange(CONFIG.STRUCTURE.DISPLAY_ROW, 1, 1, width).setValues([CONFIG.EDIT_REQUESTS_DISPLAY_ROW]);
    if (sheet.getLastColumn() > width) {
      sheet.deleteColumns(width + 1, sheet.getLastColumn() - width);
    }

    return {
      sheetName: CONFIG.SHEETS.EDIT_REQUESTS,
      headerRow: CONFIG.EDIT_REQUESTS_HEADER_ROW.slice(),
      displayRow: CONFIG.EDIT_REQUESTS_DISPLAY_ROW.slice()
    };
  }

  function validateRequired(value, message) {
    if (isEmpty(value)) throw new Error(message || 'missing_required');
  }

  return {
    normalize: normalize,
    isEmpty: isEmpty,
    toKey: toKey,
    asObject: asObject,
    nowIso: nowIso,
    safeMessage: safeMessage,
    safeJson: safeJson,
    parseJson: parseJson,
    getSheet: getSheet,
    resolveIndex: resolveIndex,
    readTable: readTable,
    rowsToObjects: rowsToObjects,
    appendRow: appendRow,
    updateRow: updateRow,
    ensureEditRequestsSheet: ensureEditRequestsSheet,
    validateRequired: validateRequired
  };
})();
