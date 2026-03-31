function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, message: 'Backend API בלבד' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var payload = {};
  try {
    payload = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  } catch (err) {
    payload = {};
  }

  var action = (payload.action || (e && e.parameter && e.parameter.action) || '');
  var result = routeAction_(action, payload);
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function routeAction_(action, payload) {
  if (action === 'login') return loginAction(payload.userId, payload.code);
  if (action === 'logout') return logoutAction();
  if (action === 'getSessionProfile') return getSessionProfileAction();
  if (action === 'getDashboard') return getDashboardDataAction();
  if (action === 'getMyCourses') return getMyCoursesDataAction(payload);
  if (action === 'submitEditRequest') return submitEditRequestAction(payload);
  if (action === 'getMyRequests') return getMyRequestsDataAction();
  if (action === 'getApprovals') return getApprovalsDataAction();
  if (action === 'approveRequest') return approveRequestAction(payload);
  if (action === 'rejectRequest') return rejectRequestAction(payload);
  return { success: false, message: 'פעולה לא נתמכת.' };
}

function loginAction(userId, code) {
  return Logic.login(userId, code);
}

function logoutAction() {
  return Logic.logout();
}

function getSessionProfileAction() {
  return Logic.getSessionProfile();
}

function getDashboardDataAction() {
  return Logic.getDashboardData();
}

function getMyCoursesDataAction(filters) {
  return Logic.getMyCoursesData(filters || {});
}

function submitEditRequestAction(payload) {
  return Logic.submitEditRequest(payload || {});
}

function getMyRequestsDataAction() {
  return Logic.getMyRequestsData();
}

function getApprovalsDataAction() {
  return Logic.getApprovalsData();
}

function approveRequestAction(payload) {
  return Logic.approveRequest(payload || {});
}

function rejectRequestAction(payload) {
  return Logic.rejectRequest(payload || {});
}
