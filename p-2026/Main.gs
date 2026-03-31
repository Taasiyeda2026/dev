function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, message: 'Backend API בלבד' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    var action = Utils.normalize(body.action);
    var payload = Utils.asObject(body.payload, {});

    if (!action) {
      return jsonOutput_({ success: false, message: 'פעולה לא תקינה.' });
    }

    var actions = {
      loginAction: function () { return loginAction(payload.userId, payload.code); },
      logoutAction: function () { return logoutAction(); },
      getSessionProfileAction: function () { return getSessionProfileAction(); },
      getDashboardDataAction: function () { return getDashboardDataAction(); },
      getMyCoursesDataAction: function () { return getMyCoursesDataAction(payload); },
      submitEditRequestAction: function () { return submitEditRequestAction(payload); },
      getMyRequestsDataAction: function () { return getMyRequestsDataAction(); },
      getApprovalsDataAction: function () { return getApprovalsDataAction(); },
      approveRequestAction: function () { return approveRequestAction(payload); },
      rejectRequestAction: function () { return rejectRequestAction(payload); }
    };

    if (!actions[action]) {
      return jsonOutput_({ success: false, message: 'פעולה לא מוכרת.' });
    }

    return jsonOutput_(actions[action]());
  } catch (err) {
    return jsonOutput_({ success: false, message: 'הפעולה נכשלה.' });
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return {};
  }
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj || {}))
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
