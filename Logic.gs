var Logic = (function () {
  // הנחה: מיפויי ההרשאה לפעולות כתיבה מרוכזים כאן כדי למנוע פיצול לוגיקה בין מסלולים שונים.
  var WRITE_ACTIONS = {
    UPDATE_COURSE: 'UPDATE_COURSE',
    CREATE_EDIT_REQUEST: 'CREATE_EDIT_REQUEST',
    APPROVAL_DECISION: 'APPROVAL_DECISION',
    MARK_EXCEPTION_RESOLVED: 'MARK_EXCEPTION_RESOLVED'
  };

  // הנחה: REVIEW_REQUIRED עשוי להכיל אחד מהשדות הבאים לזיהוי/סטטוס/אודיט.
  var REVIEW_REQUIRED_FIELD_ALIASES = {
    id: ['ReviewID', 'RowID', 'ExceptionID', 'RecordID'],
    status: ['TreatmentStatus', 'Status', 'IssueStatus'],
    notes: ['Notes', 'Remarks', 'Comment'],
    resolvedBy: ['ResolvedBy', 'ClosedBy', 'HandledBy', 'UpdatedBy'],
    resolvedAt: ['ResolvedAt', 'ClosedAt', 'HandledAt', 'UpdatedAt']
  };

  function login(userIdInput, codeInput) {
    try {
      var userId = normalizeCredential_(userIdInput);
      var code = normalizeCredential_(codeInput);
      Logger.log('loginAction: received userId=%s, code=%s', userId, code);
      if (Utils.isEmpty(userId) || Utils.isEmpty(code)) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var table = Utils.readTable(CONFIG.SHEETS.PERMISSIONS, true);
      Logger.log('loginAction: PERMISSIONS data rows=%s', table.rows.length);

      var idx = resolvePermissionIndexes_(table.headers);
      if (idx.employeeId === -1 || idx.entryCode === -1 || idx.systemRole === -1 || idx.activeFlag === -1) {
        return { authenticated: false, message: 'ההתחברות נכשלה.' };
      }

      var matchedRows = table.rows.filter(function (row) {
        return normalizeCredential_(row[idx.employeeId]) === userId;
      });
      Logger.log('loginAction: employeeId match=%s', matchedRows.length > 0);
      if (!matchedRows.length) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      matchedRows = matchedRows.filter(function (row) {
        return normalizeCredential_(row[idx.entryCode]) === code;
      });
      Logger.log('loginAction: entryCode match=%s', matchedRows.length > 0);
      if (!matchedRows.length) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      matchedRows = matchedRows.filter(function (row) {
        return !isInactiveFlag_(valueAt_(row, idx.activeFlag));
      });
      Logger.log('loginAction: active matched rows=%s', matchedRows.length);
      if (!matchedRows.length) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var profile = buildSessionProfileFromPermissions_(matchedRows, idx);
      profile.authenticated = true;
      profile.userId = Utils.normalizeID(userId);
      profile.EmployeeID = Utils.normalizeID(userId);
      if (Utils.isEmpty(profile.displayName)) profile.displayName = Utils.normalize(valueAt_(matchedRows[0], idx.employeeName));
      if (Utils.isEmpty(profile.EmployeeName)) profile.EmployeeName = profile.displayName;
      if (Utils.isEmpty(profile.SystemRole)) profile.SystemRole = Utils.normalize(valueAt_(matchedRows[0], idx.systemRole));
      if (Utils.isEmpty(profile.ActiveFlag)) profile.ActiveFlag = Utils.normalize(valueAt_(matchedRows[0], idx.activeFlag));
      profile.team = Utils.normalize(profile.TeamScope);
      if (!profile.PermissionRows) profile.PermissionRows = matchedRows.length;

      var first = matchedRows[0];
      if (Utils.isEmpty(profile.BaseRole)) profile.BaseRole = Utils.normalize(valueAt_(first, idx.baseRole));
      if (Utils.isEmpty(profile.UiProfile)) profile.UiProfile = Utils.normalize(valueAt_(first, idx.uiProfile));
      if (Utils.isEmpty(profile.DisplayRole)) profile.DisplayRole = Utils.normalize(valueAt_(first, idx.displayRole));
      if (Utils.isEmpty(profile.ViewScope)) profile.ViewScope = Utils.normalize(valueAt_(first, idx.viewScope));
      if (Utils.isEmpty(profile.EditScope)) profile.EditScope = Utils.normalize(valueAt_(first, idx.editScope));
      if (Utils.isEmpty(profile.ApprovalScope)) profile.ApprovalScope = Utils.normalize(valueAt_(first, idx.approvalScope));
      if (Utils.isEmpty(profile.IsDualMode)) profile.IsDualMode = Utils.normalize(valueAt_(first, idx.isDualMode));

      Logger.log('loginAction: matched SystemRole=%s', profile.SystemRole);
      PropertiesService.getUserProperties().setProperty(CONFIG.SESSION_KEY, JSON.stringify(profile));
      return profile;
    } catch (err) {
      return { authenticated: false, message: 'ההתחברות נכשלה.' };
    }
  }

  function buildSessionProfileFromPermissions_(rows, idx) {
    var scopeJoin = function (index) { return joinUniqueValues_(rows, index, ', '); };
    var primary = choosePrimaryPermissionRow_(rows, idx.systemRole);
    var roleCounts = countRoles_(rows, idx.systemRole);
    var primaryRole = Utils.normalize(valueAt_(primary, idx.systemRole));
    var dualFlag = Utils.normalize(valueAt_(primary, idx.isDualMode));

    if (!dualFlag && roleCounts.instructor > 0 && (roleCounts.manager > 0 || roleCounts.managerLead > 0 || roleCounts.admin > 0 || roleCounts.adminOps > 0)) {
      dualFlag = 'BOTH';
    }

    return {
        authenticated: true,
        displayName: Utils.normalize(valueAt_(primary, idx.employeeName)),
        EmployeeName: Utils.normalize(valueAt_(primary, idx.employeeName)),
        BaseRole: Utils.normalize(valueAt_(primary, idx.baseRole)),
        SystemRole: primaryRole,
        DisplayRole: Utils.normalize(valueAt_(primary, idx.displayRole)),
        ViewScope: scopeJoin(idx.viewScope),
        EditScope: scopeJoin(idx.editScope),
        ApprovalScope: scopeJoin(idx.approvalScope),
        UiProfile: Utils.normalize(valueAt_(primary, idx.uiProfile)),
        TeamScope: scopeJoin(idx.teamScope),
        IsDualMode: dualFlag,
        ActiveFlag: Utils.normalize(valueAt_(primary, idx.activeFlag)),
        PermissionRows: rows.length
      };
  }

  function logout() {
    PropertiesService.getUserProperties().deleteProperty(CONFIG.SESSION_KEY);
    return { success: true };
  }

  function getSessionProfile() {
    var profile = getSession_();
    if (!profile) return { authenticated: false, message: 'אין חיבור פעיל.' };
    return profile;
  }

  function getDashboardData() {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      var requestsTable = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, false);
      var requestIndexes = resolveRequestIndexes_(requestsTable.headers);
      var pendingEden = countByStatus_(requestsTable.rows, requestIndexes.approvalStatus, CONFIG.STATUSES.PENDING_EDEN);
      var pendingFinal = countByStatus_(requestsTable.rows, requestIndexes.approvalStatus, CONFIG.STATUSES.PENDING_FINAL);
      var approvedFinal = countByStatus_(requestsTable.rows, requestIndexes.approvalStatus, CONFIG.STATUSES.FINAL_APPROVED);

      var summaryTable = Utils.readTable(CONFIG.SHEETS.SUMMARY, false);
      var exportTable = Utils.readTable(CONFIG.SHEETS.DASHBOARD_EXPORT, false);
      var summaryMetrics = parseSummaryMetrics_(summaryTable.headers, summaryTable.rows);
      var exportMetrics = parseDashboardExportMetrics_(exportTable.headers, exportTable.rows);
      var reviewCount = asNumber_(summaryMetrics.reviewRequiredCount);
      if (!reviewCount) reviewCount = asNumber_(summaryMetrics.needsReviewCount);
      if (!reviewCount) reviewCount = asNumber_(summaryMetrics.exceptionCount);

      return {
        success: true,
        data: {
          totalDataMaster: Utils.countDataRows(CONFIG.SHEETS.DATA_MASTER),
          reviewRequiredCount: reviewCount || Utils.countDataRows(CONFIG.SHEETS.REVIEW_REQUIRED),
          pendingRequests: pendingEden,
          pendingFinal: pendingFinal,
          approvedFinal: approvedFinal,
          exportRows: Utils.countDataRows(CONFIG.SHEETS.DASHBOARD_EXPORT),
          activeNowCount: asNumber_(summaryMetrics.activeNowCount) || asNumber_(exportMetrics.activeNowCount),
          todayActivitiesCount: asNumber_(summaryMetrics.todayActivitiesCount) || asNumber_(exportMetrics.todayActivitiesCount),
          weekActivitiesCount: asNumber_(summaryMetrics.weekActivitiesCount) || asNumber_(exportMetrics.weekActivitiesCount),
          monthActivitiesCount: asNumber_(summaryMetrics.monthActivitiesCount) || asNumber_(exportMetrics.monthActivitiesCount),
          activeCoursesCount: asNumber_(summaryMetrics.activeCoursesCount) || asNumber_(exportMetrics.activeCoursesCount),
          activeInstructorsCount: asNumber_(summaryMetrics.activeInstructorsCount) || asNumber_(exportMetrics.activeInstructorsCount),
          missingReportCount: asNumber_(summaryMetrics.missingReportCount) || asNumber_(exportMetrics.missingReportCount),
          endingSoonCount: asNumber_(summaryMetrics.endingSoonCount) || asNumber_(exportMetrics.endingSoonCount),
          exceptionCount: asNumber_(summaryMetrics.exceptionCount) || asNumber_(exportMetrics.exceptionCount),
          changeRequestCount: asNumber_(summaryMetrics.changeRequestCount) || asNumber_(exportMetrics.changeRequestCount),
          instructorOverloadCount: asNumber_(summaryMetrics.instructorOverloadCount) || asNumber_(exportMetrics.instructorOverloadCount),
          unassignedInstructorCount: asNumber_(summaryMetrics.unassignedInstructorCount) || asNumber_(exportMetrics.unassignedInstructorCount),
          instructorGapCount: asNumber_(summaryMetrics.instructorGapCount) || asNumber_(exportMetrics.instructorGapCount)
        }
      };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון דשבורד.');
    }
  }

  function getMyCoursesData(filters) {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      var table = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, true);
      var instructorIndexes = resolveInstructorRowIndexes_(table.headers);
      var idxProgram = Utils.resolveIndex(table.headers, CONFIG.FIELDS.PROGRAM);
      var idxStatus = Utils.resolveIndex(table.headers, CONFIG.FIELDS.STATUS);

      var rows = table.rows.filter(function (row) {
        if (isInstructor_(session.user)) {
          return doesRowBelongToUser_(row, instructorIndexes, session.user);
        }
        return true;
      });

      var filterObj = Utils.asObject(filters, {});
      if (!Utils.isEmpty(filterObj.program) && idxProgram > -1) {
        rows = rows.filter(function (row) { return Utils.toKey(row[idxProgram]) === Utils.toKey(filterObj.program); });
      }
      if (!Utils.isEmpty(filterObj.status) && idxStatus > -1) {
        rows = rows.filter(function (row) { return Utils.toKey(row[idxStatus]) === Utils.toKey(filterObj.status); });
      }
      if (!Utils.isEmpty(filterObj.search)) {
        var query = Utils.toKey(filterObj.search);
        rows = rows.filter(function (row) { return row.some(function (cell) { return Utils.toKey(cell).indexOf(query) > -1; }); });
      }

      var dynamicDateFields = table.headers.filter(function (header) {
        return /^Date([1-9]|[12][0-9]|30)$/.test(Utils.normalize(header));
      }).sort(function (a, b) {
        return Number(String(a).replace('Date', '')) - Number(String(b).replace('Date', ''));
      });
      var frontendFields = CONFIG.FRONTEND_FIELDS.COURSES.concat(dynamicDateFields, ['InstructorDisplayRole']);
      var permissionsLookup = buildInstructorLookup_();

      var items = rows.map(function (row) {
        var out = {};
        frontendFields.forEach(function (field) {
          var fieldIdx = Utils.resolveIndex(table.headers, CONFIG.FIELDS[field] || [field]);
          out[field] = fieldIdx > -1 ? row[fieldIdx] : '';
        });
        var assignment = resolveInstructorAssignment_(out, permissionsLookup);
        out.Employee = assignment.name;
        out.Instructor = assignment.name;
        out.EmployeeID = assignment.id;
        out.InstructorDisplayRole = assignment.displayRole;
        return out;
      });

      return { success: true, data: { items: items, sourceSheet: CONFIG.SHEETS.DATA_MASTER, fields: frontendFields } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון פעילויות.');
    }
  }


  function getSheetRows(payload) {
    try {
      var body = Utils.asObject(payload, {});
      var sheetName = Utils.normalize(body.sheetName || body.SheetName);
      if (Utils.isEmpty(sheetName)) return Utils.safeMessage('sheetName הוא שדה חובה.');

      var table = Utils.readTable(sheetName, true);
      return {
        success: true,
        data: {
          sheetName: sheetName,
          headerRow: table.headers,
          displayRow: table.displayHeaders,
          dataRows: table.rows,
          rowNumbers: table.rowNumbers
        }
      };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון נתונים מהגיליון.');
    }
  }

  function updateCourse(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      var body = Utils.asObject(payload, {});
      var courseId = Utils.normalize(body.CourseID);
      var changes = Utils.asObject(body.changes, {});
      if (Utils.isEmpty(courseId)) return Utils.safeMessage('CourseID הוא שדה חובה.');
      if (!Object.keys(changes).length) return Utils.safeMessage('changes חייב להכיל לפחות שדה אחד.');
      requireWritePermission_(session.user, WRITE_ACTIONS.UPDATE_COURSE, { courseId: courseId, team: body.Team });
      if (!canEditCourseByRole_(session.user, courseId, body.Team)) return Utils.safeMessage('אין הרשאה לעדכן פעילות זו.');

      var sheetTargets = [
        { sheetName: CONFIG.SHEETS.DATA_MASTER, required: true },
        { sheetName: CONFIG.SHEETS.COURSES, required: true }
      ];
      var updateResult = {};

      sheetTargets.forEach(function (target) {
        var table = Utils.readTable(target.sheetName, target.required);
        var courseIndex = Utils.resolveIndex(table.headers, ['CourseID']);
        if (courseIndex === -1) throw new Error('missing_course_id_' + target.sheetName);

        var rowMatch = findRowByCourseId_(table, courseIndex, courseId);
        if (!rowMatch) throw new Error('course_not_found_' + target.sheetName);

        var updatedRow = rowMatch.row.slice();
        Object.keys(changes).forEach(function (field) {
          if (field === 'CourseID') return;
          var fieldIndex = Utils.resolveIndex(table.headers, [field]);
          if (fieldIndex === -1) return;
          updatedRow[fieldIndex] = changes[field];
        });

        Utils.updateRow(target.sheetName, rowMatch.rowNumber, updatedRow);
        updateResult[target.sheetName] = Utils.rowToObject(table.headers, updatedRow, rowMatch.rowNumber);
      });

      return {
        success: true,
        data: {
          CourseID: courseId,
          DATA_MASTER: updateResult[CONFIG.SHEETS.DATA_MASTER],
          COURSES: updateResult[CONFIG.SHEETS.COURSES]
        }
      };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לעדכן קורס.');
    }
  }

  function createEditRequest(payload) {
    var body = Utils.asObject(payload, {});
    if (Utils.toKey(body.operation) === Utils.toKey('MARK_EXCEPTION_RESOLVED')) {
      return markExceptionResolved_(body);
    }
    return submitEditRequest(payload || {});
  }

  function submitEditRequest(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    if (!canCreateRequest_(session.user)) return Utils.safeMessage('אין הרשאה להגיש בקשת שינוי.');

    try {
      Utils.ensureEditRequestsSheet();
      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var body = normalizeEditRequestPayload_(payload, session.user);
      var requestId = Utils.normalize(body.RequestID) || generateRequestId_();
      var idx = resolveRequestIndexes_(table.headers);
      var existing = findRequestById_(table, idx.requestId, requestId);

      if (existing && !canEditDraft_(session.user, existing.row, idx)) {
        return Utils.safeMessage('אין הרשאה לערוך בקשה זו.');
      }

      requireWritePermission_(session.user, WRITE_ACTIONS.CREATE_EDIT_REQUEST, { courseId: Utils.normalize(body.CourseID), team: body.Team });
      if (!canEditCourseByRole_(session.user, Utils.normalize(body.CourseID), body.Team)) {
        return Utils.safeMessage('ניתן לערוך רק פעילות צוותית מורשית.');
      }

      var status = normalizeInputStatus_(body.ApprovalStatus || body.status, existing ? valueAt_(existing.row, idx.approvalStatus) : '');
      var record = buildRequestRecord_(table.headers, idx, body, session.user, requestId, status, existing ? existing.row : null);
      var values = table.headers.map(function (header) { return record[header] || ''; });

      if (existing) {
        Utils.updateRow(CONFIG.SHEETS.EDIT_REQUESTS, existing.rowNumber, values);
        return { success: true, data: { RequestID: requestId, ApprovalStatus: status, mode: 'update' } };
      }

      Utils.appendRow(CONFIG.SHEETS.EDIT_REQUESTS, values);
      return { success: true, data: { RequestID: requestId, ApprovalStatus: status, mode: 'append' } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לשמור בקשה.');
    }
  }

  function getMyRequestsData(payload) {
    var session = requireSession_();
    if (!session.success) return session;

    try {
      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var idx = resolveRequestIndexes_(table.headers);
      if (idx.requestedBy === -1) return { success: true, data: { items: [] } };

      var query = Utils.asObject(payload, {});
      var limit = Math.max(1, Math.min(Number(query.limit || 250), 500));
      var offset = Math.max(0, Number(query.offset || 0));
      var items = table.rows.filter(function (row) {
        return Utils.toKey(row[idx.requestedBy]) === Utils.toKey(session.user.userId);
      }).map(function (row) {
        return projectRequestForFrontend_(row, idx);
      }).slice(offset, offset + limit);

      return { success: true, data: { items: items } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון בקשות.');
    }
  }

  function getApprovalsData(payload) {
    var session = requireSession_();
    if (!session.success) return session;

    try {
      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var idx = resolveRequestIndexes_(table.headers);
      if (idx.approvalStatus === -1) return { success: true, data: { items: [] } };

      var targetStatus = isEden_(session.user) ? CONFIG.STATUSES.PENDING_EDEN : isIdan_(session.user) ? CONFIG.STATUSES.PENDING_FINAL : '';
      if (!targetStatus) return Utils.safeMessage('אין הרשאה.');

      var query = Utils.asObject(payload, {});
      var limit = Math.max(1, Math.min(Number(query.limit || 250), 500));
      var offset = Math.max(0, Number(query.offset || 0));
      var items = table.rows.filter(function (row) {
        return Utils.toKey(row[idx.approvalStatus]) === Utils.toKey(targetStatus);
      }).map(function (row) {
        return projectRequestForFrontend_(row, idx);
      }).slice(offset, offset + limit);

      return { success: true, data: { items: items } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון אישורים.');
    }
  }

  function getEdenViewData(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    if (!isEden_(session.user) && !isIdan_(session.user)) return Utils.safeMessage('אין הרשאה.');

    try {
      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var idx = resolveRequestIndexes_(table.headers);
      var query = Utils.asObject(payload, {});
      var limit = Math.max(1, Math.min(Number(query.limit || 250), 500));
      var offset = Math.max(0, Number(query.offset || 0));
      var items = table.rows.filter(function (row) {
        return Utils.toKey(row[idx.edenViewStatus]) === Utils.toKey(CONFIG.STATUSES.EDEN_APPROVED);
      }).map(function (row) {
        return projectRequestForFrontend_(row, idx);
      }).slice(offset, offset + limit);

      return { success: true, data: { items: items } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון את תצוגת עדן.');
    }
  }

  function approveRequest(payload) {
    return updateDecision_(payload, true);
  }

  function rejectRequest(payload) {
    return updateDecision_(payload, false);
  }

  function updateDecision_(payload, approved) {
    var session = requireSession_();
    if (!session.success) return session;

    try {
      requireWritePermission_(session.user, WRITE_ACTIONS.APPROVAL_DECISION, {});
      var body = Utils.asObject(payload, {});
      var requestId = Utils.normalize(body.RequestID);
      if (Utils.isEmpty(requestId)) return Utils.safeMessage('הפעולה לא בוצעה.');

      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var idx = resolveRequestIndexes_(table.headers);
      var existing = findRequestById_(table, idx.requestId, requestId);
      if (!existing) return Utils.safeMessage('הפעולה לא בוצעה.');

      var row = existing.row.slice();
      var current = Utils.toKey(valueAt_(row, idx.approvalStatus));

      if (isEden_(session.user)) {
        if (current !== Utils.toKey(CONFIG.STATUSES.PENDING_EDEN)) return Utils.safeMessage('הבקשה אינה בשלב בקרה ותפעול.');
        row[idx.approvalStatus] = approved ? CONFIG.STATUSES.PENDING_FINAL : CONFIG.STATUSES.DECLINED;
        if (idx.requestStatus > -1) row[idx.requestStatus] = approved ? CONFIG.STATUSES.PENDING_FINAL : CONFIG.STATUSES.DECLINED;
        if (idx.edenViewStatus > -1) row[idx.edenViewStatus] = approved ? CONFIG.STATUSES.EDEN_APPROVED : CONFIG.STATUSES.DECLINED;
        if (idx.finalApprovalStatus > -1) row[idx.finalApprovalStatus] = '';
        if (idx.edenApprovedAt > -1) row[idx.edenApprovedAt] = approved ? Utils.nowIso() : '';
      } else if (isIdan_(session.user)) {
        if (current !== Utils.toKey(CONFIG.STATUSES.PENDING_FINAL)) return Utils.safeMessage('הרשומה אינה זמינה לאישור סופי.');
        row[idx.approvalStatus] = approved ? CONFIG.STATUSES.FINAL_APPROVED : CONFIG.STATUSES.DECLINED;
        if (idx.finalApprovalStatus > -1) row[idx.finalApprovalStatus] = approved ? CONFIG.STATUSES.FINAL_APPROVED : CONFIG.STATUSES.DECLINED;
        if (idx.requestStatus > -1) row[idx.requestStatus] = approved ? CONFIG.STATUSES.FINAL_APPROVED : CONFIG.STATUSES.DECLINED;
        if (idx.finalizedAt > -1) row[idx.finalizedAt] = approved ? Utils.nowIso() : '';
        if (approved) applyToDataMaster_(row, idx);
      } else {
        return Utils.safeMessage('אין הרשאה.');
      }

      if (!approved && idx.rejectedAt > -1) row[idx.rejectedAt] = Utils.nowIso();
      if (idx.approvalNotes > -1) row[idx.approvalNotes] = Utils.normalize(body.ApprovalNotes);
      if (idx.assignedEditor > -1) row[idx.assignedEditor] = session.user.userId;
      Utils.updateRow(CONFIG.SHEETS.EDIT_REQUESTS, existing.rowNumber, row);

      return { success: true, data: { RequestID: requestId, ApprovalStatus: row[idx.approvalStatus] } };
    } catch (err) {
      return Utils.safeMessage('הפעולה לא בוצעה.');
    }
  }

  function applyToDataMaster_(requestRow, idx) {
    var courseId = valueAt_(requestRow, idx.courseId);
    if (Utils.isEmpty(courseId)) return;
    var requested = Utils.parseJson(valueAt_(requestRow, idx.requestedData));
    var table = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, false);
    if (!table.sheet || !table.headers.length) return;

    var idxCourse = Utils.resolveIndex(table.headers, ['CourseID']);
    if (idxCourse === -1) return;

    for (var i = 0; i < table.rows.length; i += 1) {
      if (Utils.toKey(table.rows[i][idxCourse]) !== Utils.toKey(courseId)) continue;
      var updated = table.rows[i].slice();
      setMasterField_(table.headers, updated, ['Date'], requested.date);
      setMasterField_(table.headers, updated, ['Day'], requested.day);
      setMasterField_(table.headers, updated, ['StartTime'], requested.startTime);
      setMasterField_(table.headers, updated, ['EndTime'], requested.endTime);
      setMasterField_(table.headers, updated, ['ClassGroup'], requested.classGroup);
      setMasterField_(table.headers, updated, ['ActualMeetings'], requested.actualMeetings);
      setMasterField_(table.headers, updated, ['CourseManager'], requested.courseManager);
      setMasterField_(table.headers, updated, ['Instructor'], requested.instructor);
      setMasterField_(table.headers, updated, ['Notes'], requested.notes);
      Utils.updateRow(CONFIG.SHEETS.DATA_MASTER, table.rowNumbers[i], updated);
      break;
    }
  }

  function setMasterField_(headers, row, aliases, value) {
    if (Utils.isEmpty(value)) return;
    var i = Utils.resolveIndex(headers, aliases);
    if (i > -1) row[i] = value;
  }

  function buildRequestRecord_(headers, idx, body, user, requestId, status, existingRow) {
    var record = {};
    headers.forEach(function (header) { record[header] = existingRow ? existingRow[Utils.resolveIndex(headers, [header])] : ''; });

    var originalData = Utils.asObject(body.originalData || body.OriginalData, {});
    var requestedData = Utils.asObject(body.requestedData || body.RequestedData, {});

    setField_(record, headers, idx.requestId, requestId);
    setField_(record, headers, idx.courseId, Utils.normalize(body.CourseID));
    setField_(record, headers, idx.requestedBy, existingRow ? valueAt_(existingRow, idx.requestedBy) : user.userId);
    setField_(record, headers, idx.requestedAt, existingRow ? valueAt_(existingRow, idx.requestedAt) : Utils.nowIso());
    setField_(record, headers, idx.requestStatus, status);
    setField_(record, headers, idx.edenViewStatus, status === CONFIG.STATUSES.PENDING_FINAL ? CONFIG.STATUSES.EDEN_APPROVED : '');
    setField_(record, headers, idx.finalApprovalStatus, status === CONFIG.STATUSES.FINAL_APPROVED ? CONFIG.STATUSES.FINAL_APPROVED : '');
    setField_(record, headers, idx.approvalStatus, status);
    setField_(record, headers, idx.approvalNotes, Utils.normalize(body.ApprovalNotes));
    setField_(record, headers, idx.changeSummary, Utils.normalize(body.ChangeSummary || 'עדכון פעילות'));
    setField_(record, headers, idx.originalData, Utils.safeJson(originalData));
    setField_(record, headers, idx.requestedData, Utils.safeJson(requestedData));
    setField_(record, headers, idx.editableBy, Utils.normalize(body.EditableBy || user.userId));

    setField_(record, headers, idx.date, Utils.normalize(body.Date || requestedData.date));
    setField_(record, headers, idx.day, Utils.normalize(body.Day || requestedData.day));
    setField_(record, headers, idx.startTime, Utils.normalize(body.StartTime || requestedData.startTime));
    setField_(record, headers, idx.endTime, Utils.normalize(body.EndTime || requestedData.endTime));
    setField_(record, headers, idx.classGroup, Utils.normalize(body.ClassGroup || requestedData.classGroup));
    setField_(record, headers, idx.actualMeetings, Utils.normalize(body.ActualMeetings || requestedData.actualMeetings));
    setField_(record, headers, idx.courseManager, Utils.normalize(body.CourseManager || requestedData.courseManager));
    setField_(record, headers, idx.instructor, Utils.normalize(body.Instructor || requestedData.instructor));
    setField_(record, headers, idx.notes, Utils.normalize(body.Notes || requestedData.notes));

    return record;
  }

  function projectRequestForFrontend_(row, idx) {
    var out = {};
    CONFIG.FRONTEND_FIELDS.REQUESTS.forEach(function (fieldName) {
      out[fieldName] = valueAt_(row, idx[toIndexKey_(fieldName)]);
    });
    return out;
  }

  function resolveRequestIndexes_(headers) {
    var out = {};
    CONFIG.EDIT_REQUESTS_HEADER_ROW.forEach(function (fieldName) {
      out[toIndexKey_(fieldName)] = Utils.resolveIndex(headers, CONFIG.FIELDS[fieldName]);
    });
    return out;
  }

  function toIndexKey_(fieldName) {
    var map = {
      RequestID: 'requestId', CourseID: 'courseId', RequestedBy: 'requestedBy', RequestedAt: 'requestedAt',
      RequestStatus: 'requestStatus', EdenViewStatus: 'edenViewStatus', FinalApprovalStatus: 'finalApprovalStatus',
      ApprovalStatus: 'approvalStatus', ApprovalNotes: 'approvalNotes', ChangeSummary: 'changeSummary',
      OriginalData: 'originalData', RequestedData: 'requestedData', EditableBy: 'editableBy', AssignedEditor: 'assignedEditor',
      EdenApprovedAt: 'edenApprovedAt', FinalizedAt: 'finalizedAt', RejectedAt: 'rejectedAt',
      Date: 'date', Day: 'day', StartTime: 'startTime', EndTime: 'endTime', ClassGroup: 'classGroup',
      ActualMeetings: 'actualMeetings', CourseManager: 'courseManager', Instructor: 'instructor', Notes: 'notes'
    };
    return map[fieldName];
  }

  function findRequestById_(table, idxRequestId, requestId) {
    if (idxRequestId === -1) return null;
    for (var i = 0; i < table.rows.length; i += 1) {
      if (Utils.toKey(table.rows[i][idxRequestId]) === Utils.toKey(requestId)) {
        return { row: table.rows[i], rowNumber: table.rowNumbers[i] };
      }
    }
    return null;
  }

  function canEditDraft_(user, row, idx) {
    var ownerMatches = Utils.toKey(valueAt_(row, idx.requestedBy)) === Utils.toKey(user.userId);
    var isDraft = Utils.toKey(valueAt_(row, idx.approvalStatus)) === Utils.toKey(CONFIG.STATUSES.DRAFT);
    return ownerMatches && isDraft;
  }

  function normalizeInputStatus_(requestedStatus, fallback) {
    var normalized = Utils.toKey(requestedStatus);
    if (normalized === Utils.toKey(CONFIG.STATUSES.DRAFT)) return CONFIG.STATUSES.DRAFT;
    if (normalized === Utils.toKey(CONFIG.STATUSES.PENDING_EDEN) || normalized === Utils.toKey('pending')) return CONFIG.STATUSES.PENDING_EDEN;
    if (Utils.toKey(fallback) === Utils.toKey(CONFIG.STATUSES.DRAFT)) return CONFIG.STATUSES.DRAFT;
    return CONFIG.STATUSES.PENDING_EDEN;
  }

  function countByStatus_(rows, statusIndex, statusValue) {
    if (statusIndex === -1) return 0;
    var count = 0;
    rows.forEach(function (row) {
      if (Utils.toKey(row[statusIndex]) === Utils.toKey(statusValue)) count += 1;
    });
    return count;
  }

  function parseSummaryMetrics_(headers, rows) {
    if (!headers || !headers.length || !rows || !rows.length) return {};
    var metrics = {};
    if (rows.length === 1) {
      mapMetricFields_(metrics, headers, rows[0]);
      return metrics;
    }

    var keyIndex = Utils.resolveIndex(headers, ['Metric', 'MetricKey', 'Key', 'Name', 'KPI', 'Code']);
    var valueIndex = Utils.resolveIndex(headers, ['Value', 'MetricValue', 'Count', 'Total', 'Amount']);
    if (keyIndex === -1 || valueIndex === -1) return metrics;

    rows.forEach(function (row) {
      var metricKey = normalizeMetricKey_(row[keyIndex]);
      if (!metricKey) return;
      metrics[metricKey] = asNumber_(row[valueIndex]);
    });
    return metrics;
  }

  function parseDashboardExportMetrics_(headers, rows) {
    if (!headers || !headers.length || !rows || !rows.length) return {};
    var totals = {};
    rows.forEach(function (row) {
      mapMetricFields_(totals, headers, row, true);
    });
    return totals;
  }

  function mapMetricFields_(target, headers, row, addMode) {
    headers.forEach(function (header, i) {
      var metricKey = normalizeMetricKey_(header);
      if (!metricKey) return;
      var value = asNumber_(row[i]);
      if (!value && value !== 0) return;
      if (addMode) target[metricKey] = asNumber_(target[metricKey]) + value;
      else target[metricKey] = value;
    });
  }

  function normalizeMetricKey_(value) {
    var key = Utils.toKey(value).replace(/[\s_-]+/g, '');
    var aliases = {
      activenowcount: 'activeNowCount',
      activitiestoday: 'todayActivitiesCount',
      todayactivitiescount: 'todayActivitiesCount',
      activitiesweek: 'weekActivitiesCount',
      weekactivitiescount: 'weekActivitiesCount',
      activitiesmonth: 'monthActivitiesCount',
      monthactivitiescount: 'monthActivitiesCount',
      activecoursescount: 'activeCoursesCount',
      activeinstructorscount: 'activeInstructorsCount',
      missingreportcount: 'missingReportCount',
      endingsooncount: 'endingSoonCount',
      exceptioncount: 'exceptionCount',
      needsreviewcount: 'reviewRequiredCount',
      reviewrequiredcount: 'reviewRequiredCount',
      changerequestcount: 'changeRequestCount',
      instructoroverloadcount: 'instructorOverloadCount',
      unassignedinstructorcount: 'unassignedInstructorCount',
      instructorgapcount: 'instructorGapCount'
    };
    return aliases[key] || '';
  }

  function asNumber_(value) {
    var text = Utils.normalize(value).replace(/,/g, '');
    if (text === '') return 0;
    var number = Number(text);
    return isNaN(number) ? 0 : number;
  }

  function canCreateRequest_(user) {
    return !isInstructor_(user);
  }

  function canEditCourseByRole_(user, courseId, payloadTeam) {
    if (isIdan_(user) || isEden_(user) || isManagerLead_(user)) return true;
    if (!isManager_(user)) return false;
    var effectiveTeam = Utils.normalize(payloadTeam);
    if (Utils.isEmpty(effectiveTeam) && !Utils.isEmpty(courseId)) {
      effectiveTeam = resolveTeamScopeByCourseId_(courseId);
    }
    if (Utils.isEmpty(user.team) || Utils.isEmpty(effectiveTeam)) return false;
    return Utils.toKey(user.team) === Utils.toKey(effectiveTeam);
  }

  function normalizeEditRequestPayload_(payload, user) {
    var body = Utils.asObject(payload, {});
    var out = {};
    Object.keys(body).forEach(function (key) { out[key] = body[key]; });

    var courseId = Utils.normalize(body.CourseID || body.courseId);
    var changes = Utils.asObject(body.changes, {});
    var requestedData = Utils.asObject(body.requestedData || body.RequestedData, {});
    if (!Object.keys(requestedData).length && Object.keys(changes).length) requestedData = changes;
    if (!courseId) return out;

    var originalData = Utils.asObject(body.originalData || body.OriginalData, {});
    if (!Object.keys(originalData).length) {
      var snapshot = getCourseSnapshotById_(courseId);
      if (snapshot) originalData = snapshot;
    }

    if (!Utils.normalize(out.RequestedBy)) out.RequestedBy = user.userId;
    if (!Utils.normalize(out.ChangeSummary)) out.ChangeSummary = 'עדכון פעילות';
    if (!Utils.normalize(out.ApprovalStatus)) out.ApprovalStatus = CONFIG.STATUSES.PENDING_EDEN;
    if (!Utils.normalize(out.Team)) out.Team = resolveTeamScopeByCourseId_(courseId);

    out.CourseID = courseId;
    out.requestedData = requestedData;
    out.RequestedData = requestedData;
    out.originalData = originalData;
    out.OriginalData = originalData;
    return out;
  }

  function markExceptionResolved_(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      requireWritePermission_(session.user, WRITE_ACTIONS.MARK_EXCEPTION_RESOLVED, {});
      var body = Utils.asObject(payload, {});
      var table = Utils.readTable(CONFIG.SHEETS.REVIEW_REQUIRED, true);
      if (!table.headers.length) return Utils.safeMessage('לא נמצאו כותרות ב-REVIEW_REQUIRED.');

      var target = resolveReviewRowTarget_(table, body);
      if (!target) return Utils.safeMessage('לא נמצאה רשומת חריגה לעדכון.');

      var updated = target.row.slice();
      var idxStatus = Utils.resolveIndex(table.headers, REVIEW_REQUIRED_FIELD_ALIASES.status);
      var idxNotes = Utils.resolveIndex(table.headers, REVIEW_REQUIRED_FIELD_ALIASES.notes);
      var idxResolvedBy = Utils.resolveIndex(table.headers, REVIEW_REQUIRED_FIELD_ALIASES.resolvedBy);
      var idxResolvedAt = Utils.resolveIndex(table.headers, REVIEW_REQUIRED_FIELD_ALIASES.resolvedAt);

      if (idxStatus > -1) {
        updated[idxStatus] = 'RESOLVED';
      } else if (idxNotes > -1) {
        // הנחה: אם אין עמודת סטטוס ב-REVIEW_REQUIRED, מעדכנים את Notes בסמן טיפול.
        var existingNotes = Utils.normalize(updated[idxNotes]);
        var prefix = existingNotes ? existingNotes + ' | ' : '';
        updated[idxNotes] = prefix + 'RESOLVED ' + Utils.nowIso();
      } else {
        return Utils.safeMessage('לא קיימת עמודת סטטוס או הערות לעדכון חריגה.');
      }

      if (idxResolvedBy > -1) updated[idxResolvedBy] = session.user.userId;
      if (idxResolvedAt > -1) updated[idxResolvedAt] = Utils.nowIso();

      Utils.updateRow(CONFIG.SHEETS.REVIEW_REQUIRED, target.rowNumber, updated);
      return {
        success: true,
        data: {
          rowNumber: target.rowNumber,
          status: idxStatus > -1 ? updated[idxStatus] : '',
          resolvedBy: idxResolvedBy > -1 ? updated[idxResolvedBy] : '',
          resolvedAt: idxResolvedAt > -1 ? updated[idxResolvedAt] : ''
        }
      };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לסמן חריגה כטופלה.');
    }
  }

  function resolveReviewRowTarget_(table, body) {
    var reviewId = Utils.normalize(body.ReviewID || body.reviewId || body.RowID || body.ExceptionID);
    var requestedRowNumber = Number(body.reviewRowNumber || body.rowNumber || 0);
    if (requestedRowNumber > 0) {
      for (var i = 0; i < table.rowNumbers.length; i += 1) {
        if (Number(table.rowNumbers[i]) !== requestedRowNumber) continue;
        return { row: table.rows[i], rowNumber: table.rowNumbers[i] };
      }
    }
    if (!reviewId) return null;
    var idxId = Utils.resolveIndex(table.headers, REVIEW_REQUIRED_FIELD_ALIASES.id);
    if (idxId === -1) return null;
    for (var j = 0; j < table.rows.length; j += 1) {
      if (Utils.toKey(table.rows[j][idxId]) !== Utils.toKey(reviewId)) continue;
      return { row: table.rows[j], rowNumber: table.rowNumbers[j] };
    }
    return null;
  }

  function requireWritePermission_(user, actionType, context) {
    if (!user || Utils.isEmpty(user.userId)) throw new Error('auth_required');
    var role = Utils.toKey(user.SystemRole);
    var editScope = Utils.toKey(user.EditScope);
    var approvalScope = Utils.toKey(user.ApprovalScope);
    var allowed = false;

    if (actionType === WRITE_ACTIONS.UPDATE_COURSE) {
      allowed = role === 'admin' || role === 'idan_main_admin' || editScope === 'main_data_direct_edit' || role === 'admin-ops' || role === 'manager-lead' || role === 'manager';
    } else if (actionType === WRITE_ACTIONS.CREATE_EDIT_REQUEST) {
      allowed = role !== 'instructor';
    } else if (actionType === WRITE_ACTIONS.APPROVAL_DECISION) {
      allowed = role === 'admin' || role === 'admin-ops' || approvalScope === 'all' || approvalScope === 'full';
    } else if (actionType === WRITE_ACTIONS.MARK_EXCEPTION_RESOLVED) {
      allowed = role === 'admin' || role === 'admin-ops' || role === 'manager-lead' || role === 'manager';
    }

    if (!allowed) throw new Error('unauthorized_write_' + actionType);
    if (actionType === WRITE_ACTIONS.UPDATE_COURSE && !canEditCourseByRole_(user, context && context.courseId, context && context.team)) {
      throw new Error('unauthorized_scope_' + actionType);
    }
    return true;
  }

  function resolveTeamScopeByCourseId_(courseId) {
    if (Utils.isEmpty(courseId)) return '';
    var table = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, false);
    if (!table.sheet || !table.headers.length) return '';
    var idxCourse = Utils.resolveIndex(table.headers, ['CourseID']);
    var idxTeam = Utils.resolveIndex(table.headers, CONFIG.FIELDS.TEAM);
    if (idxCourse === -1 || idxTeam === -1) return '';
    for (var i = 0; i < table.rows.length; i += 1) {
      if (Utils.toKey(table.rows[i][idxCourse]) !== Utils.toKey(courseId)) continue;
      return Utils.normalize(table.rows[i][idxTeam]);
    }
    return '';
  }

  function normalizeCredential_(value) {
    var byId = Utils.normalizeID(value);
    if (!Utils.isEmpty(byId)) return byId;
    return Utils.normalizeWhitespace(value);
  }

  function buildInstructorLookup_() {
    var table = Utils.readTable(CONFIG.SHEETS.PERMISSIONS, false);
    if (!table.sheet || !table.headers.length) return { byId: {}, byName: {} };

    var idxId = Utils.resolveIndex(table.headers, CONFIG.FIELDS.EMPLOYEE_ID);
    var idxEntryCode = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ENTRY_CODE);
    var idxName = Utils.resolveIndex(table.headers, ['Employee', 'EmployeeName', 'DisplayName']);
    var idxDisplayRole = Utils.resolveIndex(table.headers, ['DisplayRole']);
    var idxActive = Utils.resolveIndex(table.headers, ['ActiveFlag']);
    var byId = {};
    var byEntryCode = {};
    var byName = {};

    table.rows.forEach(function (row) {
      if (idxActive > -1 && isInactiveFlag_(valueAt_(row, idxActive))) return;
      var employeeId = Utils.normalizeID(valueAt_(row, idxId));
      var entryCode = normalizeCredential_(valueAt_(row, idxEntryCode));
      var employeeName = Utils.normalizeWhitespace(valueAt_(row, idxName));
      var displayRole = Utils.normalizeWhitespace(valueAt_(row, idxDisplayRole));
      if (!employeeId && !entryCode && !employeeName) return;
      var entry = {
        id: employeeId,
        entryCode: entryCode,
        name: employeeName,
        displayRole: displayRole
      };
      if (employeeId && !byId[employeeId]) byId[employeeId] = entry;
      if (entryCode && !byEntryCode[entryCode]) byEntryCode[entryCode] = entry;
      var normalizedName = Utils.normalizeName(employeeName);
      if (normalizedName && !byName[normalizedName]) byName[normalizedName] = entry;
    });

    return { byId: byId, byEntryCode: byEntryCode, byName: byName };
  }

  function resolveInstructorAssignment_(rowObject, lookup) {
    var employeeId = Utils.normalizeID(rowObject.EmployeeID || rowObject.UserID || rowObject.InstructorID);
    var entryCode = normalizeCredential_(rowObject.EntryCode || rowObject.LoginCode);
    var employeeName = Utils.normalizeWhitespace(rowObject.Employee || rowObject.Instructor || rowObject.EmployeeName);
    var byId = employeeId ? lookup.byId[employeeId] : null;
    if (byId) return byId;
    var byEntryCode = entryCode ? lookup.byEntryCode[entryCode] : null;
    if (byEntryCode) return byEntryCode;
    var byName = lookup.byName[Utils.normalizeName(employeeName)];
    if (byName) return byName;
    return { id: '', name: '', displayRole: '' };
  }

  function resolvePermissionIndexes_(headers) {
    return {
      employeeId: Utils.resolveIndex(headers, CONFIG.FIELDS.EMPLOYEE_ID),
      entryCode: Utils.resolveIndex(headers, CONFIG.FIELDS.ENTRY_CODE),
      employeeName: Utils.resolveIndex(headers, ['EmployeeName', 'Employee', 'DisplayName']),
      baseRole: Utils.resolveIndex(headers, ['BaseRole']),
      systemRole: Utils.resolveIndex(headers, ['SystemRole']),
      displayRole: Utils.resolveIndex(headers, ['DisplayRole']),
      viewScope: Utils.resolveIndex(headers, ['ViewScope']),
      editScope: Utils.resolveIndex(headers, ['EditScope']),
      approvalScope: Utils.resolveIndex(headers, ['ApprovalScope']),
      uiProfile: Utils.resolveIndex(headers, ['UiProfile']),
      teamScope: Utils.resolveIndex(headers, ['TeamScope']),
      isDualMode: Utils.resolveIndex(headers, ['IsDualMode']),
      activeFlag: Utils.resolveIndex(headers, ['ActiveFlag'])
    };
  }

  function roleRank_(role) {
    var normalized = Utils.toKey(role);
    if (normalized === 'admin' || normalized === 'idan_main_admin') return 100;
    if (normalized === 'admin-ops') return 90;
    if (normalized === 'manager-lead') return 80;
    if (normalized === 'manager') return 70;
    if (normalized === 'instructor') return 60;
    return 0;
  }

  function choosePrimaryPermissionRow_(rows, roleIdx) {
    if (!rows || !rows.length) return [];
    var best = rows[0];
    var bestRank = roleRank_(valueAt_(best, roleIdx));
    rows.forEach(function (row) {
      var rank = roleRank_(valueAt_(row, roleIdx));
      if (rank > bestRank) {
        best = row;
        bestRank = rank;
      }
    });
    return best;
  }

  function joinUniqueValues_(rows, index, separator) {
    if (index === -1) return '';
    var map = {};
    var values = [];
    rows.forEach(function (row) {
      Utils.normalize(valueAt_(row, index)).split(',').forEach(function (part) {
        var clean = Utils.normalizeWhitespace(part);
        if (!clean) return;
        var key = Utils.toKey(clean);
        if (map[key]) return;
        map[key] = true;
        values.push(clean);
      });
    });
    return values.join(separator || ', ');
  }

  function countRoles_(rows, roleIdx) {
    var out = { admin: 0, adminOps: 0, managerLead: 0, manager: 0, instructor: 0 };
    rows.forEach(function (row) {
      var role = Utils.toKey(valueAt_(row, roleIdx));
      if (role === 'admin' || role === 'idan_main_admin') out.admin += 1;
      else if (role === 'admin-ops') out.adminOps += 1;
      else if (role === 'manager-lead') out.managerLead += 1;
      else if (role === 'manager') out.manager += 1;
      else if (role === 'instructor') out.instructor += 1;
    });
    return out;
  }

  function resolveInstructorRowIndexes_(headers) {
    return {
      employeeId: Utils.resolveIndex(headers, CONFIG.FIELDS.EMPLOYEE_ID),
      entryCode: Utils.resolveIndex(headers, CONFIG.FIELDS.ENTRY_CODE),
      instructor: Utils.resolveIndex(headers, CONFIG.FIELDS.INSTRUCTOR.concat(['Employee'])),
      displayName: Utils.resolveIndex(headers, CONFIG.FIELDS.DISPLAY_NAME)
    };
  }

  function doesRowBelongToUser_(row, indexes, user) {
    var userId = normalizeCredential_(user.userId || user.EmployeeID);
    var sessionName = Utils.normalizeName(user.displayName || user.EmployeeName);
    var rowIds = [
      valueAt_(row, indexes.employeeId),
      valueAt_(row, indexes.entryCode),
      valueAt_(row, indexes.instructor)
    ];
    for (var i = 0; i < rowIds.length; i += 1) {
      var rowId = normalizeCredential_(rowIds[i]);
      if (rowId && userId && rowId === userId) return true;
    }
    var names = [valueAt_(row, indexes.instructor), valueAt_(row, indexes.displayName)];
    for (var j = 0; j < names.length; j += 1) {
      var rowName = Utils.normalizeName(names[j]);
      if (rowName && sessionName && rowName === sessionName) return true;
    }
    return false;
  }


  function findRowByCourseId_(table, courseIndex, courseId) {
    for (var i = 0; i < table.rows.length; i += 1) {
      if (Utils.toKey(table.rows[i][courseIndex]) !== Utils.toKey(courseId)) continue;
      return { row: table.rows[i], rowNumber: table.rowNumbers[i] };
    }
    return null;
  }

  function getCourseSnapshotById_(courseId) {
    var table = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, true);
    var courseIndex = Utils.resolveIndex(table.headers, ['CourseID']);
    if (courseIndex === -1) return null;
    var match = findRowByCourseId_(table, courseIndex, courseId);
    if (!match) return null;
    return Utils.rowToObject(table.headers, match.row, match.rowNumber);
  }

  function isInactiveFlag_(value) {
    var key = Utils.toKey(value);
    return key === '0' || key === 'false' || key === 'no' || key === 'inactive' || key === 'disabled';
  }

  function isIdan_(user) { return Utils.toKey(user.SystemRole) === 'admin'; }
  function isEden_(user) { return Utils.toKey(user.SystemRole) === 'admin-ops'; }
  function isManager_(user) { return Utils.toKey(user.SystemRole) === 'manager'; }
  function isManagerLead_(user) { return Utils.toKey(user.SystemRole) === 'manager-lead'; }
  function isInstructor_(user) { return Utils.toKey(user.SystemRole) === 'instructor'; }

  function requireSession_() {
    var profile = getSession_();
    if (!profile || !profile.authenticated || Utils.isEmpty(profile.userId)) return { success: false, message: 'אין חיבור פעיל.' };
    return { success: true, user: profile };
  }

  function getSession_() {
    try {
      var raw = PropertiesService.getUserProperties().getProperty(CONFIG.SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function valueAt_(row, index) {
    return index > -1 ? row[index] : '';
  }

  function setField_(record, headers, index, value) {
    if (index > -1) record[headers[index]] = value;
  }

  function generateRequestId_() {
    return 'REQ-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000000);
  }

  return {
    login: login,
    logout: logout,
    getSessionProfile: getSessionProfile,
    getDashboardData: getDashboardData,
    getMyCoursesData: getMyCoursesData,
    submitEditRequest: submitEditRequest,
    getSheetRows: getSheetRows,
    updateCourse: updateCourse,
    createEditRequest: createEditRequest,
    getMyRequestsData: getMyRequestsData,
    getApprovalsData: getApprovalsData,
    getEdenViewData: getEdenViewData,
    approveRequest: approveRequest,
    rejectRequest: rejectRequest
  };
})();
