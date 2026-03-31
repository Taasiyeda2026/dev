function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, message: 'Backend API בלבד' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function loginAction(userId, code) {
  return AuthService.login(userId, code);
}

function logoutAction() {
  return AuthService.logout();
}

function getSessionProfileAction() {
  var profile = AuthService.getSession();
  if (!profile) return { authenticated: false, message: 'אין חיבור פעיל.' };
  return profile;
}

function getDashboardDataAction() {
  var profile = requireSession_();
  if (!profile.success) return profile;
  return DashboardService.getDashboard(profile.user);
}

function getMyCoursesDataAction(filters) {
  var profile = requireSession_();
  if (!profile.success) return profile;
  return CoursesService.getMyCourses(profile.user, filters || {});
}

function submitEditRequestAction(payload) {
  var profile = requireSession_();
  if (!profile.success) return profile;
  return RequestsService.submitEditRequest(profile.user, payload || {});
}

function getMyRequestsDataAction() {
  var profile = requireSession_();
  if (!profile.success) return profile;
  return RequestsService.getMyRequests(profile.user);
}

function getApprovalsDataAction() {
  var profile = requireSession_();
  if (!profile.success) return profile;
  return RequestsService.getApprovals(profile.user);
}

function approveRequestAction(payload) {
  var profile = requireSession_();
  if (!profile.success) return profile;
  return RequestsService.approveRequest(profile.user, payload || {});
}

function rejectRequestAction(payload) {
  var profile = requireSession_();
  if (!profile.success) return profile;
  return RequestsService.rejectRequest(profile.user, payload || {});
}

function requireSession_() {
  var profile = AuthService.getSession();
  if (!profile || !profile.authenticated) return { success: false, message: 'אין חיבור פעיל.' };
  return { success: true, user: profile };
}
