import {
  COURSE_FIELDS,
  PERMISSION_FIELDS,
  REQUEST_FIELDS,
  SHEET_NAMES
} from './data-contracts.js';

const SHEETS_WITH_DISPLAY_ROW = new Set([
  SHEET_NAMES.COURSES,
  SHEET_NAMES.DATA_MASTER,
  SHEET_NAMES.PERMISSIONS,
  SHEET_NAMES.EDIT_REQUESTS,
  SHEET_NAMES.REVIEW_REQUIRED,
  SHEET_NAMES.LISTS,
  SHEET_NAMES.PROGRAM_CODES,
  'SUMMARY'
]);

const BOOL_TRUE = new Set(['yes', 'true', '1', 'y', 'כן']);

const dataStore = {
  permissions: [],
  courses: [],
  lists: [],
  programCodes: [],
  editRequests: [],
  reviewItems: [],
  dataMaster: [],
  loadedAt: {
    permissions: 0,
    courses: 0,
    lists: 0,
    programCodes: 0,
    editRequests: 0,
    reviewItems: 0,
    dataMaster: 0
  }
};

let apiRef = null;

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
  return {
    employeeName: String(raw[PERMISSION_FIELDS.EMPLOYEE_NAME] || '').trim(),
    employeeId: toNumber(raw[PERMISSION_FIELDS.EMPLOYEE_ID]),
    entryCode: String(raw[PERMISSION_FIELDS.ENTRY_CODE] || '').trim(),
    baseRole: String(raw[PERMISSION_FIELDS.BASE_ROLE] || '').trim(),
    systemRole: String(raw[PERMISSION_FIELDS.SYSTEM_ROLE] || '').trim(),
    displayRole: String(raw[PERMISSION_FIELDS.DISPLAY_ROLE] || '').trim(),
    viewScope: String(raw[PERMISSION_FIELDS.VIEW_SCOPE] || '').trim(),
    editScope: String(raw[PERMISSION_FIELDS.EDIT_SCOPE] || '').trim(),
    approvalScope: String(raw[PERMISSION_FIELDS.APPROVAL_SCOPE] || '').trim(),
    uiProfile: String(raw[PERMISSION_FIELDS.UI_PROFILE] || '').trim(),
    teamScope: String(raw[PERMISSION_FIELDS.TEAM_SCOPE] || '').trim(),
    isDualMode: toBool(raw[PERMISSION_FIELDS.IS_DUAL_MODE]),
    canViewDashboard: toBool(raw[PERMISSION_FIELDS.CAN_VIEW_DASHBOARD]),
    canEditMasterData: toBool(raw[PERMISSION_FIELDS.CAN_EDIT_MASTER_DATA]),
    canApproveToMainData: toBool(raw[PERMISSION_FIELDS.CAN_APPROVE_TO_MAIN_DATA]),
    raw
  };
}

function mapCourseRow(raw = {}) {
  return {
    ...raw,
    [COURSE_FIELDS.COURSE_ID]: String(raw[COURSE_FIELDS.COURSE_ID] || '').trim(),
    [COURSE_FIELDS.PROGRAM_CODE]: toNumber(raw[COURSE_FIELDS.PROGRAM_CODE]),
    [COURSE_FIELDS.EMPLOYEE_ID]: toNumber(raw[COURSE_FIELDS.EMPLOYEE_ID]),
    [COURSE_FIELDS.PLANNED_MEETINGS]: toNumber(raw[COURSE_FIELDS.PLANNED_MEETINGS]),
    [COURSE_FIELDS.ACTUAL_MEETINGS]: toNumber(raw[COURSE_FIELDS.ACTUAL_MEETINGS]),
    [COURSE_FIELDS.START_TIME]: raw[COURSE_FIELDS.START_TIME],
    [COURSE_FIELDS.END_TIME]: raw[COURSE_FIELDS.END_TIME]
  };
}

async function fetchSheet(sheetName) {
  if (!apiRef?.getSheetRows) return [];
  const res = await apiRef.getSheetRows({ sheetName });
  if (!res?.success) return [];
  const headers = Array.isArray(res?.data?.headerRow) ? res.data.headerRow : [];
  const dataRows = Array.isArray(res?.data?.dataRows) ? res.data.dataRows : [];
  const rowNumbers = Array.isArray(res?.data?.rowNumbers) ? res.data.rowNumbers : [];
  if (!headers.length) return [];
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

async function loadCourses() {
  if (!apiRef) return [];
  const rows = await fetchSheet(SHEET_NAMES.COURSES);
  dataStore.courses = rows.map(mapCourseRow);
  dataStore.loadedAt.courses = now();
  return dataStore.courses;
}

export async function reloadCourses() {
  return loadCourses();
}

export async function initDataEngine(api, options = {}) {
  apiRef = api;
  const [courses, permissions, lists, programCodes] = await Promise.all([
    loadCourses(),
    loadPermissions(options.userState),
    loadLists(),
    loadProgramCodes()
  ]);
  return { courses, permissions, lists, programCodes };
}

export async function loadPermissions(userState = {}) {
  let mapped = [];
  const rows = await fetchSheet(SHEET_NAMES.PERMISSIONS);
  if (rows.length) {
    mapped = rows.map(mapPermissionRow);
  } else {
    mapped = [{
      employeeName: String(userState.displayName || '').trim(),
      employeeId: toNumber(userState.EmployeeID || userState.userId),
      entryCode: '',
      baseRole: String(userState.BaseRole || '').trim(),
      systemRole: String(userState.SystemRole || '').trim(),
      displayRole: String(userState.DisplayRole || '').trim(),
      viewScope: String(userState.ViewScope || '').trim(),
      editScope: String(userState.EditScope || '').trim(),
      approvalScope: String(userState.ApprovalScope || '').trim(),
      uiProfile: String(userState.UiProfile || '').trim(),
      teamScope: String(userState.TeamScope || '').trim(),
      isDualMode: toBool(userState.IsDualMode),
      canViewDashboard: true,
      canEditMasterData: false,
      canApproveToMainData: false,
      raw: userState
    }];
  }
  dataStore.permissions = mapped;
  dataStore.loadedAt.permissions = now();
  return mapped;
}

export async function loadLists() {
  dataStore.lists = await fetchSheet(SHEET_NAMES.LISTS);
  dataStore.loadedAt.lists = now();
  return dataStore.lists;
}

export async function loadProgramCodes() {
  dataStore.programCodes = await fetchSheet(SHEET_NAMES.PROGRAM_CODES);
  dataStore.loadedAt.programCodes = now();
  return dataStore.programCodes;
}

export async function loadEditRequests(force = false) {
  if (!force && dataStore.editRequests.length) return dataStore.editRequests;
  dataStore.editRequests = await fetchSheet(SHEET_NAMES.EDIT_REQUESTS);
  dataStore.loadedAt.editRequests = now();
  return dataStore.editRequests;
}

export async function loadReviewItems(force = false) {
  if (!force && dataStore.reviewItems.length) return dataStore.reviewItems;
  dataStore.reviewItems = await fetchSheet(SHEET_NAMES.REVIEW_REQUIRED);
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
    programCodes: [...dataStore.programCodes],
    editRequests: [...dataStore.editRequests],
    reviewItems: [...dataStore.reviewItems],
    loadedAt: { ...dataStore.loadedAt }
  };
}

export function getPermissionForUser(userState = {}) {
  const userId = toNumber(userState.EmployeeID || userState.userId);
  const name = String(userState.displayName || '').trim();
  return dataStore.permissions.find((row) => (userId && row.employeeId === userId)
    || (name && row.employeeName === name)) || null;
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
    if (filters.period) {
      const period = String(filters.period || '').trim();
      const end = String(course[COURSE_FIELDS.END] || '').trim();
      if (!end.includes(period)) return false;
    }
    return true;
  });
}

export async function refreshCourse(courseId) {
  const courseKey = String(courseId || '').trim();
  if (!courseKey) return null;
  const rows = await fetchSheet(SHEET_NAMES.COURSES);
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
    const updated = res?.data?.COURSES || null;
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
  const payload = {
    [REQUEST_FIELDS.COURSE_ID]: courseId,
    [REQUEST_FIELDS.REQUESTED_BY]: actor.displayName || actor.userId || '',
    changes
  };
  const res = await apiRef.createEditRequest(payload);
  if (res?.success) await loadEditRequests(true);
  return res;
}

export function buildFilterOptions(rows = []) {
  const uniq = (field) => Array.from(new Set(rows.map((item) => String(item?.[field] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he'));
  return {
    authority: uniq(COURSE_FIELDS.AUTHORITY),
    school: uniq(COURSE_FIELDS.SCHOOL),
    employee: uniq(COURSE_FIELDS.EMPLOYEE),
    courseManager: uniq(COURSE_FIELDS.COURSE_MANAGER)
  };
}
