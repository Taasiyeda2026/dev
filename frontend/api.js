const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyO8lelLfZEpFAlLji5f6qO5tR7I5uoQK5FfMf2y1XWJj5UreSS4ddEtkKDPzKT7YiwMw/exec';

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
  try {
    const response = await fetch(WEB_APP_URL, {
      method: 'POST',
      body: buildRequestParams(action, payload)
    });

    if (!response.ok) {
      return { success: false, message: 'השרת אינו זמין כרגע.' };
    }

    const data = await response.json();
    return data && typeof data === 'object' ? data : { success: false, message: 'התקבלה תשובה לא תקינה.' };
  } catch (error) {
    return { success: false, message: 'לא ניתן להשלים את הפעולה כעת.' };
  }
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
  syncFinance: () => callAction('syncFinanceAction', {})
};
