const DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxe8tTVquQLr-VtsVyMMTJB4ZGOAMIdtwEWdQWLuRc14pokaSEgG0N0ssbjgPHqFkUY-w/exec';
const WEB_APP_URL = (globalThis.__WEB_APP_URL__ && String(globalThis.__WEB_APP_URL__).trim()) || DEFAULT_WEB_APP_URL;
const actionCache = new Map();


function logApi(level, event, meta = {}) {
  const fn = level === 'error' ? console.error : console.warn;
  fn(`[api:${event}]`, meta);
}

const ACTION_TTL_MS = {
  getSessionProfileAction: 120 * 1000,
  getDashboardDataAction: 120 * 1000,
  getMyCoursesDataAction: 360 * 1000,
  getFinanceDataAction: 300 * 1000,
  getFinanceArchiveDataAction: 300 * 1000,
  getContactsDataAction: 240 * 1000,
  getAllSettingsAction: 600 * 1000,
  getAllListsAction: 300 * 1000,
  getMyRequestsDataAction: 90 * 1000,
  getApprovalsDataAction: 90 * 1000,
  getEdenViewDataAction: 90 * 1000
};

const inflightActions = new Map();

function appendPayload(params, value, path) {
  if (value === null || typeof value === 'undefined') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendPayload(params, item, `${path}.${index}`));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => appendPayload(params, nested, `${path}.${key}`));
    return;
  }
  params.append(path, String(value));
}

function buildRequestParams(action, payload) {
  const params = new URLSearchParams();
  params.append('action', action);
  if (payload && typeof payload === 'object') {
    Object.entries(payload).forEach(([key, value]) => appendPayload(params, value, `payload.${key}`));
  }
  return params;
}

async function callAction(action, payload) {
  const key = `${action}:${JSON.stringify(payload || {})}`;
  const ttl = ACTION_TTL_MS[action] || 0;
  if (ttl > 0) {
    const cached = actionCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
  }
  if (inflightActions.has(key)) return inflightActions.get(key);
  const exec = (async () => {
    try {
      const response = await fetch(WEB_APP_URL, {
        method: 'POST',
        body: buildRequestParams(action, payload)
      });

      if (!response.ok) {
        logApi('warn', 'http_not_ok', { action, status: response.status });
        return { success: false, message: 'השרת אינו זמין כרגע.' };
      }

      const data = await response.json();
      const resolved = data && typeof data === 'object' ? data : { success: false, message: 'התקבלה תשובה לא תקינה.' };
      if (!resolved?.success) logApi('warn', 'action_failed', { action, message: resolved?.message || '' });
      if (ttl > 0 && (resolved?.success || resolved?.authenticated)) {
        actionCache.set(key, { value: resolved, expiresAt: Date.now() + ttl });
      }
      return resolved;
    } catch (error) {
      logApi('error', 'network_or_parse_error', { action, error: error?.message || String(error || '') });
      return { success: false, message: 'לא ניתן להשלים את הפעולה כעת.' };
    } finally {
      inflightActions.delete(key);
    }
  })();
  inflightActions.set(key, exec);
  return exec;
}

function clearActionCache(actions = []) {
  if (!Array.isArray(actions) || !actions.length) {
    actionCache.clear();
    return;
  }
  const target = new Set(actions);
  Array.from(actionCache.keys()).forEach((key) => {
    const action = key.split(':')[0];
    if (target.has(action)) actionCache.delete(key);
  });
}

export const api = {
  login: (payload) => callAction('loginAction', payload),
  logout: () => callAction('logoutAction', {}),
  getSessionProfile: () => callAction('getSessionProfileAction', {}),
  getDashboard: () => callAction('getDashboardDataAction', {}),
  getMyCourses: (filters) => callAction('getMyCoursesDataAction', filters),
  getSheetRows: (payload) => callAction('getSheetRows', payload),
  updateCourse: (payload) => callAction('updateCourse', payload),
  getCourseMeetings: (payload) => callAction('getCourseMeetingsAction', payload),
  updateCourseMeeting: (payload) => callAction('updateCourseMeetingAction', payload),
  createEditRequest: (payload) => callAction('createEditRequest', payload),
  submitEditRequest: (payload) => callAction('submitEditRequestAction', payload),
  markExceptionResolved: (payload) => callAction('createEditRequest', { ...payload, operation: 'MARK_EXCEPTION_RESOLVED' }),
  getMyRequests: () => callAction('getMyRequestsDataAction', {}),
  getApprovals: () => callAction('getApprovalsDataAction', {}),
  getEdenView: () => callAction('getEdenViewDataAction', {}),
  approveRequest: (payload) => callAction('approveRequestAction', payload),
  rejectRequest: (payload) => callAction('rejectRequestAction', payload),
  getFinanceData: () => callAction('getFinanceDataAction', {}),
  getFinanceArchiveData: () => callAction('getFinanceArchiveDataAction', {}),
  updateFinanceStatus: (payload) => callAction('updateFinanceStatusAction', payload),
  syncFinance: () => callAction('syncFinanceAction', {}),
  getContactsData: () => callAction('getContactsDataAction', {}),
  updateContact: (payload) => callAction('updateContactAction', payload),
  getAllLists: () => callAction('getAllListsAction', {}),
  getListByName: (listName) => callAction('getListByNameAction', { listName }),
  updatePermission: (payload) => callAction('updatePermissionAction', payload),
  getAllSettings: () => callAction('getAllSettingsAction', {}),
  getSetting: (key, fallback) => callAction('getSettingAction', { key, fallback }),
  createDataMasterRecord: (payload) => callAction('createDataMasterRecordAction', payload),
  clearCache: clearActionCache
};
