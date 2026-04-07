var Utils = (function () {
  var requestMemo = {};

  function normalize(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function normalizeWhitespace(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeName(value) {
    return normalizeWhitespace(value).toLowerCase();
  }

  function normalizeID(value) {
    var normalized = normalizeWhitespace(value).replace(/,/g, '');
    if (!normalized) return '';
    if (/^[+-]?\d+(\.0+)?$/.test(normalized)) return String(parseInt(normalized, 10));
    var asNumber = Number(normalized);
    if (!isNaN(asNumber) && isFinite(asNumber) && Math.floor(asNumber) === asNumber) {
      return String(asNumber);
    }
    return normalized;
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
    var options = arguments.length > 2 ? asObject(arguments[2], {}) : {};
    var requestMemoKey = options.requestMemoKey || ('table:' + sheetName + ':' + (required ? 'required' : 'optional'));
    if (!options.bypassRequestMemo && requestMemo[requestMemoKey]) {
      return cloneTable_(requestMemo[requestMemoKey]);
    }

    if (options.useScriptCache) {
      var cacheKey = normalize(options.cacheKey || ('sheet:' + sheetName));
      var ttl = Number(options.cacheTtlSeconds || 120);
      if (cacheKey && ttl > 0) {
        var cached = getScriptCacheJson_(cacheKey);
        if (cached && cached.headers && cached.rows) {
          cached.sheet = getSheet(sheetName, false);
          requestMemo[requestMemoKey] = cached;
          return cloneTable_(cached);
        }
      }
    }

    var sheet = getSheet(sheetName, required);
    if (!sheet) return { sheet: null, headers: [], displayHeaders: [], rows: [], rowNumbers: [] };

    var structure = resolveStructure_(sheetName);
    var lastColumn = sheet.getLastColumn();
    var lastRow = sheet.getLastRow();
    if (lastColumn < 1) return { sheet: sheet, headers: [], displayHeaders: [], rows: [], rowNumbers: [] };

    var headers = sheet.getRange(structure.headerRow, 1, 1, lastColumn).getValues()[0].map(normalize);
    var displayHeaders = structure.hasDisplayRow && lastRow >= structure.displayRow
      ? sheet.getRange(structure.displayRow, 1, 1, lastColumn).getValues()[0].map(normalize)
      : [];

    if (lastRow < structure.dataStartRow) {
      return { sheet: sheet, headers: headers, displayHeaders: displayHeaders, rows: [], rowNumbers: [] };
    }

    var numRows = lastRow - structure.dataStartRow + 1;
    var all = sheet.getRange(structure.dataStartRow, 1, numRows, lastColumn).getValues();
    var rows = [];
    var rowNumbers = [];

    all.forEach(function (row, offset) {
      var hasValue = row.some(function (cell) { return !isEmpty(cell); });
      if (!hasValue) return;
      rows.push(row);
      rowNumbers.push(structure.dataStartRow + offset);
    });

    var table = { sheet: sheet, headers: headers, displayHeaders: displayHeaders, rows: rows, rowNumbers: rowNumbers };
    requestMemo[requestMemoKey] = table;

    if (options.useScriptCache) {
      var scriptCacheKey = normalize(options.cacheKey || ('sheet:' + sheetName));
      var scriptCacheTtl = Number(options.cacheTtlSeconds || 120);
      if (scriptCacheKey && scriptCacheTtl > 0) {
        putScriptCacheJson_(scriptCacheKey, {
          headers: headers,
          displayHeaders: displayHeaders,
          rows: rows,
          rowNumbers: rowNumbers
        }, scriptCacheTtl);
      }
    }

    return cloneTable_(table);
  }

  function countDataRows(sheetName) {
    var sheet = getSheet(sheetName, false);
    if (!sheet) return 0;
    var structure = resolveStructure_(sheetName);
    var lastRow = sheet.getLastRow();
    if (lastRow < structure.dataStartRow) return 0;
    return lastRow - structure.dataStartRow + 1;
  }

  function countMatchingInColumn(sheetName, fieldAliases, expectedValue) {
    var table = readTable(sheetName, false);
    if (!table.sheet || !table.headers.length) return 0;
    var index = resolveIndex(table.headers, fieldAliases);
    if (index === -1) return 0;
    var wanted = toKey(expectedValue);
    var count = 0;
    table.rows.forEach(function (row) {
      if (toKey(row[index]) === wanted) count += 1;
    });
    return count;
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

  function rowToObject(headers, row, rowNumber) {
    var out = { _rowNumber: rowNumber };
    headers.forEach(function (header, index) {
      out[header] = row[index];
    });
    return out;
  }

  function appendRow(sheetName, rowValues) {
    var sheet = getSheet(sheetName, true);
    var rowNumber = Math.max(sheet.getLastRow() + 1, CONFIG.STRUCTURE.DATA_START_ROW);
    sheet.getRange(rowNumber, 1, 1, rowValues.length).setValues([rowValues]);
    invalidateCacheBySheet_(sheetName);
    return rowNumber;
  }

  function updateRow(sheetName, rowNumber, rowValues) {
    var sheet = getSheet(sheetName, true);
    sheet.getRange(rowNumber, 1, 1, rowValues.length).setValues([rowValues]);
    invalidateCacheBySheet_(sheetName);
    return rowNumber;
  }

  function clearRequestMemo() {
    requestMemo = {};
  }

  function withScriptCache(cacheKey, ttlSeconds, producerFn) {
    var key = normalize(cacheKey);
    var ttl = Number(ttlSeconds || 120);
    if (!key || typeof producerFn !== 'function') return producerFn();

    var cached = getScriptCacheJson_(key);
    if (cached && cached.__hasValue) return cached.value;

    var produced = producerFn();
    putScriptCacheJson_(key, { __hasValue: true, value: produced }, ttl);
    return produced;
  }

  function getScriptCacheJson_(key) {
    try {
      var raw = CacheService.getScriptCache().get(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function putScriptCacheJson_(key, value, ttlSeconds) {
    try {
      CacheService.getScriptCache().put(key, JSON.stringify(value), Math.max(1, Math.floor(ttlSeconds || 120)));
    } catch (err) {}
  }

  function removeScriptCache(keys) {
    var list = Array.isArray(keys) ? keys : [keys];
    var clean = list.map(function (key) { return normalize(key); }).filter(function (key) { return Boolean(key); });
    if (!clean.length) return;
    try {
      CacheService.getScriptCache().removeAll(clean);
    } catch (err) {}
  }

  function invalidateCacheBySheet_(sheetName) {
    clearRequestMemo();
    var sheet = normalize(sheetName);
    if (!sheet) return;
    var keys = [
      'sheet:' + sheet,
      'lookup:instructors',
      'dashboard:metrics',
      'table:summary',
      'table:dashboard_export',
      'table:permissions',
      'table:data_master',
      'table:finance',
      'table:finance_archive'
    ];
    if (sheet === CONFIG.SHEETS.EDIT_REQUESTS) keys.push('dashboard:requests');
    removeScriptCache(keys);
  }

  function cloneTable_(table) {
    if (!table) return table;
    return {
      sheet: table.sheet || null,
      headers: (table.headers || []).slice(),
      displayHeaders: (table.displayHeaders || []).slice(),
      rows: (table.rows || []).map(function (row) { return row.slice(); }),
      rowNumbers: (table.rowNumbers || []).slice()
    };
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

  function ensureCourseMeetingsSheet() {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName(CONFIG.SHEETS.COURSE_MEETINGS);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(CONFIG.SHEETS.COURSE_MEETINGS);
    }

    var width = CONFIG.COURSE_MEETINGS_HEADER_ROW.length;
    if (sheet.getMaxColumns() < width) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
    }

    sheet.getRange(CONFIG.STRUCTURE.HEADER_ROW, 1, 1, width).setValues([CONFIG.COURSE_MEETINGS_HEADER_ROW]);
    sheet.getRange(CONFIG.STRUCTURE.DISPLAY_ROW, 1, 1, width).setValues([CONFIG.COURSE_MEETINGS_DISPLAY_ROW]);
    if (sheet.getLastColumn() > width) {
      sheet.deleteColumns(width + 1, sheet.getLastColumn() - width);
    }

    return {
      sheetName: CONFIG.SHEETS.COURSE_MEETINGS,
      headerRow: CONFIG.COURSE_MEETINGS_HEADER_ROW.slice(),
      displayRow: CONFIG.COURSE_MEETINGS_DISPLAY_ROW.slice()
    };
  }

  function validateRequired(value, message) {
    if (isEmpty(value)) throw new Error(message || 'missing_required');
  }

  function resolveStructure_(sheetName) {
    if (sheetName === CONFIG.SHEETS.DASHBOARD_EXPORT) {
      return {
        headerRow: 1,
        displayRow: null,
        dataStartRow: 2,
        hasDisplayRow: false
      };
    }
    if (
      sheetName === CONFIG.SHEETS.LISTS ||
      sheetName === CONFIG.SHEETS.PROGRAM_CODES ||
      sheetName === CONFIG.SHEETS.README
    ) {
      return {
        headerRow: 1,
        displayRow: null,
        dataStartRow: 2,
        hasDisplayRow: false
      };
    }
    return {
      headerRow: CONFIG.STRUCTURE.HEADER_ROW,
      displayRow: CONFIG.STRUCTURE.DISPLAY_ROW,
      dataStartRow: CONFIG.STRUCTURE.DATA_START_ROW,
      hasDisplayRow: true
    };
  }

  return {
    normalize: normalize,
    normalizeWhitespace: normalizeWhitespace,
    normalizeName: normalizeName,
    normalizeID: normalizeID,
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
    countDataRows: countDataRows,
    countMatchingInColumn: countMatchingInColumn,
    rowsToObjects: rowsToObjects,
    rowToObject: rowToObject,
    appendRow: appendRow,
    updateRow: updateRow,
    clearRequestMemo: clearRequestMemo,
    withScriptCache: withScriptCache,
    removeScriptCache: removeScriptCache,
    ensureEditRequestsSheet: ensureEditRequestsSheet,
    ensureCourseMeetingsSheet: ensureCourseMeetingsSheet,
    validateRequired: validateRequired
  };
})();
