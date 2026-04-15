import {
  COURSE_FIELDS,
  PERMISSION_FIELDS,
  REQUEST_FIELDS,
  SHEET_NAMES
} from './data-contracts.js';

const SHEETS_WITH_DISPLAY_ROW = new Set([
  SHEET_NAMES.DATA_MASTER,
  SHEET_NAMES.PERMISSIONS,
  SHEET_NAMES.EDIT_REQUESTS
]);

const BOOL_TRUE = new Set(['yes', 'true', '1', 'y', 'כן']);

const dataStore = {
  permissions: [],
  courses: [],
  lists: [],
  settings: [],
  contacts: [],
  editRequests: [],
  reviewItems: [],
  finance: [],
  financeArchive: [],
  dataMaster: [],
  loadedAt: {
    permissions: 0,
    courses: 0,
    lists: 0,
    settings: 0,
    contacts: 0,
    editRequests: 0,
    reviewItems: 0,
    finance: 0,
    financeArchive: 0,
    dataMaster: 0
  }
};

let apiRef = null;

/** מטמון לניווט בין מסכים — מפחית קריאות כבדות ל-Sheets */
const COURSES_CACHE_TTL_MS = 3 * 60 * 1000;
const REVIEW_CACHE_TTL_MS = 2 * 60 * 1000;


function logEngine(level, event, meta = {}) {
  const fn = level === 'error' ? console.error : console.warn;
  fn(`[data-engine:${event}]`, meta);
}

function assertRequired(value, message, meta = {}) {
  if (String(value ?? '').trim()) return;
  const err = new Error(message);
  err.meta = meta;
  throw err;
}

function now() {
  return Date.now();
}

function toBool(value) {
  return BOOL_TRUE.has(String(value || '').trim().toLowerCase());
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}


function pickFirst(raw = {}, keys = []) {
  for (const key of keys) {
    const value = raw?.[key];
    if (String(value ?? '').trim() !== '') return value;
  }
  return '';
}


function extractCapabilities(raw = {}) {
  return Object.keys(raw).reduce((acc, key) => {
    if (!/^view_|^edit_/.test(String(key))) return acc;
    acc[String(key)] = toBool(raw[key]);
    return acc;
  }, {});
}

export function listEnabledCapabilities(capabilities = {}, prefix = 'view_') {
  return Object.keys(capabilities).filter((key) => key.startsWith(prefix) && capabilities[key]);
}

function normalizePermissionScope(raw = {}) {
  return {
    viewScope: String(raw.ViewScope || '').trim(),
    editScope: String(raw.EditScope || '').trim(),
    approvalScope: String(raw.ApprovalScope || raw.SystemRole || '').trim()
  };
}

function parseRowsToObjects(sheetName, rows = []) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const headerRow = rows[0] || [];
  const dataRows = SHEETS_WITH_DISPLAY_ROW.has(sheetName) ? rows.slice(2) : rows.slice(1);
  return dataRows
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell || '').trim() !== ''))
    .map((row) => {
      const mapped = {};
      headerRow.forEach((header, index) => {
        const key = String(header || '').trim();
        if (!key) return;
        mapped[key] = row[index];
      });
      return mapped;
    });
}

function mapPermissionRow(raw = {}) {
  const scopes = normalizePermissionScope(raw);
  const capabilities = extractCapabilities(raw);
  const displayName = pickFirst(raw, ['name', 'EmployeeName', PERMISSION_FIELDS.EMPLOYEE_NAME]);
  const displayRole = pickFirst(raw, [PERMISSION_FIELDS.DISPLAY_ROLE, 'role', 'SystemRole', PERMISSION_FIELDS.SYSTEM_ROLE]);
  const empIdRaw = pickFirst(raw, ['emp_id', 'EmployeeID', PERMISSION_FIELDS.EMPLOYEE_ID]);
  return {
    employeeName: String(displayName || '').trim(),
    employeeId: String(empIdRaw || '').trim(),
    entryCode: String(pickFirst(raw, ['code', 'EntryCode', PERMISSION_FIELDS.ENTRY_CODE]) || '').trim(),
    systemRole: String(pickFirst(raw, ['role', 'SystemRole', PERMISSION_FIELDS.SYSTEM_ROLE]) || '').trim(),
    displayRole: String(displayRole || '').trim(),
    rolevalue: String(raw['rolevalue'] || raw['RoleValue'] || '').trim(),
    viewScope: listEnabledCapabilities(capabilities, 'view_').join(',' ) || scopes.viewScope,
    editScope: listEnabledCapabilities(capabilities, 'edit_').join(',' ) || scopes.editScope,
    approvalScope: scopes.approvalScope,
    uiProfile: String(pickFirst(raw, ['default_view', 'UiProfile', PERMISSION_FIELDS.DEFAULT_VIEW, PERMISSION_FIELDS.UI_PROFILE]) || '').trim(),
    defaultView: String(pickFirst(raw, ['default_view', 'UiProfile', PERMISSION_FIELDS.DEFAULT_VIEW, PERMISSION_FIELDS.UI_PROFILE]) || '').trim(),
    teamScope: String(pickFirst(raw, ['TeamScope', PERMISSION_FIELDS.TEAM_SCOPE]) || '').trim(),
    instructorManager: String(pickFirst(raw, ['manager', 'InstructorManager', PERMISSION_FIELDS.INSTRUCTOR_MANAGER]) || '').trim(),
    activeFlag: toBool(pickFirst(raw, ['active', 'ActiveFlag', PERMISSION_FIELDS.ACTIVE_FLAG])),
    canAccessFinance: Boolean(capabilities.view_finance || toBool(raw[PERMISSION_FIELDS.CAN_ACCESS_FINANCE])),
    canEditFinance: Boolean(capabilities.edit_finance || toBool(raw[PERMISSION_FIELDS.CAN_EDIT_FINANCE])),
    canAccessFinanceArchive: false,
    canEditFinanceArchive: false,
    capabilities,
    allowedViews: listEnabledCapabilities(capabilities, 'view_'),
    raw
  };
}

function mapCourseRow(raw = {}) {
  const rowId = String(pickFirst(raw, ['RowID', 'CourseID'])).trim();
  if (!rowId) logEngine('warn', 'missing_row_id_in_data_row', { rowNumber: raw?._rowNumber || 0 });
  const mapped = {
    ...raw,
    RowID: rowId,
    CourseID: rowId,
    [COURSE_FIELDS.COURSE_ID]: rowId,
    [COURSE_FIELDS.PROGRAM_CODE]: toNumber(pickFirst(raw, [COURSE_FIELDS.PROGRAM_CODE, 'ProgramCode'])),
    [COURSE_FIELDS.EMPLOYEE_ID]: toNumber(pickFirst(raw, [COURSE_FIELDS.EMPLOYEE_ID, 'EmployeeID'])),
    [COURSE_FIELDS.PLANNED_MEETINGS]: toNumber(pickFirst(raw, [COURSE_FIELDS.PLANNED_MEETINGS, 'PlannedMeetings'])),
    [COURSE_FIELDS.START_TIME]: pickFirst(raw, [COURSE_FIELDS.START_TIME, 'StartTime']),
    [COURSE_FIELDS.END_TIME]: pickFirst(raw, [COURSE_FIELDS.END_TIME, 'EndTime'])
  };
  return mapped;
}

async function fetchSheet(sheetName) {
  if (!apiRef?.getSheetRows) return [];
  const res = await apiRef.getSheetRows({ sheetName });
  if (!res?.success) {
    logEngine('warn', 'sheet_read_failed', { sheetName, message: res?.message || '' });
    return [];
  }
  const headers = Array.isArray(res?.data?.headerRow) ? res.data.headerRow : [];
  let dataRows = Array.isArray(res?.data?.dataRows) ? res.data.dataRows : [];
  let rowNumbers = Array.isArray(res?.data?.rowNumbers) ? res.data.rowNumbers : [];
  if (rowNumbers.length && Number(rowNumbers[0]) <= 2) {
    dataRows = dataRows.slice(1);
    rowNumbers = rowNumbers.slice(1);
  }
  if (sheetName === SHEET_NAMES.DATA_MASTER && !headers.includes('RowID')) {
    throw new Error('DATA_MASTER missing required RowID header');
  }
  if (sheetName === SHEET_NAMES.OPERATIONS_DATA && !headers.includes('source_row_id')) {
    throw new Error('operations_data missing required source_row_id header');
  }
  if (sheetName === SHEET_NAMES.LISTS && !headers.includes('list_name')) {
    throw new Error('lists missing required list_name header');
  }
  if (!headers.length) {
    logEngine('warn', 'sheet_missing_headers', { sheetName });
    return [];
  }
  return dataRows
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell || '').trim() !== ''))
    .map((row, rowIndex) => {
      const mapped = {};
      headers.forEach((header, index) => {
        const key = String(header || '').trim();
        if (!key) return;
        mapped[key] = row[index];
      });
      mapped._rowNumber = Number(rowNumbers[rowIndex] || 0);
      return mapped;
    });
}

let coursesLoadPromise = null;

async function loadCourses() {
  if (!apiRef) return [];
  const rows = await fetchSheet(SHEET_NAMES.DATA_MASTER);
  dataStore.dataMaster = rows;
  dataStore.loadedAt.dataMaster = now();
  dataStore.courses = rows.map(mapCourseRow);
  dataStore.loadedAt.courses = now();
  return dataStore.courses;
}

/** Single in-flight / shared refresh for DATA_MASTER; use after permissions on boot. */
export async function ensureCoursesLoaded() {
  if (isCoursesCacheFresh() && dataStore.courses.length) return dataStore.courses;
  if (!coursesLoadPromise) {
    coursesLoadPromise = loadCourses().finally(() => {
      coursesLoadPromise = null;
    });
  }
  return coursesLoadPromise;
}

export function isCoursesCacheFresh(ttlMs = COURSES_CACHE_TTL_MS) {
  const t = dataStore.loadedAt.courses || 0;
  return t > 0 && (now() - t) < ttlMs;
}

export function isReviewCacheFresh(ttlMs = REVIEW_CACHE_TTL_MS) {
  const t = dataStore.loadedAt.reviewItems || 0;
  return t > 0 && (now() - t) < ttlMs;
}

/** רענון מלא מול השרת; force=true תמיד מושך מחדש */
export async function reloadCourses(force = false) {
  if (!force && isCoursesCacheFresh()) return dataStore.courses;
  coursesLoadPromise = null;
  return loadCourses();
}

export function resetClientDataStore() {
  coursesLoadPromise = null;
  dataStore.permissions = [];
  dataStore.courses = [];
  dataStore.lists = [];
  dataStore.settings = [];
  dataStore.contacts = [];
  dataStore.editRequests = [];
  dataStore.reviewItems = [];
  dataStore.finance = [];
  dataStore.financeArchive = [];
  dataStore.dataMaster = [];
  dataStore.loadedAt = {
    permissions: 0,
    courses: 0,
    lists: 0,
    settings: 0,
    contacts: 0,
    editRequests: 0,
    reviewItems: 0,
    finance: 0,
    financeArchive: 0,
    dataMaster: 0
  };
}

export async function initDataEngine(api, options = {}) {
  apiRef = api;
  const permissions = await loadPermissions(options.userState);
  void ensureCoursesLoaded().catch((error) => {
    logEngine('warn', 'courses_bootstrap_failed', { message: error?.message || String(error || '') });
  });
  return {
    courses: dataStore.courses,
    permissions,
    lists: dataStore.lists
  };
}

export async function loadPermissions(userState = {}) {
  let mapped = [];
  const rows = await fetchSheet(SHEET_NAMES.PERMISSIONS);
  if (rows.length) {
    mapped = rows.map(mapPermissionRow);
  } else {
    mapped = [{
      employeeName: String(userState.displayName || userState.name || userState.EmployeeName || '').trim(),
      employeeId: String(userState.EmployeeID || userState.userId || userState.emp_id || '').trim(),
      entryCode: '',
      systemRole: String(userState.role || userState.SystemRole || '').trim(),
      displayRole: String(userState.DisplayRole || userState.role || userState.SystemRole || '').trim(),
      viewScope: String(userState.ViewScope || '').trim(),
      editScope: String(userState.EditScope || '').trim(),
      approvalScope: String(userState.ApprovalScope || '').trim(),
      uiProfile: String(userState.default_view || userState.DefaultView || userState.UiProfile || '').trim(),
      defaultView: String(userState.default_view || userState.DefaultView || userState.UiProfile || '').trim(),
      teamScope: String(userState.TeamScope || '').trim(),
      instructorManager: String(userState.InstructorManager || '').trim(),
      canAccessFinance: Boolean(userState?.Capabilities?.view_finance),
      canEditFinance: Boolean(userState?.Capabilities?.edit_finance),
      canAccessFinanceArchive: false,
      canEditFinanceArchive: false,
      capabilities: (userState?.Capabilities && typeof userState.Capabilities === 'object') ? { ...userState.Capabilities } : {},
      allowedViews: Array.isArray(userState?.AllowedViews) ? [...userState.AllowedViews] : [],
      raw: userState
    }];
  }
  dataStore.permissions = mapped;
  dataStore.loadedAt.permissions = now();
  return mapped;
}

export async function loadLists() {
  if (apiRef?.getAllLists) {
    const res = await apiRef.getAllLists();
    dataStore.lists = Array.isArray(res?.data?.items) ? res.data.items : [];
  } else {
    dataStore.lists = await fetchSheet(SHEET_NAMES.LISTS);
  }
  dataStore.loadedAt.lists = now();
  return dataStore.lists;
}

export async function loadSettings() {
  dataStore.settings = await fetchSheet(SHEET_NAMES.SETTINGS);
  if (dataStore.settings.length) {
    const sample = dataStore.settings[0] || {};
    if (!Object.prototype.hasOwnProperty.call(sample, 'key') || !Object.prototype.hasOwnProperty.call(sample, 'value')) {
      throw new Error('settings missing key/value headers');
    }
  }
  dataStore.loadedAt.settings = now();
  return dataStore.settings;
}

export async function loadContacts() {
  dataStore.contacts = await fetchSheet(SHEET_NAMES.CONTACTS);
  dataStore.contacts.forEach((row) => {
    if (!String(row?.emp_id || '').trim() && !String(row?.name || '').trim()) {
      logEngine('warn', 'malformed_contact_row', { rowNumber: row?._rowNumber || 0 });
    }
  });
  dataStore.loadedAt.contacts = now();
  return dataStore.contacts;
}

export async function loadEditRequests(force = false) {
  if (!force && dataStore.editRequests.length) return dataStore.editRequests;
  dataStore.editRequests = await fetchSheet(SHEET_NAMES.EDIT_REQUESTS);
  dataStore.loadedAt.editRequests = now();
  return dataStore.editRequests;
}

export async function loadReviewItems(force = false) {
  if (!force && isReviewCacheFresh()) return dataStore.reviewItems;
  const dataMasterRows = await loadDataMaster(force);
  dataStore.reviewItems = (dataMasterRows || []).filter((row) => {
    const reviewStatus = String(row?.[COURSE_FIELDS.REVIEW_STATUS] || row?.ReviewStatus || row?.status || '').trim().toLowerCase();
    return !!reviewStatus && !['resolved', 'closed', 'done', 'טופל', 'טופלה', 'נסגר', 'סגור'].includes(reviewStatus);
  });
  dataStore.loadedAt.reviewItems = now();
  return dataStore.reviewItems;
}

export async function loadDataMaster(force = false) {
  if (!force && dataStore.dataMaster.length) return dataStore.dataMaster;
  dataStore.dataMaster = await fetchSheet(SHEET_NAMES.DATA_MASTER);
  dataStore.loadedAt.dataMaster = now();
  return dataStore.dataMaster;
}

export function getStoreSnapshot() {
  return {
    permissions: [...dataStore.permissions],
    courses: [...dataStore.courses],
    lists: [...dataStore.lists],
    settings: [...dataStore.settings],
    contacts: [...dataStore.contacts],
    editRequests: [...dataStore.editRequests],
    reviewItems: [...dataStore.reviewItems],
    finance: [...dataStore.finance],
    financeArchive: [...dataStore.financeArchive],
    loadedAt: { ...dataStore.loadedAt }
  };
}

export function getPermissionForUser(userState = {}) {
  const userKey = String(userState.EmployeeID || userState.userId || userState.emp_id || '').trim();
  const name = String(
    userState.displayName || userState.name || userState.EmployeeName || ''
  ).trim();
  return dataStore.permissions.find((row) => {
    const rowId = String(row.employeeId || '').trim();
    if (userKey && rowId && rowId === userKey) return true;
    if (userKey && rowId && String(toNumber(rowId)) === String(toNumber(userKey))) return true;
    const rowName = String(row.employeeName || '').trim();
    return Boolean(name && rowName && rowName === name);
  }) || null;
}

function matchContains(value, filterValue) {
  if (!filterValue) return true;
  return String(value || '').toLowerCase().includes(String(filterValue).toLowerCase());
}

function canViewCourse(course, permission, userState = {}) {
  if (!permission) return true;
  const scope = String(permission.viewScope || '').toLowerCase();
  const teamScope = String(permission.teamScope || '').toLowerCase();
  const isAdmin = String(permission.systemRole || '').toUpperCase() === 'IDAN_MAIN_ADMIN';
  if (isAdmin || scope === 'all') return true;
  const authority = String(course[COURSE_FIELDS.AUTHORITY] || '').toLowerCase();
  const manager = String(course[COURSE_FIELDS.COURSE_MANAGER] || '').trim();
  const employee = String(course[COURSE_FIELDS.EMPLOYEE] || '').trim();
  const myName = String(userState.displayName || '').trim();
  const myEmployeeId = toNumber(userState.EmployeeID || userState.userId);
  if (teamScope && authority.includes(teamScope)) return true;
  if (scope && authority.includes(scope)) return true;
  if (scope === 'self') {
    return employee === myName || manager === myName || toNumber(course[COURSE_FIELDS.EMPLOYEE_ID]) === myEmployeeId;
  }
  return true;
}

export function getCoursesForUser(userState = {}, filters = {}) {
  const permission = getPermissionForUser(userState);
  return dataStore.courses.filter((course) => {
    if (!canViewCourse(course, permission, userState)) return false;
    if (!matchContains(course[COURSE_FIELDS.AUTHORITY], filters.authority)) return false;
    if (!matchContains(course[COURSE_FIELDS.SCHOOL], filters.school)) return false;
    if (!matchContains(course[COURSE_FIELDS.EMPLOYEE], filters.employee)) return false;
    if (!matchContains(course[COURSE_FIELDS.COURSE_MANAGER], filters.courseManager)) return false;
    return true;
  });
}

export async function refreshCourse(courseId) {
  const courseKey = String(courseId || '').trim();
  if (!courseKey) return null;
  const rows = await fetchSheet(SHEET_NAMES.DATA_MASTER);
  if (rows.length) {
    const mappedRows = rows.map(mapCourseRow);
    const found = mappedRows.find((item) => String(item[COURSE_FIELDS.COURSE_ID]) === courseKey) || null;
    if (found) {
      const existingIndex = dataStore.courses.findIndex((item) => String(item[COURSE_FIELDS.COURSE_ID]) === courseKey);
      if (existingIndex > -1) dataStore.courses[existingIndex] = { ...dataStore.courses[existingIndex], ...found };
      else dataStore.courses.unshift(found);
      dataStore.loadedAt.courses = now();
      return dataStore.courses[existingIndex > -1 ? existingIndex : 0];
    }
    dataStore.courses = mappedRows;
    dataStore.loadedAt.courses = now();
  }
  return dataStore.courses.find((item) => String(item[COURSE_FIELDS.COURSE_ID]) === courseKey) || null;
}

export async function updateCourse(courseId, changes, actor = {}) {
  if (!apiRef?.updateCourse) return { success: false, message: 'API לא זמין לעדכון קורס.' };
  const res = await apiRef.updateCourse({ [COURSE_FIELDS.COURSE_ID]: courseId, changes, actor });
  if (res?.success) {
    apiRef?.clearCache?.(['getMyCoursesDataAction', 'getDashboardDataAction']);
    const updated = res?.data?.DATA_MASTER || res?.data?.data || null;
    if (updated && updated[COURSE_FIELDS.COURSE_ID]) {
      const mapped = mapCourseRow(updated);
      const existingIndex = dataStore.courses.findIndex((item) => String(item[COURSE_FIELDS.COURSE_ID]) === String(mapped[COURSE_FIELDS.COURSE_ID]));
      if (existingIndex > -1) dataStore.courses[existingIndex] = { ...dataStore.courses[existingIndex], ...mapped };
      else dataStore.courses.unshift(mapped);
      dataStore.loadedAt.courses = now();
    }
  }
  return res;
}

export async function createEditRequest(courseId, changes, actor = {}) {
  if (!apiRef?.createEditRequest) return { success: false, message: 'API לא זמין לבקשת שינוי.' };
  assertRequired(courseId, 'RowID is required for createEditRequest', { actor: actor?.userId || actor?.displayName || '' });
  const payload = {
    [REQUEST_FIELDS.COURSE_ID]: courseId,
    [REQUEST_FIELDS.REQUESTED_BY]: actor.displayName || actor.userId || '',
    changes
  };
  const res = await apiRef.createEditRequest(payload);
  if (!res?.success) logEngine('warn', 'create_edit_request_failed', { rowId: courseId, message: res?.message || '' });
  if (res?.success) {
    apiRef?.clearCache?.(['getDashboardDataAction']);
    await loadEditRequests(true);
  }
  return res;
}

export async function createDataMasterRecord(record = {}, actor = {}) {
  if (!apiRef?.createDataMasterRecord) return { success: false, message: 'API לא זמין ליצירת רשומה.' };
  const res = await apiRef.createDataMasterRecord({ record, actor });
  if (res?.success) {
    apiRef?.clearCache?.(['getMyCoursesDataAction', 'getDashboardDataAction']);
    await loadCourses();
  }
  return res;
}


function parseDateLike(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === 'number' && value > 20000 && value < 60000) {
    const utc = new Date((value - 25569) * 86400000);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  }

  const raw = String(value).trim();

  if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial > 20000 && serial < 60000) {
      const utc = new Date((serial - 25569) * 86400000);
      return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
    }
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const isoDateTime = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z)?$/);
  if (isoDateTime) {
    if (raw.includes('Z')) {
      const utc = new Date(raw);
      return Number.isNaN(utc.getTime()) ? null : new Date(utc.getFullYear(), utc.getMonth(), utc.getDate());
    }
    const d = new Date(
      Number(isoDateTime[1]),
      Number(isoDateTime[2]) - 1,
      Number(isoDateTime[3]),
      Number(isoDateTime[4]),
      Number(isoDateTime[5]),
      Number(isoDateTime[6] || '0')
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dmy) {
    const y = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const d = new Date(y, Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const direct = new Date(raw);
  return Number.isNaN(direct.getTime()) ? null : direct;
}

function financeMeetingDateRaw(row, field) {
  const direct = row?.[field];
  if (String(direct ?? '').trim()) return direct;
  if (field === 'start_date') return row?.Date1;
  const m = String(field).match(/^date(\d+)$/i);
  return m ? row?.[`Date${m[1]}`] : '';
}

function isGefenFunding(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/["׳״'\s-]/g, '');
  return normalized === 'גפן' || normalized === 'gefen';
}

function isEndedUntilToday(row = {}) {
  const todayNow = new Date();
  const todayTs = new Date(todayNow.getFullYear(), todayNow.getMonth(), todayNow.getDate(), 23, 59, 59, 999).getTime();
  const endRaw = row?.end_date || row?.End || '';
  const endDate = parseDateLike(endRaw);
  const status = String(row?.status || row?.WorkflowStatus || '').trim().toLowerCase();
  const statusEnded = ['ended', 'completed', 'closed', 'הסתיים', 'הושלם', 'סגור'].some((marker) => status.includes(marker));
  if (endDate) return endDate.getTime() <= todayTs;
  return statusEnded;
}

export async function loadFinanceItems(force = false) {
  if (!force && dataStore.finance.length) return dataStore.finance;
  let rows;
  if (!force && isCoursesCacheFresh() && dataStore.dataMaster.length) {
    rows = dataStore.dataMaster;
  } else {
    rows = await fetchSheet(SHEET_NAMES.DATA_MASTER);
  }
  const currentDate = new Date();
  const todayTs = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59, 999).getTime();
  dataStore.finance = (rows || []).filter((row) => {
    const fs = String(row?.finance_status || row?.FinanceStatus || 'open').trim().toLowerCase();
    return fs !== 'closed';
  }).map((row) => {
    const funding = row?.funding || row?.Funding || '';
    const authority = row?.authority || row?.Authority || '';
    const school = row?.school || row?.School || '';
    const isGefen = isGefenFunding(funding);
    const payer = isGefen ? school : (authority || funding);
    return {
      ...row,
      FinanceRowID: String(row?.RowID || row?.CourseID || row?._rowNumber || ''),
      FinanceStatus: (String(row?.finance_status || row?.FinanceStatus || 'open').trim().toLowerCase() === 'closed' ? 'closed' : 'open'),
      FinanceNotes: row?.finance_notes || row?.FinanceNotes || '',
      CourseID: row?.RowID || row?.CourseID || '',
      Course: row?.activity_name || row?.Program || '',
      Program: row?.activity_name || row?.Program || '',
      EventType: row?.activity_type || row?.EventType || '',
      Authority: authority,
      School: school,
      Employee: row?.name || row?.Employee || '',
      Instructor: row?.name || row?.Instructor || '',
      CourseManager: row?.activity_manager || row?.CourseManager || '',
      Funding: funding,
      End: row?.end_date || row?.End || '',
      Payment: row?.price || row?.Payment || '',
      Payer: payer,
      FinanceGroupKey: isGefen
        ? String(school).trim()
        : String(funding).trim() || 'ללא מימון',
      FinanceGroupType: isGefen ? 'school' : 'funding',
      DatesListedCount: (() => {
        const seenTs = new Set();
        let count = 0;
        (COURSE_FIELDS.DATE_FIELDS || []).forEach((field) => {
          const parsed = parseDateLike(financeMeetingDateRaw(row, field));
          if (parsed && parsed.getTime() <= todayTs) {
            const ts = parsed.getTime();
            if (!seenTs.has(ts)) { seenTs.add(ts); count += 1; }
          }
        });
        return count;
      })()
    };
  });
  dataStore.loadedAt.finance = now();
  return dataStore.finance;
}

export async function loadFinanceArchiveItems(force = false) {
  dataStore.financeArchive = [];
  dataStore.loadedAt.financeArchive = now();
  return dataStore.financeArchive;
}

export async function updateFinanceStatus(financeRowId, financeStatus, options = {}) {
  if (!apiRef?.updateFinanceStatus) return { success: false, message: 'API לא זמין לעדכון סטטוס גבייה.' };
  assertRequired(financeRowId, 'FinanceRowID is required for updateFinanceStatus');
  const payload = {
    FinanceRowID: financeRowId,
    FinanceStatus: financeStatus,
    sheetName: options.sheetName || SHEET_NAMES.DATA_MASTER,
    StatusNote: options.statusNote || ''
  };
  const res = await apiRef.updateFinanceStatus(payload);
  if (!res?.success) logEngine('warn', 'finance_update_failed', { financeRowId, status: financeStatus, message: res?.message || '' });
  if (res?.success) {
    apiRef?.clearCache?.(['getFinanceDataAction', 'getFinanceArchiveDataAction', 'getDashboardDataAction']);
    await Promise.all([
      loadFinanceItems(true),
      loadFinanceArchiveItems(true)
    ]);
  }
  return res;
}

export async function syncFinance() {
  if (!apiRef?.syncFinance) return { success: false, message: 'API לא זמין לרענון כספים.' };
  const res = await apiRef.syncFinance();
  if (!res?.success) logEngine('warn', 'finance_sync_failed', { message: res?.message || '' });
  if (res?.success) {
    apiRef?.clearCache?.(['getFinanceDataAction', 'getFinanceArchiveDataAction', 'getDashboardDataAction']);
    await Promise.all([
      loadFinanceItems(true),
      loadFinanceArchiveItems(true)
    ]);
  }
  return res;
}

export function buildFilterOptions(rows = []) {
  const uniq = (field) => Array.from(new Set(rows.map((item) => String(item?.[field] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he'));
  return {
    authority: uniq(COURSE_FIELDS.AUTHORITY),
    school: uniq(COURSE_FIELDS.SCHOOL),
    employee: uniq(COURSE_FIELDS.EMPLOYEE),
    courseManager: uniq(COURSE_FIELDS.COURSE_MANAGER),
    activityType: uniq(COURSE_FIELDS.EVENT_TYPE)
  };
}
