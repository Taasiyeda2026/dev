var SheetService = (function () {
  function getSheet(sheetName, required) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet && required) {
      throw new Error('missing_sheet');
    }
    return sheet;
  }

  function getHeaders(sheet) {
    var lastColumn = sheet.getLastColumn();
    if (lastColumn < 1) return [];
    return sheet.getRange(CONFIG.STRUCTURE.HEADER_ROW, 1, 1, lastColumn).getValues()[0].map(Utils.normalize);
  }

  function getDisplayHeaders(sheet) {
    var lastColumn = sheet.getLastColumn();
    if (lastColumn < 1) return [];
    return sheet.getRange(CONFIG.STRUCTURE.DISPLAY_ROW, 1, 1, lastColumn).getValues()[0].map(Utils.normalize);
  }

  function resolveIndex(headers, aliases) {
    var map = {};
    headers.forEach(function (header, idx) {
      map[Utils.toKey(header)] = idx;
    });
    for (var i = 0; i < aliases.length; i += 1) {
      var idx = map[Utils.toKey(aliases[i])];
      if (idx !== undefined) return idx;
    }
    return -1;
  }

  function readTable(sheetName, required) {
    var sheet = getSheet(sheetName, required);
    if (!sheet) return { headers: [], displayHeaders: [], rows: [], rowNumbers: [], sheet: null };

    var headers = getHeaders(sheet);
    var displayHeaders = getDisplayHeaders(sheet);
    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();

    if (lastRow < CONFIG.STRUCTURE.DATA_START_ROW || lastColumn < 1) {
      return { headers: headers, displayHeaders: displayHeaders, rows: [], rowNumbers: [], sheet: sheet };
    }

    var numRows = lastRow - CONFIG.STRUCTURE.DATA_START_ROW + 1;
    var allRows = sheet.getRange(CONFIG.STRUCTURE.DATA_START_ROW, 1, numRows, lastColumn).getValues();
    var rows = [];
    var rowNumbers = [];

    allRows.forEach(function (row, i) {
      var hasValue = row.some(function (cell) { return !Utils.isEmpty(cell); });
      if (!hasValue) return;
      rows.push(row);
      rowNumbers.push(CONFIG.STRUCTURE.DATA_START_ROW + i);
    });

    return { headers: headers, displayHeaders: displayHeaders, rows: rows, rowNumbers: rowNumbers, sheet: sheet };
  }

  function toObjects(table) {
    return table.rows.map(function (row, idx) {
      var obj = { _rowNumber: table.rowNumbers[idx] };
      table.headers.forEach(function (header, colIdx) {
        obj[header] = row[colIdx];
      });
      return obj;
    });
  }

  function appendRow(sheetName, rowValues) {
    var sheet = getSheet(sheetName, true);
    var nextRow = Math.max(sheet.getLastRow() + 1, CONFIG.STRUCTURE.DATA_START_ROW);
    sheet.getRange(nextRow, 1, 1, rowValues.length).setValues([rowValues]);
    return nextRow;
  }

  return {
    getSheet: getSheet,
    getHeaders: getHeaders,
    resolveIndex: resolveIndex,
    readTable: readTable,
    toObjects: toObjects,
    appendRow: appendRow
  };
})();
