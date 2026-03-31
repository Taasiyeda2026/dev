function doGet(e) {
  var view = (e && e.parameter && e.parameter.view) ? e.parameter.view : '';
  var userProfile = AuthService.getSession();

  var currentView = 'login';
  if (userProfile) {
    currentView = resolveSafeView(view || 'dashboard', userProfile);
  }

  var template = HtmlService.createTemplateFromFile('Layout');
  template.pageTitle = CONFIG.SETTINGS.DEFAULT_PAGE_TITLE;
  template.currentView = currentView;
  template.userProfile = userProfile;

  return template
    .evaluate()
    .setTitle(CONFIG.SETTINGS.DEFAULT_PAGE_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function resolveSafeView(requestedView, userProfile) {
  var allowedViews = {
    login: true,
    dashboard: true,
    mycourses: true,
    myrequests: true,
    approvals: true
  };

  var normalizedView = allowedViews[requestedView] ? requestedView : 'dashboard';

  if (normalizedView === 'approvals' && !ApprovalService.canAccessApprovals(userProfile)) {
    return 'dashboard';
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
  var profile = AuthService.getSession();
  return DashboardService.getDashboardData(profile);
}

function getSessionProfileAction() {
  var profile = AuthService.getSession();
  return {
    success: !!profile,
    userProfile: profile
  };
}

function getMyCoursesDataAction(filters) {
  var profile = AuthService.getSession();
  return CoursesService.getMyCoursesData(profile, filters || {});
}

function getEditFormDataAction(sourceRowNumber) {
  var profile = AuthService.getSession();
  return FormService.getEditFormData(profile, sourceRowNumber);
}

function submitEditRequestAction(payload) {
  var profile = AuthService.getSession();
  return FormService.submitEditRequest(profile, payload || {});
}

function getMyRequestsDataAction(filters) {
  var profile = AuthService.getSession();
  return RequestsService.getMyRequestsData(profile, filters || {});
}

function getApprovalsDataAction(filters) {
  var profile = AuthService.getSession();
  return ApprovalService.getApprovalsData(profile, filters || {});
}

function submitApprovalDecisionAction(payload) {
  var profile = AuthService.getSession();
  return ApprovalService.submitApprovalDecision(profile, payload || {});
}
