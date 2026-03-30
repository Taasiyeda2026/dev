var SheetService = (function () {
  function getSpreadsheet() {
    return SpreadsheetApp.getActiveSpreadsheet();
  }

  function getSheetByName(sheetName, required) {
    var sheet = getSpreadsheet().getSheetByName(sheetName);
    if (!sheet && required) {
      throw new Error('הגיליון "' + sheetName + '" לא נמצא בקובץ.');
    }
    return sheet;
  }

  function getHeaders(sheet, headerRow) {
    var rowNumber = headerRow || 1;
    var lastColumn = sheet.getLastColumn();
    if (lastColumn === 0) return [];
    return sheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0].map(function (h) {
      return Utils.normalize(h);
    });
  }

  function getHeaderMap(sheet, headerRow) {
    var headers = getHeaders(sheet, headerRow);
    var map = {};
    headers.forEach(function (header, idx) {
      if (header) map[header] = idx;
    });
    return map;
  }

  function findHeaderIndex(headers, aliases) {
    for (var i = 0; i < aliases.length; i += 1) {
      var alias = Utils.normalize(aliases[i]);
      var idx = headers.indexOf(alias);
      if (idx !== -1) return idx;
    }
    return -1;
  }

  function resolveFieldIndexes(headers, aliasConfig) {
    var resolved = {};
    Object.keys(aliasConfig).forEach(function (fieldKey) {
      resolved[fieldKey] = findHeaderIndex(headers, aliasConfig[fieldKey]);
    });
    return resolved;
  }

  function getRecords(sheetName, required, options) {
    var sheet = getSheetByName(sheetName, required);
    if (!sheet) return { headers: [], rows: [], records: [] };

    var opts = options || {};
    var headerRow = opts.headerRow || 1;
    var dataStartRow = opts.dataStartRow || (headerRow + 1);

    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();
    var headers = getHeaders(sheet, headerRow);

    if (lastColumn === 0 || lastRow < dataStartRow) {
      return { headers: headers, rows: [], records: [] };
    }

    var numRows = lastRow - dataStartRow + 1;
    var rows = sheet.getRange(dataStartRow, 1, numRows, lastColumn).getValues().filter(function (row) {
      return row.some(function (cell) { return !Utils.isEmpty(cell); });
    });

    var records = rows.map(function (row) {
      var obj = {};
      headers.forEach(function (header, idx) {
        obj[header] = row[idx];
      });
      return obj;
    });

    return {
      headers: headers,
      rows: rows,
      records: records
    };
  }

  function countDataRows(sheetName) {
    var data = getRecords(sheetName, false);
    return data.rows.length;
  }

  function hasSheet(sheetName) {
    return !!getSheetByName(sheetName, false);
  }

  return {
    getSpreadsheet: getSpreadsheet,
    getSheetByName: getSheetByName,
    getHeaders: getHeaders,
    getHeaderMap: getHeaderMap,
    findHeaderIndex: findHeaderIndex,
    resolveFieldIndexes: resolveFieldIndexes,
    getRecords: getRecords,
    countDataRows: countDataRows,
    hasSheet: hasSheet
  };
})();
