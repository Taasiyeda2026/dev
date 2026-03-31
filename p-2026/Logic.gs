var Logic = (function () {
  function login(userIdInput, codeInput) {
    try {
      var userId = Utils.normalize(userIdInput);
      var code = Utils.normalize(codeInput);
      if (Utils.isEmpty(userId) || Utils.isEmpty(code)) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var table = Utils.readTable(CONFIG.SHEETS.PERMISSIONS, true);
      var idxUser = Utils.resolveIndex(table.headers, CONFIG.FIELDS.USER_ID);
      var idxCode = Utils.resolveIndex(table.headers, CONFIG.FIELDS.LOGIN_CODE);
      var idxBaseRole = Utils.resolveIndex(table.headers, CONFIG.FIELDS.BASE_ROLE);
      var idxSystemRole = Utils.resolveIndex(table.headers, CONFIG.FIELDS.SYSTEM_ROLE);
      var idxScope = Utils.resolveIndex(table.headers, CONFIG.FIELDS.ACCESS_SCOPE);
      var idxName = Utils.resolveIndex(table.headers, CONFIG.FIELDS.DISPLAY_NAME);
      if (idxUser === -1 || idxCode === -1) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var found = null;
      table.rows.some(function (row) {
        if (Utils.toKey(row[idxUser]) === Utils.toKey(userId) && Utils.normalize(row[idxCode]) === code) {
          found = row;
          return true;
        }
        return false;
      });
      if (!found) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var profile = {
        authenticated: true,
        userId: Utils.normalize(found[idxUser]),
        BaseRole: idxBaseRole > -1 ? Utils.normalize(found[idxBaseRole]) : '',
        SystemRole: idxSystemRole > -1 ? Utils.normalize(found[idxSystemRole]) : '',
        AccessScope: idxScope > -1 ? Utils.normalize(found[idxScope]) : '',
        displayName: idxName > -1 ? Utils.normalize(found[idxName]) : ''
      };
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
      var dataMaster = Utils.readTable(CONFIG.SHEETS.DATA_MASTER, false);
      var reviewRequired = Utils.readTable(CONFIG.SHEETS.REVIEW_REQUIRED, false);
      var editRequests = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, false);
      var dashboardExport = Utils.readTable(CONFIG.SHEETS.DASHBOARD_EXPORT, false);
      var idxStatus = Utils.resolveIndex(editRequests.headers, CONFIG.FIELDS.ApprovalStatus);
      var pending = idxStatus === -1 ? 0 : editRequests.rows.filter(function (row) {
        return Utils.toKey(row[idxStatus]) === Utils.toKey(CONFIG.STATUSES.PENDING);
      }).length;

      return {
        success: true,
        data: {
          totalDataMaster: dataMaster.rows.length,
          reviewRequiredCount: reviewRequired.rows.length,
          pendingRequests: pending,
          exportRows: dashboardExport.rows.length
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
      var table = Utils.readTable(CONFIG.SHEETS.COURSES, true);
      var idxUser = Utils.resolveIndex(table.headers, CONFIG.FIELDS.USER_ID.concat(CONFIG.FIELDS.DISPLAY_NAME));
      var idxProgram = Utils.resolveIndex(table.headers, ['Program']);
      var idxStatus = Utils.resolveIndex(table.headers, ['Status']);

      var rows = table.rows.filter(function (row) {
        if (idxUser === -1) return true;
        return Utils.toKey(row[idxUser]) === Utils.toKey(session.user.userId) || canApprove_(session.user);
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
        rows = rows.filter(function (row) {
          return row.some(function (cell) { return Utils.toKey(cell).indexOf(query) > -1; });
        });
      }

      var items = rows.map(function (row) {
        var out = {};
        CONFIG.FRONTEND_FIELDS.COURSES.forEach(function (field) {
          var idx = Utils.resolveIndex(table.headers, [field]);
          out[field] = idx > -1 ? row[idx] : '';
        });
        return out;
      });

      return { success: true, data: { items: items } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון קורסים.');
    }
  }

  function submitEditRequest(payload) {
    var session = requireSession_();
    if (!session.success) return session;

    try {
      Utils.ensureEditRequestsSheet();
      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var body = Utils.asObject(payload, {});
      var status = normalizeStatus_(body.ApprovalStatus || body.status || CONFIG.STATUSES.DRAFT);
      var requestId = Utils.normalize(body.RequestID) || generateRequestId_();
      var idx = resolveRequestIndexes_(table.headers);

      var existing = findRequestById_(table, idx.requestId, requestId);
      if (existing && !canEditDraft_(session.user, existing.row, idx)) {
        return Utils.safeMessage('אין הרשאה לערוך בקשה זו.');
      }

      var record = buildRequestRecord_(table.headers, idx, body, session.user, requestId, status, existing ? existing.row : null);
      var values = table.headers.map(function (header) { return record[header] || ''; });

      if (existing) {
        Utils.updateRow(CONFIG.SHEETS.EDIT_REQUESTS, existing.rowNumber, values);
        return { success: true, data: { RequestID: requestId, ApprovalStatus: status, mode: 'update' } };
      }

      var rowNumber = Utils.appendRow(CONFIG.SHEETS.EDIT_REQUESTS, values);
      return { success: true, data: { RequestID: requestId, ApprovalStatus: status, rowNumber: rowNumber, mode: 'append' } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לשמור בקשה.');
    }
  }

  function getMyRequestsData() {
    var session = requireSession_();
    if (!session.success) return session;

    try {
      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var idx = resolveRequestIndexes_(table.headers);
      if (idx.requestedBy === -1) return { success: true, data: { items: [] } };

      var items = table.rows.filter(function (row) {
        return Utils.toKey(row[idx.requestedBy]) === Utils.toKey(session.user.userId);
      }).map(function (row) {
        return projectRequestForFrontend_(row, idx);
      });

      return { success: true, data: { items: items } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון בקשות.');
    }
  }

  function getApprovalsData() {
    var session = requireSession_();
    if (!session.success) return session;
    if (!canApprove_(session.user)) return Utils.safeMessage('אין הרשאה.');

    try {
      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var idx = resolveRequestIndexes_(table.headers);
      if (idx.approvalStatus === -1) return { success: true, data: { items: [] } };

      var items = table.rows.filter(function (row) {
        return Utils.toKey(row[idx.approvalStatus]) === Utils.toKey(CONFIG.STATUSES.PENDING);
      }).map(function (row) {
        return projectRequestForFrontend_(row, idx);
      });

      return { success: true, data: { items: items } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון אישורים.');
    }
  }

  function approveRequest(payload) {
    return updateDecision_(payload, CONFIG.STATUSES.APPROVED);
  }

  function rejectRequest(payload) {
    return updateDecision_(payload, CONFIG.STATUSES.DECLINED);
  }

  function updateDecision_(payload, status) {
    var session = requireSession_();
    if (!session.success) return session;
    if (!canApprove_(session.user)) return Utils.safeMessage('אין הרשאה.');

    try {
      var body = Utils.asObject(payload, {});
      var requestId = Utils.normalize(body.RequestID);
      if (Utils.isEmpty(requestId)) return Utils.safeMessage('הפעולה לא בוצעה.');

      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var idx = resolveRequestIndexes_(table.headers);
      var existing = findRequestById_(table, idx.requestId, requestId);
      if (!existing) return Utils.safeMessage('הפעולה לא בוצעה.');

      var row = existing.row.slice();
      if (idx.approvalStatus > -1) row[idx.approvalStatus] = status;
      if (idx.approvalNotes > -1) row[idx.approvalNotes] = Utils.normalize(body.ApprovalNotes);
      if (idx.assignedEditor > -1) row[idx.assignedEditor] = session.user.userId;
      Utils.updateRow(CONFIG.SHEETS.EDIT_REQUESTS, existing.rowNumber, row);

      return { success: true, data: { RequestID: requestId, ApprovalStatus: status } };
    } catch (err) {
      return Utils.safeMessage('הפעולה לא בוצעה.');
    }
  }

  function buildRequestRecord_(headers, idx, body, user, requestId, status, existingRow) {
    var record = {};
    headers.forEach(function (header) { record[header] = ''; });

    var originalData = Utils.asObject(body.originalData || body.OriginalData, {});
    var requestedData = Utils.asObject(body.requestedData || body.RequestedData, {});

    setField_(record, headers, idx.requestId, requestId);
    setField_(record, headers, idx.courseId, Utils.normalize(body.CourseID));
    setField_(record, headers, idx.requestedBy, existingRow ? valueAt_(existingRow, idx.requestedBy) : user.userId);
    setField_(record, headers, idx.requestedAt, existingRow ? valueAt_(existingRow, idx.requestedAt) : Utils.nowIso());
    setField_(record, headers, idx.approvalStatus, status);
    setField_(record, headers, idx.approvalNotes, Utils.normalize(body.ApprovalNotes));
    setField_(record, headers, idx.changeSummary, Utils.normalize(body.ChangeSummary));
    setField_(record, headers, idx.originalData, Utils.safeJson(originalData));
    setField_(record, headers, idx.requestedData, Utils.safeJson(requestedData));
    setField_(record, headers, idx.editableBy, Utils.normalize(body.EditableBy || user.userId));
    setField_(record, headers, idx.assignedEditor, existingRow ? valueAt_(existingRow, idx.assignedEditor) : '');

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
      RequestID: 'requestId',
      CourseID: 'courseId',
      RequestedBy: 'requestedBy',
      RequestedAt: 'requestedAt',
      ApprovalStatus: 'approvalStatus',
      ApprovalNotes: 'approvalNotes',
      ChangeSummary: 'changeSummary',
      OriginalData: 'originalData',
      RequestedData: 'requestedData',
      EditableBy: 'editableBy',
      AssignedEditor: 'assignedEditor',
      Date: 'date',
      Day: 'day',
      StartTime: 'startTime',
      EndTime: 'endTime',
      ClassGroup: 'classGroup',
      ActualMeetings: 'actualMeetings',
      CourseManager: 'courseManager',
      Instructor: 'instructor',
      Notes: 'notes'
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

  function normalizeStatus_(value) {
    var status = Utils.normalize(value);
    if (status === CONFIG.STATUSES.PENDING) return CONFIG.STATUSES.PENDING;
    if (status === CONFIG.STATUSES.DRAFT) return CONFIG.STATUSES.DRAFT;
    return CONFIG.STATUSES.DRAFT;
  }

  function generateRequestId_() {
    return 'REQ-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000000);
  }

  function canApprove_(user) {
    var text = (Utils.normalize(user.BaseRole) + ' ' + Utils.normalize(user.SystemRole)).toLowerCase();
    return /(master|admin|approval|approver|מנהל|מאשר|מאסטר)/.test(text);
  }

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

  return {
    login: login,
    logout: logout,
    getSessionProfile: getSessionProfile,
    getDashboardData: getDashboardData,
    getMyCoursesData: getMyCoursesData,
    submitEditRequest: submitEditRequest,
    getMyRequestsData: getMyRequestsData,
    getApprovalsData: getApprovalsData,
    approveRequest: approveRequest,
    rejectRequest: rejectRequest
  };
})();
