function doGet() {
  return HtmlService
    .createTemplateFromFile('index')
    .evaluate()
    .setTitle('DASHBOARD2026')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
  if (action === 'loginAction') return loginAction(payload.userId, payload.code);
  if (action === 'logoutAction') return logoutAction();
  if (action === 'getSessionProfileAction') return getSessionProfileAction();
  if (action === 'getDashboardDataAction') return getDashboardDataAction();
  if (action === 'getMyCoursesDataAction') return getMyCoursesDataAction(payload);
  if (action === 'submitEditRequestAction') return submitEditRequestAction(payload);
  if (action === 'getMyRequestsDataAction') return getMyRequestsDataAction(payload);
  if (action === 'getApprovalsDataAction') return getApprovalsDataAction(payload);
  if (action === 'approveRequestAction') return approveRequestAction(payload);
  if (action === 'rejectRequestAction') return rejectRequestAction(payload);
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

function getMyRequestsDataAction(payload) {
  return Logic.getMyRequestsData(payload || {});
}

function getApprovalsDataAction(payload) {
  return Logic.getApprovalsData(payload || {});
}

function approveRequestAction(payload) {
  return Logic.approveRequest(payload || {});
}

function rejectRequestAction(payload) {
  return Logic.rejectRequest(payload || {});
}
