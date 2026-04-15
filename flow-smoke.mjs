import assert from 'node:assert/strict';
import {
  initDataEngine,
  getStoreSnapshot,
  ensureCoursesLoaded,
  createEditRequest,
  createDataMasterRecord,
  loadEditRequests,
  loadReviewItems,
  loadDataMaster
} from './frontend/data-engine.js';

const mem = {
  data: [
    {
      RowID: 'R-1',
      activity_name: 'P1',
      activity_type: 'A1',
      status: 'open',
      authority: 'Auth1',
      school: 'School1',
      start_date: '2026-04-01',
      date35: '2026-06-01'
    }
  ],
  operations_data: [
    { RequestID: 'REQ-BOOT-1', source_row_id: 'R-1', admin_status: 'pending_eden', requested_by: 'qa-seed' }
  ],
  permissions: [
    { EmployeeName: 'QA', emp_id: '1', EntryCode: '1111', SystemRole: 'manager', default_view: 'courses', view_activities: 'true' }
  ],
  lists: [
    { list_name: 'authorities', value: 'Auth1', label: 'Auth1' }
  ],
  settings: [
    { key: 'cache_data_master_ttl', value: '120' }
  ],
  contacts: [
    { emp_id: '1', name: 'QA Contact', role: 'manager' }
  ]
};

const api = {
  async getSheetRows({ sheetName }) {
    const aliases = {
      DATA_MASTER: 'data',
      EDIT_REQUESTS: 'operations_data',
      OPERATIONS_DATA: 'operations_data',
      PERMISSIONS: 'permissions',
      LISTS: 'lists',
      SETTINGS: 'settings',
      CONTACTS: 'contacts'
    };
    const rows = mem[sheetName] || mem[aliases[sheetName]] || [];
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return {
      success: true,
      data: {
        headerRow: headers,
        dataRows: rows.map((r) => headers.map((h) => r[h] ?? '')),
        rowNumbers: rows.map((_, i) => i + 3)
      }
    };
  },
  async createEditRequest(payload) {
    mem.operations_data.push({ RequestID: `R-${mem.operations_data.length + 1}`, ...payload });
    return { success: true, data: { RequestID: `R-${mem.operations_data.length}` } };
  },
  async createDataMasterRecord({ record }) {
    mem.data.push({ ...record, RowID: record.RowID || `R-${mem.data.length + 1}` });
    return { success: true, data: record };
  },
  clearCache() {}
};

await initDataEngine(api, { userState: { displayName: 'QA', userId: '1' } });
let snap = getStoreSnapshot();
assert.equal(snap.courses.length, 0, 'courses should stay lazy until explicitly requested');
await ensureCoursesLoaded();
await loadDataMaster(true);
await loadReviewItems(true);
snap = getStoreSnapshot();
assert.equal(snap.courses.length, 1, 'courses should load from data');
assert.equal(snap.reviewItems.length, 1, 'review items should be derived from data');
assert.equal(snap.courses[0].RowID, 'R-1', 'RowID should be primary identifier');
assert.equal(String(snap.courses[0].date35 || '').trim(), '2026-06-01', 'date35 should be preserved');
assert.equal(snap.permissions.length, 1, 'permissions should initialize from session profile');

const reqRes = await createEditRequest('R-1', { notes: 'changed' }, { displayName: 'qa-user' });
assert.equal(reqRes.success, true, 'createEditRequest should succeed');
await loadEditRequests(true);
snap = getStoreSnapshot();
assert.equal(snap.editRequests.length, 2, 'requests should include seed + created');
assert.equal(String(snap.editRequests[0].source_row_id || '').trim(), 'R-1', 'operations flow must keep source_row_id');

const createRes = await createDataMasterRecord({ activity_name: 'P2', activity_type: 'A2' }, {});
assert.equal(createRes.success, true, 'createDataMasterRecord should succeed');
await loadDataMaster(true);
snap = getStoreSnapshot();
assert.equal(snap.courses.length, 2, 'new master record should appear in courses cache');

console.log('flow-smoke: PASS');
