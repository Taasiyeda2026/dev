const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx7IZP0WsrUEguIJuWgtwu4uYQSWyQVzx2lbYRYs1TO3mFBM35Gd2rP-HanFX_4Cs3Vmg/exec';
const actionCache = new Map();

const ACTION_TTL_MS = {
  getDashboardDataAction: 90 * 1000,
  getMyCoursesDataAction: 180 * 1000,
  getFinanceDataAction: 180 * 1000,
  getFinanceArchiveDataAction: 180 * 1000
};

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
  try {
    const response = await fetch(WEB_APP_URL, {
      method: 'POST',
      body: buildRequestParams(action, payload)
    });

    if (!response.ok) {
      return { success: false, message: 'השרת אינו זמין כרגע.' };
    }

    const data = await response.json();
    const resolved = data && typeof data === 'object' ? data : { success: false, message: 'התקבלה תשובה לא תקינה.' };
    if (ttl > 0 && resolved?.success) {
      actionCache.set(key, { value: resolved, expiresAt: Date.now() + ttl });
    }
    return resolved;
  } catch (error) {
    return { success: false, message: 'לא ניתן להשלים את הפעולה כעת.' };
  }
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
  createEditRequest: (payload) => callAction('createEditRequest', payload),
  submitEditRequest: (payload) => callAction('createEditRequest', payload),
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
  clearCache: clearActionCache
};
