const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxME4qlq8-ve9IVCMQKFXVyquL44drrJmjLz3G87rF0a2UEJ_1j9cLqTCbRqC6c5_8-HA/exec';

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
  getSheetRows: (payload) => callAction('getSheetRowsAction', payload),
  updateCourse: (payload) => callAction('updateCourseAction', payload),
  createEditRequest: (payload) => callAction('createEditRequestAction', payload),
  submitEditRequest: (payload) => callAction('submitEditRequestAction', payload),
  getMyRequests: () => callAction('getMyRequestsDataAction', {}),
  getApprovals: () => callAction('getApprovalsDataAction', {}),
  getEdenView: () => callAction('getEdenViewDataAction', {}),
  approveRequest: (payload) => callAction('approveRequestAction', payload),
  rejectRequest: (payload) => callAction('rejectRequestAction', payload)
};
