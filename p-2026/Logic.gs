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

      var match = null;
      table.rows.some(function (row) {
        if (Utils.toKey(row[idxUser]) === Utils.toKey(userId) && Utils.normalize(row[idxCode]) === code) {
          match = row;
          return true;
        }
        return false;
      });
      if (!match) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var profile = {
        authenticated: true,
        userId: Utils.normalize(match[idxUser]),
        BaseRole: idxBaseRole > -1 ? Utils.normalize(match[idxBaseRole]) : '',
        SystemRole: idxSystemRole > -1 ? Utils.normalize(match[idxSystemRole]) : '',
        AccessScope: idxScope > -1 ? Utils.normalize(match[idxScope]) : '',
        displayName: idxName > -1 ? Utils.normalize(match[idxName]) : ''
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
      var exportSheet = Utils.readTable(CONFIG.SHEETS.DASHBOARD_EXPORT, false);
      var idxStatus = Utils.resolveIndex(editRequests.headers, CONFIG.FIELDS.APPROVAL_STATUS);
      var pendingCount = idxStatus === -1 ? 0 : editRequests.rows.filter(function (r) { return Utils.toKey(r[idxStatus]) === 'pending'; }).length;

      return {
        success: true,
        data: {
          totalDataMaster: dataMaster.rows.length,
          reviewRequiredCount: reviewRequired.rows.length,
          pendingRequests: pendingCount,
          exportRows: exportSheet.rows.length
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
      var idxProgram = Utils.resolveIndex(table.headers, CONFIG.FIELDS.PROGRAM);
      var idxStatus = Utils.resolveIndex(table.headers, CONFIG.FIELDS.STATUS);

      var rows = table.rows.filter(function (row) {
        if (idxUser === -1) return true;
        return Utils.toKey(row[idxUser]) === Utils.toKey(session.user.userId) || canApprove_(session.user);
      });

      var f = Utils.asObject(filters, {});
      if (!Utils.isEmpty(f.program) && idxProgram > -1) rows = rows.filter(function (r) { return Utils.toKey(r[idxProgram]) === Utils.toKey(f.program); });
      if (!Utils.isEmpty(f.status) && idxStatus > -1) rows = rows.filter(function (r) { return Utils.toKey(r[idxStatus]) === Utils.toKey(f.status); });
      if (!Utils.isEmpty(f.search)) {
        var q = Utils.toKey(f.search);
        rows = rows.filter(function (r) { return r.some(function (c) { return Utils.toKey(c).indexOf(q) > -1; }); });
      }

      var fields = CONFIG.FRONTEND_FIELDS.COURSES;
      var items = rows.map(function (row) {
        var obj = {};
        fields.forEach(function (field) {
          var idx = Utils.resolveIndex(table.headers, [field]);
          obj[field] = idx > -1 ? row[idx] : '';
        });
        return obj;
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
      var sheetMeta = Utils.ensureEditRequestsSheet();
      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var body = Utils.asObject(payload, {});
      var status = normalizeStatus_(body.ApprovalStatus || body.status || CONFIG.STATUSES.DRAFT);
      var requestId = Utils.normalize(body.RequestID) || generateRequestId_();

      var indexes = resolveRequestIndexes_(table.headers);
      var existing = findRequestById_(table, indexes.requestId, requestId);
      if (existing && !canEditDraft_(session.user, existing.row, indexes)) return Utils.safeMessage('אין הרשאה לערוך בקשה זו.');

      var record = buildRequestRecord_(table.headers, indexes, body, session.user, requestId, status, existing ? existing.row : null);
      var row = table.headers.map(function (h) { return record[h] || ''; });

      if (existing) {
        Utils.updateRow(CONFIG.SHEETS.EDIT_REQUESTS, existing.rowNumber, row);
        return { success: true, data: { RequestID: requestId, ApprovalStatus: status, mode: 'update', sheetMeta: sheetMeta } };
      }

      var rowNumber = Utils.appendRow(CONFIG.SHEETS.EDIT_REQUESTS, row);
      return { success: true, data: { RequestID: requestId, ApprovalStatus: status, rowNumber: rowNumber, mode: 'append', sheetMeta: sheetMeta } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לשמור בקשה.');
    }
  }

  function getMyRequestsData() {
    var session = requireSession_();
    if (!session.success) return session;
    try {
      var table = Utils.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var idxBy = Utils.resolveIndex(table.headers, CONFIG.FIELDS.REQUESTED_BY);
      if (idxBy === -1) return { success: true, data: { items: [] } };
      var indexes = resolveRequestIndexes_(table.headers);

      var items = table.rows.filter(function (row) {
        return Utils.toKey(row[idxBy]) === Utils.toKey(session.user.userId);
      }).map(function (row) {
        return projectRequestForFrontend_(row, indexes);
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
      var indexes = resolveRequestIndexes_(table.headers);
      if (indexes.approvalStatus === -1) return { success: true, data: { items: [] } };

      var items = table.rows.filter(function (row) {
        return Utils.toKey(row[indexes.approvalStatus]) === 'pending';
      }).map(function (row) {
        return projectRequestForFrontend_(row, indexes);
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
      var indexes = resolveRequestIndexes_(table.headers);
      var existing = findRequestById_(table, indexes.requestId, requestId);
      if (!existing) return Utils.safeMessage('הפעולה לא בוצעה.');

      var row = existing.row.slice();
      if (indexes.approvalStatus > -1) row[indexes.approvalStatus] = status;
      if (indexes.approvalNotes > -1) row[indexes.approvalNotes] = Utils.normalize(body.ApprovalNotes);
      if (indexes.assignedEditor > -1) row[indexes.assignedEditor] = session.user.userId;
      Utils.updateRow(CONFIG.SHEETS.EDIT_REQUESTS, existing.rowNumber, row);

      return { success: true, data: { RequestID: requestId, ApprovalStatus: status } };
    } catch (err) {
      return Utils.safeMessage('הפעולה לא בוצעה.');
    }
  }

  function buildRequestRecord_(headers, idx, body, user, requestId, status, existingRow) {
    var record = {};
    headers.forEach(function (h) { record[h] = ''; });

    var requestedData = Utils.asObject(body.requestedData || body.RequestedData, {});
    var originalData = Utils.asObject(body.originalData || body.OriginalData, {});

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
    setField_(record, headers, idx.assignedEditor, Utils.normalize(body.AssignedEditor));

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
    CONFIG.FRONTEND_FIELDS.REQUESTS.forEach(function (key) {
      out[key] = valueAt_(row, idx[toIndexKey_(key)]);
    });
    return out;
  }

  function toIndexKey_(fieldName) {
    var map = {
      RequestID: 'requestId', CourseID: 'courseId', RequestedBy: 'requestedBy', RequestedAt: 'requestedAt',
      ApprovalStatus: 'approvalStatus', ApprovalNotes: 'approvalNotes', ChangeSummary: 'changeSummary',
      OriginalData: 'originalData', RequestedData: 'requestedData', EditableBy: 'editableBy', AssignedEditor: 'assignedEditor',
      Date: 'date', Day: 'day', StartTime: 'startTime', EndTime: 'endTime', ClassGroup: 'classGroup',
      ActualMeetings: 'actualMeetings', CourseManager: 'courseManager', Instructor: 'instructor', Notes: 'notes'
    };
    return map[fieldName];
  }

  function resolveRequestIndexes_(headers) {
    return {
      requestId: Utils.resolveIndex(headers, CONFIG.FIELDS.REQUEST_ID),
      courseId: Utils.resolveIndex(headers, CONFIG.FIELDS.COURSE_ID),
      requestedBy: Utils.resolveIndex(headers, CONFIG.FIELDS.REQUESTED_BY),
      requestedAt: Utils.resolveIndex(headers, CONFIG.FIELDS.REQUESTED_AT),
      approvalStatus: Utils.resolveIndex(headers, CONFIG.FIELDS.APPROVAL_STATUS),
      approvalNotes: Utils.resolveIndex(headers, CONFIG.FIELDS.APPROVAL_NOTES),
      changeSummary: Utils.resolveIndex(headers, CONFIG.FIELDS.CHANGE_SUMMARY),
      originalData: Utils.resolveIndex(headers, CONFIG.FIELDS.ORIGINAL_DATA),
      requestedData: Utils.resolveIndex(headers, CONFIG.FIELDS.REQUESTED_DATA),
      editableBy: Utils.resolveIndex(headers, CONFIG.FIELDS.EDITABLE_BY),
      assignedEditor: Utils.resolveIndex(headers, CONFIG.FIELDS.ASSIGNED_EDITOR),
      date: Utils.resolveIndex(headers, CONFIG.FIELDS.DATE),
      day: Utils.resolveIndex(headers, CONFIG.FIELDS.DAY),
      startTime: Utils.resolveIndex(headers, CONFIG.FIELDS.START_TIME),
      endTime: Utils.resolveIndex(headers, CONFIG.FIELDS.END_TIME),
      classGroup: Utils.resolveIndex(headers, CONFIG.FIELDS.CLASS_GROUP),
      actualMeetings: Utils.resolveIndex(headers, CONFIG.FIELDS.ACTUAL_MEETINGS),
      courseManager: Utils.resolveIndex(headers, CONFIG.FIELDS.COURSE_MANAGER),
      instructor: Utils.resolveIndex(headers, CONFIG.FIELDS.INSTRUCTOR),
      notes: Utils.resolveIndex(headers, CONFIG.FIELDS.NOTES)
    };
  }

  function findRequestById_(table, idxRequestId, requestId) {
    if (idxRequestId === -1) return null;
    for (var i = 0; i < table.rows.length; i += 1) {
      if (Utils.toKey(table.rows[i][idxRequestId]) === Utils.toKey(requestId)) return { row: table.rows[i], rowNumber: table.rowNumbers[i] };
    }
    return null;
  }

  function canEditDraft_(user, row, idx) {
    return Utils.toKey(valueAt_(row, idx.requestedBy)) === Utils.toKey(user.userId) && Utils.toKey(valueAt_(row, idx.approvalStatus)) === 'draft';
  }

  function normalizeStatus_(value) {
    var text = Utils.normalize(value);
    if (text === CONFIG.STATUSES.DRAFT || text === CONFIG.STATUSES.PENDING) return text;
    return CONFIG.STATUSES.DRAFT;
  }

  function generateRequestId_() {
    return 'REQ-' + new Date().getTime();
  }

  function canApprove_(user) {
    var roleText = (Utils.normalize(user.BaseRole) + ' ' + Utils.normalize(user.SystemRole)).toLowerCase();
    return /(master|admin|approval|approver|מנהל|מאשר|מאסטר)/.test(roleText);
  }

  function requireSession_() {
    var user = getSession_();
    if (!user || !user.authenticated || Utils.isEmpty(user.userId)) return { success: false, message: 'אין חיבור פעיל.' };
    return { success: true, user: user };
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

  function valueAt_(row, idx) {
    return idx > -1 ? row[idx] : '';
  }

  function setField_(record, headers, idx, value) {
    if (idx > -1) record[headers[idx]] = value;
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
