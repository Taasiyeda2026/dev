var Logic = (function () {
  // הנחה: מיפויי ההרשאה לפעולות כתיבה מרוכזים כאן כדי למנוע פיצול לוגיקה בין מסלולים שונים.
  var WRITE_ACTIONS = {
    UPDATE_COURSE: 'UPDATE_COURSE',
    UPDATE_MEETINGS: 'UPDATE_MEETINGS',
    CREATE_MASTER_RECORD: 'CREATE_MASTER_RECORD',
    CREATE_EDIT_REQUEST: 'CREATE_EDIT_REQUEST',
    APPROVAL_DECISION: 'APPROVAL_DECISION',
    MARK_EXCEPTION_RESOLVED: 'MARK_EXCEPTION_RESOLVED',
    FINANCE_SYNC: 'FINANCE_SYNC',
    FINANCE_UPDATE: 'FINANCE_UPDATE',
    FINANCE_ARCHIVE_UPDATE: 'FINANCE_ARCHIVE_UPDATE'
  };

  // הנחה: REVIEW_REQUIRED עשוי להכיל אחד מהשדות הבאים לזיהוי/סטטוס/אודיט.
  var REVIEW_REQUIRED_FIELD_ALIASES = {
    id: ['ReviewID', 'RowID', 'ExceptionID', 'RecordID'],
    status: ['ReviewStatus'],
    notes: ['Notes', 'Remarks', 'Comment'],
    resolvedBy: ['ResolvedBy', 'ClosedBy', 'HandledBy', 'UpdatedBy'],
    resolvedAt: ['ResolvedAt', 'ClosedAt', 'HandledAt', 'UpdatedAt']
  };

  var PERF_CACHE = {
    DATA_MASTER_TTL: 240,
    PERMISSIONS_TTL: 240,
    SUMMARY_TTL: 120,
    DASHBOARD_EXPORT_TTL: 120,
    FINANCE_TTL: 240,
    DASHBOARD_RESPONSE_TTL: 90,
    INSTRUCTOR_LOOKUP_TTL: 240
  };

  var EDEN_WORKFLOW_STATUSES = {
    PENDING_EDEN: 'pending_eden',
    EDEN_SAVED: 'eden_saved',
    PENDING_FINAL: 'pending_final',
    FINAL_APPROVED: 'final_approved',
    FINAL_REJECTED: 'final_rejected',
    CLOSED: 'closed'
  };

  var EDEN_CHANGE_ORIGINS = {
    REQUEST: 'REQUEST',
    EDEN_INITIATED: 'EDEN_INITIATED'
  };

  var EDEN_CHANGE_TYPES = {
    UPDATE_EXISTING: 'UPDATE_EXISTING',
    NEW_RECORD: 'NEW_RECORD'
  };

  function logDiag_(level, eventName, meta) {
    try {
      Logger.log('[%s][%s] %s', String(level || 'INFO').toUpperCase(), eventName || 'event', Utils.safeJson(meta || {}));
    } catch (err) {}
  }

  function login(userIdInput, codeInput) {
    try {
      var userId = normalizeCredential_(userIdInput);
      var code = normalizeCredential_(codeInput);
      logDiag_('INFO', 'login_attempt', { hasUserId: !Utils.isEmpty(userId), hasCode: !Utils.isEmpty(code) });
      if (Utils.isEmpty(userId) || Utils.isEmpty(code)) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var table = getCachedPermissionsTable_(true);
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

      var profile = buildSessionProfileFromPermissions_(matchedRows, idx, table.headers);
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
      if (Utils.isEmpty(profile.UiProfile)) profile.UiProfile = Utils.normalize(valueAt_(first, idx.uiProfile));
      if (Utils.isEmpty(profile.DisplayRole)) profile.DisplayRole = Utils.normalize(valueAt_(first, idx.displayRole));
      if (Utils.isEmpty(profile.ViewScope)) profile.ViewScope = Utils.normalize(valueAt_(first, idx.viewScope));
      if (Utils.isEmpty(profile.EditScope)) profile.EditScope = Utils.normalize(valueAt_(first, idx.editScope));
      if (Utils.isEmpty(profile.ApprovalScope)) profile.ApprovalScope = Utils.normalize(valueAt_(first, idx.approvalScope));

      Logger.log('loginAction: matched SystemRole=%s', profile.SystemRole);
      PropertiesService.getUserProperties().setProperty(CONFIG.SESSION_KEY, JSON.stringify(profile));
      return profile;
    } catch (err) {
      logDiag_('WARN', 'login_failed_exception', { message: err && err.message ? err.message : String(err || '') });
      return { authenticated: false, message: 'ההתחברות נכשלה.' };
    }
  }

  function buildSessionProfileFromPermissions_(rows, idx, headers) {
    var scopeJoin = function (index) { return joinUniqueValues_(rows, index, ', '); };
    var primary = choosePrimaryPermissionRow_(rows, idx.systemRole);
    var primaryRole = Utils.normalize(valueAt_(primary, idx.systemRole));
    var capabilities = collectCapabilitiesFromRows_(rows, headers);
    var defaultView = Utils.normalize(valueAt_(primary, idx.defaultView));
    var allowedViews = getAllowedViewsFromCapabilities_(capabilities);
    return {
        authenticated: true,
        displayName: Utils.normalize(valueAt_(primary, idx.employeeName)),
        name: Utils.normalize(valueAt_(primary, idx.employeeName)),
        EmployeeName: Utils.normalize(valueAt_(primary, idx.employeeName)),
        role: primaryRole,
        SystemRole: primaryRole,
        DisplayRole: Utils.normalize(valueAt_(primary, idx.displayRole)) || Utils.normalize(valueAt_(primary, idx.systemRole)),
        ViewScope: allowedViews.join(', '),
        EditScope: getAllowedEditsFromCapabilities_(capabilities).join(', '),
        actionMode: Utils.normalize(valueAt_(primary, idx.editScope)),
        ApprovalScope: scopeJoin(idx.approvalScope) || primaryRole,
        UiProfile: defaultView,
        default_view: defaultView,
        DefaultView: defaultView,
        TeamScope: scopeJoin(idx.teamScope),
        InstructorManager: scopeJoin(idx.instructorManager),
        manager: scopeJoin(idx.instructorManager),
        active: Utils.normalize(valueAt_(primary, idx.activeFlag)),
        ActiveFlag: Utils.normalize(valueAt_(primary, idx.activeFlag)),
        CanAccessFinance: Boolean(capabilities.view_finance),
        CanEditFinance: Boolean(capabilities.edit_finance),
        CanAccessFinanceArchive: false,
        CanEditFinanceArchive: false,
        Capabilities: capabilities,
        AllowedViews: allowedViews,
        PermissionRows: rows.length
      };
  }

  function collectCapabilitiesFromRows_(rows, headers) {
    var out = {};
    (CONFIG.PERM_COLS || []).forEach(function (permCol) {
      var colIdx = Utils.resolveIndex(headers, [permCol]);
      out[permCol] = anyTrueInRows_(rows, colIdx);
    });
    return out;
  }

  function getAllowedViewsFromCapabilities_(capabilities) {
    return Object.keys(capabilities || {}).filter(function (key) {
      return key.indexOf('view_') === 0 && capabilities[key];
    });
  }

  function getAllowedEditsFromCapabilities_(capabilities) {
    return Object.keys(capabilities || {}).filter(function (key) {
      return key.indexOf('edit_') === 0 && capabilities[key];
    });
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
      var perf = startPerf_('getDashboardData');
      var data = Utils.withScriptCache('dashboard:metrics', PERF_CACHE.DASHBOARD_RESPONSE_TTL, function () {
        var requestsStage = perf.startStage('sheet.edit_requests');
        var requestsTable = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, false, { requestMemoKey: 'dashboard:requests' });
        perf.endStage(requestsStage, { rows: requestsTable.rows.length });
        var requestIndexes = resolveRequestIndexes_(requestsTable.headers);
        var pendingEden = countByStatus_(requestsTable.rows, requestIndexes.approvalStatus, CONFIG.STATUSES.PENDING_EDEN);
        var pendingFinal = countByStatus_(requestsTable.rows, requestIndexes.approvalStatus, CONFIG.STATUSES.PENDING_FINAL);
        var approvedFinal = countByStatus_(requestsTable.rows, requestIndexes.approvalStatus, CONFIG.STATUSES.FINAL_APPROVED);
        var dmStage = perf.startStage('sheet.data_master');
        var dataMasterTable = getCachedDataMasterTable_();
        perf.endStage(dmStage, { rows: dataMasterTable.rows.length });
        var metrics = computeDashboardMetricsFromDataMaster_(dataMasterTable.headers, dataMasterTable.rows);

        return {
          totalDataMaster: dataMasterTable.rows.length,
          reviewRequiredCount: metrics.reviewRequiredCount,
          pendingRequests: pendingEden,
          pendingFinal: pendingFinal,
          approvedFinal: approvedFinal,
          exportRows: 0,
          activeNowCount: metrics.activeNowCount,
          todayActivitiesCount: metrics.todayActivitiesCount,
          weekActivitiesCount: metrics.weekActivitiesCount,
          monthActivitiesCount: metrics.monthActivitiesCount,
          activeCoursesCount: metrics.activeCoursesCount,
          activeInstructorsCount: metrics.activeInstructorsCount,
          missingReportCount: metrics.missingReportCount,
          endingSoonCount: metrics.endingSoonCount,
          exceptionCount: metrics.exceptionCount,
          changeRequestCount: pendingEden + pendingFinal,
          unassignedInstructorCount: metrics.unassignedInstructorCount,
          instructorGapCount: metrics.instructorGapCount
        };
      });

      perf.finish({ success: true });
      return { success: true, data: data };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון דשבורד.');
    }
  }

  function meetingDateHeaderOrder_(header) {
    var h = Utils.normalize(header);
    if (h === 'start_date' || h === 'Date1') return 1;
    var m = /^date([2-9]|[12][0-9]|3[0-5])$/i.exec(h) || /^Date([2-9]|[12][0-9]|3[0-5])$/.exec(h);
    return m ? Number(m[1]) : 999;
  }

  function meetingDateHeadersFromTable_(headers) {
    return (headers || []).filter(function (header) {
      var h = Utils.normalize(header);
      if (h === 'start_date') return true;
      if (/^date([2-9]|[12][0-9]|3[0-5])$/i.test(h)) return true;
      if (/^Date([2-9]|[12][0-9]|3[0-5])$/.test(h)) return true;
      if (h === 'Date1') return true;
      return false;
    }).sort(function (a, b) {
      var oa = meetingDateHeaderOrder_(a);
      var ob = meetingDateHeaderOrder_(b);
      if (oa !== ob) return oa - ob;
      return String(a).localeCompare(String(b));
    });
  }

  function getMyCoursesData(filters) {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      var perf = startPerf_('getMyCoursesData');
      var readStage = perf.startStage('sheet.data_master');
      var table = getCachedDataMasterTable_();
      perf.endStage(readStage, { rows: table.rows.length });
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

      var dynamicDateFields = meetingDateHeadersFromTable_(table.headers);
      var frontendFields = CONFIG.FRONTEND_FIELDS.COURSES.concat(dynamicDateFields, ['InstructorDisplayRole']);
      var transformStage = perf.startStage('transform.courses');
      var permissionsLookup = buildInstructorLookup_();
      var fieldIndexes = buildFieldIndexMap_(table.headers, frontendFields);

      var items = rows.map(function (row) {
        var out = {};
        frontendFields.forEach(function (field) {
          var fieldIdx = fieldIndexes[field];
          out[field] = fieldIdx > -1 ? row[fieldIdx] : '';
        });
        var assignment = resolveInstructorAssignment_(out, permissionsLookup);
        out.Employee = assignment.name;
        out.Instructor = assignment.name;
        out.EmployeeID = assignment.id;
        out.InstructorDisplayRole = assignment.displayRole;
        return out;
      });
      perf.endStage(transformStage, { rows: items.length });
      perf.finish({ success: true, rows: items.length });

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
      if (sheetName === CONFIG.SHEETS.DATA_MASTER) {
        Utils.validateTableHeaders(table, { rowId: CONFIG.FIELDS.ROW_ID }, 'getSheetRows:data');
      }
      if (sheetName === CONFIG.SHEETS.OPERATIONS_DATA) {
        Utils.validateTableHeaders(table, { sourceRowId: CONFIG.FIELDS.SOURCE_ROW_ID }, 'getSheetRows:operations_data');
      }
      if (sheetName === CONFIG.SHEETS.LISTS) {
        Utils.validateTableHeaders(table, { listName: CONFIG.FIELDS.LIST_NAME }, 'getSheetRows:lists');
      }
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
      logDiag_('WARN', 'sheet_read_failed', { sheetName: (payload || {}).sheetName || '', message: err && err.message ? err.message : String(err || '') });
      return Utils.safeMessage('לא ניתן לטעון נתונים מהגיליון.');
    }
  }

  function getFinanceData() {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      var perf = startPerf_('getFinanceData');
      requireFinanceAccess_(session.user, { archive: false, requireEdit: false });
      var readStage = perf.startStage('sheet.data_finance_view');
      var table = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, true, {
        useScriptCache: true,
        cacheKey: 'table:data_master',
        cacheTtlSeconds: PERF_CACHE.FINANCE_TTL,
        requestMemoKey: 'finance:active'
      });
      perf.endStage(readStage, { rows: table.rows.length });
      var transformStage = perf.startStage('transform.finance');
      var idxStatus = Utils.resolveIndex(table.headers, CONFIG.FIELDS.STATUS);
      var idxEnd = Utils.resolveIndex(table.headers, CONFIG.FIELDS.END_DATE);
      var idxRow = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ROW_ID);
      var idxFinanceStatus = Utils.resolveIndex(table.headers, CONFIG.FIELDS.FINANCE_STATUS);
      var idxFinanceNotes = Utils.resolveIndex(table.headers, CONFIG.FIELDS.FINANCE_NOTES);
      var items = table.rows.map(function (row, index) {
        return { row: row, rowNumber: table.rowNumbers[index] };
      }).filter(function (entry) {
        var status = Utils.toKey(valueAt_(entry.row, idxStatus));
        return status === 'ended' && !Utils.isEmpty(valueAt_(entry.row, idxEnd));
      }).map(function (entry) {
        var row = entry.row;
        var out = Utils.rowToObject(table.headers, row, entry.rowNumber);
        out.FinanceRowID = Utils.normalize(valueAt_(row, idxRow));
        out.FinanceStatus = Utils.normalize(valueAt_(row, idxFinanceStatus)) || 'open';
        out.FinanceNotes = Utils.normalize(valueAt_(row, idxFinanceNotes));
        return out;
      });
      perf.endStage(transformStage, { rows: items.length });
      perf.finish({ success: true, rows: items.length });
      return { success: true, data: { items: items } };
    } catch (err) {
      return Utils.safeMessage('אין הרשאה לצפייה בגבייה פעילה.');
    }
  }

  function getFinanceArchiveData() {
    return { success: true, data: { items: [] } };
  }

  function updateFinanceStatus(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      var body = Utils.asObject(payload, {});
      var financeRowId = Utils.normalize(body.FinanceRowID || body.financeRowId);
      var financeStatus = Utils.normalize(body.FinanceStatus || body.financeStatus);
      var targetSheet = CONFIG.SHEETS.DATA_MASTER;
      requireWritePermission_(session.user, WRITE_ACTIONS.FINANCE_UPDATE, {});
      if (!financeRowId || !financeStatus) return Utils.safeMessage('FinanceRowID ו-FinanceStatus הם שדות חובה.');
      if (financeStatus !== 'open' && financeStatus !== 'closed') return Utils.safeMessage('FinanceStatus חייב להיות open או closed.');

      var table = Utils.readTable(targetSheet, true);
      Utils.validateTableHeaders(table, { rowId: CONFIG.FIELDS.ROW_ID, financeStatus: CONFIG.FIELDS.FINANCE_STATUS }, 'updateFinanceStatus:data');
      var idxFinanceRowId = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ROW_ID);
      var idxFinanceStatus = Utils.resolveIndex(table.headers, CONFIG.FIELDS.FINANCE_STATUS);
      var idxNotes = Utils.resolveIndex(table.headers, ['FinanceNotes']);
      if (idxFinanceRowId === -1 || idxFinanceStatus === -1) return Utils.safeMessage('חסרות עמודות חובה בגיליון הכספים.');

      for (var i = 0; i < table.rows.length; i += 1) {
        if (Utils.normalize(table.rows[i][idxFinanceRowId]) !== financeRowId) continue;
        var updated = table.rows[i].slice();
        updated[idxFinanceStatus] = financeStatus;
        if (idxNotes > -1 && !Utils.isEmpty(body.StatusNote || body.statusNote)) {
          var current = Utils.normalize(updated[idxNotes]);
          var suffix = Utils.normalize(body.StatusNote || body.statusNote);
          updated[idxNotes] = current ? (current + ' | ' + suffix) : suffix;
        }
        Utils.updateRow(targetSheet, table.rowNumbers[i], updated);
        return { success: true, data: { item: Utils.rowToObject(table.headers, updated, table.rowNumbers[i]) } };
      }

      return Utils.safeMessage('FinanceRowID לא נמצא לעדכון.');
    } catch (err) {
      logDiag_('WARN', 'finance_update_failed', { message: err && err.message ? err.message : String(err || '') });
      return Utils.safeMessage('לא ניתן לעדכן סטטוס גבייה.');
    }
  }

  function syncFinance() {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      requireWritePermission_(session.user, WRITE_ACTIONS.FINANCE_SYNC, {});
      return rebuildFinanceSheet();
    } catch (err) {
      return Utils.safeMessage('אין הרשאה לרענון גיליון הכספים.');
    }
  }

  function updateCourse(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      var body = Utils.asObject(payload, {});
      var courseId = Utils.normalize(body.RowID || body.CourseID || body.courseId || body.rowId);
      var changes = Utils.asObject(body.changes, {});
      if (Utils.isEmpty(courseId)) return Utils.safeMessage('RowID הוא שדה חובה.');
      if (!Object.keys(changes).length) return Utils.safeMessage('changes חייב להכיל לפחות שדה אחד.');
      requireWritePermission_(session.user, WRITE_ACTIONS.UPDATE_COURSE, { courseId: courseId, team: body.InstructorManager });
      if (!canEditCourseByRole_(session.user, courseId, body.InstructorManager)) return Utils.safeMessage('אין הרשאה לעדכן פעילות זו.');

      var sheetTargets = [
        { sheetName: CONFIG.SHEETS.DATA_MASTER, required: true }
      ];
      var updateResult = {};

      sheetTargets.forEach(function (target) {
        var table = Utils.readTable(target.sheetName, target.required);
        var courseIndex = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ROW_ID);
        if (courseIndex === -1) throw new Error('missing_course_id_' + target.sheetName);

        var rowMatch = findRowByCourseId_(table, courseIndex, courseId);
        if (!rowMatch) throw new Error('course_not_found_' + target.sheetName);

        var updatedRow = rowMatch.row.slice();
        Object.keys(changes).forEach(function (field) {
          if (field === 'CourseID' || field === 'RowID') return;
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
          RowID: courseId,
          CourseID: courseId,
          DATA_MASTER: updateResult[CONFIG.SHEETS.DATA_MASTER]
        }
      };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לעדכן קורס.');
    }
  }

  function getCourseMeetings(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      var body = Utils.asObject(payload, {});
      var courseId = Utils.normalize(body.RowID || body.CourseID || body.rowId || body.courseId);
      if (!courseId) return Utils.safeMessage('RowID הוא שדה חובה.');
      var table = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, true);
      var idxCourse = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ROW_ID);
      if (idxCourse === -1) return Utils.safeMessage('עמודת RowID חסרה.');
      var rowMatch = findRowByCourseId_(table, idxCourse, courseId);
      if (!rowMatch) return Utils.safeMessage('הפעילות לא נמצאה.');
      if (!courseId) return Utils.safeMessage('CourseID הוא שדה חובה.');
      Utils.ensureCourseMeetingsSheet();
      var meetings = [];
      var idxStartTime = Utils.resolveIndex(table.headers, CONFIG.FIELDS.START_TIME);
      var idxEndTime = Utils.resolveIndex(table.headers, CONFIG.FIELDS.END_TIME);
      var idxStatus = Utils.resolveIndex(table.headers, CONFIG.FIELDS.STATUS);
      for (var n = 1; n <= CONFIG.DATE_FIELDS_COUNT; n += 1) {
        var field = n === 1 ? 'start_date' : ('date' + n);
        var idxDate = Utils.resolveIndex(table.headers, [field, 'Date' + n]);
        if (idxDate === -1) continue;
        var dateVal = asDate_(valueAt_(rowMatch.row, idxDate));
        if (!dateVal) continue;
        meetings.push({
          RowID: courseId,
          CourseID: courseId,
          MeetingNumber: n,
          MeetingDate: stripTime_(dateVal),
          StartTime: valueAt_(rowMatch.row, idxStartTime),
          EndTime: valueAt_(rowMatch.row, idxEndTime),
          MeetingStatus: valueAt_(rowMatch.row, idxStatus)
        });
      }
      meetings.sort(function (a, b) {
        return Number(a.MeetingNumber || 0) - Number(b.MeetingNumber || 0);
      });
      return { success: true, data: { RowID: courseId,
          CourseID: courseId, items: meetings } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון מפגשים לקורס.');
    }
  }
  function updateCourseMeeting(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      var body = Utils.asObject(payload, {});
      var courseId = Utils.normalize(body.RowID || body.CourseID || body.rowId || body.courseId);
      var meetingNumber = Number(body.MeetingNumber || body.meetingNumber);
      var newMeetingDate = asDate_(body.NewMeetingDate || body.newMeetingDate);
      if (!courseId) return Utils.safeMessage('RowID הוא שדה חובה.');
      if (!Number.isFinite(meetingNumber) || meetingNumber < 1 || meetingNumber > CONFIG.DATE_FIELDS_COUNT) return Utils.safeMessage('MeetingNumber לא תקין.');
      if (!newMeetingDate) return Utils.safeMessage('תאריך מפגש חדש הוא שדה חובה.');
      requireWritePermission_(session.user, WRITE_ACTIONS.UPDATE_MEETINGS, { courseId: courseId, team: body.InstructorManager });

      var table = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, true);
      var idxCourse = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ROW_ID);
      var rowMatch = findRowByCourseId_(table, idxCourse, courseId);
      if (!rowMatch) return Utils.safeMessage('הפעילות לא נמצאה.');

      var dateField = meetingNumber === 1 ? 'start_date' : ('date' + meetingNumber);
      var idxDate = Utils.resolveIndex(table.headers, [dateField, 'Date' + meetingNumber]);
      if (idxDate === -1) return Utils.safeMessage('עמודת התאריך לא נמצאה.');

      var updated = rowMatch.row.slice();
      updated[idxDate] = stripTime_(newMeetingDate);

      var lastMeeting = null;
      for (var n = 1; n <= CONFIG.DATE_FIELDS_COUNT; n += 1) {
        var field = n === 1 ? 'start_date' : ('date' + n);
        var idx = Utils.resolveIndex(table.headers, [field, 'Date' + n]);
        if (idx === -1) continue;
        var dv = asDate_(valueAt_(updated, idx));
        if (dv && (!lastMeeting || dv > lastMeeting)) lastMeeting = dv;
      }
      var idxEnd = Utils.resolveIndex(table.headers, CONFIG.FIELDS.END_DATE);
      if (idxEnd > -1 && lastMeeting) updated[idxEnd] = stripTime_(lastMeeting);

      Utils.updateRow(CONFIG.SHEETS.DATA_MASTER, rowMatch.rowNumber, updated);
      var refreshed = getCourseMeetings({ RowID: courseId });
      if (!refreshed.success) return refreshed;
      return {
        success: true,
        data: {
          RowID: courseId,
          CourseID: courseId,
          mode: 'DIRECT_UPDATE',
          shiftGroupId: '',
          monthEndChanged: idxEnd > -1,
          financeRefreshed: false,
          items: refreshed.data.items
        }
      };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לעדכן מפגש.');
    }
  }
  function createDataMasterRecord(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      requireWritePermission_(session.user, WRITE_ACTIONS.CREATE_MASTER_RECORD, {});
      var body = Utils.asObject(payload, {});
      var record = Utils.asObject(body.record, {});
      var table = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, true);
      if (!table.sheet || !table.headers.length) return Utils.safeMessage('data לא זמין.');
      var row = table.headers.map(function (header) { return ''; });
      var courseId = Utils.normalize(record.RowID || record.CourseID) || generateCourseId_();
      Object.keys(record).forEach(function (fieldName) {
        var idx = Utils.resolveIndex(table.headers, [fieldName]);
        if (idx > -1) row[idx] = record[fieldName];
      });
      var idxCourse = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ROW_ID);
      if (idxCourse > -1) row[idxCourse] = courseId;
      var idxCreatedAt = Utils.resolveIndex(table.headers, ['CreatedAt']);
      if (idxCreatedAt > -1 && !row[idxCreatedAt]) row[idxCreatedAt] = Utils.nowIso();
      Utils.appendRow(CONFIG.SHEETS.DATA_MASTER, row);
      var created = Utils.rowToObject(table.headers, row, 0);
      created.RowID = courseId;
      created.CourseID = courseId;
      return { success: true, data: created };
    } catch (err) {
      return Utils.safeMessage('לא ניתן ליצור רשומה חדשה.');
    }
  }

  function createEditRequest(payload) {
    var body = Utils.asObject(payload, {});
    if (Utils.toKey(body.operation) === Utils.toKey('MARK_EXCEPTION_RESOLVED')) {
      return markExceptionResolved_(body);
    }
    if (Utils.toKey(body.operation) === Utils.toKey('EDEN_SAVE')
      || Utils.toKey(body.operation) === Utils.toKey('EDEN_SUBMIT_ADMIN')
      || Utils.toKey(body.operation) === Utils.toKey('EDEN_REFRESH_SOURCE')) {
      return handleEdenOperationInOperationsData_(body);
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
      Utils.validateTableHeaders(table, {
        requestId: ['request_id', 'RequestID'],
        sourceRowId: CONFIG.FIELDS.SOURCE_ROW_ID,
        approvalStatus: ['admin_status', 'ApprovalStatus']
      }, 'submitEditRequest:operations_data');
      var existing = findRequestById_(table, idx.requestId, requestId);

      if (existing && !canEditDraft_(session.user, existing.row, idx)) {
        return Utils.safeMessage('אין הרשאה לערוך בקשה זו.');
      }

      requireWritePermission_(session.user, WRITE_ACTIONS.CREATE_EDIT_REQUEST, { courseId: Utils.normalize(body.CourseID), team: body.InstructorManager });
      var requestCourseId = Utils.normalize(body.CourseID);
      var requestChangeType = normalizeChangeType_(body.ChangeType, requestCourseId);
      if (requestChangeType === EDEN_CHANGE_TYPES.UPDATE_EXISTING && !canEditCourseByRole_(session.user, requestCourseId, body.InstructorManager)) {
        return Utils.safeMessage('ניתן לערוך רק פעילות צוותית מורשית.');
      }

      var status = normalizeInputStatus_(body.admin_status || body.ApprovalStatus || body.status, existing ? valueAt_(existing.row, idx.approvalStatus) : '');
      var sourceRowId = Utils.normalize(body.source_row_id || body.RowID || body.CourseID);
      if (!sourceRowId) return Utils.safeMessage('source_row_id הוא שדה חובה.');
      var openRequest = findOpenRequestBySourceRowId_(table, idx, sourceRowId, existing ? requestId : '');
      if (openRequest) {
        return Utils.safeMessage('כבר קיימת רשומת תפעול פתוחה עבור רשומה זו.');
      }
      if (!hasBusinessChanges_(body.requestedData, body.originalData)) {
        return Utils.safeMessage('לא זוהה שינוי עסקי לשליחה לאדמין.');
      }
      var record = buildRequestRecord_(table.headers, idx, body, session.user, requestId, status, existing ? existing.row : null);
      var values = table.headers.map(function (header) { return record[header] || ''; });

      if (existing) {
        Utils.updateRow(CONFIG.SHEETS.EDIT_REQUESTS, existing.rowNumber, values);
                return { success: true, data: { RequestID: requestId, ApprovalStatus: status, mode: 'update' } };
      }

      Utils.appendRow(CONFIG.SHEETS.EDIT_REQUESTS, values);
            return { success: true, data: { RequestID: requestId, ApprovalStatus: status, mode: 'append' } };
    } catch (err) {
      logDiag_('WARN', 'submit_edit_request_failed', { message: err && err.message ? err.message : String(err || '') });
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
      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, false);
      if (!table.sheet || !table.headers.length) return { success: true, data: { items: [], counters: {} } };
      var idx = resolveRequestIndexes_(table.headers);
      var query = Utils.asObject(payload, {});
      var limit = Math.max(1, Math.min(Number(query.limit || 250), 500));
      var offset = Math.max(0, Number(query.offset || 0));
      var items = table.rows.filter(function (row) {
        var status = Utils.toKey(valueAt_(row, idx.approvalStatus));
        return status === Utils.toKey(EDEN_WORKFLOW_STATUSES.PENDING_EDEN)
          || status === Utils.toKey(EDEN_WORKFLOW_STATUSES.EDEN_SAVED)
          || status === Utils.toKey(EDEN_WORKFLOW_STATUSES.PENDING_FINAL)
          || status === Utils.toKey(EDEN_WORKFLOW_STATUSES.FINAL_APPROVED)
          || status === Utils.toKey(EDEN_WORKFLOW_STATUSES.FINAL_REJECTED)
          || status === Utils.toKey(EDEN_WORKFLOW_STATUSES.CLOSED);
      }).map(function (row) {
        var requestId = valueAt_(row, idx.requestId);
        var courseId = valueAt_(row, idx.courseId);
        var requested = Utils.asObject(Utils.parseJson(valueAt_(row, idx.requestedData)), {});
        var source = Utils.asObject(Utils.parseJson(valueAt_(row, idx.originalData)), {});
        var sourceChanged = hasMasterChangedAfterSourceSnapshot_(courseId, source);
        return {
          RequestID: requestId,
          RowID: courseId,
          CourseID: courseId,
          Origin: valueAt_(row, idx.origin),
          ChangeType: valueAt_(row, idx.changeType),
          ApprovalStatus: valueAt_(row, idx.approvalStatus),
          RequestedData: Utils.safeJson(requested),
          SourceData: Utils.safeJson(source),
          EdenNotes: valueAt_(row, idx.approvalNotes),
          HasDiffBetweenSourceAndEden: hasBusinessChanges_(requested, source),
          HasMasterChangedAfterEdenEdit: sourceChanged,
          SentToAdminAt: valueAt_(row, idx.edenApprovedAt),
          EdenLastSavedAt: valueAt_(row, idx.requestedAt),
          RequestedBy: valueAt_(row, idx.requestedBy),
          OriginalData: valueAt_(row, idx.originalData)
        };
      }).slice(offset, offset + limit);
      var counters = {
        pending_eden: 0,
        eden_saved: 0,
        pending_final: 0,
        master_changed_warning: 0,
        request_origin: 0,
        eden_initiated_origin: 0
      };
      items.forEach(function (item) {
        var wfKey = Utils.toKey(item.admin_status || item.ApprovalStatus);
        if (wfKey === Utils.toKey(EDEN_WORKFLOW_STATUSES.PENDING_EDEN)) counters.pending_eden += 1;
        if (wfKey === Utils.toKey(EDEN_WORKFLOW_STATUSES.EDEN_SAVED)) counters.eden_saved += 1;
        if (wfKey === Utils.toKey(EDEN_WORKFLOW_STATUSES.PENDING_FINAL)) counters.pending_final += 1;
        if (item.HasMasterChangedAfterEdenEdit) counters.master_changed_warning += 1;
        if (Utils.toKey(item.Origin) === Utils.toKey(EDEN_CHANGE_ORIGINS.REQUEST)) counters.request_origin += 1;
        if (Utils.toKey(item.Origin) === Utils.toKey(EDEN_CHANGE_ORIGINS.EDEN_INITIATED)) counters.eden_initiated_origin += 1;
      });
      return { success: true, data: { items: items, counters: counters } };
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
        row[idx.approvalStatus] = approved ? CONFIG.STATUSES.EDEN_APPROVED : CONFIG.STATUSES.DECLINED;
        if (idx.requestStatus > -1) row[idx.requestStatus] = approved ? CONFIG.STATUSES.EDEN_APPROVED : CONFIG.STATUSES.DECLINED;
        if (idx.edenViewStatus > -1) row[idx.edenViewStatus] = approved ? CONFIG.STATUSES.EDEN_APPROVED : CONFIG.STATUSES.DECLINED;
        if (idx.finalApprovalStatus > -1) row[idx.finalApprovalStatus] = '';
        if (idx.edenApprovedAt > -1) row[idx.edenApprovedAt] = approved ? Utils.nowIso() : '';
      } else if (isIdan_(session.user)) {
        if (current !== Utils.toKey(CONFIG.STATUSES.PENDING_FINAL)) return Utils.safeMessage('הרשומה אינה זמינה לאישור סופי.');
        row[idx.approvalStatus] = approved ? CONFIG.STATUSES.FINAL_APPROVED : CONFIG.STATUSES.DECLINED;
        if (idx.finalApprovalStatus > -1) row[idx.finalApprovalStatus] = approved ? CONFIG.STATUSES.FINAL_APPROVED : CONFIG.STATUSES.DECLINED;
        if (idx.requestStatus > -1) row[idx.requestStatus] = approved ? CONFIG.STATUSES.FINAL_APPROVED : CONFIG.STATUSES.DECLINED;
        if (idx.finalizedAt > -1) row[idx.finalizedAt] = Utils.nowIso();
        if (approved) {
          applyApprovedRequestToMainData_(row, idx);
                  } else {
                  }
      } else {
        return Utils.safeMessage('אין הרשאה.');
      }

      if (!approved && idx.rejectedAt > -1) row[idx.rejectedAt] = Utils.nowIso();
      if (idx.approvalNotes > -1) row[idx.approvalNotes] = Utils.normalize(body.operations_notes || body.ApprovalNotes);
      if (idx.assignedEditor > -1) row[idx.assignedEditor] = session.user.userId;
      Utils.updateRow(CONFIG.SHEETS.EDIT_REQUESTS, existing.rowNumber, row);

      return { success: true, data: { RequestID: requestId, ApprovalStatus: row[idx.approvalStatus] } };
    } catch (err) {
      return Utils.safeMessage('הפעולה לא בוצעה.');
    }
  }

  function applyApprovedRequestToMainData_(requestRow, idx) {
    var courseId = valueAt_(requestRow, idx.courseId);
    var changeType = normalizeChangeType_(valueAt_(requestRow, idx.changeType), courseId);
    var requested = Utils.parseJson(valueAt_(requestRow, idx.requestedData));
    if (changeType === EDEN_CHANGE_TYPES.NEW_RECORD) {
      createDataMasterRecordFromRequest_(requested, courseId);
    } else {
      if (Utils.isEmpty(courseId)) return;
      applyRequestedDataToCourseRow_(CONFIG.SHEETS.DATA_MASTER, courseId, requested);
    }
    try {
      rebuildFinanceSheet();
    } catch (err) {}
  }

  function createDataMasterRecordFromRequest_(requestedData, requestedCourseId) {
    var table = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, true);
    if (!table.sheet || !table.headers.length) return;
    var row = table.headers.map(function () { return ''; });
    Object.keys(requestedData || {}).forEach(function (fieldName) {
      var aliases = [fieldName, toPascalCase_(fieldName)];
      var fieldIndex = Utils.resolveIndex(table.headers, aliases);
      if (fieldIndex > -1) row[fieldIndex] = requestedData[fieldName];
    });
    var idxCourse = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ROW_ID);
    if (idxCourse > -1) row[idxCourse] = Utils.normalize(requestedData.CourseID || requestedCourseId) || generateCourseId_();
    var idxCreatedAt = Utils.resolveIndex(table.headers, ['CreatedAt']);
    if (idxCreatedAt > -1 && !row[idxCreatedAt]) row[idxCreatedAt] = Utils.nowIso();
    Utils.appendRow(CONFIG.SHEETS.DATA_MASTER, row);
  }

  function applyRequestedDataToCourseRow_(sheetName, courseId, requestedData) {
    var table = Utils.readTable(sheetName, false);
    if (!table.sheet || !table.headers.length) return;
    var idxCourse = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ROW_ID);
    if (idxCourse === -1) return;
    for (var i = 0; i < table.rows.length; i += 1) {
      if (Utils.toKey(table.rows[i][idxCourse]) !== Utils.toKey(courseId)) continue;
      var updated = table.rows[i].slice();
      Object.keys(requestedData || {}).forEach(function (fieldName) {
        var aliases = [fieldName, toPascalCase_(fieldName)];
        var fieldIndex = Utils.resolveIndex(table.headers, aliases);
        if (fieldIndex > -1) updated[fieldIndex] = requestedData[fieldName];
      });
      Utils.updateRow(sheetName, table.rowNumbers[i], updated);
      break;
    }
  }

  function toPascalCase_(value) {
    var text = Utils.normalize(value);
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function buildRequestRecord_(headers, idx, body, user, requestId, status, existingRow) {
    var record = {};
    headers.forEach(function (header) { record[header] = existingRow ? existingRow[Utils.resolveIndex(headers, [header])] : ''; });

    var originalData = Utils.asObject(body.originalData || body.OriginalData, {});
    var requestedData = Utils.asObject(body.requestedData || body.RequestedData, {});

    setField_(record, headers, idx.requestId, requestId);
    setField_(record, headers, idx.courseId, Utils.normalize(body.RowID || body.CourseID || body.source_row_id));
    setField_(record, headers, idx.origin, normalizeOrigin_(body.Origin));
    setField_(record, headers, idx.changeType, normalizeChangeType_(body.ChangeType, body.CourseID));
    setField_(record, headers, idx.requestedBy, existingRow ? valueAt_(existingRow, idx.requestedBy) : (user.userId || ''));
    setField_(record, headers, idx.requestedAt, existingRow ? valueAt_(existingRow, idx.requestedAt) : Utils.nowIso());
    setField_(record, headers, idx.requestStatus, status);
    setField_(record, headers, idx.edenViewStatus, (status === CONFIG.STATUSES.EDEN_APPROVED || status === CONFIG.STATUSES.PENDING_FINAL || status === CONFIG.STATUSES.FINAL_APPROVED) ? CONFIG.STATUSES.EDEN_APPROVED : '');
    setField_(record, headers, idx.finalApprovalStatus, status === CONFIG.STATUSES.FINAL_APPROVED ? CONFIG.STATUSES.FINAL_APPROVED : '');
    setField_(record, headers, idx.approvalStatus, status);
    setField_(record, headers, idx.approvalNotes, Utils.normalize(body.operations_notes || body.ApprovalNotes));
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
    var sourceRowId = valueAt_(row, idx.courseId);
    var out = {
      request_id: valueAt_(row, idx.requestId),
      source_row_id: sourceRowId,
      requested_by: valueAt_(row, idx.requestedBy),
      requested_at: valueAt_(row, idx.requestedAt),
      operations_notes: valueAt_(row, idx.approvalNotes),
      sent_to_admin_at: valueAt_(row, idx.edenApprovedAt),
      admin_status: valueAt_(row, idx.approvalStatus),
      admin_decision_at: valueAt_(row, idx.finalizedAt),
      requested_data: valueAt_(row, idx.requestedData),
      original_data: valueAt_(row, idx.originalData),
      change_type: valueAt_(row, idx.changeType),
      origin: valueAt_(row, idx.origin)
    };
    out.RequestID = out.request_id;
    out.RowID = sourceRowId;
    out.CourseID = sourceRowId;
    out.RequestedBy = out.requested_by;
    out.RequestedAt = out.requested_at;
    out.ApprovalStatus = out.admin_status;
    out.ApprovalNotes = out.operations_notes;
    out.SentToAdminAt = out.sent_to_admin_at;
    out.FinalizedAt = out.admin_decision_at;
    out.OriginalData = out.original_data;
    out.RequestedData = out.requested_data;
    return out;
  }


  function resolveRequestIndexes_(headers) {
    return {
      requestId: Utils.resolveIndex(headers, ['request_id', 'RequestID']),
      courseId: Utils.resolveIndex(headers, ['source_row_id', 'CourseID', 'RowID']),
      requestedBy: Utils.resolveIndex(headers, ['requested_by', 'RequestedBy']),
      requestedAt: Utils.resolveIndex(headers, ['requested_at', 'RequestedAt']),
      origin: Utils.resolveIndex(headers, ['origin', 'Origin']),
      changeType: Utils.resolveIndex(headers, ['change_type', 'request_type', 'ChangeType']),
      requestStatus: Utils.resolveIndex(headers, ['admin_status', 'request_status', 'RequestStatus']),
      edenViewStatus: Utils.resolveIndex(headers, ['admin_status', 'EdenViewStatus']),
      finalApprovalStatus: Utils.resolveIndex(headers, ['admin_status', 'FinalApprovalStatus']),
      approvalStatus: Utils.resolveIndex(headers, ['admin_status', 'ApprovalStatus']),
      approvalNotes: Utils.resolveIndex(headers, ['operations_notes', 'approval_notes', 'ApprovalNotes']),
      changeSummary: Utils.resolveIndex(headers, ['change_summary', 'ChangeSummary']),
      originalData: Utils.resolveIndex(headers, ['original_data', 'OriginalData']),
      requestedData: Utils.resolveIndex(headers, ['requested_data', 'RequestedData']),
      editableBy: Utils.resolveIndex(headers, ['editable_by', 'EditableBy']),
      assignedEditor: Utils.resolveIndex(headers, ['assigned_editor', 'AssignedEditor']),
      edenApprovedAt: Utils.resolveIndex(headers, ['sent_to_admin_at', 'EdenApprovedAt']),
      finalizedAt: Utils.resolveIndex(headers, ['admin_decision_at', 'FinalizedAt']),
      rejectedAt: Utils.resolveIndex(headers, ['admin_decision_at', 'RejectedAt']),
      date: Utils.resolveIndex(headers, ['start_date', 'Date']),
      day: Utils.resolveIndex(headers, ['day', 'Day']),
      startTime: Utils.resolveIndex(headers, ['start_time', 'StartTime']),
      endTime: Utils.resolveIndex(headers, ['end_time', 'EndTime']),
      classGroup: Utils.resolveIndex(headers, ['class_group', 'ClassGroup']),
      actualMeetings: Utils.resolveIndex(headers, ['sessions', 'ActualMeetings']),
      courseManager: Utils.resolveIndex(headers, ['activity_manager', 'CourseManager']),
      instructor: Utils.resolveIndex(headers, ['name', 'Instructor']),
      notes: Utils.resolveIndex(headers, ['notes', 'Notes'])
    };
  }


  function toIndexKey_(fieldName) {
    var map = {
      RequestID: 'requestId', CourseID: 'courseId', RequestedBy: 'requestedBy', RequestedAt: 'requestedAt',
      Origin: 'origin', ChangeType: 'changeType',
      RequestStatus: 'requestStatus', EdenViewStatus: 'edenViewStatus', FinalApprovalStatus: 'finalApprovalStatus',
      ApprovalStatus: 'approvalStatus', ApprovalNotes: 'approvalNotes', ChangeSummary: 'changeSummary',
      OriginalData: 'originalData', RequestedData: 'requestedData', EditableBy: 'editableBy', AssignedEditor: 'assignedEditor',
      EdenApprovedAt: 'edenApprovedAt', FinalizedAt: 'finalizedAt', RejectedAt: 'rejectedAt',
      Date: 'date', Day: 'day', StartTime: 'startTime', EndTime: 'endTime', ClassGroup: 'classGroup',
      ActualMeetings: 'actualMeetings', CourseManager: 'courseManager', Instructor: 'instructor', Notes: 'notes',
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

  function findOpenRequestBySourceRowId_(table, idx, sourceRowId, excludeRequestId) {
    if (idx.courseId === -1 || idx.approvalStatus === -1) return null;
    var idKey = Utils.toKey(sourceRowId);
    var excludeKey = Utils.toKey(excludeRequestId);
    for (var i = 0; i < table.rows.length; i += 1) {
      var row = table.rows[i];
      if (Utils.toKey(valueAt_(row, idx.courseId)) !== idKey) continue;
      if (excludeKey && Utils.toKey(valueAt_(row, idx.requestId)) === excludeKey) continue;
      var status = Utils.toKey(valueAt_(row, idx.approvalStatus));
      if (status !== Utils.toKey(CONFIG.STATUSES.FINAL_APPROVED)
        && status !== Utils.toKey(CONFIG.STATUSES.DECLINED)
        && status !== Utils.toKey(EDEN_WORKFLOW_STATUSES.CLOSED)) {
        return { row: row, rowNumber: table.rowNumbers[i] };
      }
    }
    return null;
  }

  function hasBusinessChanges_(requestedData, originalData) {
    var requested = Utils.asObject(requestedData, {});
    var original = Utils.asObject(originalData, {});
    var keys = Object.keys(requested);
    if (!keys.length) return false;
    return keys.some(function (key) {
      if (Utils.toKey(key) === 'operations_notes') return false;
      return Utils.normalize(requested[key]) !== Utils.normalize(original[key]);
    });
  }

  function canEditDraft_(user, row, idx) {
    var ownerMatches = Utils.toKey(valueAt_(row, idx.requestedBy)) === Utils.toKey(user.userId);
    var isDraft = Utils.toKey(valueAt_(row, idx.approvalStatus)) === Utils.toKey(CONFIG.STATUSES.DRAFT);
    return ownerMatches && isDraft;
  }

  function normalizeInputStatus_(requestedStatus, fallback) {
    var normalized = Utils.toKey(requestedStatus);
    if (normalized === Utils.toKey(CONFIG.STATUSES.DRAFT)) return CONFIG.STATUSES.DRAFT;
    if (normalized === Utils.toKey(CONFIG.STATUSES.EDEN_APPROVED)) return CONFIG.STATUSES.EDEN_APPROVED;
    if (normalized === Utils.toKey(CONFIG.STATUSES.PENDING_FINAL)) return CONFIG.STATUSES.PENDING_FINAL;
    if (normalized === Utils.toKey(CONFIG.STATUSES.FINAL_APPROVED)) return CONFIG.STATUSES.FINAL_APPROVED;
    if (normalized === Utils.toKey(CONFIG.STATUSES.DECLINED)) return CONFIG.STATUSES.DECLINED;
    if (normalized === Utils.toKey(EDEN_WORKFLOW_STATUSES.EDEN_SAVED)) return EDEN_WORKFLOW_STATUSES.EDEN_SAVED;
    if (normalized === Utils.toKey(EDEN_WORKFLOW_STATUSES.CLOSED)) return EDEN_WORKFLOW_STATUSES.CLOSED;
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

  function computeDashboardMetricsFromDataMaster_(headers, rows) {
    var idxWorkflow = Utils.resolveIndex(headers, CONFIG.FIELDS.STATUS);
    var idxCourseId = Utils.resolveIndex(headers, CONFIG.FIELDS.ROW_ID);
    var idxInstructor = Utils.resolveIndex(headers, CONFIG.FIELDS.NAME);
    var idxReviewStatus = Utils.resolveIndex(headers, CONFIG.FIELDS.STATUS);
    var idxReviewNotes = Utils.resolveIndex(headers, CONFIG.FIELDS.OPERATIONS_NOTES);
    var idxEndDate = Utils.resolveIndex(headers, CONFIG.FIELDS.END_DATE);
    var dateIndexes = [];
    headers.forEach(function (header, index) {
      var normalized = Utils.normalize(header);
      if (normalized === 'start_date' || /^date([2-9]|[12][0-9]|3[0-5])$/i.test(normalized) || /^Date([2-9]|[12][0-9]|3[0-5])$/.test(normalized)) dateIndexes.push(index);
    });
    var today = new Date();
    var dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var weekEnd = new Date(dayStart.getTime() + (7 * 24 * 60 * 60 * 1000));
    var monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    var metrics = {
      activeNowCount: 0,
      todayActivitiesCount: 0,
      weekActivitiesCount: 0,
      monthActivitiesCount: 0,
      activeCoursesCount: 0,
      activeInstructorsCount: 0,
      missingReportCount: 0,
      endingSoonCount: 0,
      exceptionCount: 0,
      reviewRequiredCount: 0,
      unassignedInstructorCount: 0,
      instructorGapCount: 0
    };
    var activeCourses = {};
    var activeInstructors = {};

    (rows || []).forEach(function (row) {
      var workflow = Utils.toKey(valueAt_(row, idxWorkflow));
      var isActive = workflow !== 'final_approved' && workflow !== 'closed' && workflow !== 'final_rejected';
      if (isActive) metrics.activeNowCount += 1;
      if (isActive) {
        var cid = Utils.normalize(valueAt_(row, idxCourseId));
        if (cid) activeCourses[cid] = true;
        var instructor = Utils.normalize(valueAt_(row, idxInstructor));
        if (instructor) activeInstructors[instructor] = true;
      }

      var hasToday = false;
      var hasWeek = false;
      var hasMonth = false;
      dateIndexes.forEach(function (dateIdx) {
        var dateVal = asDate_(valueAt_(row, dateIdx));
        if (!dateVal) return;
        if (sameDate_(dateVal, dayStart)) hasToday = true;
        if (dateVal >= dayStart && dateVal < weekEnd) hasWeek = true;
        if (dateVal >= dayStart && dateVal < monthEnd) hasMonth = true;
      });
      if (hasToday) metrics.todayActivitiesCount += 1;
      if (hasWeek) metrics.weekActivitiesCount += 1;
      if (hasMonth) metrics.monthActivitiesCount += 1;

      metrics.missingReportCount = 0;

      var hasException = !!Utils.toKey(valueAt_(row, idxReviewStatus)) || !!Utils.toKey(valueAt_(row, idxReviewNotes));
      if (hasException) {
        metrics.exceptionCount += 1;
        metrics.reviewRequiredCount += 1;
      }

      var endDate = asDate_(valueAt_(row, idxEndDate));
      if (endDate && endDate >= dayStart && endDate < weekEnd) metrics.endingSoonCount += 1;

      var instructorName = Utils.normalize(valueAt_(row, idxInstructor));
      if (!instructorName) {
        metrics.unassignedInstructorCount += 1;
        if (isActive) metrics.instructorGapCount += 1;
      }
    });

    metrics.activeCoursesCount = Object.keys(activeCourses).length;
    metrics.activeInstructorsCount = Object.keys(activeInstructors).length;
    return metrics;
  }

  function sameDate_(left, right) {
    return left.getFullYear() === right.getFullYear()
      && left.getMonth() === right.getMonth()
      && left.getDate() === right.getDate();
  }

  function canCreateRequest_(user) {
    var mode = Utils.toKey(user.actionMode || user.EditScope);
    var hasCapability = hasCapability_(user, 'edit_edit_requests')
      || hasCapability_(user, 'edit_activities')
      || hasCapability_(user, 'edit_admin');
    if (hasCapability) return true;
    if (mode === 'no_edit') return false;
    return mode === 'request_edit' || mode === 'edit' || !isInstructor_(user);
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

    var courseId = Utils.normalize(body.RowID || body.CourseID || body.rowId || body.courseId);
    var origin = normalizeOrigin_(body.Origin || body.origin);
    var changeType = normalizeChangeType_(body.ChangeType || body.changeType, courseId);
    var changes = Utils.asObject(body.changes, {});
    var requestedData = Utils.asObject(body.requestedData || body.RequestedData, {});
    if (!Object.keys(requestedData).length && Object.keys(changes).length) requestedData = changes;

    var originalData = Utils.asObject(body.originalData || body.OriginalData, {});
    if (courseId && !Object.keys(originalData).length) {
      var snapshot = getCourseSnapshotById_(courseId);
      if (snapshot) originalData = snapshot;
    }

    if (!Utils.normalize(out.requested_by) && !Utils.normalize(out.RequestedBy)) out.requested_by = user.userId;
    if (!Utils.normalize(out.admin_status) && !Utils.normalize(out.ApprovalStatus)) out.admin_status = CONFIG.STATUSES.PENDING_EDEN;
    if (!Utils.normalize(out.InstructorManager) && courseId) out.InstructorManager = resolveTeamScopeByCourseId_(courseId);
    if (!courseId && changeType === EDEN_CHANGE_TYPES.NEW_RECORD) {
      courseId = Utils.normalize(requestedData.CourseID || requestedData.courseId);
    }

    out.source_row_id = courseId;
    out.source_row_id = courseId;
    out.CourseID = courseId;
    out.requested_by = out.requested_by || out.RequestedBy || user.userId;
    out.requested_at = out.requested_at || out.RequestedAt || Utils.nowIso();
    out.admin_status = out.admin_status || out.ApprovalStatus || CONFIG.STATUSES.PENDING_EDEN;
    out.operations_notes = out.operations_notes || out.ApprovalNotes || '';
    out.Origin = origin;
    out.ChangeType = changeType;
    out.requestedData = requestedData;
    out.RequestedData = requestedData;
    out.originalData = originalData;
    out.OriginalData = originalData;
    return out;
  }

  function normalizeOrigin_(originInput) {
    var key = Utils.toKey(originInput);
    if (key === Utils.toKey(EDEN_CHANGE_ORIGINS.EDEN_INITIATED)) return EDEN_CHANGE_ORIGINS.EDEN_INITIATED;
    return EDEN_CHANGE_ORIGINS.REQUEST;
  }

  function normalizeChangeType_(changeTypeInput, courseId) {
    var key = Utils.toKey(changeTypeInput);
    if (key === Utils.toKey(EDEN_CHANGE_TYPES.NEW_RECORD)) return EDEN_CHANGE_TYPES.NEW_RECORD;
    if (key === Utils.toKey(EDEN_CHANGE_TYPES.UPDATE_EXISTING)) return EDEN_CHANGE_TYPES.UPDATE_EXISTING;
    return Utils.normalize(courseId) ? EDEN_CHANGE_TYPES.UPDATE_EXISTING : EDEN_CHANGE_TYPES.NEW_RECORD;
  }


  function handleEdenOperationInOperationsData_(body) {
    var session = requireSession_();
    if (!session.success) return session;
    var requestId = Utils.normalize(body.RequestID || body.request_id);
    if (!requestId) return Utils.safeMessage('RequestID הוא שדה חובה.');
    var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
    var idx = resolveRequestIndexes_(table.headers);
    var found = findRequestById_(table, idx.requestId, requestId);
    if (!found) return Utils.safeMessage('הבקשה לא נמצאה.');
    var row = found.row.slice();
    var op = Utils.toKey(body.operation);
    if (op === Utils.toKey('EDEN_SAVE')) {
      if (idx.requestedData > -1 && body.RequestedData) {
        row[idx.requestedData] = Utils.safeJson(Utils.asObject(body.RequestedData, {}));
      }
      if (idx.approvalNotes > -1) row[idx.approvalNotes] = Utils.normalize(body.EdenNotes || body.operations_notes || body.ApprovalNotes);
      if (idx.approvalStatus > -1) row[idx.approvalStatus] = EDEN_WORKFLOW_STATUSES.EDEN_SAVED;
      if (idx.requestStatus > -1) row[idx.requestStatus] = EDEN_WORKFLOW_STATUSES.EDEN_SAVED;
    } else if (op === Utils.toKey('EDEN_SUBMIT_ADMIN')) {
      if (idx.approvalStatus > -1) row[idx.approvalStatus] = CONFIG.STATUSES.PENDING_FINAL;
      if (idx.requestStatus > -1) row[idx.requestStatus] = CONFIG.STATUSES.PENDING_FINAL;
      if (idx.edenApprovedAt > -1) row[idx.edenApprovedAt] = Utils.nowIso();
    } else if (op === Utils.toKey('EDEN_REFRESH_SOURCE')) {
      var courseId = Utils.normalize(valueAt_(row, idx.courseId));
      var snapshot = getCourseSnapshotById_(courseId);
      if (idx.originalData > -1 && snapshot) row[idx.originalData] = Utils.safeJson(snapshot);
    } else {
      return Utils.safeMessage('פעולת Eden לא נתמכת.');
    }
    Utils.updateRow(CONFIG.SHEETS.EDIT_REQUESTS, found.rowNumber, row);
    return { success: true, data: projectRequestForFrontend_(row, idx) };
  }

  function markExceptionResolved_(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      requireWritePermission_(session.user, WRITE_ACTIONS.MARK_EXCEPTION_RESOLVED, {});
      var body = Utils.asObject(payload, {});
      var table = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, true);
      if (!table.headers.length) return Utils.safeMessage('לא נמצאו כותרות ב-data.');

      var target = resolveReviewRowTarget_(table, body);
      if (!target) return Utils.safeMessage('לא נמצאה רשומת חריגה לעדכון.');

      var updated = target.row.slice();
      var idxStatus = Utils.resolveIndex(table.headers, ['ReviewStatus', 'TreatmentStatus', 'Status']);
      var idxNotes = Utils.resolveIndex(table.headers, ['ReviewNotes', 'Notes', 'Remarks']);
      var idxResolvedBy = Utils.resolveIndex(table.headers, ['ReviewHandledBy', 'ResolvedBy', 'ClosedBy']);
      var idxResolvedAt = Utils.resolveIndex(table.headers, ['ReviewHandledAt', 'ResolvedAt', 'ClosedAt']);

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

      Utils.updateRow(CONFIG.SHEETS.DATA_MASTER, target.rowNumber, updated);
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
    var reviewId = Utils.normalize(body.ReviewID || body.reviewId || body.RowID || body.ExceptionID || body.CourseID || body.courseId);
    var requestedRowNumber = Number(body.reviewRowNumber || body.rowNumber || 0);
    if (requestedRowNumber > 0) {
      for (var i = 0; i < table.rowNumbers.length; i += 1) {
        if (Number(table.rowNumbers[i]) !== requestedRowNumber) continue;
        return { row: table.rows[i], rowNumber: table.rowNumbers[i] };
      }
    }
    if (!reviewId) return null;
    var idxId = Utils.resolveIndex(table.headers, ['CourseID', 'ReviewID', 'RowID', 'ExceptionID']);
    if (idxId === -1) return null;
    for (var j = 0; j < table.rows.length; j += 1) {
      if (Utils.toKey(table.rows[j][idxId]) !== Utils.toKey(reviewId)) continue;
      return { row: table.rows[j], rowNumber: table.rowNumbers[j] };
    }
    return null;
  }

  function syncRequestToEdenDataMaster_(requestRecord) {
    if (!requestRecord || !requestRecord.RequestID) return false;
    return updateEdenWorkflowByRequestId_(requestRecord.RequestID, requestRecord.ApprovalStatus || CONFIG.STATUSES.PENDING_EDEN, {
      requestedData: requestRecord.RequestedData,
      originalData: requestRecord.OriginalData,
      approvalNotes: requestRecord.ApprovalNotes
    });
  }
  function buildEdenRowFromRequest_(requestRecord) {
    var source = getCourseSnapshotById_(requestRecord.CourseID) || {};
    var requested = Utils.parseJson(requestRecord.RequestedData) || {};
    var rowObj = {};
    var nowIso = Utils.nowIso();
    var dataHeaders = getEdenDataHeaders_();
    dataHeaders.forEach(function (field) {
      rowObj['Source_' + field] = source[field] || '';
      rowObj['Eden_' + field] = requested[field] !== undefined ? requested[field] : (source[field] || '');
    });
    rowObj.RowID = source.RowID || '';
    rowObj.CourseID = requestRecord.CourseID || requested.CourseID || source.CourseID || '';
    rowObj.WorkflowStatus = EDEN_WORKFLOW_STATUSES.PENDING_EDEN;
    rowObj.EdenNotes = requestRecord.ApprovalNotes || '';
    rowObj.MasterLastUpdatedAt = source.UpdatedAt || source.LastUpdatedAt || '';
    rowObj.LastSyncedAt = nowIso;
    rowObj.EdenLastSavedAt = '';
    rowObj.SentToAdminAt = '';
    rowObj.AdminDecision = '';
    rowObj.AdminApprovedAt = '';
    rowObj.AdminRejectedAt = '';
    rowObj.HasMasterChangedAfterEdenEdit = 'false';
    rowObj.HasDiffBetweenSourceAndEden = hasDiffBetweenSourceAndEden_(rowObj) ? 'true' : 'false';
    return rowObj;
  }

  function ensureEdenDataMasterSheet_() {
    return Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
  }
  function findRowByRequestId_(table, idxRequestId, requestId) {
    if (idxRequestId === -1) return null;
    for (var i = 0; i < table.rows.length; i += 1) {
      if (Utils.toKey(table.rows[i][idxRequestId]) !== Utils.toKey(requestId)) continue;
      return { row: table.rows[i], rowNumber: table.rowNumbers[i] };
    }
    return null;
  }

  function findEdenRowByCourseId_(table, courseId) {
    var idxCourse = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ROW_ID);
    if (idxCourse === -1) return null;
    for (var i = 0; i < table.rows.length; i += 1) {
      if (Utils.toKey(table.rows[i][idxCourse]) !== Utils.toKey(courseId)) continue;
      return { row: table.rows[i], rowNumber: table.rowNumbers[i] };
    }
    return null;
  }

  function resolveCourseIdByRequestId_(requestId) {
    var reqTable = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, false);
    var reqIdx = resolveRequestIndexes_(reqTable.headers || []);
    var match = findRequestById_(reqTable, reqIdx.requestId, requestId);
    return match ? Utils.normalize(valueAt_(match.row, reqIdx.courseId)) : '';
  }

  function getEdenDataHeaders_() {
    var dmTable = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, true);
    return (dmTable.headers || []).filter(function (header) {
      return ['WorkflowStatus', 'EdenNotes'].indexOf(header) === -1;
    });
  }

  function hasDiffBetweenSourceAndEden_(rowObj) {
    var fields = getEdenDataHeaders_();
    for (var i = 0; i < fields.length; i += 1) {
      var sourceValue = Utils.normalize(rowObj['Source_' + fields[i]]);
      var edenValue = Utils.normalize(rowObj['Eden_' + fields[i]]);
      if (sourceValue !== edenValue) return true;
    }
    return false;
  }

  function extractEdenDraftFromRow_(rowObj) {
    var out = {};
    getEdenDataHeaders_().forEach(function (field) {
      out[field] = rowObj['Eden_' + field];
    });
    return out;
  }

  function extractEdenSourceFromRow_(rowObj) {
    var out = {};
    getEdenDataHeaders_().forEach(function (field) {
      out[field] = rowObj['Source_' + field];
    });
    return out;
  }

  function syncEdenRowsWithMaster_() {
    return;
  }
  function saveEdenDataMasterDraft_(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    if (!isEden_(session.user) && !isIdan_(session.user)) return Utils.safeMessage('אין הרשאה.');
    try {
      var body = Utils.asObject(payload, {});
      var requestId = Utils.normalize(body.RequestID);
      if (!requestId) return Utils.safeMessage('RequestID הוא שדה חובה.');
      var courseId = resolveCourseIdByRequestId_(requestId);
      if (!courseId) return Utils.safeMessage('לא נמצא CourseID לבקשה.');
      var requestedData = Utils.asObject(body.RequestedData, {});
      var edenNotes = Utils.normalize(body.EdenNotes || body.ApprovalNotes);

      var edenTable = ensureEdenDataMasterSheet_();
      var existing = findEdenRowByCourseId_(edenTable, courseId);
      if (!existing) return Utils.safeMessage('לא נמצאה רשומה במסך עדן.');
      var updated = existing.row.slice();
      var headers = edenTable.headers;
      Object.keys(requestedData).forEach(function (field) {
        var idx = Utils.resolveIndex(headers, ['Eden_' + field]);
        if (idx > -1) updated[idx] = requestedData[field];
      });
      var idxNotes = Utils.resolveIndex(headers, ['EdenNotes']);
      if (idxNotes > -1) updated[idxNotes] = edenNotes;
      var idxWorkflow = Utils.resolveIndex(headers, ['WorkflowStatus']);
      if (idxWorkflow > -1) updated[idxWorkflow] = EDEN_WORKFLOW_STATUSES.EDEN_SAVED;
      var idxSavedAt = Utils.resolveIndex(headers, ['EdenLastSavedAt']);
      if (idxSavedAt > -1) updated[idxSavedAt] = Utils.nowIso();
      var idxHasDiff = Utils.resolveIndex(headers, ['HasDiffBetweenSourceAndEden']);
      if (idxHasDiff > -1) {
        var rowObj = Utils.rowToObject(headers, updated, existing.rowNumber);
        updated[idxHasDiff] = hasDiffBetweenSourceAndEden_(rowObj) ? 'true' : 'false';
      }
      Utils.updateRow(CONFIG.SHEETS.EDEN_DATA_MASTER, existing.rowNumber, updated);
      return { success: true, data: { RequestID: requestId, RowID: courseId,
          CourseID: courseId, WorkflowStatus: EDEN_WORKFLOW_STATUSES.EDEN_SAVED } };
    } catch (err) {
      return Utils.safeMessage('שמירת טיוטת עדן נכשלה.');
    }
  }
  function submitEdenToAdmin_(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    if (!isEden_(session.user) && !isIdan_(session.user)) return Utils.safeMessage('אין הרשאה.');
    try {
      var body = Utils.asObject(payload, {});
      var requestId = Utils.normalize(body.RequestID);
      if (!requestId) return Utils.safeMessage('RequestID הוא שדה חובה.');
      var courseId = resolveCourseIdByRequestId_(requestId);
      if (!courseId) return Utils.safeMessage('לא נמצא CourseID לבקשה.');
      var edenTable = ensureEdenDataMasterSheet_();
      var existing = findEdenRowByCourseId_(edenTable, courseId);
      if (!existing) return Utils.safeMessage('לא נמצאה רשומת עדן.');

      var rowObj = Utils.rowToObject(edenTable.headers, existing.row, existing.rowNumber);
      var requestedData = extractEdenDraftFromRow_(rowObj);

      var reqTable = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var reqIdx = resolveRequestIndexes_(reqTable.headers);
      var requestMatch = findRequestById_(reqTable, reqIdx.requestId, requestId);
      if (!requestMatch) return Utils.safeMessage('לא נמצאה בקשת שינוי.');
      var reqRow = requestMatch.row.slice();
      if (reqIdx.requestedData > -1) reqRow[reqIdx.requestedData] = Utils.safeJson(requestedData);
      if (reqIdx.approvalStatus > -1) reqRow[reqIdx.approvalStatus] = CONFIG.STATUSES.PENDING_FINAL;
      if (reqIdx.requestStatus > -1) reqRow[reqIdx.requestStatus] = CONFIG.STATUSES.PENDING_FINAL;
      if (reqIdx.edenViewStatus > -1) reqRow[reqIdx.edenViewStatus] = CONFIG.STATUSES.EDEN_APPROVED;
      if (reqIdx.approvalNotes > -1) reqRow[reqIdx.approvalNotes] = Utils.normalize(rowObj.EdenNotes);
      Utils.updateRow(CONFIG.SHEETS.EDIT_REQUESTS, requestMatch.rowNumber, reqRow);

      var edenUpdated = existing.row.slice();
      var idxWorkflow = Utils.resolveIndex(edenTable.headers, ['WorkflowStatus']);
      if (idxWorkflow > -1) edenUpdated[idxWorkflow] = EDEN_WORKFLOW_STATUSES.PENDING_FINAL;
      var idxSent = Utils.resolveIndex(edenTable.headers, ['SentToAdminAt']);
      if (idxSent > -1) edenUpdated[idxSent] = Utils.nowIso();
      Utils.updateRow(CONFIG.SHEETS.EDEN_DATA_MASTER, existing.rowNumber, edenUpdated);
      return { success: true, data: { RequestID: requestId, RowID: courseId,
          CourseID: courseId, ApprovalStatus: EDEN_WORKFLOW_STATUSES.PENDING_FINAL } };
    } catch (err) {
      return Utils.safeMessage('העברה לאדמין נכשלה.');
    }
  }
  function refreshEdenSource_(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    if (!isEden_(session.user) && !isIdan_(session.user)) return Utils.safeMessage('אין הרשאה.');
    try {
      var body = Utils.asObject(payload, {});
      var requestId = Utils.normalize(body.RequestID);
      if (!requestId) return Utils.safeMessage('RequestID הוא שדה חובה.');
      var courseId = resolveCourseIdByRequestId_(requestId);
      if (!courseId) return Utils.safeMessage('לא נמצא CourseID לבקשה.');
      syncEdenRowsWithMaster_();
      var edenTable = Utils.readTable(CONFIG.SHEETS.EDEN_DATA_MASTER, true);
      var existing = findEdenRowByCourseId_(edenTable, courseId);
      if (!existing) return Utils.safeMessage('לא נמצאה רשומה.');
      return { success: true, data: { RequestID: requestId, RowID: courseId,
          CourseID: courseId, refreshedAt: Utils.nowIso() } };
    } catch (err) {
      return Utils.safeMessage('רענון מקור נכשל.');
    }
  }
  function updateEdenWorkflowByRequestId_(requestId, workflowStatus, extraFields) {
    var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
    var idx = resolveRequestIndexes_(table.headers);
    var found = findRequestById_(table, idx.requestId, requestId);
    if (!found) return false;
    var row = found.row.slice();
    if (idx.approvalStatus > -1) row[idx.approvalStatus] = workflowStatus;
    if (idx.requestStatus > -1) row[idx.requestStatus] = workflowStatus;
    var extras = Utils.asObject(extraFields, {});
    if (idx.requestedData > -1 && extras.requestedData) row[idx.requestedData] = Utils.safeJson(Utils.asObject(extras.requestedData, {}));
    if (idx.originalData > -1 && extras.originalData) row[idx.originalData] = Utils.safeJson(Utils.asObject(extras.originalData, {}));
    if (idx.approvalNotes > -1 && extras.approvalNotes !== undefined) row[idx.approvalNotes] = Utils.normalize(extras.approvalNotes);
    if (idx.edenApprovedAt > -1 && Utils.toKey(workflowStatus) === Utils.toKey(CONFIG.STATUSES.PENDING_FINAL)) row[idx.edenApprovedAt] = Utils.nowIso();
    Utils.updateRow(CONFIG.SHEETS.EDIT_REQUESTS, found.rowNumber, row);
    return true;
  }
  function resolveMeetingIndexes_(headers) {
    return {
      meetingId: Utils.resolveIndex(headers, ['MeetingID']),
      rowId: Utils.resolveIndex(headers, ['RowID']),
      courseId: Utils.resolveIndex(headers, ['CourseID']),
      meetingNumber: Utils.resolveIndex(headers, ['MeetingNumber']),
      meetingDate: Utils.resolveIndex(headers, ['MeetingDate']),
      originalMeetingDate: Utils.resolveIndex(headers, ['OriginalMeetingDate']),
      startTime: Utils.resolveIndex(headers, ['StartTime']),
      endTime: Utils.resolveIndex(headers, ['EndTime']),
      meetingStatus: Utils.resolveIndex(headers, ['MeetingStatus']),
      changedBy: Utils.resolveIndex(headers, ['ChangedBy']),
      changedAt: Utils.resolveIndex(headers, ['ChangedAt']),
      changeSource: Utils.resolveIndex(headers, ['ChangeSource']),
      shiftGroupId: Utils.resolveIndex(headers, ['ShiftGroupID']),
      changeNote: Utils.resolveIndex(headers, ['ChangeNote'])
    };
  }

  function normalizeChangeSource_(sourceInput, user) {
    var key = Utils.toKey(sourceInput);
    if (key === 'manager' || key === 'eden' || key === 'admin') return key.toUpperCase();
    if (isEden_(user)) return 'EDEN';
    if (isIdan_(user)) return 'ADMIN';
    return 'MANAGER';
  }

  function stripTime_(dateValue) {
    var source = asDate_(dateValue);
    if (!source) return null;
    return new Date(source.getFullYear(), source.getMonth(), source.getDate());
  }

  function bootstrapMeetingsForCourse_(courseId) {
    var table = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, true);
    var idxCourse = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ROW_ID);
    if (idxCourse === -1) return [];
    var match = null;
    for (var i = 0; i < table.rows.length; i += 1) {
      if (Utils.toKey(valueAt_(table.rows[i], idxCourse)) !== Utils.toKey(courseId)) continue;
      match = table.rows[i];
      break;
    }
    if (!match) return [];
    var idxStartTime = Utils.resolveIndex(table.headers, ['StartTime']);
    var idxEndTime = Utils.resolveIndex(table.headers, ['EndTime']);
    var idxStatus = Utils.resolveIndex(table.headers, CONFIG.FIELDS.STATUS);
    var created = [];
    for (var meetingNumber = 1; meetingNumber <= 35; meetingNumber += 1) {
      var idxDate = Utils.resolveIndex(table.headers, ['Date' + meetingNumber]);
      if (idxDate === -1) continue;
      var dateValue = asDate_(valueAt_(match, idxDate));
      if (!dateValue) continue;
      created.push(createMeetingRow_(courseId, meetingNumber, dateValue, valueAt_(match, idxStartTime), valueAt_(match, idxEndTime), valueAt_(match, idxStatus)));
    }
    if (!created.length) return [];
    Utils.ensureCourseMeetingsSheet();
    var meetingSheet = Utils.readTable(CONFIG.SHEETS.COURSE_MEETINGS, true);
    created.forEach(function (entry) {
      var values = meetingSheet.headers.map(function (header) { return entry[header] || ''; });
      Utils.appendRow(CONFIG.SHEETS.COURSE_MEETINGS, values);
    });
    var refreshed = Utils.readTable(CONFIG.SHEETS.COURSE_MEETINGS, true);
    var idx = resolveMeetingIndexes_(refreshed.headers);
    var out = [];
    for (var k = 0; k < refreshed.rows.length; k += 1) {
      var row = refreshed.rows[k];
      if (Utils.toKey(valueAt_(row, idx.courseId)) !== Utils.toKey(courseId)) continue;
      out.push(Utils.rowToObject(refreshed.headers, row, refreshed.rowNumbers[k]));
    }
    return out;
  }
  function createMeetingRow_(courseId, meetingNumber, dateValue, startTime, endTime, status) {
    var meetingId = [Utils.normalize(courseId), String(meetingNumber)].join('-M');
    return {
      MeetingID: meetingId,
      RowID: courseId,
      CourseID: courseId,
      MeetingNumber: meetingNumber,
      MeetingDate: stripTime_(dateValue),
      StartTime: startTime || '',
      EndTime: endTime || '',
      MeetingStatus: status || ''
    };
  }

  function hasMasterChangedAfterSourceSnapshot_(courseId, sourceSnapshot) {
    if (!courseId) return false;
    var latest = getCourseSnapshotById_(courseId);
    if (!latest) return false;
    var source = Utils.asObject(sourceSnapshot, {});
    var latestKeys = Object.keys(latest);
    for (var i = 0; i < latestKeys.length; i += 1) {
      var key = latestKeys[i];
      if (Utils.toKey(key) === 'rownumber') continue;
      if (Utils.normalize(latest[key]) !== Utils.normalize(source[key])) return true;
    }
    return false;
  }
  function syncCourseMeetingsToDataMaster_(courseId) {
    var table = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, true);
    var idxCourse = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ROW_ID);
    var rowMatch = findRowByCourseId_(table, idxCourse, courseId);
    if (!rowMatch) return { monthEndChanged: false };
    var idxEnd = Utils.resolveIndex(table.headers, CONFIG.FIELDS.END_DATE);
    var oldEnd = idxEnd > -1 ? Utils.normalize(valueAt_(rowMatch.row, idxEnd)) : '';
    var latest = null;
    for (var n = 1; n <= CONFIG.DATE_FIELDS_COUNT; n += 1) {
      var field = n === 1 ? 'start_date' : ('date' + n);
      var idx = Utils.resolveIndex(table.headers, [field, 'Date' + n]);
      if (idx === -1) continue;
      var dv = asDate_(valueAt_(rowMatch.row, idx));
      if (dv && (!latest || dv > latest)) latest = dv;
    }
    if (idxEnd > -1 && latest) {
      var updated = rowMatch.row.slice();
      updated[idxEnd] = stripTime_(latest);
      Utils.updateRow(CONFIG.SHEETS.DATA_MASTER, rowMatch.rowNumber, updated);
      return { monthEndChanged: oldEnd !== Utils.normalize(updated[idxEnd]) };
    }
    return { monthEndChanged: false };
  }
  function requireWritePermission_(user, actionType, context) {
    if (!user || Utils.isEmpty(user.userId)) throw new Error('auth_required');
    var role = Utils.toKey(user.SystemRole);
    var editScope = Utils.toKey(user.EditScope);
    var approvalScope = Utils.toKey(user.ApprovalScope);
    var canEditAdmin = hasCapability_(user, 'edit_admin');
    var canEditActivities = hasCapability_(user, 'edit_activities');
    var canEditOperations = hasCapability_(user, 'edit_operations_data');
    var canEditExceptions = hasCapability_(user, 'edit_exceptions');
    var canEditRequests = hasCapability_(user, 'edit_edit_requests');
    var allowed = false;

    if (actionType === WRITE_ACTIONS.UPDATE_COURSE || actionType === WRITE_ACTIONS.UPDATE_MEETINGS) {
      allowed = canEditAdmin || canEditActivities || canEditOperations
        || role === 'admin' || role === 'idan_main_admin' || role === 'admin-ops' || role === 'manager-lead' || role === 'manager'
        || editScope === 'all' || editScope === 'full';
    } else if (actionType === WRITE_ACTIONS.CREATE_MASTER_RECORD) {
      allowed = canEditAdmin || canEditActivities || canEditOperations
        || role === 'admin' || role === 'idan_main_admin' || role === 'admin-ops' || role === 'manager-lead' || role === 'manager'
        || editScope === 'all' || editScope === 'full';
    } else if (actionType === WRITE_ACTIONS.CREATE_EDIT_REQUEST) {
      allowed = canEditRequests || canEditActivities || canEditAdmin || role !== 'instructor';
    } else if (actionType === WRITE_ACTIONS.APPROVAL_DECISION) {
      allowed = canEditOperations || canEditAdmin || role === 'admin' || role === 'admin-ops' || approvalScope === 'all' || approvalScope === 'full';
    } else if (actionType === WRITE_ACTIONS.MARK_EXCEPTION_RESOLVED) {
      allowed = canEditExceptions || canEditOperations || canEditAdmin
        || role === 'admin' || role === 'admin-ops' || role === 'manager-lead' || role === 'manager';
    } else if (actionType === WRITE_ACTIONS.FINANCE_SYNC || actionType === WRITE_ACTIONS.FINANCE_UPDATE) {
      requireFinanceAccess_(user, { archive: false, requireEdit: true });
      allowed = true;
    } else if (actionType === WRITE_ACTIONS.FINANCE_ARCHIVE_UPDATE) {
      requireFinanceAccess_(user, { archive: true, requireEdit: true });
      allowed = true;
    }

    if (!allowed) throw new Error('unauthorized_write_' + actionType);
    if ((actionType === WRITE_ACTIONS.UPDATE_COURSE || actionType === WRITE_ACTIONS.UPDATE_MEETINGS)
      && !canEditCourseByRole_(user, context && context.courseId, context && context.team)
      && !canEditAdmin && !canEditActivities && !canEditOperations) {
      throw new Error('unauthorized_scope_' + actionType);
    }
    return true;
  }

  function hasCapability_(user, key) {
    if (!user || Utils.isEmpty(key)) return false;
    var caps = Utils.asObject(user.Capabilities, {});
    return isTrueFlag_(caps[key]);
  }

  function requireFinanceAccess_(user, options) {
    var opts = options || {};
    var archive = Boolean(opts.archive);
    var requireEdit = Boolean(opts.requireEdit);
    var accessField = archive ? 'CanAccessFinanceArchive' : 'CanAccessFinance';
    var editField = archive ? 'CanEditFinanceArchive' : 'CanEditFinance';
    var isAdminRole = Utils.toKey(user.SystemRole) === 'admin' || Utils.toKey(user.SystemRole) === 'idan_main_admin';
    var hasAccess = isAdminRole || isTrueFlag_(user[accessField]);
    var hasEdit = isAdminRole || isTrueFlag_(user[editField]);

    if (!hasAccess) throw new Error('unauthorized_finance_access');
    if (requireEdit && !hasEdit) throw new Error('unauthorized_finance_edit');
    return true;
  }

  function resolveTeamScopeByCourseId_(courseId) {
    if (Utils.isEmpty(courseId)) return '';
    var table = getCachedDataMasterTable_();
    if (!table.sheet || !table.headers.length) return '';
    var idxCourse = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ROW_ID);
    var idxTeam = Utils.resolveIndex(table.headers, CONFIG.FIELDS.TEAM);
    if (idxCourse === -1 || idxTeam === -1) return '';
    for (var i = 0; i < table.rows.length; i += 1) {
      if (Utils.toKey(table.rows[i][idxCourse]) !== Utils.toKey(courseId)) continue;
      return Utils.normalize(table.rows[i][idxTeam]);
    }
    return '';
  }

  function getCachedDataMasterTable_() {
    var ttl = Number(getSetting('cache_data_master_ttl', PERF_CACHE.DATA_MASTER_TTL));
    return Utils.readTable(CONFIG.SHEETS.DATA_MASTER, true, {
      useScriptCache: true,
      cacheKey: 'table:data_master',
      cacheTtlSeconds: ttl > 0 ? ttl : PERF_CACHE.DATA_MASTER_TTL,
      requestMemoKey: 'table:data_master'
    });
  }

  function getCachedPermissionsTable_(required) {
    var ttl = Number(getSetting('cache_permissions_ttl', PERF_CACHE.PERMISSIONS_TTL));
    return Utils.readTable(CONFIG.SHEETS.PERMISSIONS, required !== false, {
      useScriptCache: true,
      cacheKey: 'table:permissions',
      cacheTtlSeconds: ttl > 0 ? ttl : PERF_CACHE.PERMISSIONS_TTL,
      requestMemoKey: 'table:permissions'
    });
  }

  function normalizeCredential_(value) {
    var byId = Utils.normalizeID(value);
    if (!Utils.isEmpty(byId)) return byId;
    return Utils.normalizeWhitespace(value);
  }

  function buildInstructorLookup_() {
    return Utils.withScriptCache('lookup:instructors', PERF_CACHE.INSTRUCTOR_LOOKUP_TTL, function () {
      var table = getCachedPermissionsTable_(false);
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
    });
  }

  function buildFieldIndexMap_(headers, fields) {
    var out = {};
    (fields || []).forEach(function (field) {
      if (out[field] !== undefined) return;
      out[field] = Utils.resolveIndex(headers, CONFIG.FIELDS[field] || [field]);
    });
    return out;
  }

  function startPerf_(endpoint) {
    var startedAt = new Date().getTime();
    Logger.log('[PERF][%s] start=%s', endpoint, new Date(startedAt).toISOString());
    return {
      startStage: function (name) {
        return { name: name, startedAt: new Date().getTime() };
      },
      endStage: function (stage, meta) {
        var endedAt = new Date().getTime();
        var payload = meta ? JSON.stringify(meta) : '{}';
        Logger.log('[PERF][%s] %s=%sms meta=%s', endpoint, stage.name, endedAt - stage.startedAt, payload);
      },
      finish: function (meta) {
        var endedAt = new Date().getTime();
        var payload = meta ? JSON.stringify(meta) : '{}';
        Logger.log('[PERF][%s] total=%sms meta=%s', endpoint, endedAt - startedAt, payload);
      }
    };
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
      employeeId: Utils.resolveIndex(headers, ['EmployeeID', 'emp_id']),
      entryCode: Utils.resolveIndex(headers, ['EntryCode', 'code']),
      employeeName: Utils.resolveIndex(headers, ['name', 'EmployeeName']),
      systemRole: Utils.resolveIndex(headers, ['SystemRole', 'role']),
      displayRole: Utils.resolveIndex(headers, ['DisplayRole', 'role', 'SystemRole']),
      viewScope: Utils.resolveIndex(headers, ['ViewScope']),
      editScope: Utils.resolveIndex(headers, ['EditScope', 'action_language']),
      approvalScope: Utils.resolveIndex(headers, ['ApprovalScope', 'role', 'SystemRole']),
      uiProfile: Utils.resolveIndex(headers, ['default_view', 'UiProfile']),
      defaultView: Utils.resolveIndex(headers, ['default_view', 'UiProfile']),
      teamScope: Utils.resolveIndex(headers, ['TeamScope']),
      instructorManager: Utils.resolveIndex(headers, ['InstructorManager', 'manager']),
      activeFlag: Utils.resolveIndex(headers, ['ActiveFlag', 'active']),
      canAccessFinance: Utils.resolveIndex(headers, ['CanAccessFinance', 'view_finance']),
      canEditFinance: Utils.resolveIndex(headers, ['CanEditFinance', 'edit_finance']),
      canAccessFinanceArchive: Utils.resolveIndex(headers, ['CanAccessFinanceArchive']),
      canEditFinanceArchive: Utils.resolveIndex(headers, ['CanEditFinanceArchive'])
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

  function anyTrueInRows_(rows, index) {
    if (index === -1) return false;
    for (var i = 0; i < rows.length; i += 1) {
      if (isTrueFlag_(valueAt_(rows[i], index))) return true;
    }
    return false;
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
    var courseIndex = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ROW_ID);
    if (courseIndex === -1) return null;
    var match = findRowByCourseId_(table, courseIndex, courseId);
    if (!match) return null;
    return Utils.rowToObject(table.headers, match.row, match.rowNumber);
  }



  function rebuildFinanceSheet() {
    var FINANCE_SHEET = 'FINANCE';
    var FINANCE_ARCHIVE_SHEET = 'FINANCE_ARCHIVE';
    var ARCHIVED_STATUS = 'בוצע-גביה'; // הנחה: זהו הערך הקבוע שמסמן גבייה שהושלמה.
    var DEFAULT_STATUS = 'ממתין'; // הנחה: זהו סטטוס ברירת המחדל לקבוצת גבייה חדשה.

    var financeTable = Utils.readTable(FINANCE_SHEET, true);
    var dataMasterTable = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, true);
    var financeSheet = financeTable.sheet;

    var archiveSheet = ensureFinanceArchiveSheet_(financeSheet, FINANCE_ARCHIVE_SHEET);
    var archiveTable = Utils.readTable(FINANCE_ARCHIVE_SHEET, true);

    var activeByGroupKey = {};
    var archiveByGroupKey = {};
    var archiveByFinanceRowId = {};
    var allFinanceIds = {};

    indexFinanceRowsByKey_(archiveTable.headers, archiveTable.rows, archiveByGroupKey, archiveByFinanceRowId, allFinanceIds);

    var archivedCandidates = [];
    var activeFinanceRows = [];
    var financeStatusIdx = Utils.resolveIndex(financeTable.headers, ['FinanceStatus']);

    financeTable.rows.forEach(function (row) {
      var status = Utils.normalize(valueAt_(row, financeStatusIdx));
      if (status === ARCHIVED_STATUS) {
        archivedCandidates.push(row);
      } else {
        activeFinanceRows.push(row);
      }
    });

    var archivedAddedCount = 0;
    var financeRowIdIdx = Utils.resolveIndex(financeTable.headers, ['FinanceRowID']);
    archivedCandidates.forEach(function (row) {
      var financeRowId = Utils.normalize(valueAt_(row, financeRowIdIdx));
      if (!financeRowId || archiveByFinanceRowId[financeRowId]) return;
      appendFinanceArchiveRow_(archiveSheet, row, financeTable.headers.length);
      archiveByFinanceRowId[financeRowId] = true;
      archivedAddedCount += 1;
    });

    archiveTable = Utils.readTable(FINANCE_ARCHIVE_SHEET, true);
    archiveByGroupKey = {};
    archiveByFinanceRowId = {};
    indexFinanceRowsByKey_(archiveTable.headers, archiveTable.rows, archiveByGroupKey, archiveByFinanceRowId, allFinanceIds);

    activeFinanceRows.forEach(function (row) {
      var out = buildExistingFinanceIdentity_(financeTable.headers, row);
      if (!out.groupKey) return;
      activeByGroupKey[out.groupKey] = out;
      if (out.financeRowId) allFinanceIds[out.financeRowId] = true;
    });

    var groups = aggregateFinanceGroupsFromDataMaster_(dataMasterTable.headers, dataMasterTable.rows);
    var groupKeys = Object.keys(groups);
    var nextSequence = findNextFinanceSequence_(allFinanceIds);

    var outputRows = [];
    groupKeys.forEach(function (groupKey) {
      if (archiveByGroupKey[groupKey]) return;
      var group = groups[groupKey];
      var existing = activeByGroupKey[groupKey] || archiveByGroupKey[groupKey] || null;

      var financeRowId = existing && existing.financeRowId ? existing.financeRowId : generateFinanceRowId_(nextSequence++);
      var financeStatus = existing && existing.financeStatus ? existing.financeStatus : DEFAULT_STATUS;

      if (archiveByFinanceRowId[financeRowId]) return;

      outputRows.push(buildFinanceOutputRow_(financeTable.headers, group, financeRowId, financeStatus));
    });

    sortFinanceRows_(outputRows, financeTable.headers);

    clearFinanceDataRows_(financeSheet, financeTable.headers.length);
    if (outputRows.length) {
      financeSheet
        .getRange(CONFIG.STRUCTURE.DATA_START_ROW, 1, outputRows.length, financeTable.headers.length)
        .setValues(outputRows);
    }

    return {
      success: true,
      activeRowsCount: outputRows.length,
      archivedAddedCount: archivedAddedCount,
      sampleActiveRow: outputRows.length ? outputRows[0] : null,
      sampleArchiveRow: archivedAddedCount ? archiveSheet.getRange(archiveSheet.getLastRow(), 1, 1, archiveTable.headers.length).getValues()[0] : null
    };
  }

  function aggregateFinanceGroupsFromDataMaster_(headers, rows) {
    var idx = resolveDataMasterFinanceIndexes_(headers);
    var groups = {};

    rows.forEach(function (row, rowIndex) {
      if (!row || !row.length || isRowEmpty_(row)) return;

      var endValue = valueAt_(row, idx.end);
      if (Utils.isEmpty(endValue)) return;

      var normalizedFunding = normalizeFunding_(valueAt_(row, idx.funding));
      var billingGroup = resolveBillingGroup_(normalizedFunding, valueAt_(row, idx.school));
      var endKey = normalizeDateKey_(endValue);
      var courseId = Utils.normalize(valueAt_(row, idx.courseId));
      var rowId = Utils.normalize(valueAt_(row, idx.rowId)) || ('ROW-' + (rowIndex + 1));
      var groupKey = buildGroupKey_(endKey, billingGroup.type, billingGroup.key) + '|' + courseId + '|' + rowId;

      var monthEndValue = Utils.normalize(valueAt_(row, idx.monthEnd));
      var dateValues = collectDateFieldValues_(headers, row);
      groups[groupKey] = {
        rowId: rowId,
        end: endValue,
        monthEnd: monthEndValue || deriveMonthEndFromEnd_(endValue),
        funding: normalizedFunding,
        payerType: billingGroup.type,
        payer: billingGroup.key,
        payerName: billingGroup.key,
        courseId: courseId,
        program: Utils.normalize(valueAt_(row, idx.program)),
        eventType: Utils.normalize(valueAt_(row, idx.eventType)),
        authority: Utils.normalize(valueAt_(row, idx.authority)),
        school: Utils.normalize(valueAt_(row, idx.school)),
        instructor: Utils.normalize(valueAt_(row, idx.instructor)),
        employeeId: Utils.normalize(valueAt_(row, idx.employeeId)),
        courseManager: Utils.normalize(valueAt_(row, idx.courseManager)),
        classGroup: Utils.normalize(valueAt_(row, idx.classGroup)),
        dayName: Utils.normalize(valueAt_(row, idx.dayName)),
        startTime: valueAt_(row, idx.startTime),
        endTime: valueAt_(row, idx.endTime),
        dateValues: dateValues,
        plannedMeetings: parseNumberOrZero_(valueAt_(row, idx.plannedMeetings)),
        datesListedCount: dateValues.filter(function (value) { return Utils.normalize(value); }).length,
        paymentTotal: parseNumberOrZero_(valueAt_(row, idx.payment)),
        notes: Utils.normalizeWhitespace(valueAt_(row, idx.notes))
      };
    });

    return groups;
  }

  function collectDateFieldValues_(headers, row) {
    var values = new Array(CONFIG.DATE_FIELDS_COUNT).fill('');
    (headers || []).forEach(function (header, index) {
      var normalized = Utils.normalize(header);
      if (normalized === 'start_date') { values[0] = valueAt_(row, index); return; }
      if (normalized === 'Date1') {
        if (!Utils.normalize(values[0])) values[0] = valueAt_(row, index);
        return;
      }
      var match = /^(?:date|Date)([2-9]|[12][0-9]|3[0-5])$/.exec(normalized);
      if (!match) return;
      var position = Number(match[1]) - 1;
      if (position < 0 || position >= CONFIG.DATE_FIELDS_COUNT) return;
      values[position] = valueAt_(row, index);
    });
    return values;
  }

  function resolveDataMasterFinanceIndexes_(headers) {
    return {
      rowId: Utils.resolveIndex(headers, ['RowID']),
      courseId: Utils.resolveIndex(headers, ['CourseID']),
      authority: Utils.resolveIndex(headers, ['Authority']),
      school: Utils.resolveIndex(headers, ['School']),
      program: Utils.resolveIndex(headers, ['Program']),
      eventType: Utils.resolveIndex(headers, ['EventType']),
      instructor: Utils.resolveIndex(headers, ['Employee']),
      employeeId: Utils.resolveIndex(headers, ['EmployeeID']),
      courseManager: Utils.resolveIndex(headers, ['CourseManager']),
      classGroup: Utils.resolveIndex(headers, ['ClassGroup']),
      dayName: Utils.resolveIndex(headers, ['DayName']),
      startTime: Utils.resolveIndex(headers, ['StartTime']),
      endTime: Utils.resolveIndex(headers, ['EndTime']),
      plannedMeetings: Utils.resolveIndex(headers, ['PlannedMeetings']),
      funding: Utils.resolveIndex(headers, ['Funding']),
      payment: Utils.resolveIndex(headers, ['Payment']),
      notes: Utils.resolveIndex(headers, ['Notes']),
      end: Utils.resolveIndex(headers, ['End']),
      monthEnd: Utils.resolveIndex(headers, ['MonthEnd'])
    };
  }

  function resolveBillingGroup_(funding, school) {
    var key = Utils.normalizeWhitespace(funding);
    if (key === 'גפ"ן') return { type: 'SCHOOL', key: Utils.normalizeWhitespace(school) };
    return { type: 'FUNDING', key: key || 'לא מוגדר' };
  }

  function normalizeFunding_(value) {
    var normalized = Utils.normalizeWhitespace(value);
    if (normalized === 'גפן') return 'גפ"ן';
    return normalized;
  }

  function buildGroupKey_(endValue, billingGroupType, billingGroupKey) {
    return [Utils.normalize(endValue), Utils.normalize(billingGroupType), Utils.normalize(billingGroupKey)].join('|');
  }

  function buildExistingFinanceIdentity_(headers, row) {
    var idxFinanceRowId = Utils.resolveIndex(headers, ['FinanceRowID']);
    var idxEnd = Utils.resolveIndex(headers, ['End']);
    var idxType = Utils.resolveIndex(headers, ['PayerType']);
    var idxKey = Utils.resolveIndex(headers, ['Payer']);
    var idxRowId = Utils.resolveIndex(headers, ['RowID']);
    var idxCourseId = Utils.resolveIndex(headers, CONFIG.FIELDS.ROW_ID);
    var idxStatus = Utils.resolveIndex(headers, ['FinanceStatus']);

    var out = {
      financeRowId: Utils.normalize(valueAt_(row, idxFinanceRowId)),
      financeStatus: Utils.normalize(valueAt_(row, idxStatus)),
      groupKey: buildGroupKey_(normalizeDateKey_(valueAt_(row, idxEnd)), valueAt_(row, idxType), valueAt_(row, idxKey)) + '|'
        + Utils.normalize(valueAt_(row, idxCourseId)) + '|' + Utils.normalize(valueAt_(row, idxRowId))
    };
    return out;
  }

  function buildFinanceOutputRow_(headers, group, financeRowId, financeStatus) {
    var record = {
      FinanceRowID: financeRowId,
      End: group.end,
      MonthEnd: group.monthEnd,
      RowID: group.rowId,
      CourseID: group.courseId,
      Program: group.program,
      EventType: group.eventType,
      Funding: group.funding,
      PayerType: group.payerType,
      Payer: group.payerName,
      Authority: group.authority,
      School: group.school,
      Instructor: group.instructor,
      EmployeeID: group.employeeId,
      CourseManager: group.courseManager,
      ClassGroup: group.classGroup,
      DayName: group.dayName,
      StartTime: group.startTime,
      EndTime: group.endTime,
      PlannedMeetings: group.plannedMeetings,
      DatesListedCount: group.datesListedCount,
      Payment: group.paymentTotal,
      FinanceStatus: financeStatus,
      FinanceNotes: group.notes
    };
    for (var i = 1; i <= 35; i += 1) record['Date' + i] = group.dateValues[i - 1] || '';

    return headers.map(function (header) {
      return record.hasOwnProperty(header) ? record[header] : '';
    });
  }

  function ensureFinanceArchiveSheet_(financeSheet, archiveSheetName) {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var archiveSheet = spreadsheet.getSheetByName(archiveSheetName);
    if (archiveSheet) return archiveSheet;

    archiveSheet = spreadsheet.insertSheet(archiveSheetName);
    var headerWidth = financeSheet.getLastColumn();
    if (archiveSheet.getMaxColumns() < headerWidth) {
      archiveSheet.insertColumnsAfter(archiveSheet.getMaxColumns(), headerWidth - archiveSheet.getMaxColumns());
    }

    var headerRow = financeSheet.getRange(CONFIG.STRUCTURE.HEADER_ROW, 1, 1, headerWidth).getValues();
    var displayRow = financeSheet.getRange(CONFIG.STRUCTURE.DISPLAY_ROW, 1, 1, headerWidth).getValues();
    archiveSheet.getRange(CONFIG.STRUCTURE.HEADER_ROW, 1, 1, headerWidth).setValues(headerRow);
    archiveSheet.getRange(CONFIG.STRUCTURE.DISPLAY_ROW, 1, 1, headerWidth).setValues(displayRow);
    return archiveSheet;
  }

  function indexFinanceRowsByKey_(headers, rows, byGroupKey, byFinanceRowId, allFinanceIds) {
    rows.forEach(function (row) {
      var identity = buildExistingFinanceIdentity_(headers, row);
      if (identity.groupKey) byGroupKey[identity.groupKey] = identity;
      if (identity.financeRowId) {
        byFinanceRowId[identity.financeRowId] = true;
        allFinanceIds[identity.financeRowId] = true;
      }
    });
  }

  function clearFinanceDataRows_(sheet, width) {
    var lastRow = sheet.getLastRow();
    if (lastRow < CONFIG.STRUCTURE.DATA_START_ROW) return;
    sheet.getRange(CONFIG.STRUCTURE.DATA_START_ROW, 1, lastRow - CONFIG.STRUCTURE.DATA_START_ROW + 1, width).clearContent();
  }

  function appendFinanceArchiveRow_(sheet, row, width) {
    var nextRow = Math.max(sheet.getLastRow() + 1, CONFIG.STRUCTURE.DATA_START_ROW);
    sheet.getRange(nextRow, 1, 1, width).setValues([row]);
  }

  function findNextFinanceSequence_(allFinanceIds) {
    var maxNumber = 0;
    Object.keys(allFinanceIds).forEach(function (financeRowId) {
      var match = /^FIN-(\d+)$/.exec(financeRowId);
      if (!match) return;
      var n = Number(match[1]);
      if (n > maxNumber) maxNumber = n;
    });
    return maxNumber + 1;
  }

  function generateFinanceRowId_(sequence) {
    return 'FIN-' + ('00000' + sequence).slice(-5);
  }

  function sortFinanceRows_(rows, headers) {
    var idxEnd = Utils.resolveIndex(headers, ['End']);
    var idxType = Utils.resolveIndex(headers, ['PayerType']);
    var idxKey = Utils.resolveIndex(headers, ['Payer']);

    rows.sort(function (a, b) {
      var endDiff = compareDateLikeValues_(a[idxEnd], b[idxEnd]);
      if (endDiff !== 0) return endDiff;
      var typeA = Utils.normalize(a[idxType]);
      var typeB = Utils.normalize(b[idxType]);
      if (typeA < typeB) return -1;
      if (typeA > typeB) return 1;
      var keyA = Utils.normalize(a[idxKey]);
      var keyB = Utils.normalize(b[idxKey]);
      if (keyA < keyB) return -1;
      if (keyA > keyB) return 1;
      return 0;
    });
  }

  function compareDateLikeValues_(left, right) {
    var leftDate = asDate_(left);
    var rightDate = asDate_(right);
    if (leftDate && rightDate) return leftDate.getTime() - rightDate.getTime();
    var leftText = Utils.normalize(left);
    var rightText = Utils.normalize(right);
    if (leftText < rightText) return -1;
    if (leftText > rightText) return 1;
    return 0;
  }

  function pickEarlierDateLikeValue_(baseValue, candidateValue) {
    if (Utils.isEmpty(baseValue)) return candidateValue;
    if (Utils.isEmpty(candidateValue)) return baseValue;
    return compareDateLikeValues_(baseValue, candidateValue) <= 0 ? baseValue : candidateValue;
  }

  function normalizeDateKey_(value) {
    var asDate = asDate_(value);
    if (!asDate) return Utils.normalize(value);
    return Utilities.formatDate(asDate, 'UTC', 'yyyy-MM-dd');
  }

  function deriveMonthEndFromEnd_(endValue) {
    var asDate = asDate_(endValue);
    if (!asDate) return '';
    return Utilities.formatDate(asDate, 'UTC', 'yyyy-MM');
  }

  function asDate_(value) {
    if (value instanceof Date && !isNaN(value.getTime())) return value;
    if (Utils.isEmpty(value)) return null;
    var parsed = new Date(value);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  }

  function addUniqueValue_(mapObj, value) {
    var normalized = Utils.normalizeWhitespace(value);
    if (!normalized) return;
    mapObj[normalized] = true;
  }

  function mapKeysToList_(mapObj) {
    return Object.keys(mapObj).join(', ');
  }

  function parseNumberOrZero_(value) {
    if (Utils.isEmpty(value)) return 0;
    var normalized = String(value).replace(/,/g, '').trim();
    if (!normalized) return 0;
    var num = Number(normalized);
    return isNaN(num) ? 0 : num;
  }

  function parseBooleanFlag_(value) {
    return isTrueFlag_(value);
  }

  function parseSettingValueByType_(rawValue, rawType) {
    var typeKey = Utils.toKey(rawType);
    if (typeKey === 'number' || typeKey === 'int' || typeKey === 'float') {
      var normalized = Utils.normalize(rawValue).replace(/,/g, '');
      if (!normalized) return 0;
      var num = Number(normalized);
      return isNaN(num) ? 0 : num;
    }
    if (typeKey === 'boolean' || typeKey === 'bool') {
      return parseBooleanFlag_(rawValue);
    }
    if (typeKey === 'json' || typeKey === 'object' || typeKey === 'array') {
      return Utils.parseJson(rawValue);
    }
    return Utils.normalize(rawValue);
  }

  function loadActiveSettingsMap_() {
    return Utils.withScriptCache('settings:active_map', 120, function () {
      var table = Utils.readTable(CONFIG.SHEETS.SETTINGS, false, {
        useScriptCache: true,
        cacheKey: 'table:settings',
        cacheTtlSeconds: 120,
        requestMemoKey: 'table:settings'
      });
      if (!table.sheet || !table.headers.length) return {};
      var idxKey = Utils.resolveIndex(table.headers, CONFIG.FIELDS.SETTING_KEY);
      var idxValue = Utils.resolveIndex(table.headers, CONFIG.FIELDS.SETTING_VALUE);
      var idxType = Utils.resolveIndex(table.headers, CONFIG.FIELDS.SETTING_TYPE);
      var idxActive = Utils.resolveIndex(table.headers, CONFIG.FIELDS.SETTING_ACTIVE);
      if (idxKey === -1 || idxValue === -1 || idxType === -1 || idxActive === -1) return {};

      var out = {};
      table.rows.forEach(function (row) {
        if (!isTrueFlag_(valueAt_(row, idxActive))) return;
        var key = Utils.normalize(valueAt_(row, idxKey));
        if (!key) return;
        out[key] = parseSettingValueByType_(valueAt_(row, idxValue), valueAt_(row, idxType));
      });
      return out;
    });
  }

  function getSetting(key, fallback) {
    var normalizedKey = Utils.normalize(key);
    if (!normalizedKey) return fallback;
    var map = loadActiveSettingsMap_();
    if (!map.hasOwnProperty(normalizedKey)) return fallback;
    return map[normalizedKey];
  }

  function getAllSettings() {
    var session = requireSession_();
    if (!session.success) return session;
    if (!hasCapability_(session.user, 'view_settings') && !hasCapability_(session.user, 'view_admin')) {
      return Utils.safeMessage('אין הרשאה לצפייה בהגדרות.');
    }
    try {
      var table = Utils.readTable(CONFIG.SHEETS.SETTINGS, false, {
        useScriptCache: true,
        cacheKey: 'table:settings',
        cacheTtlSeconds: 120,
        requestMemoKey: 'table:settings'
      });
      if (!table.sheet || !table.headers.length) return { success: true, data: { items: [] } };
      var idxKey = Utils.resolveIndex(table.headers, CONFIG.FIELDS.SETTING_KEY);
      var idxValue = Utils.resolveIndex(table.headers, CONFIG.FIELDS.SETTING_VALUE);
      var idxType = Utils.resolveIndex(table.headers, CONFIG.FIELDS.SETTING_TYPE);
      var idxActive = Utils.resolveIndex(table.headers, CONFIG.FIELDS.SETTING_ACTIVE);
      var idxNotes = Utils.resolveIndex(table.headers, CONFIG.FIELDS.SETTING_NOTES);
      var items = table.rows.filter(function (row) {
        return isTrueFlag_(valueAt_(row, idxActive));
      }).map(function (row) {
        var key = Utils.normalize(valueAt_(row, idxKey));
        return {
          key: key,
          value: parseSettingValueByType_(valueAt_(row, idxValue), valueAt_(row, idxType)),
          type: Utils.normalize(valueAt_(row, idxType)),
          active: true,
          notes: Utils.normalize(valueAt_(row, idxNotes))
        };
      });
      return { success: true, data: { items: items } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון הגדרות.');
    }
  }

  function getActiveListItemsByName_(listName) {
    var wanted = Utils.toKey(listName);
    if (!wanted) return [];
    var table = Utils.readTable(CONFIG.SHEETS.LISTS, false, {
      useScriptCache: true,
      cacheKey: 'table:lists',
      cacheTtlSeconds: 120,
      requestMemoKey: 'table:lists'
    });
    if (!table.sheet || !table.headers.length) return [];
    var idxName = Utils.resolveIndex(table.headers, CONFIG.FIELDS.LIST_NAME);
    var idxValue = Utils.resolveIndex(table.headers, CONFIG.FIELDS.LIST_VALUE);
    var idxLabel = Utils.resolveIndex(table.headers, CONFIG.FIELDS.LIST_LABEL);
    var idxType = Utils.resolveIndex(table.headers, CONFIG.FIELDS.LIST_ACTIVITY_TYPE);
    var idxNo = Utils.resolveIndex(table.headers, CONFIG.FIELDS.LIST_ACTIVITY_NO);
    var idxActivityName = Utils.resolveIndex(table.headers, CONFIG.FIELDS.LIST_ACTIVITY_NAME);
    var idxActive = Utils.resolveIndex(table.headers, CONFIG.FIELDS.LIST_ACTIVE);

    return table.rows.filter(function (row) {
      return isTrueFlag_(valueAt_(row, idxActive))
        && Utils.toKey(valueAt_(row, idxName)) === wanted;
    }).map(function (row) {
      return {
        list_name: Utils.normalize(valueAt_(row, idxName)),
        value: Utils.normalize(valueAt_(row, idxValue)),
        label: Utils.normalize(valueAt_(row, idxLabel)) || Utils.normalize(valueAt_(row, idxValue)),
        activity_type: Utils.normalize(valueAt_(row, idxType)),
        activity_no: Utils.normalize(valueAt_(row, idxNo)),
        activity_name: Utils.normalize(valueAt_(row, idxActivityName)),
        active: true
      };
    });
  }

  function getAllLists() {
    var session = requireSession_();
    if (!session.success) return session;
    if (!hasCapability_(session.user, 'view_lists') && !hasCapability_(session.user, 'view_admin')) {
      return Utils.safeMessage('אין הרשאה לצפייה ברשימות.');
    }
    try {
      var table = Utils.readTable(CONFIG.SHEETS.LISTS, false, {
        useScriptCache: true,
        cacheKey: 'table:lists',
        cacheTtlSeconds: 120,
        requestMemoKey: 'table:lists'
      });
      if (!table.sheet || !table.headers.length) return { success: true, data: { items: [] } };
      var idxName = Utils.resolveIndex(table.headers, CONFIG.FIELDS.LIST_NAME);
      var names = {};
      table.rows.forEach(function (row) {
        var n = Utils.normalize(valueAt_(row, idxName));
        if (n) names[n] = true;
      });
      var items = [];
      Object.keys(names).forEach(function (name) {
        items = items.concat(getActiveListItemsByName_(name));
      });
      return { success: true, data: { items: items } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון רשימות.');
    }
  }

  function getListByName(listName) {
    var session = requireSession_();
    if (!session.success) return session;
    if (!hasCapability_(session.user, 'view_lists') && !hasCapability_(session.user, 'view_admin')) {
      return Utils.safeMessage('אין הרשאה לצפייה ברשימות.');
    }
    try {
      return { success: true, data: { items: getActiveListItemsByName_(listName) } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון רשימה.');
    }
  }

  function getContactsData() {
    var session = requireSession_();
    if (!session.success) return session;
    if (!hasCapability_(session.user, 'view_contacts') && !hasCapability_(session.user, 'view_admin')) {
      return Utils.safeMessage('אין הרשאה לצפייה באנשי קשר.');
    }
    try {
      var table = Utils.readTable(CONFIG.SHEETS.CONTACTS, false, {
        useScriptCache: true,
        cacheKey: 'table:contacts',
        cacheTtlSeconds: 120,
        requestMemoKey: 'table:contacts'
      });
      if (!table.sheet || !table.headers.length) return { success: true, data: { items: [] } };
      var indexes = {
        emp_id: Utils.resolveIndex(table.headers, CONFIG.FIELDS.CONTACT_EMP_ID),
        role: Utils.resolveIndex(table.headers, CONFIG.FIELDS.CONTACT_ROLE),
        name: Utils.resolveIndex(table.headers, CONFIG.FIELDS.CONTACT_NAME),
        id_number: Utils.resolveIndex(table.headers, CONFIG.FIELDS.CONTACT_ID_NUMBER),
        address: Utils.resolveIndex(table.headers, CONFIG.FIELDS.CONTACT_ADDRESS),
        mobile: Utils.resolveIndex(table.headers, CONFIG.FIELDS.CONTACT_MOBILE),
        email: Utils.resolveIndex(table.headers, CONFIG.FIELDS.CONTACT_EMAIL),
        employment: Utils.resolveIndex(table.headers, CONFIG.FIELDS.CONTACT_EMPLOYMENT)
      };
      var items = table.rows.map(function (row, i) {
        return {
          emp_id: Utils.normalize(valueAt_(row, indexes.emp_id)),
          role: Utils.normalize(valueAt_(row, indexes.role)),
          name: Utils.normalize(valueAt_(row, indexes.name)),
          id_number: Utils.normalize(valueAt_(row, indexes.id_number)),
          address: Utils.normalize(valueAt_(row, indexes.address)),
          mobile: Utils.normalize(valueAt_(row, indexes.mobile)),
          email: Utils.normalize(valueAt_(row, indexes.email)),
          employment: Utils.normalize(valueAt_(row, indexes.employment)),
          _rowNumber: table.rowNumbers[i]
        };
      });
      return { success: true, data: { items: items } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון אנשי קשר.');
    }
  }

  function updateContact(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    if (!hasCapability_(session.user, 'edit_contacts') && !hasCapability_(session.user, 'edit_admin')) {
      return Utils.safeMessage('אין הרשאה לעריכת אנשי קשר.');
    }
    try {
      var body = Utils.asObject(payload, {});
      var rowNumber = Number(body._rowNumber || body.rowNumber);
      if (!rowNumber) return Utils.safeMessage('חסר מזהה שורה לעריכה.');
      var table = Utils.readTable(CONFIG.SHEETS.CONTACTS, true, { requestMemoKey: 'table:contacts:update' });
      Utils.validateTableHeaders(table, { empId: CONFIG.FIELDS.CONTACT_EMP_ID, name: CONFIG.FIELDS.CONTACT_NAME }, 'updateContact:contacts');
      var rowIndex = table.rowNumbers.indexOf(rowNumber);
      if (rowIndex === -1) return Utils.safeMessage('רשומת איש קשר לא נמצאה.');
      var existing = table.rows[rowIndex].slice();
      var pairs = [
        { key: 'emp_id', aliases: CONFIG.FIELDS.CONTACT_EMP_ID },
        { key: 'role', aliases: CONFIG.FIELDS.CONTACT_ROLE },
        { key: 'name', aliases: CONFIG.FIELDS.CONTACT_NAME },
        { key: 'id_number', aliases: CONFIG.FIELDS.CONTACT_ID_NUMBER },
        { key: 'address', aliases: CONFIG.FIELDS.CONTACT_ADDRESS },
        { key: 'mobile', aliases: CONFIG.FIELDS.CONTACT_MOBILE },
        { key: 'email', aliases: CONFIG.FIELDS.CONTACT_EMAIL },
        { key: 'employment', aliases: CONFIG.FIELDS.CONTACT_EMPLOYMENT }
      ];
      pairs.forEach(function (field) {
        var idx = Utils.resolveIndex(table.headers, field.aliases);
        if (idx === -1) return;
        if (!body.hasOwnProperty(field.key)) return;
        existing[idx] = Utils.normalize(body[field.key]);
      });
      Utils.updateRow(CONFIG.SHEETS.CONTACTS, rowNumber, existing);
      return { success: true, data: { _rowNumber: rowNumber } };
    } catch (err) {
      logDiag_('WARN', 'contacts_update_failed', { message: err && err.message ? err.message : String(err || '') });
      return Utils.safeMessage('עדכון איש קשר נכשל.');
    }
  }

  function isRowEmpty_(row) {
    for (var i = 0; i < row.length; i += 1) {
      if (!Utils.isEmpty(row[i])) return false;
    }
    return true;
  }

  function isInactiveFlag_(value) {
    var key = Utils.toKey(value);
    return key === '0' || key === 'false' || key === 'no' || key === 'inactive' || key === 'disabled';
  }

  function isTrueFlag_(value) {
    var key = Utils.toKey(value);
    return key === '1' || key === 'true' || key === 'yes' || key === 'כן' || key === 'y';
  }

  function isIdan_(user) {
    var r = Utils.toKey(user.SystemRole);
    return r === 'admin' || r === 'idan_main_admin';
  }
  function isEden_(user) { return Utils.toKey(user.SystemRole) === 'admin-ops'; }
  function isManager_(user) { return Utils.toKey(user.SystemRole) === 'manager'; }
  function isManagerLead_(user) { return Utils.toKey(user.SystemRole) === 'manager-lead'; }
  function isInstructor_(user) { return Utils.toKey(user.SystemRole) === 'instructor'; }

  function requireSession_() {
    var profile = getSession_();
    if (!profile || !profile.authenticated || Utils.isEmpty(profile.userId)) {
      logDiag_('WARN', 'session_missing_or_invalid', { hasProfile: Boolean(profile), authenticated: Boolean(profile && profile.authenticated) });
      return { success: false, message: 'אין חיבור פעיל.' };
    }
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

  function generateCourseId_() {
    return 'CRS-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
  }

  return {
    login: login,
    logout: logout,
    getSessionProfile: getSessionProfile,
    getDashboardData: getDashboardData,
    getMyCoursesData: getMyCoursesData,
    submitEditRequest: submitEditRequest,
    getSheetRows: getSheetRows,
    getFinanceData: getFinanceData,
    getFinanceArchiveData: getFinanceArchiveData,
    getContactsData: getContactsData,
    updateContact: updateContact,
    getAllLists: getAllLists,
    getListByName: getListByName,
    getAllSettings: getAllSettings,
    getSetting: getSetting,
    getCourseMeetings: getCourseMeetings,
    updateCourseMeeting: updateCourseMeeting,
    updateFinanceStatus: updateFinanceStatus,
    syncFinance: syncFinance,
    updateCourse: updateCourse,
    createDataMasterRecord: createDataMasterRecord,
    createEditRequest: createEditRequest,
    getMyRequestsData: getMyRequestsData,
    getApprovalsData: getApprovalsData,
    getEdenViewData: getEdenViewData,
    approveRequest: approveRequest,
    rejectRequest: rejectRequest,
    rebuildFinanceSheet: rebuildFinanceSheet
  };
})();


function rebuildFinanceSheet() {
  return Logic.rebuildFinanceSheet();
}
