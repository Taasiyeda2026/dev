function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('DASHBOARD2026')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function doPost(e) {
  var body = {};
  try {
    body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  } catch (err) {
    body = {};
  }

  var action = Utils.normalize(body.action || (e && e.parameter && e.parameter.action));
  var payload = Utils.asObject(body.payload, {});
  var result = routeAction_(action, payload);
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function routeAction_(action, payload) {
  if (action === 'loginAction' || action === 'login') return loginAction(payload.userId, payload.code);
  if (action === 'logoutAction' || action === 'logout') return logoutAction();
  if (action === 'getSessionProfileAction' || action === 'getSessionProfile') return getSessionProfileAction();
  if (action === 'getDashboardDataAction' || action === 'getDashboard') return getDashboardDataAction();
  if (action === 'getMyCoursesDataAction' || action === 'getMyCourses') return getMyCoursesDataAction(payload);
  if (action === 'submitEditRequestAction' || action === 'submitEditRequest') return submitEditRequestAction(payload);
  if (action === 'getMyRequestsDataAction' || action === 'getMyRequests') return getMyRequestsDataAction();
  if (action === 'getApprovalsDataAction' || action === 'getApprovals') return getApprovalsDataAction();
  if (action === 'approveRequestAction' || action === 'approveRequest') return approveRequestAction(payload);
  if (action === 'rejectRequestAction' || action === 'rejectRequest') return rejectRequestAction(payload);
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
