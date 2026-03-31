function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, message: 'Backend API בלבד' }))
    .setMimeType(ContentService.MimeType.JSON);
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
