var RequestsService = (function () {
  var STATUS_DRAFT = 'Draft';
  var STATUS_PENDING = 'Pending';

  function submitEditRequest(profile, payload) {
    try {
      if (!profile) return Utils.safeMessage('אין גישה.');
      var request = Utils.asObject(payload, {});
      var status = normalizeStatus_(request.ApprovalStatus || request.status || STATUS_DRAFT);

      var table = SheetService.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var headers = table.headers;
      var indexes = resolveIndexes_(headers);
      if (!hasRequiredCoreIndexes_(indexes)) return Utils.safeMessage('מבנה בקשות העריכה אינו תקין.');

      var requestId = Utils.normalize(request.RequestID) || ('REQ-' + new Date().getTime());
      var existing = findByRequestId_(table, indexes.requestId, requestId);

      if (existing && !canEditExisting_(profile, existing.row, indexes)) {
        return Utils.safeMessage('אין הרשאה לערוך בקשה זו.');
      }

      var record = buildRecord_(headers, indexes, profile, request, status, requestId, existing ? existing.row : null);
      var row = headers.map(function (h) { return record[h] || ''; });

      if (existing) {
        table.sheet.getRange(existing.rowNumber, 1, 1, headers.length).setValues([row]);
        return { success: true, data: { RequestID: requestId, ApprovalStatus: status, mode: 'update' } };
      }

      var rowNumber = SheetService.appendRow(CONFIG.SHEETS.EDIT_REQUESTS, row);
      return { success: true, data: { RequestID: requestId, ApprovalStatus: status, rowNumber: rowNumber, mode: 'append' } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לשמור בקשה.');
    }
  }

  function getMyRequests(profile) {
    try {
      if (!profile) return Utils.safeMessage('אין גישה.');
      var table = SheetService.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var headers = table.headers;
      var indexes = resolveIndexes_(headers);
      if (indexes.requestedBy === -1) return { success: true, data: { items: [] } };

      var items = table.rows.filter(function (row) {
        return Utils.toKey(row[indexes.requestedBy]) === Utils.toKey(profile.userId);
      }).map(function (row) {
        return mapRequestForUi_(headers, indexes, row);
      });

      return { success: true, data: { items: items } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון בקשות.');
    }
  }

  function getApprovals(profile) {
    try {
      if (!profile || !AuthService.canAccessApprovals(profile)) return Utils.safeMessage('אין הרשאה.');
      var table = SheetService.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var headers = table.headers;
      var indexes = resolveIndexes_(headers);
      if (indexes.approvalStatus === -1) return { success: true, data: { items: [] } };

      var items = table.rows.filter(function (row) {
        return Utils.toKey(row[indexes.approvalStatus]) === 'pending';
      }).map(function (row) {
        return {
          RequestID: getCell_(row, indexes.requestId),
          CourseID: getCell_(row, indexes.courseId),
          RequestedBy: getCell_(row, indexes.requestedBy),
          RequestedAt: getCell_(row, indexes.requestedAt),
          ChangeSummary: getCell_(row, indexes.changeSummary),
          OriginalData: getCell_(row, indexes.originalData),
          RequestedData: getCell_(row, indexes.requestedData),
          Notes: getCell_(row, indexes.notes)
        };
      });

      return { success: true, data: { items: items } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון אישורים.');
    }
  }

  function approveRequest(profile, payload) {
    return updateRequestStatus_(profile, payload, 'Approved');
  }

  function rejectRequest(profile, payload) {
    return updateRequestStatus_(profile, payload, 'Declined');
  }

  function updateRequestStatus_(profile, payload, status) {
    try {
      if (!profile || !AuthService.canAccessApprovals(profile)) return Utils.safeMessage('אין הרשאה.');
      var body = Utils.asObject(payload, {});
      var requestId = Utils.normalize(body.RequestID);
      if (Utils.isEmpty(requestId)) return Utils.safeMessage('הפעולה לא בוצעה.');

      var table = SheetService.readTable(CONFIG.SHEETS.EDIT_REQUESTS, true);
      var headers = table.headers;
      var indexes = resolveIndexes_(headers);
      var existing = findByRequestId_(table, indexes.requestId, requestId);
      if (!existing) return Utils.safeMessage('הפעולה לא בוצעה.');

      var row = existing.row.slice();
      if (indexes.approvalStatus > -1) row[indexes.approvalStatus] = status;
      if (indexes.approvalNotes > -1) row[indexes.approvalNotes] = Utils.normalize(body.ApprovalNotes);
      if (indexes.assignedEditor > -1) row[indexes.assignedEditor] = Utils.normalize(profile.userId);
      table.sheet.getRange(existing.rowNumber, 1, 1, headers.length).setValues([row]);

      return { success: true, data: { RequestID: requestId, ApprovalStatus: status } };
    } catch (err) {
      return Utils.safeMessage('הפעולה לא בוצעה.');
    }
  }

  function buildRecord_(headers, indexes, profile, request, status, requestId, existingRow) {
    var record = {};
    headers.forEach(function (h) { record[h] = ''; });

    var requestedData = Utils.asObject(request.requestedData || request.RequestedData, {});
    var originalData = Utils.asObject(request.originalData || request.OriginalData, {});

    setByIndex_(record, headers, indexes.requestId, requestId);
    setByIndex_(record, headers, indexes.courseId, Utils.normalize(request.CourseID));
    setByIndex_(record, headers, indexes.requestedBy, existingRow ? getCell_(existingRow, indexes.requestedBy) : profile.userId);
    setByIndex_(record, headers, indexes.requestedAt, existingRow ? getCell_(existingRow, indexes.requestedAt) : Utils.nowIso());
    setByIndex_(record, headers, indexes.approvalStatus, status);
    setByIndex_(record, headers, indexes.approvalNotes, Utils.normalize(request.ApprovalNotes));
    setByIndex_(record, headers, indexes.changeSummary, Utils.normalize(request.ChangeSummary));
    setByIndex_(record, headers, indexes.originalData, safeJson_(originalData));
    setByIndex_(record, headers, indexes.requestedData, safeJson_(requestedData));
    setByIndex_(record, headers, indexes.editableBy, Utils.normalize(request.EditableBy || profile.userId));
    setByIndex_(record, headers, indexes.assignedEditor, Utils.normalize(request.AssignedEditor));

    var operational = {
      date: Utils.normalize(request.Date || requestedData.date),
      day: Utils.normalize(request.Day || requestedData.day),
      startTime: Utils.normalize(request.StartTime || requestedData.startTime),
      endTime: Utils.normalize(request.EndTime || requestedData.endTime),
      classGroup: Utils.normalize(request.ClassGroup || requestedData.classGroup),
      actualMeetings: Utils.normalize(request.ActualMeetings || requestedData.actualMeetings),
      courseManager: Utils.normalize(request.CourseManager || requestedData.courseManager),
      instructor: Utils.normalize(request.Instructor || requestedData.instructor),
      notes: Utils.normalize(request.Notes || requestedData.notes)
    };

    setByIndex_(record, headers, indexes.date, operational.date);
    setByIndex_(record, headers, indexes.day, operational.day);
    setByIndex_(record, headers, indexes.startTime, operational.startTime);
    setByIndex_(record, headers, indexes.endTime, operational.endTime);
    setByIndex_(record, headers, indexes.classGroup, operational.classGroup);
    setByIndex_(record, headers, indexes.actualMeetings, operational.actualMeetings);
    setByIndex_(record, headers, indexes.courseManager, operational.courseManager);
    setByIndex_(record, headers, indexes.instructor, operational.instructor);
    setByIndex_(record, headers, indexes.notes, operational.notes);

    return record;
  }

  function canEditExisting_(profile, row, indexes) {
    var owner = getCell_(row, indexes.requestedBy);
    var status = getCell_(row, indexes.approvalStatus);
    if (Utils.toKey(owner) !== Utils.toKey(profile.userId)) return false;
    return Utils.toKey(status) === 'draft';
  }

  function findByRequestId_(table, idxRequestId, requestId) {
    if (idxRequestId === -1) return null;
    for (var i = 0; i < table.rows.length; i += 1) {
      if (Utils.toKey(table.rows[i][idxRequestId]) === Utils.toKey(requestId)) {
        return { row: table.rows[i], rowNumber: table.rowNumbers[i] };
      }
    }
    return null;
  }

  function normalizeStatus_(value) {
    var s = Utils.normalize(value);
    if (s === STATUS_DRAFT || s === STATUS_PENDING) return s;
    return STATUS_DRAFT;
  }

  function safeJson_(obj) {
    try { return JSON.stringify(obj || {}); } catch (err) { return '{}'; }
  }

  function resolveIndexes_(headers) {
    return {
      requestId: SheetService.resolveIndex(headers, CONFIG.FIELDS.REQUEST_ID),
      courseId: SheetService.resolveIndex(headers, CONFIG.FIELDS.COURSE_ID),
      requestedBy: SheetService.resolveIndex(headers, CONFIG.FIELDS.REQUESTED_BY),
      requestedAt: SheetService.resolveIndex(headers, CONFIG.FIELDS.REQUESTED_AT),
      approvalStatus: SheetService.resolveIndex(headers, CONFIG.FIELDS.APPROVAL_STATUS),
      approvalNotes: SheetService.resolveIndex(headers, CONFIG.FIELDS.APPROVAL_NOTES),
      changeSummary: SheetService.resolveIndex(headers, CONFIG.FIELDS.CHANGE_SUMMARY),
      originalData: SheetService.resolveIndex(headers, CONFIG.FIELDS.ORIGINAL_DATA),
      requestedData: SheetService.resolveIndex(headers, CONFIG.FIELDS.REQUESTED_DATA),
      editableBy: SheetService.resolveIndex(headers, CONFIG.FIELDS.EDITABLE_BY),
      assignedEditor: SheetService.resolveIndex(headers, CONFIG.FIELDS.ASSIGNED_EDITOR),
      date: SheetService.resolveIndex(headers, CONFIG.FIELDS.DATE),
      day: SheetService.resolveIndex(headers, CONFIG.FIELDS.DAY),
      startTime: SheetService.resolveIndex(headers, CONFIG.FIELDS.START_TIME),
      endTime: SheetService.resolveIndex(headers, CONFIG.FIELDS.END_TIME),
      classGroup: SheetService.resolveIndex(headers, CONFIG.FIELDS.CLASS_GROUP),
      actualMeetings: SheetService.resolveIndex(headers, CONFIG.FIELDS.ACTUAL_MEETINGS),
      courseManager: SheetService.resolveIndex(headers, CONFIG.FIELDS.COURSE_MANAGER),
      instructor: SheetService.resolveIndex(headers, CONFIG.FIELDS.INSTRUCTOR),
      notes: SheetService.resolveIndex(headers, CONFIG.FIELDS.NOTES)
    };
  }

  function hasRequiredCoreIndexes_(indexes) {
    return indexes.requestId > -1 && indexes.courseId > -1 && indexes.requestedBy > -1 &&
      indexes.requestedAt > -1 && indexes.approvalStatus > -1;
  }

  function mapRequestForUi_(headers, indexes, row) {
    return {
      RequestID: getCell_(row, indexes.requestId),
      CourseID: getCell_(row, indexes.courseId),
      RequestedBy: getCell_(row, indexes.requestedBy),
      RequestedAt: getCell_(row, indexes.requestedAt),
      ApprovalStatus: getCell_(row, indexes.approvalStatus),
      ApprovalNotes: getCell_(row, indexes.approvalNotes),
      ChangeSummary: getCell_(row, indexes.changeSummary),
      OriginalData: getCell_(row, indexes.originalData),
      RequestedData: getCell_(row, indexes.requestedData),
      EditableBy: getCell_(row, indexes.editableBy),
      AssignedEditor: getCell_(row, indexes.assignedEditor),
      Date: getCell_(row, indexes.date),
      Day: getCell_(row, indexes.day),
      StartTime: getCell_(row, indexes.startTime),
      EndTime: getCell_(row, indexes.endTime),
      ClassGroup: getCell_(row, indexes.classGroup),
      ActualMeetings: getCell_(row, indexes.actualMeetings),
      CourseManager: getCell_(row, indexes.courseManager),
      Instructor: getCell_(row, indexes.instructor),
      Notes: getCell_(row, indexes.notes)
    };
  }

  function getCell_(row, idx) {
    return idx > -1 ? row[idx] : '';
  }

  function setByIndex_(record, headers, idx, value) {
    if (idx > -1) record[headers[idx]] = value;
  }

  return {
    submitEditRequest: submitEditRequest,
    getMyRequests: getMyRequests,
    getApprovals: getApprovals,
    approveRequest: approveRequest,
    rejectRequest: rejectRequest
  };
})();
