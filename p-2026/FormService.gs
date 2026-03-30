var FormService = (function () {
  var SHEET_READ_OPTIONS = { headerRow: 1, dataStartRow: 3 };
  var STATUS_PENDING = 'Pending';

  function getEditFormData(userProfile, sourceRowNumber) {
    try {
      if (!userProfile) {
        return { success: false, message: 'אין התחברות פעילה. יש להתחבר מחדש.' };
      }

      var rowNumber = Number(sourceRowNumber);
      if (isNaN(rowNumber) || rowNumber < SHEET_READ_OPTIONS.dataStartRow) {
        return { success: false, message: 'מזהה הרשומה שנבחרה אינו תקין.' };
      }

      var masterData = loadDataMaster();
      var rowItem = findRowByNumber(masterData.items, rowNumber);
      if (!rowItem) {
        return { success: false, message: 'הרשומה שנבחרה לא נמצאה ב-DATA_MASTER.' };
      }

      var idx = SheetService.resolveFieldIndexes(masterData.headers, CONFIG.FIELD_ALIASES);
      var accessCheck = canAccessRow(rowItem.values, idx, userProfile);
      if (!accessCheck.allowed) {
        return { success: false, message: accessCheck.message };
      }

      var fieldModel = buildFieldModel(masterData.headers, rowItem.values, userProfile);

      return {
        success: true,
        data: {
          sourceRowNumber: rowItem.rowNumber,
          canSubmitRequest: true,
          recordSummary: buildRecordSummary(rowItem.values, idx, rowItem.rowNumber),
          fields: fieldModel.fields,
          assumptions: fieldModel.assumptions
        }
      };
    } catch (err) {
      return { success: false, message: 'שגיאה בטעינת טופס העריכה: ' + err.message };
    }
  }

  function submitEditRequest(userProfile, payload) {
    try {
      if (!userProfile) {
        return { success: false, message: 'אין התחברות פעילה. יש להתחבר מחדש.' };
      }

      var rowNumber = Number(payload && payload.sourceRowNumber);
      if (isNaN(rowNumber) || rowNumber < SHEET_READ_OPTIONS.dataStartRow) {
        return { success: false, message: 'מזהה רשומה לא תקין לשמירת בקשה.' };
      }

      var updates = (payload && payload.updates) || {};
      var masterData = loadDataMaster();
      var rowItem = findRowByNumber(masterData.items, rowNumber);
      if (!rowItem) {
        return { success: false, message: 'הרשומה שנבחרה לא נמצאה ב-DATA_MASTER.' };
      }

      var idx = SheetService.resolveFieldIndexes(masterData.headers, CONFIG.FIELD_ALIASES);
      var accessCheck = canAccessRow(rowItem.values, idx, userProfile);
      if (!accessCheck.allowed) {
        return { success: false, message: accessCheck.message };
      }

      var fieldModel = buildFieldModel(masterData.headers, rowItem.values, userProfile);
      var sanitized = sanitizeUpdates(updates, fieldModel.fields);
      if (!Object.keys(sanitized.allowed).length) {
        return { success: false, message: 'לא נמצאו שדות מותרים לעריכה בבקשה זו.' };
      }

      var writeResult = writeRequestToEditRequests({
        rowNumber: rowNumber,
        userProfile: userProfile,
        headers: masterData.headers,
        rowValues: rowItem.values,
        allowedUpdates: sanitized.allowed,
        ignoredFields: sanitized.ignored
      });

      if (!writeResult.success) return writeResult;

      return {
        success: true,
        message: 'בקשת העריכה נשמרה בהצלחה.',
        meta: {
          ignoredFields: sanitized.ignored,
          mappedFields: writeResult.mappedHeaders
        }
      };
    } catch (err) {
      return { success: false, message: 'שגיאה בשמירת בקשת העריכה: ' + err.message };
    }
  }

  function loadDataMaster() {
    var sheet = SheetService.getSheetByName(CONFIG.SHEETS.DATA_MASTER, true);
    var headers = SheetService.getHeaders(sheet, SHEET_READ_OPTIONS.headerRow);
    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();
    var items = [];

    if (lastColumn === 0 || lastRow < SHEET_READ_OPTIONS.dataStartRow) {
      return { headers: headers, items: items };
    }

    var numRows = lastRow - SHEET_READ_OPTIONS.dataStartRow + 1;
    var rows = sheet.getRange(SHEET_READ_OPTIONS.dataStartRow, 1, numRows, lastColumn).getValues();
    rows.forEach(function (row, i) {
      var hasValue = row.some(function (cell) { return !Utils.isEmpty(cell); });
      if (!hasValue) return;
      items.push({
        rowNumber: SHEET_READ_OPTIONS.dataStartRow + i,
        values: row
      });
    });

    return { headers: headers, items: items };
  }

  function findRowByNumber(items, rowNumber) {
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].rowNumber === rowNumber) return items[i];
    }
    return null;
  }

  function canAccessRow(rowValues, idx, userProfile) {
    var roleText = [userProfile.SystemRole, userProfile.BaseRole].map(function (v) {
      return Utils.normalize(v).toLowerCase();
    }).join(' ');
    var isMasterAdmin = /(master|מאסטר)/.test(roleText) && /(admin|אדמין)/.test(roleText);
    var isAdmin = isMasterAdmin || /(admin|אדמין)/.test(roleText);
    var isManager = /(manager|ניהול|הנהלה)/.test(roleText);

    if (isMasterAdmin || isAdmin) return { allowed: true };

    if (isManager) {
      var scope = Utils.normalize(userProfile.AccessScope).toLowerCase();
      if (!scope || scope === 'all') return { allowed: true };
      if (idx.Program === -1) return { allowed: true };
      var program = Utils.normalize(rowValues[idx.Program]).toLowerCase();
      var allowedPrograms = scope.split(',').map(function (s) { return Utils.normalize(s).toLowerCase(); });
      return allowedPrograms.indexOf(program) !== -1
        ? { allowed: true }
        : { allowed: false, message: 'אין הרשאה לערוך רשומה זו לפי תחום הגישה שלך.' };
    }

    var employeeId = idx.EmployeeID > -1 ? Utils.normalize(rowValues[idx.EmployeeID]).toLowerCase() : '';
    var employeeName = idx.EmployeeName > -1 ? Utils.normalize(rowValues[idx.EmployeeName]).toLowerCase() : '';
    var userId = Utils.normalize(userProfile.EmployeeID).toLowerCase();
    var userName = Utils.normalize(userProfile.EmployeeName).toLowerCase();
    var allowed = (employeeId && userId && employeeId === userId) || (employeeName && userName && employeeName === userName);

    return allowed
      ? { allowed: true }
      : { allowed: false, message: 'אין הרשאה לפתוח בקשת עריכה לרשומה זו.' };
  }

  function buildFieldModel(headers, rowValues, userProfile) {
    var assumptions = [];
    var roleText = [userProfile.SystemRole, userProfile.BaseRole].map(function (v) {
      return Utils.normalize(v).toLowerCase();
    }).join(' ');
    var isMasterAdmin = /(master|מאסטר)/.test(roleText) && /(admin|אדמין)/.test(roleText);
    var isManager = /(manager|ניהול|הנהלה)/.test(roleText) || /(admin|אדמין)/.test(roleText);

    var editableForManager = {
      Status: true,
      PlannedMeetings: true,
      ActualMeetings: true,
      StartTime: true,
      EndTime: true
    };

    var fields = headers.map(function (header, i) {
      var label = header || ('עמודה ' + (i + 1));
      var normalized = Utils.normalize(header);
      var value = rowValues[i];

      if (!normalized) {
        return {
          key: 'column_' + i,
          requestKey: 'column_' + i,
          label: label,
          value: value,
          editable: false,
          lockedReason: 'כותרת חסרה'
        };
      }

      var isFinancial = /(cost|price|budget|salary|payment|amount|fee|כספ|עלות|תקציב|שכר|תשלום|מחיר)/i.test(normalized);
      if (isFinancial && !isMasterAdmin) {
        return {
          key: 'field_' + i,
          requestKey: normalized,
          label: label,
          value: value,
          editable: false,
          lockedReason: 'שדה כספי נעול למשתמש הנוכחי'
        };
      }

      var isIdentifier = /(employeeid|employeename|courseid|program|entrycode|logincode|createdat|id|מזהה|תאריך יצירה)/i.test(normalized);
      if (isIdentifier && !isMasterAdmin) {
        return {
          key: 'field_' + i,
          requestKey: normalized,
          label: label,
          value: value,
          editable: false,
          lockedReason: 'שדה מזהה/מערכת לקריאה בלבד'
        };
      }

      var editable = false;
      if (isMasterAdmin) {
        editable = !isIdentifier || /status|planned|actual|start|end|הערה|notes|טלפון|phone|email|דוא|תיאור|description/i.test(normalized);
      } else if (isManager) {
        editable = !!editableForManager[normalized] || /status|planned|actual|starttime|endtime/i.test(normalized);
      } else {
        editable = /status|actualmeetings|starttime|endtime|הערה|notes/i.test(normalized);
      }

      return {
        key: 'field_' + i,
        requestKey: normalized,
        label: label,
        value: value,
        editable: editable,
        lockedReason: editable ? '' : 'שדה זה אינו ניתן לעריכה לפי ההרשאות'
      };
    });

    if (!fields.length) assumptions.push('לא זוהו שדות להצגה בטופס העריכה.');

    return {
      fields: fields,
      assumptions: assumptions
    };
  }

  function sanitizeUpdates(updates, fields) {
    var allowedMap = {};
    fields.forEach(function (field) {
      if (field.editable) allowedMap[field.requestKey] = true;
    });

    var allowed = {};
    var ignored = [];
    Object.keys(updates).forEach(function (key) {
      if (allowedMap[key]) {
        allowed[key] = updates[key];
      } else {
        ignored.push(key);
      }
    });

    return { allowed: allowed, ignored: ignored };
  }

  function writeRequestToEditRequests(context) {
    var editSheet = SheetService.getSheetByName(CONFIG.SHEETS.EDIT_REQUESTS, false);
    if (!editSheet) {
      return { success: false, message: 'הגיליון EDIT_REQUESTS לא קיים ולכן לא ניתן לשמור בקשה.' };
    }

    var headers = SheetService.getHeaders(editSheet, SHEET_READ_OPTIONS.headerRow);
    if (!headers.length) {
      return { success: false, message: 'לא נמצאו כותרות בגיליון EDIT_REQUESTS.' };
    }

    var idx = {};
    headers.forEach(function (header, i) { idx[Utils.normalize(header)] = i; });

    var nowIso = new Date().toISOString();
    var sourceCourseId = readByAliases(context.headers, context.rowValues, CONFIG.FIELD_ALIASES.CourseID);

    var payload = {
      RequestType: 'EditRequest',
      Status: STATUS_PENDING,
      CreatedAt: nowIso,
      SourceRowNumber: context.rowNumber,
      SourceCourseID: sourceCourseId || '',
      RequestedByEmployeeID: Utils.normalize(context.userProfile.EmployeeID),
      RequestedByEmployeeName: Utils.normalize(context.userProfile.EmployeeName),
      RequestedByRole: Utils.normalize(context.userProfile.SystemRole || context.userProfile.BaseRole),
      OriginalData: JSON.stringify(mapRowToObject(context.headers, context.rowValues)),
      RequestedData: JSON.stringify(context.allowedUpdates),
      SystemNote: context.ignoredFields.length ? ('השדות הבאים ננעלו ולא נשמרו: ' + context.ignoredFields.join(', ')) : ''
    };

    var mapping = {
      RequestType: ['RequestType', 'ActionType', 'סוג פעולה', 'Action'],
      Status: ['Status', 'סטטוס'],
      CreatedAt: ['CreatedAt', 'CreatedOn', 'תאריך יצירה'],
      SourceRowNumber: ['SourceRowNumber', 'SourceRow', 'RecordRow', 'מזהה רשומת מקור'],
      SourceCourseID: ['SourceCourseID', 'CourseID', 'CourseId', 'מזהה קורס מקור'],
      RequestedByEmployeeID: ['RequestedByEmployeeID', 'RequestedBy', 'EmployeeID', 'מבקש'],
      RequestedByEmployeeName: ['RequestedByEmployeeName', 'EmployeeName', 'שם מבקש'],
      RequestedByRole: ['RequestedByRole', 'RequesterRole', 'Role'],
      OriginalData: ['OriginalData', 'SourceData', 'OriginalPayload', 'נתונים מקוריים'],
      RequestedData: ['RequestedData', 'EditedData', 'RequestedPayload', 'נתונים מבוקשים'],
      SystemNote: ['SystemNote', 'Notes', 'Comment', 'הערת מערכת']
    };

    var row = new Array(headers.length).fill('');
    var mappedHeaders = [];

    Object.keys(payload).forEach(function (fieldKey) {
      var targetIndex = findIndexByAliases(headers, mapping[fieldKey]);
      if (targetIndex > -1) {
        row[targetIndex] = payload[fieldKey];
        mappedHeaders.push(headers[targetIndex]);
      }
    });

    if (!mappedHeaders.length) {
      return { success: false, message: 'לא נמצא מיפוי כותרות מתאים בגיליון EDIT_REQUESTS.' };
    }

    editSheet.appendRow(row);
    return { success: true, mappedHeaders: mappedHeaders };
  }

  function buildRecordSummary(rowValues, idx, rowNumber) {
    return {
      rowNumber: rowNumber,
      courseId: idx.CourseID > -1 ? rowValues[idx.CourseID] : '',
      program: idx.Program > -1 ? rowValues[idx.Program] : '',
      status: idx.Status > -1 ? rowValues[idx.Status] : ''
    };
  }

  function mapRowToObject(headers, rowValues) {
    var obj = {};
    headers.forEach(function (header, i) {
      obj[header || ('column_' + i)] = rowValues[i];
    });
    return obj;
  }

  function readByAliases(headers, rowValues, aliases) {
    var index = SheetService.findHeaderIndex(headers, aliases || []);
    return index > -1 ? rowValues[index] : '';
  }

  function findIndexByAliases(headers, aliases) {
    for (var i = 0; i < aliases.length; i += 1) {
      var idx = headers.indexOf(Utils.normalize(aliases[i]));
      if (idx > -1) return idx;
    }
    return -1;
  }

  return {
    getEditFormData: getEditFormData,
    submitEditRequest: submitEditRequest
  };
})();
