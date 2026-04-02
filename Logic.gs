var Logic = (function () {
  function login(userIdInput, codeInput) {
    try {
      var userId = normalizeCredential_(userIdInput);
      var code = normalizeCredential_(codeInput);
      Logger.log('loginAction: received userId=%s, code=%s', userId, code);
      if (Utils.isEmpty(userId) || Utils.isEmpty(code)) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var table = Utils.readTable(CONFIG.SHEETS.PERMISSIONS, true);
      Logger.log('loginAction: PERMISSIONS data rows=%s', table.rows.length);

      var idx = {
        employeeId: Utils.resolveIndex(table.headers, 'EmployeeID'),
        entryCode: Utils.resolveIndex(table.headers, 'EntryCode'),
        employeeName: Utils.resolveIndex(table.headers, 'EmployeeName'),
        baseRole: Utils.resolveIndex(table.headers, 'BaseRole'),
        systemRole: Utils.resolveIndex(table.headers, 'SystemRole'),
        displayRole: Utils.resolveIndex(table.headers, 'DisplayRole'),
        viewScope: Utils.resolveIndex(table.headers, 'ViewScope'),
        editScope: Utils.resolveIndex(table.headers, 'EditScope'),
        approvalScope: Utils.resolveIndex(table.headers, 'ApprovalScope'),
        uiProfile: Utils.resolveIndex(table.headers, 'UiProfile'),
        teamScope: Utils.resolveIndex(table.headers, 'TeamScope'),
        isDualMode: Utils.resolveIndex(table.headers, 'IsDualMode'),
        activeFlag: Utils.resolveIndex(table.headers, 'ActiveFlag')
      };
      if (idx.employeeId === -1 || idx.entryCode === -1 || idx.systemRole === -1 || idx.activeFlag === -1) {
        return { authenticated: false, message: 'ההתחברות נכשלה.' };
      }

      var rowsByEmployeeId = table.rows.filter(function (row) {
        return normalizeCredential_(row[idx.employeeId]) === userId;
      });
      Logger.log('loginAction: employeeId match=%s', rowsByEmployeeId.length > 0);
      if (!rowsByEmployeeId.length) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var found = null;
      rowsByEmployeeId.some(function (row) {
        var codeMatches = normalizeCredential_(row[idx.entryCode]) === code;
        if (codeMatches) found = row;
        return codeMatches;
      });
      Logger.log('loginAction: entryCode match=%s', !!found);
      if (!found) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var blockedByActiveFlag = isInactiveFlag_(valueAt_(found, idx.activeFlag));
      Logger.log('loginAction: activeFlag blocked=%s', blockedByActiveFlag);
      if (blockedByActiveFlag) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var profile = {
        authenticated: true,
        userId: Utils.normalize(found[idx.employeeId]),
        displayName: Utils.normalize(valueAt_(found, idx.employeeName)),
        EmployeeName: Utils.normalize(valueAt_(found, idx.employeeName)),
        EmployeeID: Utils.normalize(valueAt_(found, idx.employeeId)),
        BaseRole: Utils.normalize(valueAt_(found, idx.baseRole)),
        SystemRole: Utils.normalize(valueAt_(found, idx.systemRole)),
        DisplayRole: Utils.normalize(valueAt_(found, idx.displayRole)),
        ViewScope: Utils.normalize(valueAt_(found, idx.viewScope)),
        EditScope: Utils.normalize(valueAt_(found, idx.editScope)),
        ApprovalScope: Utils.normalize(valueAt_(found, idx.approvalScope)),
        UiProfile: Utils.normalize(valueAt_(found, idx.uiProfile)),
        TeamScope: Utils.normalize(valueAt_(found, idx.teamScope)),
        IsDualMode: Utils.normalize(valueAt_(found, idx.isDualMode)),
        ActiveFlag: Utils.normalize(valueAt_(found, idx.activeFlag)),
        team: Utils.normalize(valueAt_(found, idx.teamScope))
      };
      Logger.log('loginAction: matched SystemRole=%s', profile.SystemRole);
      PropertiesService.getUserProperties().setProperty(CONFIG.SESSION_KEY, JSON.stringify(profile));
      return profile;
    } catch (err) {
      return { authenticated: false, message: 'ההתחברות נכשלה.' };
    }
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
      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, false);
      var idx = resolveRequestIndexes_(table.headers);
      var pendingEden = countByStatus_(table.rows, idx.approvalStatus, CONFIG.STATUSES.PENDING_EDEN);
      var pendingFinal = countByStatus_(table.rows, idx.approvalStatus, CONFIG.STATUSES.PENDING_FINAL);
      var approvedFinal = countByStatus_(table.rows, idx.approvalStatus, CONFIG.STATUSES.FINAL_APPROVED);

      return {
        success: true,
        data: {
          totalDataMaster: Utils.countDataRows(CONFIG.SHEETS.DATA_MASTER),
          reviewRequiredCount: Utils.countDataRows(CONFIG.SHEETS.REVIEW_REQUIRED),
          pendingRequests: pendingEden,
          pendingFinal: pendingFinal,
          approvedFinal: approvedFinal,
          exportRows: Utils.countDataRows(CONFIG.SHEETS.DASHBOARD_EXPORT)
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
      var idxInstructor = Utils.resolveIndex(table.headers, CONFIG.FIELDS.INSTRUCTOR.concat(['Employee', 'EmployeeID'], CONFIG.FIELDS.USER_ID, CONFIG.FIELDS.DISPLAY_NAME));
      var idxProgram = Utils.resolveIndex(table.headers, CONFIG.FIELDS.PROGRAM);
      var idxStatus = Utils.resolveIndex(table.headers, CONFIG.FIELDS.STATUS);

      var rows = table.rows.filter(function (row) {
        if (isInstructor_(session.user)) {
          if (idxInstructor === -1) return false;
          return Utils.toKey(row[idxInstructor]) === Utils.toKey(session.user.userId) || Utils.toKey(row[idxInstructor]) === Utils.toKey(session.user.displayName);
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
      var frontendFields = CONFIG.FRONTEND_FIELDS.COURSES.concat(dynamicDateFields);

      var items = rows.map(function (row) {
        var out = {};
        frontendFields.forEach(function (field) {
          var fieldIdx = Utils.resolveIndex(table.headers, CONFIG.FIELDS[field] || [field]);
          out[field] = fieldIdx > -1 ? row[fieldIdx] : '';
        });
        return out;
      });

      return { success: true, data: { items: items, sourceSheet: CONFIG.SHEETS.DATA_MASTER, fields: frontendFields } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון פעילויות.');
    }
  }

  function submitEditRequest(payload) {
    var session = requireSession_();
    if (!session.success) return session;
    if (!canCreateRequest_(session.user)) return Utils.safeMessage('אין הרשאה להגיש בקשת שינוי.');

    try {
      Utils.ensureEditRequestsSheet();
      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var body = Utils.asObject(payload, {});
      var requestId = Utils.normalize(body.RequestID) || generateRequestId_();
      var idx = resolveRequestIndexes_(table.headers);
      var existing = findRequestById_(table, idx.requestId, requestId);

      if (existing && !canEditDraft_(session.user, existing.row, idx)) {
        return Utils.safeMessage('אין הרשאה לערוך בקשה זו.');
      }

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

  function canCreateRequest_(user) {
    return !isInstructor_(user);
  }

  function canEditCourseByRole_(user, courseId, payloadTeam) {
    if (isIdan_(user) || isEden_(user) || isManagerLead_(user)) return true;
    if (!isManager_(user)) return false;
    if (Utils.isEmpty(user.team) || Utils.isEmpty(payloadTeam)) return false;
    return Utils.toKey(user.team) === Utils.toKey(payloadTeam);
  }

  function normalizeCredential_(value) {
    var normalized = Utils.normalize(value);
    if (Utils.isEmpty(normalized)) return '';
    var compact = normalized.replace(/[\s,]/g, '');
    if (/^[+-]?\d+(\.0+)?$/.test(compact)) return String(parseInt(compact, 10));
    var asNumber = Number(compact);
    if (!isNaN(asNumber) && isFinite(asNumber) && Math.floor(asNumber) === asNumber) {
      return String(asNumber);
    }
    return normalized;
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
    getMyRequestsData: getMyRequestsData,
    getApprovalsData: getApprovalsData,
    getEdenViewData: getEdenViewData,
    approveRequest: approveRequest,
    rejectRequest: rejectRequest
  };
})();
