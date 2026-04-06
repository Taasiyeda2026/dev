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
  DATA_MASTER: [
    { CourseID: 'C-1', Program: 'P1', Activity: 'A1', RequiresReview: 'true', Authority: 'Auth1', School: 'School1' }
  ],
  EDIT_REQUESTS: []
};

const api = {
  async getSheetRows({ sheetName }) {
    const rows = mem[sheetName] || [];
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
    mem.EDIT_REQUESTS.push({ RequestID: `R-${mem.EDIT_REQUESTS.length + 1}`, ...payload });
    return { success: true, data: { RequestID: `R-${mem.EDIT_REQUESTS.length}` } };
  },
  async createDataMasterRecord({ record }) {
    mem.DATA_MASTER.push({ ...record, CourseID: record.CourseID || `C-${mem.DATA_MASTER.length + 1}` });
    return { success: true, data: record };
  },
  clearCache() {}
};

await initDataEngine(api, { userState: { displayName: 'QA', userId: '1' } });
await loadDataMaster(true);
await loadReviewItems(true);
let snap = getStoreSnapshot();
assert.equal(snap.courses.length, 1, 'courses should load from DATA_MASTER');
assert.equal(snap.reviewItems.length, 1, 'review items should be derived from DATA_MASTER');

const reqRes = await createEditRequest('C-1', { Notes: 'changed' }, { displayName: 'qa-user' });
assert.equal(reqRes.success, true, 'createEditRequest should succeed');
await loadEditRequests(true);
snap = getStoreSnapshot();
assert.equal(snap.editRequests.length, 1, 'request should be tracked');

const createRes = await createDataMasterRecord({ Program: 'P2', Activity: 'A2' }, {});
assert.equal(createRes.success, true, 'createDataMasterRecord should succeed');
await loadDataMaster(true);
snap = getStoreSnapshot();
assert.equal(snap.courses.length, 2, 'new master record should appear in courses cache');

console.log('flow-smoke: PASS');
