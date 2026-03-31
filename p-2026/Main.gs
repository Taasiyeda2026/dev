function doGet(e) {
  var view = (e && e.parameter && e.parameter.view) ? e.parameter.view : '';
  var sourceRowNumber = (e && e.parameter && e.parameter.row) ? e.parameter.row : '';
  var buildLabel = getBuildLabelSafe_();

  try {
    var userProfile = null;
    try {
      userProfile = AuthService.getSession();
    } catch (sessionErr) {
      Logger.log('AuthService.getSession failed: %s', sessionErr && sessionErr.message ? sessionErr.message : sessionErr);
    }

    var currentView = 'login';
    try {
      currentView = resolveSafeView(view || 'dashboard', userProfile, sourceRowNumber);
    } catch (routeErr) {
      Logger.log('resolveSafeView failed: %s', routeErr && routeErr.message ? routeErr.message : routeErr);
      currentView = userProfile ? 'dashboard' : 'login';
    }

    var template = HtmlService.createTemplateFromFile('Layout');
    template.pageTitle = CONFIG.SETTINGS.DEFAULT_PAGE_TITLE;
    template.currentView = currentView;
    template.userProfile = userProfile || null;
    template.buildLabel = buildLabel;

    return template
      .evaluate()
      .setTitle(CONFIG.SETTINGS.DEFAULT_PAGE_TITLE)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    Logger.log('doGet fatal error: %s', err && err.stack ? err.stack : err);
    return renderFatalShell_(err, buildLabel);
  }
}

function getBuildLabelSafe_() {
  try {
    return (CONFIG && CONFIG.SETTINGS && CONFIG.SETTINGS.BUILD_LABEL) ? CONFIG.SETTINGS.BUILD_LABEL : 'unknown-build';
  } catch (err) {
    return 'unknown-build';
  }
}

function renderFatalShell_(err, buildLabel) {
  var safeMessage = escapeHtml_(err && err.message ? err.message : String(err || 'Unknown error'));
  var html = ''
    + '<!doctype html>'
    + '<html dir="rtl" lang="he"><head>'
    + '<meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>שגיאת מערכת</title>'
    + '<style>'
    + 'body{margin:0;font-family:Heebo,Rubik,Arial,sans-serif;background:#f4f7ff;color:#0f172a;}'
    + '.wrap{max-width:860px;margin:48px auto;padding:0 16px;}'
    + '.card{background:#fff;border:1px solid #d9e2ef;border-radius:20px;padding:24px;box-shadow:0 12px 30px rgba(15,23,42,.08);}'
    + 'h1{margin:0 0 8px;font-size:24px;}'
    + 'p{margin:0 0 10px;line-height:1.6;color:#475569;}'
    + '.err{margin-top:14px;padding:12px 14px;border-radius:12px;background:#fff1f2;border:1px solid #fecaca;color:#b42318;white-space:pre-wrap;direction:ltr;text-align:left;}'
    + '.meta{margin-top:14px;font-size:13px;color:#64748b;}'
    + '.actions{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;}'
    + '.btn{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:700;border:1px solid #bfd2f2;background:#eef4ff;color:#1e3a8a;}'
    + '</style></head><body>'
    + '<div class="wrap"><div class="card">'
    + '<h1>המערכת לא הצליחה להיטען</h1>'
    + '<p>במקום מסך לבן מוצגת כעת שגיאה מפורטת כדי שנוכל לזהות את התקלה האמיתית.</p>'
    + '<div class="err">' + safeMessage + '</div>'
    + '<div class="meta">Build: ' + escapeHtml_(buildLabel) + '</div>'
    + '<div class="actions">'
    + '<a class="btn" href="?view=dashboard">מעבר לדשבורד</a>'
    + '<a class="btn" href="?view=login">חזרה להתחברות</a>'
    + '</div>'
    + '</div></div></body></html>';

  return HtmlService.createHtmlOutput(html)
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

  if (normalizedView === 'approvals' && !safeCanAccessApprovals_(userProfile)) {
    return 'dashboard';
  }
  if (normalizedView === 'edit-form' && !sourceRowNumber) {
    return 'mycourses';
  }

  return normalizedView;
}

function safeCanAccessApprovals_(userProfile) {
  try {
    return ApprovalService.canAccessApprovals(userProfile);
  } catch (err) {
    Logger.log('ApprovalService.canAccessApprovals failed: %s', err && err.message ? err.message : err);
    return false;
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function includeSafe(filename, fallbackHtml) {
  try {
    return include(filename);
  } catch (err) {
    Logger.log('includeSafe failed for "%s": %s', filename, err && err.message ? err.message : err);
    return fallbackHtml || '';
  }
}

function escapeHtml_(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
