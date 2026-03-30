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

  function getHeaders(sheet) {
    var lastColumn = sheet.getLastColumn();
    if (lastColumn === 0) return [];
    return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (h) {
      return Utils.normalize(h);
    });
  }

  function getHeaderMap(sheet) {
    var headers = getHeaders(sheet);
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

  function getRecords(sheetName, required) {
    var sheet = getSheetByName(sheetName, required);
    if (!sheet) return { headers: [], rows: [], records: [] };

    var range = sheet.getDataRange();
    var values = range.getValues();
    if (values.length <= 1) return { headers: getHeaders(sheet), rows: [], records: [] };

    var headers = values[0].map(function (h) { return Utils.normalize(h); });
    var rows = values.slice(1);

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
