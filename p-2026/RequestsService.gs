var RequestsService = (function () {
  var SHEET_READ_OPTIONS = { headerRow: 1, dataStartRow: 3 };

  function getMyRequestsData(userProfile, filters) {
    try {
      if (!userProfile) return { success: false, message: 'אין התחברות פעילה. יש להתחבר מחדש.' };

      var table = SheetService.getRecords(CONFIG.SHEETS.EDIT_REQUESTS, false, SHEET_READ_OPTIONS);
      if (!table.headers.length) {
        return {
          success: true,
          data: {
            generatedAt: new Date().toISOString(),
            assumptions: ['לא נמצאו כותרות בגיליון EDIT_REQUESTS.'],
            filtering: { mode: 'END_USER', fieldUsed: 'ללא' },
            detectedColumns: {},
            statuses: [],
            requestTypes: [],
            rows: []
          }
        };
      }

      var indexes = resolveIndexes(table.headers);
      var roleMeta = resolveRoleMeta(userProfile);
      var permissionFiltered = filterByPermission(table.rows, indexes, userProfile, roleMeta);
      var queryFiltered = applyFilters(permissionFiltered.rows, indexes, filters || {}, permissionFiltered.assumptions);

      return {
        success: true,
        data: {
          generatedAt: new Date().toISOString(),
          assumptions: queryFiltered.assumptions,
          filtering: permissionFiltered.filtering,
          detectedColumns: buildDetectedColumns(table.headers, indexes),
          statuses: collectUniqueFromRows(permissionFiltered.rows, indexes.status),
          requestTypes: collectUniqueFromRows(permissionFiltered.rows, indexes.requestType),
          rows: queryFiltered.rows.map(function (row) { return projectRequestRow(row, indexes); })
        }
      };
    } catch (err) {
      return { success: false, message: 'שגיאה בטעינת הבקשות: ' + err.message };
    }
  }

  function resolveIndexes(headers) {
    return {
      requestType: find(headers, ['RequestType', 'ActionType', 'Type', 'סוג פעולה', 'סוג בקשה']),
      createdAt: find(headers, ['CreatedAt', 'CreatedOn', 'RequestCreatedAt', 'תאריך יצירה']),
      status: find(headers, ['Status', 'RequestStatus', 'סטטוס', 'מצב']),
      sourceRowNumber: find(headers, ['SourceRowNumber', 'SourceRow', 'RecordRow', 'מזהה רשומת מקור', 'שורת מקור']),
      sourceCourseId: find(headers, ['SourceCourseID', 'CourseID', 'CourseId', 'קורס', 'מזהה קורס מקור']),
      sourceProgram: find(headers, ['SourceProgram', 'Program', 'תוכנית', 'שם תוכנית']),
      requestedData: find(headers, ['RequestedData', 'EditedData', 'RequestedPayload', 'נתונים מבוקשים']),
      systemNote: find(headers, ['SystemNote', 'Notes', 'Comment', 'הערת מערכת']),
      requestedByEmployeeId: find(headers, ['RequestedByEmployeeID', 'RequestedBy', 'EmployeeID', 'מבקש', 'מספר עובד']),
      requestedByEmployeeName: find(headers, ['RequestedByEmployeeName', 'EmployeeName', 'שם מבקש', 'שם עובד']),
      requestedByEmail: find(headers, ['RequestedByEmail', 'Email', 'RequesterEmail', 'דוא"ל', 'אימייל']),
      reviewedBy: find(headers, ['ReviewedBy', 'ApprovedBy', 'CheckedBy', 'מאשר', 'נבדק על ידי']),
      reviewerNote: find(headers, ['ReviewerNote', 'ApproverNote', 'הערת מאשר', 'הערת בודק']),
      decisionAt: find(headers, ['DecisionAt', 'ReviewedAt', 'ApprovedAt', 'תאריך החלטה'])
    };
  }

  function resolveRoleMeta(profile) {
    var roleText = [profile.SystemRole, profile.BaseRole].map(function (v) {
      return Utils.normalize(v).toLowerCase();
    }).join(' ');

    var isMasterAdmin = /(master|מאסטר)/.test(roleText) && /(admin|אדמין)/.test(roleText);
    var isManagement = isMasterAdmin || /(admin|אדמין|manager|ניהול|הנהלה)/.test(roleText);

    return {
      isMasterAdmin: isMasterAdmin,
      isManagement: isManagement,
      mode: isMasterAdmin ? 'MASTER_ADMIN' : (isManagement ? 'MANAGEMENT' : 'END_USER')
    };
  }

  function filterByPermission(rows, indexes, userProfile, roleMeta) {
    var assumptions = [];
    var filtering = { mode: roleMeta.mode, fieldUsed: 'ללא סינון' };

    if (roleMeta.isMasterAdmin) {
      filtering.fieldUsed = 'MASTER_ADMIN: כל הבקשות';
      return { rows: rows, assumptions: assumptions, filtering: filtering };
    }

    if (roleMeta.isManagement) {
      var scope = Utils.normalize(userProfile.AccessScope).toLowerCase();
      if (!scope) {
        assumptions.push('AccessScope חסר ולכן למשתמש הנהלה הוחזרו 0 בקשות לשמירה על אבטחה.');
        filtering.fieldUsed = 'AccessScope חסר';
        return { rows: [], assumptions: assumptions, filtering: filtering };
      }
      if (scope === 'all') {
        filtering.fieldUsed = 'הנהלה עם AccessScope=ALL';
        return { rows: rows, assumptions: assumptions, filtering: filtering };
      }

      if (indexes.sourceProgram === -1) {
        assumptions.push('לא נמצאה עמודת Program/SourceProgram ולכן למשתמש הנהלה הוחזרו 0 בקשות לשמירה על אבטחה.');
        filtering.fieldUsed = 'AccessScope ללא Program';
        return { rows: [], assumptions: assumptions, filtering: filtering };
      }

      var scopeValues = scope.split(',').map(function (v) { return Utils.normalize(v).toLowerCase(); }).filter(Boolean);
      filtering.fieldUsed = 'Program לפי AccessScope';

      return {
        rows: rows.filter(function (row) {
          var program = Utils.normalize(row[indexes.sourceProgram]).toLowerCase();
          return scopeValues.indexOf(program) !== -1;
        }),
        assumptions: assumptions,
        filtering: filtering
      };
    }

    filtering.fieldUsed = 'Requester לפי מזהי session';
    return filterRowsByRequester(rows, indexes, userProfile, filtering, assumptions);
  }

  function filterRowsByRequester(rows, indexes, userProfile, filtering, assumptions) {
    var userCandidates = {
      employeeId: Utils.normalize(userProfile.EmployeeID).toLowerCase(),
      employeeName: Utils.normalize(userProfile.EmployeeName).toLowerCase(),
      email: Utils.normalize(userProfile.Email || userProfile.EmployeeEmail || userProfile.Mail).toLowerCase()
    };

    var filtered = rows.filter(function (row) {
      var byId = readCell(row, indexes.requestedByEmployeeId).toLowerCase();
      var byName = readCell(row, indexes.requestedByEmployeeName).toLowerCase();
      var byEmail = readCell(row, indexes.requestedByEmail).toLowerCase();
      return (byId && userCandidates.employeeId && byId === userCandidates.employeeId) ||
        (byName && userCandidates.employeeName && byName === userCandidates.employeeName) ||
        (byEmail && userCandidates.email && byEmail === userCandidates.email);
    });

    if (indexes.requestedByEmployeeId === -1 && indexes.requestedByEmployeeName === -1 && indexes.requestedByEmail === -1) {
      assumptions.push('לא נמצאו עמודות מזהה מבקש בגיליון EDIT_REQUESTS ולכן הוחזרו 0 בקשות.');
      filtered = [];
    }

    return { rows: filtered, assumptions: assumptions, filtering: filtering };
  }

  function applyFilters(rows, indexes, filters, assumptions) {
    var filtered = rows.slice();
    var query = Utils.normalize(filters.query).toLowerCase();
    var status = Utils.normalize(filters.status).toLowerCase();
    var requestType = Utils.normalize(filters.requestType).toLowerCase();

    if (status) {
      if (indexes.status === -1) assumptions.push('התקבל סינון סטטוס אך לא נמצאה עמודת Status.');
      else filtered = filtered.filter(function (row) { return Utils.normalize(row[indexes.status]).toLowerCase() === status; });
    }

    if (requestType) {
      if (indexes.requestType === -1) assumptions.push('התקבל סינון סוג בקשה אך לא נמצאה עמודת RequestType.');
      else filtered = filtered.filter(function (row) { return Utils.normalize(row[indexes.requestType]).toLowerCase() === requestType; });
    }

    if (query) {
      filtered = filtered.filter(function (row) {
        return row.some(function (cell) {
          return Utils.normalize(cell).toLowerCase().indexOf(query) !== -1;
        }) || buildRequestedDataSummary(readCell(row, indexes.requestedData)).toLowerCase().indexOf(query) !== -1;
      });
    }

    return { rows: filtered, assumptions: assumptions };
  }

  function projectRequestRow(row, indexes) {
    return {
      requestType: readCell(row, indexes.requestType),
      createdAt: formatDateValue(readCell(row, indexes.createdAt)),
      status: readCell(row, indexes.status),
      sourceRowNumber: readCell(row, indexes.sourceRowNumber),
      programOrCourse: buildProgramCourseText(row, indexes),
      requestedSummary: buildRequestedDataSummary(readCell(row, indexes.requestedData)),
      systemNote: readCell(row, indexes.systemNote),
      requestCreator: buildRequesterText(row, indexes),
      reviewedBy: readCell(row, indexes.reviewedBy),
      decisionAt: formatDateValue(readCell(row, indexes.decisionAt)),
      reviewerNote: readCell(row, indexes.reviewerNote)
    };
  }

  function buildRequesterText(row, indexes) {
    var name = readCell(row, indexes.requestedByEmployeeName);
    var id = readCell(row, indexes.requestedByEmployeeId);
    var email = readCell(row, indexes.requestedByEmail);
    return [name, id, email].filter(Boolean).join(' | ');
  }

  function buildProgramCourseText(row, indexes) {
    var program = readCell(row, indexes.sourceProgram);
    var course = readCell(row, indexes.sourceCourseId);
    if (program && course) return program + ' / ' + course;
    return program || course || '';
  }

  function buildRequestedDataSummary(rawValue) {
    var normalized = Utils.normalize(rawValue);
    if (!normalized) return '';

    var parsed = tryParseJsonObject(normalized);
    if (!parsed) return shortenText(normalized, 140);

    var keys = Object.keys(parsed);
    if (!keys.length) return 'ללא שדות שינוי';

    var parts = keys.slice(0, 4).map(function (key) {
      return key + ': ' + shortenText(parsed[key], 30);
    });

    if (keys.length > 4) parts.push('+' + (keys.length - 4) + ' שדות נוספים');
    return parts.join(' | ');
  }

  function tryParseJsonObject(text) {
    if (!text || text.charAt(0) !== '{') return null;
    try {
      var obj = JSON.parse(text);
      return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : null;
    } catch (err) {
      return null;
    }
  }

  function shortenText(text, maxLen) {
    var value = Utils.normalize(text);
    return value.length <= maxLen ? value : (value.slice(0, maxLen - 1) + '…');
  }

  function collectUniqueFromRows(rows, index) {
    if (index === -1) return [];
    var bag = {};
    rows.forEach(function (row) {
      var value = Utils.normalize(row[index]);
      if (value) bag[value] = true;
    });
    return Object.keys(bag).sort();
  }

  function readCell(row, idx) {
    if (idx === -1 || idx >= row.length) return '';
    return Utils.normalize(row[idx]);
  }

  function formatDateValue(value) {
    if (value instanceof Date) return value.toISOString();
    var text = Utils.normalize(value);
    if (!text) return '';
    var maybeDate = new Date(text);
    return isNaN(maybeDate.getTime()) ? text : maybeDate.toISOString();
  }

  function buildDetectedColumns(headers, indexes) {
    var out = {};
    Object.keys(indexes).forEach(function (key) {
      var i = indexes[key];
      out[key] = i > -1 ? headers[i] : '';
    });
    return out;
  }

  function find(headers, aliases) {
    return SheetService.findHeaderIndex(headers, aliases);
  }

  return {
    getMyRequestsData: getMyRequestsData
  };
})();
