function doGet(e) {
  var view = (e && e.parameter && e.parameter.view) ? e.parameter.view : '';
  var userProfile = AuthService.getSession();

  var currentView = 'login';
  if (userProfile) {
    currentView = view || 'dashboard';
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
