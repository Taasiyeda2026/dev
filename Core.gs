function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      service: 'p-2026-backend',
      message: 'Apps Script פועל כ-API בלבד. הממשק נמצא ב-Frontend של GitHub.'
    }))
    .setMimeType(ContentService.MimeType.JSON);
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
  if (!Object.keys(payload).length) {
    payload = buildPayloadFromParams_(e && e.parameter ? e.parameter : {});
  }
  var result = routeAction_(action, payload);
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildPayloadFromParams_(params) {
  var payload = {};
  if (!params) return payload;

  Object.keys(params).forEach(function(key) {
    if (key.indexOf('payload.') !== 0) return;
    var path = key.substring('payload.'.length);
    if (!path) return;
    setByPath_(payload, path.split('.'), params[key]);
  });

  return payload;
}

function setByPath_(target, segments, value) {
  if (!segments || !segments.length) return;
  var current = target;

  for (var i = 0; i < segments.length; i += 1) {
    var seg = segments[i];
    var isLast = i === segments.length - 1;
    var nextSeg = segments[i + 1];
    var nextIsIndex = /^\d+$/.test(nextSeg || '');

    if (isLast) {
      current[seg] = value;
      return;
    }

    if (!current[seg] || typeof current[seg] !== 'object') {
      current[seg] = nextIsIndex ? [] : {};
    }
    current = current[seg];
  }
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
  if (action === 'getEdenViewDataAction') return getEdenViewDataAction(payload);
  if (action === 'approveRequestAction') return approveRequestAction(payload);
  if (action === 'rejectRequestAction') return rejectRequestAction(payload);
  if (action === 'getSheetRows') return getSheetRowsAction(payload);
  if (action === 'updateCourse') return updateCourseAction(payload);
  if (action === 'createEditRequest') return createEditRequestAction(payload);
  return { success: false, message: 'פעולה לא נתמכת.' };
}

function loginAction(userId, code) { return Logic.login(userId, code); }
function logoutAction() { return Logic.logout(); }
function getSessionProfileAction() { return Logic.getSessionProfile(); }
function getDashboardDataAction() { return Logic.getDashboardData(); }
function getMyCoursesDataAction(filters) { return Logic.getMyCoursesData(filters || {}); }
function submitEditRequestAction(payload) { return Logic.submitEditRequest(payload || {}); }
function getMyRequestsDataAction(payload) { return Logic.getMyRequestsData(payload || {}); }
function getApprovalsDataAction(payload) { return Logic.getApprovalsData(payload || {}); }
function getEdenViewDataAction(payload) { return Logic.getEdenViewData(payload || {}); }
function approveRequestAction(payload) { return Logic.approveRequest(payload || {}); }
function rejectRequestAction(payload) { return Logic.rejectRequest(payload || {}); }
function getSheetRowsAction(payload) { return Logic.getSheetRows(payload || {}); }
function updateCourseAction(payload) { return Logic.updateCourse(payload || {}); }
function createEditRequestAction(payload) { return Logic.createEditRequest(payload || {}); }


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('תחזוקה')
    .addItem('רענון FINANCE', 'rebuildFinanceSheet')
    .addToUi();
}
