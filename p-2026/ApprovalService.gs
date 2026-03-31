var ApprovalService = (function () {
  var SHEET_READ_OPTIONS = { headerRow: 1, dataStartRow: 3 };
  var STATUS_PENDING = 'Pending';
  var STATUS_APPROVED = 'Approved';
  var STATUS_REJECTED = 'Rejected';
  var STATUS_APPLIED = 'Applied';

  function canAccessApprovals(userProfile) {
    if (!userProfile) return false;
    var role = getRoleMeta(userProfile);
    return role.isManagement;
  }

  function getApprovalsData(userProfile, filters) {
    try {
      if (!userProfile) return { success: false, message: 'אין התחברות פעילה. יש להתחבר מחדש.' };
      if (!canAccessApprovals(userProfile)) return { success: false, message: 'אין הרשאה למסך אישורים.' };

      var table = SheetService.getRecords(CONFIG.SHEETS.EDIT_REQUESTS, false, SHEET_READ_OPTIONS);
      var headers = table.headers || [];
      if (!headers.length) return { success: true, data: { rows: [], statuses: [], requestTypes: [], assumptions: ['לא נמצאו כותרות ב-EDIT_REQUESTS.'], detectedColumns: {} } };

      var indexes = resolveRequestIndexes(headers);
      var assumptions = [];
      var rows = table.rows.map(function (row, i) {
        return { sheetRowNumber: SHEET_READ_OPTIONS.dataStartRow + i, values: row };
      });

      rows = filterRowsByRole(rows, indexes, userProfile, assumptions);
      rows = applyListFilters(rows, indexes, filters || {}, assumptions);

      return {
        success: true,
        data: {
          rows: rows.map(function (item) { return projectApprovalRow(item, indexes); }),
          statuses: collectUnique(rows, indexes.status),
          requestTypes: collectUnique(rows, indexes.requestType),
          assumptions: assumptions,
          detectedColumns: buildDetectedColumns(headers, indexes)
        }
      };
    } catch (err) {
      return { success: false, message: 'שגיאה בטעינת אישורים: ' + err.message };
    }
  }

  function submitApprovalDecision(userProfile, payload) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      if (!userProfile) return { success: false, message: 'אין התחברות פעילה. יש להתחבר מחדש.' };
      if (!canAccessApprovals(userProfile)) return { success: false, message: 'אין הרשאה לפעולת אישור/דחייה.' };

      var decision = Utils.normalize(payload.decision).toLowerCase();
      var sheetRowNumber = Number(payload.requestRowNumber);
      var reviewerNote = Utils.normalize(payload.reviewerNote);

      if (decision !== 'approve' && decision !== 'reject') return { success: false, message: 'פעולה לא תקינה.' };
      if (isNaN(sheetRowNumber) || sheetRowNumber < SHEET_READ_OPTIONS.dataStartRow) return { success: false, message: 'מזהה שורת בקשה לא תקין.' };

      var requestSheet = SheetService.getSheetByName(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var headers = SheetService.getHeaders(requestSheet, SHEET_READ_OPTIONS.headerRow);
      var indexes = resolveRequestIndexes(headers);
      var lastColumn = requestSheet.getLastColumn();

      if (sheetRowNumber > requestSheet.getLastRow()) return { success: false, message: 'שורת הבקשה לא קיימת.' };

      var row = requestSheet.getRange(sheetRowNumber, 1, 1, lastColumn).getValues()[0];
      if (!hasAnyValue(row)) return { success: false, message: 'שורת הבקשה ריקה.' };

      var permission = canReviewerHandleRequest(row, indexes, userProfile);
      if (!permission.allowed) return { success: false, message: permission.message };

      var statusNow = readCell(row, indexes.status);
      if (statusNow && statusNow.toLowerCase() !== STATUS_PENDING.toLowerCase()) {
        return { success: false, message: 'ניתן לטפל רק בבקשות במצב Pending. סטטוס נוכחי: ' + statusNow };
      }

      if (decision === 'reject') {
        setDecisionColumns(row, indexes, STATUS_REJECTED, userProfile, reviewerNote, new Date());
        requestSheet.getRange(sheetRowNumber, 1, 1, lastColumn).setValues([row]);
        return { success: true, message: 'הבקשה נדחתה בהצלחה.', data: { status: STATUS_REJECTED } };
      }

      setDecisionColumns(row, indexes, STATUS_APPROVED, userProfile, reviewerNote, new Date());
      requestSheet.getRange(sheetRowNumber, 1, 1, lastColumn).setValues([row]);

      var applyResult = applyApprovedRequest(row, indexes, userProfile);
      if (!applyResult.success) {
        row = requestSheet.getRange(sheetRowNumber, 1, 1, lastColumn).getValues()[0];
        setStatus(row, indexes, STATUS_PENDING);
        appendSystemNote(row, indexes, 'האישור בוטל עקב כשל בהחלה: ' + applyResult.message);
        requestSheet.getRange(sheetRowNumber, 1, 1, lastColumn).setValues([row]);
        return { success: false, message: 'האישור לא הושלם: ' + applyResult.message };
      }

      row = requestSheet.getRange(sheetRowNumber, 1, 1, lastColumn).getValues()[0];
      setStatus(row, indexes, STATUS_APPLIED);
      if (indexes.decisionAt > -1) row[indexes.decisionAt] = new Date().toISOString();
      requestSheet.getRange(sheetRowNumber, 1, 1, lastColumn).setValues([row]);

      return {
        success: true,
        message: 'הבקשה אושרה והוחלה בהצלחה ל-DATA_MASTER.',
        data: { status: STATUS_APPLIED, updatedFields: applyResult.updatedFields, skippedFields: applyResult.skippedFields }
      };
    } catch (err) {
      return { success: false, message: 'שגיאה בטיפול בבקשה: ' + err.message };
    } finally {
      lock.releaseLock();
    }
  }

  function applyApprovedRequest(requestRow, requestIndexes, reviewerProfile) {
    var sourceRowNumber = Number(readCell(requestRow, requestIndexes.sourceRowNumber));
    if (isNaN(sourceRowNumber) || sourceRowNumber < SHEET_READ_OPTIONS.dataStartRow) {
      return { success: false, message: 'SourceRowNumber חסר או לא תקין.' };
    }

    var requestedDataText = readCell(requestRow, requestIndexes.requestedData);
    var requestedData = parseObject(requestedDataText);
    if (!requestedData || !Object.keys(requestedData).length) {
      return { success: false, message: 'RequestedData ריק או לא תקין.' };
    }

    var masterSheet = SheetService.getSheetByName(CONFIG.SHEETS.DATA_MASTER, true);
    if (sourceRowNumber > masterSheet.getLastRow()) {
      return { success: false, message: 'רשומת מקור לא קיימת ב-DATA_MASTER.' };
    }

    var masterHeaders = SheetService.getHeaders(masterSheet, SHEET_READ_OPTIONS.headerRow);
    var masterLastColumn = masterSheet.getLastColumn();
    var masterRow = masterSheet.getRange(sourceRowNumber, 1, 1, masterLastColumn).getValues()[0];
    if (!hasAnyValue(masterRow)) return { success: false, message: 'רשומת המקור ריקה.' };

    var role = getRoleMeta(reviewerProfile);
    var updates = buildSafeUpdates(masterHeaders, requestedData, role);
    if (!updates.allowedIndexes.length) {
      return { success: false, message: 'לא נמצאו שדות מותרים לעדכון.' };
    }

    var nextRow = masterRow.slice();
    updates.allowedIndexes.forEach(function (colIndex) {
      nextRow[colIndex] = updates.valuesByIndex[colIndex];
    });

    masterSheet.getRange(sourceRowNumber, 1, 1, masterLastColumn).setValues([nextRow]);

    return {
      success: true,
      updatedFields: updates.allowedFields,
      skippedFields: updates.skippedFields
    };
  }

  function buildSafeUpdates(masterHeaders, requestedData, role) {
    var byNormalizedHeader = {};
    masterHeaders.forEach(function (header, i) {
      var key = normalizeKey(header);
      if (key) byNormalizedHeader[key] = i;
    });

    var valuesByIndex = {};
    var allowedIndexes = [];
    var allowedFields = [];
    var skippedFields = [];

    Object.keys(requestedData).forEach(function (rawKey) {
      var normalizedRequestKey = normalizeKey(rawKey);
      var colIndex = byNormalizedHeader[normalizedRequestKey];
      if (colIndex === undefined || colIndex === null) {
        skippedFields.push(rawKey + ' (ללא מיפוי בטוח)');
        return;
      }

      var header = Utils.normalize(masterHeaders[colIndex]);
      if (!isFieldAllowedForRole(header, role)) {
        skippedFields.push(rawKey + ' (שדה חסום לפי הרשאות)');
        return;
      }

      if (allowedIndexes.indexOf(colIndex) === -1) {
        allowedIndexes.push(colIndex);
        allowedFields.push(header || rawKey);
      }
      valuesByIndex[colIndex] = requestedData[rawKey];
    });

    return {
      allowedIndexes: allowedIndexes,
      allowedFields: allowedFields,
      skippedFields: skippedFields,
      valuesByIndex: valuesByIndex
    };
  }

  function isFieldAllowedForRole(headerName, role) {
    var normalized = normalizeKey(headerName);
    if (!normalized) return false;

    if (isSystemLockedField(normalized)) return false;
    if (!role.isMasterAdmin && isFinancialField(normalized)) return false;
    if (role.isMasterAdmin) return true;

    return /(status|plannedmeetings|actualmeetings|starttime|endtime|notes|note|comment|phone|email|description|הערה|סטטוס|מתוכנן|בוצע|התחלה|סיום)/i.test(normalized);
  }

  function isSystemLockedField(normalizedHeader) {
    return /(request|logincode|entrycode|employeeid|id$|createdat|createdon|timestamp|session|מזהה|קוד כניסה|תאריך יצירה)/i.test(normalizedHeader);
  }

  function isFinancialField(normalizedHeader) {
    return /(cost|price|budget|salary|payment|amount|fee|כספ|עלות|תקציב|שכר|תשלום|מחיר)/i.test(normalizedHeader);
  }

  function canReviewerHandleRequest(row, indexes, userProfile) {
    var role = getRoleMeta(userProfile);
    if (role.isMasterAdmin) return { allowed: true };
    if (!role.isManagement) return { allowed: false, message: 'רק הנהלה או מאסטר אדמין יכולים לאשר בקשות.' };

    var scope = Utils.normalize(userProfile.AccessScope).toLowerCase();
    if (!scope || scope === 'all') return { allowed: true };

    var program = readCell(row, indexes.sourceProgram).toLowerCase();
    if (!program) return { allowed: false, message: 'לא ניתן לאשר בקשה ללא שיוך Program תחת AccessScope מוגבל.' };

    var allowedPrograms = scope.split(',').map(function (x) { return Utils.normalize(x).toLowerCase(); }).filter(Boolean);
    if (allowedPrograms.indexOf(program) === -1) {
      return { allowed: false, message: 'הבקשה מחוץ לתחום ההרשאה של המשתמש המאשר.' };
    }

    return { allowed: true };
  }

  function filterRowsByRole(rows, indexes, userProfile, assumptions) {
    var role = getRoleMeta(userProfile);
    if (role.isMasterAdmin) return rows;

    var scope = Utils.normalize(userProfile.AccessScope).toLowerCase();
    if (!scope || scope === 'all') return rows;

    if (indexes.sourceProgram === -1) {
      assumptions.push('אין עמודת SourceProgram ולכן בוצע סינון ל-Pending בלבד עבור הנהלה.');
      return rows.filter(function (item) { return readCell(item.values, indexes.status) === STATUS_PENDING; });
    }

    var allowedPrograms = scope.split(',').map(function (x) { return Utils.normalize(x).toLowerCase(); }).filter(Boolean);
    return rows.filter(function (item) {
      var program = readCell(item.values, indexes.sourceProgram).toLowerCase();
      return allowedPrograms.indexOf(program) !== -1;
    });
  }

  function applyListFilters(rows, indexes, filters, assumptions) {
    var out = rows.slice();
    var status = Utils.normalize(filters.status).toLowerCase();
    var requestType = Utils.normalize(filters.requestType).toLowerCase();
    var query = Utils.normalize(filters.query).toLowerCase();

    if (!status) status = STATUS_PENDING.toLowerCase();

    if (status) {
      if (indexes.status === -1) assumptions.push('לא נמצאה עמודת Status לסינון.');
      else out = out.filter(function (item) { return readCell(item.values, indexes.status).toLowerCase() === status; });
    }

    if (requestType) {
      if (indexes.requestType === -1) assumptions.push('לא נמצאה עמודת RequestType לסינון.');
      else out = out.filter(function (item) { return readCell(item.values, indexes.requestType).toLowerCase() === requestType; });
    }

    if (query) {
      out = out.filter(function (item) {
        return item.values.some(function (cell) {
          return Utils.normalize(cell).toLowerCase().indexOf(query) !== -1;
        });
      });
    }

    return out;
  }

  function projectApprovalRow(item, indexes) {
    var row = item.values;
    var originalData = parseObject(readCell(row, indexes.originalData));
    var requestedData = parseObject(readCell(row, indexes.requestedData));
    var details = buildDiffDetails(originalData, requestedData);

    return {
      requestRowNumber: item.sheetRowNumber,
      requestType: readCell(row, indexes.requestType),
      requester: buildRequesterText(row, indexes),
      createdAt: formatDate(readCell(row, indexes.createdAt)),
      status: readCell(row, indexes.status),
      sourceRowNumber: readCell(row, indexes.sourceRowNumber),
      programOrCourse: buildProgramCourseText(row, indexes),
      requestedSummary: details.summary,
      changes: details.changes,
      systemNote: readCell(row, indexes.systemNote),
      reviewedBy: readCell(row, indexes.reviewedBy),
      reviewerNote: readCell(row, indexes.reviewerNote),
      decisionAt: formatDate(readCell(row, indexes.decisionAt))
    };
  }

  function buildDiffDetails(originalData, requestedData) {
    if (!requestedData || !Object.keys(requestedData).length) return { summary: 'ללא שינוי מזוהה', changes: [] };

    var keys = Object.keys(requestedData);
    var changes = keys.slice(0, 8).map(function (key) {
      return {
        field: key,
        from: originalData && originalData[key] !== undefined ? String(originalData[key]) : '',
        to: requestedData[key] !== undefined && requestedData[key] !== null ? String(requestedData[key]) : ''
      };
    });

    var summary = changes.slice(0, 3).map(function (change) {
      return change.field + ': ' + trim(change.from, 20) + ' → ' + trim(change.to, 20);
    }).join(' | ');

    if (keys.length > 3) summary += ' | +' + (keys.length - 3) + ' שדות נוספים';

    return { summary: summary || 'ללא שינוי מזוהה', changes: changes };
  }

  function resolveRequestIndexes(headers) {
    return {
      requestType: find(headers, ['RequestType', 'ActionType', 'Type', 'סוג בקשה', 'סוג פעולה']),
      createdAt: find(headers, ['CreatedAt', 'CreatedOn', 'תאריך יצירה']),
      status: find(headers, ['Status', 'RequestStatus', 'סטטוס']),
      sourceRowNumber: find(headers, ['SourceRowNumber', 'SourceRow', 'RecordRow', 'שורת מקור']),
      sourceCourseId: find(headers, ['SourceCourseID', 'CourseID', 'CourseId', 'קורס']),
      sourceProgram: find(headers, ['SourceProgram', 'Program', 'תוכנית']),
      originalData: find(headers, ['OriginalData', 'SourceData', 'נתונים מקוריים']),
      requestedData: find(headers, ['RequestedData', 'EditedData', 'RequestedPayload', 'נתונים מבוקשים']),
      requestedByEmployeeId: find(headers, ['RequestedByEmployeeID', 'RequestedBy', 'EmployeeID', 'מבקש']),
      requestedByEmployeeName: find(headers, ['RequestedByEmployeeName', 'EmployeeName', 'שם מבקש']),
      requestedByRole: find(headers, ['RequestedByRole', 'RequesterRole', 'תפקיד מבקש']),
      systemNote: find(headers, ['SystemNote', 'Notes', 'Comment', 'הערת מערכת']),
      reviewedBy: find(headers, ['ReviewedBy', 'ApprovedBy', 'CheckedBy', 'מאשר']),
      reviewerNote: find(headers, ['ReviewerNote', 'ApproverNote', 'הערת מאשר']),
      decisionAt: find(headers, ['DecisionAt', 'ReviewedAt', 'ApprovedAt', 'תאריך החלטה'])
    };
  }

  function setDecisionColumns(row, indexes, status, userProfile, reviewerNote, decisionDate) {
    setStatus(row, indexes, status);

    if (indexes.reviewedBy > -1) {
      row[indexes.reviewedBy] = Utils.normalize(userProfile.EmployeeName || userProfile.EmployeeID);
    }

    if (indexes.reviewerNote > -1) {
      row[indexes.reviewerNote] = reviewerNote;
    }

    if (indexes.decisionAt > -1) {
      row[indexes.decisionAt] = decisionDate.toISOString();
    }
  }

  function setStatus(row, indexes, statusValue) {
    if (indexes.status > -1) row[indexes.status] = statusValue;
  }

  function appendSystemNote(row, indexes, text) {
    if (indexes.systemNote === -1) return;
    var current = readCell(row, indexes.systemNote);
    row[indexes.systemNote] = current ? (current + ' | ' + text) : text;
  }

  function buildRequesterText(row, indexes) {
    return [
      readCell(row, indexes.requestedByEmployeeName),
      readCell(row, indexes.requestedByEmployeeId),
      readCell(row, indexes.requestedByRole)
    ].filter(Boolean).join(' | ');
  }

  function buildProgramCourseText(row, indexes) {
    var program = readCell(row, indexes.sourceProgram);
    var course = readCell(row, indexes.sourceCourseId);
    return [program, course].filter(Boolean).join(' / ');
  }

  function collectUnique(rows, index) {
    if (index === -1) return [];
    var bag = {};
    rows.forEach(function (item) {
      var value = readCell(item.values, index);
      if (value) bag[value] = true;
    });
    return Object.keys(bag).sort();
  }

  function getRoleMeta(profile) {
    var roleText = [profile.SystemRole, profile.BaseRole].map(function (v) { return Utils.normalize(v).toLowerCase(); }).join(' ');
    var isMasterAdmin = /(master|מאסטר)/.test(roleText) && /(admin|אדמין)/.test(roleText);
    var isManagement = isMasterAdmin || /(admin|אדמין|manager|ניהול|הנהלה)/.test(roleText);
    return { isMasterAdmin: isMasterAdmin, isManagement: isManagement };
  }

  function parseObject(text) {
    var value = Utils.normalize(text);
    if (!value || value.charAt(0) !== '{') return null;
    try {
      var parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function find(headers, aliases) {
    return SheetService.findHeaderIndex(headers, aliases);
  }

  function readCell(row, index) {
    if (index === -1 || index >= row.length) return '';
    return Utils.normalize(row[index]);
  }

  function hasAnyValue(row) {
    return row.some(function (cell) { return !Utils.isEmpty(cell); });
  }

  function buildDetectedColumns(headers, indexes) {
    var out = {};
    Object.keys(indexes).forEach(function (key) {
      var idx = indexes[key];
      out[key] = idx > -1 ? headers[idx] : '';
    });
    return out;
  }

  function trim(text, max) {
    var s = Utils.normalize(text);
    return s.length <= max ? s : (s.slice(0, max - 1) + '…');
  }

  function normalizeKey(value) {
    return Utils.normalize(value).toLowerCase().replace(/[\s_\-]/g, '');
  }

  function formatDate(value) {
    if (!value) return '';
    var dt = value instanceof Date ? value : new Date(value);
    if (isNaN(dt.getTime())) return Utils.normalize(value);
    return dt.toISOString();
  }

  return {
    canAccessApprovals: canAccessApprovals,
    getApprovalsData: getApprovalsData,
    submitApprovalDecision: submitApprovalDecision
  };
})();
