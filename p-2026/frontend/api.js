const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzIUSX0b1SAsswy-Nt7P0LzKV4ib099MYmXsHgnfJx7WP1RldZZj7QaUDQpgMNSB_-DPA/exec';

function buildRequestBody(action, payload) {
  return JSON.stringify({
    action,
    payload: payload && typeof payload === 'object' ? payload : {}
  });
}

async function callAction(action, payload) {
  try {
    const response = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildRequestBody(action, payload)
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
  submitEditRequest: (payload) => callAction('submitEditRequestAction', payload),
  getMyRequests: () => callAction('getMyRequestsDataAction', {}),
  getApprovals: () => callAction('getApprovalsDataAction', {}),
  approveRequest: (payload) => callAction('approveRequestAction', payload),
  rejectRequest: (payload) => callAction('rejectRequestAction', payload)
};
