import assert from 'node:assert/strict';
import {
  initDataEngine,
  getStoreSnapshot,
  createEditRequest,
  createDataMasterRecord,
  loadEditRequests,
  loadReviewItems,
  loadDataMaster
} from './frontend/data-engine.js';

const mem = {
  data: [
    { RowID: 'R-1', activity_name: 'P1', activity_type: 'A1', status: 'open', authority: 'Auth1', school: 'School1' }
  ],
  operations_data: []
};

const api = {
  async getSheetRows({ sheetName }) {
    const aliases = {
      DATA_MASTER: 'data',
      EDIT_REQUESTS: 'operations_data'
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
await loadDataMaster(true);
await loadReviewItems(true);
let snap = getStoreSnapshot();
assert.equal(snap.courses.length, 1, 'courses should load from data');
assert.equal(snap.reviewItems.length, 1, 'review items should be derived from data');

const reqRes = await createEditRequest('R-1', { notes: 'changed' }, { displayName: 'qa-user' });
assert.equal(reqRes.success, true, 'createEditRequest should succeed');
await loadEditRequests(true);
snap = getStoreSnapshot();
assert.equal(snap.editRequests.length, 1, 'request should be tracked');

const createRes = await createDataMasterRecord({ activity_name: 'P2', activity_type: 'A2' }, {});
assert.equal(createRes.success, true, 'createDataMasterRecord should succeed');
await loadDataMaster(true);
snap = getStoreSnapshot();
assert.equal(snap.courses.length, 2, 'new master record should appear in courses cache');

console.log('flow-smoke: PASS');
