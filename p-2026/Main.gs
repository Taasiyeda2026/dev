function doGet(e) {
  var view = (e && e.parameter && e.parameter.view) ? e.parameter.view : '';
  var sourceRowNumber = (e && e.parameter && e.parameter.row) ? e.parameter.row : '';
  var userProfile = AuthService.getSession();
  var currentView = resolveSafeView(view || 'dashboard', userProfile, sourceRowNumber);

  var template = HtmlService.createTemplateFromFile('Layout');
  template.pageTitle = CONFIG.SETTINGS.DEFAULT_PAGE_TITLE;
  template.currentView = currentView;
  template.userProfile = userProfile;
  template.buildLabel = CONFIG.SETTINGS.BUILD_LABEL;

  return template
    .evaluate()
    .setTitle(CONFIG.SETTINGS.DEFAULT_PAGE_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function resolveSafeView(requestedView, userProfile, sourceRowNumber) {
  var allowedViews = {
    login: true,
    dashboard: true,
    mycourses: true,
    'edit-form': true,
    myrequests: true,
    approvals: true
  };

  var normalizedView = allowedViews[requestedView] ? requestedView : 'dashboard';
  if (!userProfile) return 'login';
  if (normalizedView === 'login') return 'dashboard';

  if (normalizedView === 'approvals' && !ApprovalService.canAccessApprovals(userProfile)) {
    return 'dashboard';
  }
  if (normalizedView === 'edit-form' && !sourceRowNumber) {
    return 'mycourses';
  }

  return normalizedView;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function loginAction(loginInput, codeInput) {
  return AuthService.login(loginInput, codeInput);
}

function logoutAction() {
  return AuthService.logout();
}

function getDashboardDataAction() {
  var session = requireSession_();
  if (!session.success) return session;
  return DashboardService.getDashboardData(session.userProfile);
}

function getSessionProfileAction() {
  var profile = AuthService.getSession();
  return {
    success: !!profile,
    userProfile: profile
  };
}

function getMyCoursesDataAction(filters) {
  var session = requireSession_();
  if (!session.success) return session;
  return CoursesService.getMyCoursesData(session.userProfile, filters || {});
}

function getEditFormDataAction(sourceRowNumber) {
  var session = requireSession_();
  if (!session.success) return session;
  return FormService.getEditFormData(session.userProfile, sourceRowNumber);
}

function submitEditRequestAction(payload) {
  var session = requireSession_();
  if (!session.success) return session;
  return FormService.submitEditRequest(session.userProfile, payload || {});
}

function getMyRequestsDataAction(filters) {
  var session = requireSession_();
  if (!session.success) return session;
  return RequestsService.getMyRequestsData(session.userProfile, filters || {});
}

function getApprovalsDataAction(filters) {
  var session = requireSession_();
  if (!session.success) return session;
  return ApprovalService.getApprovalsData(session.userProfile, filters || {});
}

function submitApprovalDecisionAction(payload) {
  var session = requireSession_();
  if (!session.success) return session;
  return ApprovalService.submitApprovalDecision(session.userProfile, payload || {});
}

function getRuntimeHealthAction() {
  var session = requireSession_();
  if (!session.success) return session;

  var missingIncludes = [];
  (CONFIG.SETTINGS.REQUIRED_HTML_INCLUDES || []).forEach(function (filename) {
    try {
      HtmlService.createHtmlOutputFromFile(filename).getContent();
    } catch (err) {
      missingIncludes.push(filename);
    }
  });

  return {
    success: true,
    health: {
      buildLabel: CONFIG.SETTINGS.BUILD_LABEL,
      missingIncludes: missingIncludes,
      checkedAt: new Date().toISOString()
    }
  };
}

function requireSession_() {
  var profile = AuthService.getSession();
  if (!profile || !AuthService.isValidSessionProfile(profile)) {
    return { success: false, message: 'ה-session אינו תקין או שפג תוקף. יש להתחבר מחדש.' };
  }
  return { success: true, userProfile: profile };
}
