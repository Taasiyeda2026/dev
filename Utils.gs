var Utils = (function () {
  var requestMemo = {};

  function resolveSheetAlias_(sheetName) {
    var key = normalize(sheetName);
    if (!key) return key;
    return (CONFIG.SHEET_ALIASES && CONFIG.SHEET_ALIASES[key]) || key;
  }

  function normalizeHeaderBySheet_(sheetName, header) {
    var canonical = normalize(header);
    if (!canonical) return canonical;

    // Real spreadsheet headers are the source of truth.
    // Keep names as-is (including data.start_date/date2..date35, operations_data fields).
    var dateMatch = /^date([1-9]|[12][0-9]|3[0-5])$/i.exec(canonical);
    if (dateMatch) return 'date' + dateMatch[1];
    return canonical;
  }


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
    var actualSheetName = resolveSheetAlias_(sheetName);
    var sheet = spreadsheet.getSheetByName(actualSheetName);
    if (!sheet && required) throw new Error('missing_sheet_' + actualSheetName);
    return sheet;
  }

  function resolveIndex(headers, aliases) {
    var list = Array.isArray(aliases) ? aliases : [aliases];
    var headerKeys = (headers || []).map(function (h) { return toKey(h); });

    for (var i = 0; i < list.length; i += 1) {
      var wanted = toKey(list[i]);
      var direct = headerKeys.indexOf(wanted);
      if (direct > -1) return direct;

      // Thin compatibility: allow alias matching when code still asks for legacy keys.
      for (var j = 0; j < headerKeys.length; j += 1) {
        if (areFieldAliases_(wanted, headerKeys[j])) return j;
      }
    }
    return -1;
  }

  function areFieldAliases_(left, right) {
    if (!left || !right) return false;
    if (left === right) return true;
    var fields = (CONFIG && CONFIG.FIELDS) ? CONFIG.FIELDS : {};
    var keys = Object.keys(fields);
    for (var i = 0; i < keys.length; i += 1) {
      var aliases = (fields[keys[i]] || []).map(function (v) { return toKey(v); });
      if (aliases.indexOf(left) > -1 && aliases.indexOf(right) > -1) return true;
    }
    return false;
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

    var rawHeaders = sheet.getRange(structure.headerRow, 1, 1, lastColumn).getValues()[0].map(normalize);
    var headers = rawHeaders.map(function (header) { return normalizeHeaderBySheet_(sheetName, header); });
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
      'table:lists',
      'table:settings',
      'table:contacts',
      'settings:active_map',
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


  function isProtectedAliasTarget_(sheetName) {
    var actual = resolveSheetAlias_(sheetName);
    return actual === CONFIG.SHEETS.OPERATIONS_DATA;
  }

  function ensureEditRequestsSheet() {
    return {
      sheetName: CONFIG.SHEETS.OPERATIONS_DATA,
      skipped: true,
      reason: 'operations_data_is_source_of_truth'
    };
  }
  function ensureCourseMeetingsSheet() {
    return {
      sheetName: CONFIG.SHEETS.DATA_MASTER,
      skipped: true,
      reason: 'data_date_columns_are_source_of_truth'
    };
  }


  function validateRequired(value, message) {
    if (isEmpty(value)) throw new Error(message || 'missing_required');
  }

  function resolveStructure_(sheetName) {
    var actual = resolveSheetAlias_(sheetName);
    if (actual === CONFIG.SHEETS.DASHBOARD_EXPORT) {
      return {
        headerRow: 1,
        displayRow: null,
        dataStartRow: 2,
        hasDisplayRow: false
      };
    }
    if (
      actual === CONFIG.SHEETS.LISTS ||
      actual === CONFIG.SHEETS.README ||
      actual === CONFIG.SHEETS.SETTINGS ||
      actual === CONFIG.SHEETS.CONTACTS ||
      actual === CONFIG.SHEETS.DATA_MASTER ||
      actual === CONFIG.SHEETS.PERMISSIONS ||
      actual === CONFIG.SHEETS.OPERATIONS_DATA
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
