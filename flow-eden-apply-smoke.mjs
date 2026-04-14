import assert from 'node:assert/strict';

const LEGACY_SHEETS = ['COURSES', 'DASHBOARD_EXPORT', 'REVIEW_REQUIRED', 'SUMMARY'];
const FIELDS = ['Program', 'Authority', 'School', 'Instructor', 'ActivityType', 'Payment', 'Funding', 'Notes'];

const now = () => new Date().toISOString();

const sheets = {
  DATA_MASTER: [
    {
      RowID: 'ROW-1',
      CourseID: 'C-100',
      Program: 'Robotics',
      Authority: 'Tel Aviv',
      School: 'School A',
      Instructor: 'David',
      ActivityType: 'COURSE',
      Payment: 1000,
      Funding: 'גפ"ן',
      Notes: 'original note',
      UpdatedAt: '2026-04-01T08:00:00.000Z'
    }
  ],
  EDIT_REQUESTS: [],
  EDEN_DATA_MASTER: [],
  COURSES: [],
  DASHBOARD_EXPORT: [],
  REVIEW_REQUIRED: [],
  SUMMARY: []
};

const writes = Object.fromEntries(Object.keys(sheets).map((k) => [k, 0]));

function touchWrite(sheetName) { writes[sheetName] += 1; }
function dmRow(courseId) { return sheets.DATA_MASTER.find((r) => r.CourseID === courseId); }
function edenByRequest(requestId) { return sheets.EDEN_DATA_MASTER.find((r) => r.RequestID === requestId); }

function initEdenRowFromRequest({ requestId, courseId, requestedData, requestedBy }) {
  const source = structuredClone(dmRow(courseId));
  const row = {
    RowID: source.RowID,
    CourseID: source.CourseID,
    RequestID: requestId,
    WorkflowStatus: 'pending_eden',
    MasterLastUpdatedAt: source.UpdatedAt,
    LastSyncedAt: now(),
    EdenLastSavedAt: '',
    SentToAdminAt: '',
    AdminDecision: '',
    AdminApprovedAt: '',
    AdminRejectedAt: '',
    EdenNotes: '',
    HasMasterChangedAfterEdenEdit: 'false',
    HasDiffBetweenSourceAndEden: 'false',
    RequestedBy: requestedBy
  };

  FIELDS.forEach((field) => {
    row[`Source_${field}`] = source[field] ?? '';
    row[`Eden_${field}`] = requestedData[field] ?? source[field] ?? '';
  });
  row.HasDiffBetweenSourceAndEden = hasDiff(row) ? 'true' : 'false';

  sheets.EDEN_DATA_MASTER.push(row);
  touchWrite('EDEN_DATA_MASTER');
  return row;
}

function hasDiff(row) {
  return FIELDS.some((field) => String(row[`Source_${field}`] ?? '') !== String(row[`Eden_${field}`] ?? ''));
}

function submitEditRequest({ courseId, requestedBy, requestedData }) {
  const requestId = 'REQ-1';
  const request = {
    RequestID: requestId,
    CourseID: courseId,
    RequestedBy: requestedBy,
    ApprovalStatus: 'pending_eden',
    RequestStatus: 'pending_eden',
    OriginalData: structuredClone(dmRow(courseId)),
    RequestedData: structuredClone(requestedData)
  };
  sheets.EDIT_REQUESTS.push(request);
  touchWrite('EDIT_REQUESTS');
  initEdenRowFromRequest({ requestId, courseId, requestedData, requestedBy });
  return requestId;
}

function edenSave({ requestId, edenDraft, edenNotes }) {
  const row = edenByRequest(requestId);
  assert.ok(row, 'EDEN row must exist');
  Object.entries(edenDraft).forEach(([key, value]) => {
    row[`Eden_${key}`] = value;
  });
  row.EdenNotes = edenNotes;
  row.WorkflowStatus = 'eden_saved';
  row.EdenLastSavedAt = now();
  row.HasDiffBetweenSourceAndEden = hasDiff(row) ? 'true' : 'false';
  touchWrite('EDEN_DATA_MASTER');
}

function refreshSourceFromMaster({ requestId }) {
  const row = edenByRequest(requestId);
  const source = dmRow(row.CourseID);
  FIELDS.forEach((field) => {
    row[`Source_${field}`] = source[field] ?? '';
  });
  row.MasterLastUpdatedAt = source.UpdatedAt;
  row.LastSyncedAt = now();
  if (row.EdenLastSavedAt && source.UpdatedAt && String(source.UpdatedAt) !== String(row.EdenLastSavedAt)) {
    row.HasMasterChangedAfterEdenEdit = 'true';
  }
  row.HasDiffBetweenSourceAndEden = hasDiff(row) ? 'true' : 'false';
  touchWrite('EDEN_DATA_MASTER');
}

function edenSubmitAdmin({ requestId }) {
  const row = edenByRequest(requestId);
  const req = sheets.EDIT_REQUESTS.find((r) => r.RequestID === requestId);

  const requestedData = {};
  FIELDS.forEach((field) => { requestedData[field] = row[`Eden_${field}`]; });

  req.RequestedData = requestedData;
  req.ApprovalStatus = 'pending_final';
  req.RequestStatus = 'pending_final';
  touchWrite('EDIT_REQUESTS');

  row.WorkflowStatus = 'pending_final';
  row.SentToAdminAt = now();
  row.HasDiffBetweenSourceAndEden = hasDiff(row) ? 'true' : 'false';
  touchWrite('EDEN_DATA_MASTER');
}

function approveRequestApplyMaster({ requestId }) {
  const req = sheets.EDIT_REQUESTS.find((r) => r.RequestID === requestId);
  assert.equal(req.ApprovalStatus, 'pending_final');
  const master = dmRow(req.CourseID);
  Object.entries(req.RequestedData).forEach(([field, value]) => {
    master[field] = value;
  });
  master.UpdatedAt = now();
  touchWrite('DATA_MASTER');

  req.ApprovalStatus = 'final_approved';
  req.RequestStatus = 'final_approved';
  touchWrite('EDIT_REQUESTS');

  const row = edenByRequest(requestId);
  row.WorkflowStatus = 'final_approved';
  row.AdminDecision = 'approved';
  row.AdminApprovedAt = now();
  touchWrite('EDEN_DATA_MASTER');
}

// ==== Scenario ==== 
const beforeMaster = structuredClone(dmRow('C-100'));

const requestId = submitEditRequest({
  courseId: 'C-100',
  requestedBy: 'qa-user',
  requestedData: { Notes: 'request-level proposal' }
});

// Eden draft edit
edenSave({
  requestId,
  edenDraft: { Instructor: 'Roni', Notes: 'eden edited note' },
  edenNotes: 'need instructor switch'
});

// master changed externally after eden saved
const master = dmRow('C-100');
master.Notes = 'master changed externally';
master.UpdatedAt = '2026-04-07T12:00:00.000Z';
touchWrite('DATA_MASTER');
refreshSourceFromMaster({ requestId });

const afterEden = structuredClone(edenByRequest(requestId));
edenSubmitAdmin({ requestId });
approveRequestApplyMaster({ requestId });
const afterAdminMaster = structuredClone(dmRow('C-100'));

// Required assertions
assert.equal(afterEden.WorkflowStatus, 'eden_saved', 'status should be eden_saved after save');
assert.equal(afterEden.HasMasterChangedAfterEdenEdit, 'true', 'must detect master changed after eden edit');
assert.equal(afterEden.Source_Notes, 'master changed externally', 'source should refresh from master');
assert.equal(afterEden.Eden_Notes, 'eden edited note', 'eden draft must not be overwritten by source refresh');

const reqAfterSubmit = sheets.EDIT_REQUESTS.find((r) => r.RequestID === requestId);
assert.equal(reqAfterSubmit.RequestStatus, 'final_approved', 'request should be final_approved after admin approve');
assert.equal(afterAdminMaster.Notes, 'eden edited note', 'admin apply must write eden value to master');
assert.equal(afterAdminMaster.Instructor, 'Roni', 'admin apply must write eden instructor to master');

for (const legacy of LEGACY_SHEETS) {
  assert.equal(writes[legacy], 0, `${legacy} must not be written`);
}

const report = {
  sample: {
    originalMaster: beforeMaster,
    afterEdenEdit: afterEden,
    afterAdminApplyToMaster: afterAdminMaster
  },
  workflow: {
    currentEdenStatus: edenByRequest(requestId).WorkflowStatus,
    currentRequestStatus: reqAfterSubmit.RequestStatus
  },
  writes
};

console.log(JSON.stringify(report, null, 2));
console.log('flow-eden-apply-smoke: PASS');
