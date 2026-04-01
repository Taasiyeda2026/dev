import { api } from './api.js';
import { userState, setUserState, clearUserState, hydrateUserState } from './state.js';

const app = document.getElementById('app');
let currentRoute = 'login';

const viewState = {
  dashboard: { loading: false, error: '', data: null },
  courses: { loading: false, error: '', data: [], filters: { search: '', program: '', status: '' } },
  requests: { loading: false, error: '', data: [] },
  approvals: { loading: false, error: '', data: [] },
  eden: { loading: false, error: '', data: [] }
};

const roleMap = {
  admin: 'מנהל מערכת ראשי',
  'admin-ops': 'אחראית בקרה ותפעול',
  manager: 'מנהל פעילות',
  'manager-lead': 'מנהלת תחום',
  instructor: 'מדריך'
};

function role() { return String(userState.SystemRole || '').trim().toLowerCase(); }
function isAuth() { return Boolean(userState.authenticated && userState.userId); }
function isIdan() { return role() === 'admin'; }
function isEden() { return role() === 'admin-ops'; }
function isManager() { return ['manager', 'manager-lead', 'admin', 'admin-ops'].includes(role()); }
function isInstructor() { return role() === 'instructor'; }

function setRoute(route) {
  if (!isAuth() && route !== 'login') currentRoute = 'login';
  else currentRoute = route;
  render();
  loadRouteData();
}

function render() {
  if (!isAuth()) {
    app.innerHTML = `<section class="login-wrap"><div class="login-card"><h1>כניסה למערכת</h1>
    <label>מזהה משתמש<input id="userId" /></label>
    <label>קוד כניסה<input id="loginCode" type="password" /></label>
    <button class="btn btn-primary" id="loginBtn">התחבר</button><p class="error" id="loginError"></p></div></section>`;
    document.getElementById('loginBtn').addEventListener('click', onLogin);
    return;
  }

  app.innerHTML = `<div class="layout"><aside class="sidebar"><div class="brand">DASHBOARD2026</div>
    <div class="sidebar-user">${esc(userState.displayName || userState.userId)}</div>
    <div class="sidebar-role">${roleMap[role()] || 'מדריך'}</div><nav class="nav-list">
    ${nav('dashboard', 'דשבורד פעילות ארצי')}
    ${nav('courses', 'פעילות / קורסים / סדנאות')}
    ${nav('my-requests', 'הבקשות שלי')}
    ${isEden() ? nav('approvals', 'אישורי בקרה ותפעול') : ''}
    ${(isEden() || isIdan()) ? nav('eden-view', 'תצוגת עדן') : ''}
    ${isIdan() ? nav('final-approvals', 'אישור סופי של עידן') : ''}
    ${isInstructor() ? nav('instructor-view', 'תצוגת מדריכים') : ''}
    </nav><button class="nav-btn" data-route="logout">יציאה</button></aside><main class="main" id="main"></main></div>`;

  document.querySelectorAll('[data-route]').forEach((b) => b.addEventListener('click', async () => {
    const route = b.dataset.route;
    if (route === 'logout') {
      await api.logout();
      clearUserState();
      setRoute('login');
      return;
    }
    setRoute(route);
  }));

  renderScreen();
}

function nav(route, label) { return `<button class="nav-btn ${currentRoute === route ? 'active' : ''}" data-route="${route}">${label}</button>`; }
function head(title, sub) { return `<header class="screen-head"><div><h2>${title}</h2><p>${sub}</p></div></header>`; }

function renderScreen() {
  const main = document.getElementById('main');
  if (!main) return;

  if (currentRoute === 'dashboard') {
    const d = viewState.dashboard.data || {};
    main.innerHTML = head('דשבורד פעילות ארצי', 'תמונת מצב ניהולית עם בקרה בזמן אמת') + panel(viewState.dashboard, 'אין נתונים.',
      `<section class="kpi-grid"><article class="kpi-card"><div class="kpi-title">סה"כ פעילות</div><div class="kpi-value">${d.totalDataMaster || 0}</div></article>
      <article class="kpi-card"><div class="kpi-title">ממתין לבדיקת עדן</div><div class="kpi-value">${d.pendingRequests || 0}</div></article>
      <article class="kpi-card"><div class="kpi-title">ממתין לאישור סופי</div><div class="kpi-value">${d.pendingFinal || 0}</div></article>
      <article class="kpi-card"><div class="kpi-title">אושר לדאטה הראשית</div><div class="kpi-value">${d.approvedFinal || 0}</div></article></section>`);
    return;
  }

  if (currentRoute === 'courses' || currentRoute === 'instructor-view') {
    const subtitle = isInstructor() ? 'רק נתונים שמשויכים אליך' : 'תצוגת all data עם עריכה מבוקרת לפי הרשאה';
    main.innerHTML = head(currentRoute === 'courses' ? 'פעילות / קורסים / סדנאות' : 'תצוגת מדריכים', subtitle) +
    `<section class="filters-wrap"><label>חיפוש<input id="searchText" value="${escAttr(viewState.courses.filters.search)}"></label>
    <label>תוכנית<input id="programFilter" value="${escAttr(viewState.courses.filters.program)}"></label>
    <label>סטטוס<input id="statusFilter" value="${escAttr(viewState.courses.filters.status)}"></label>
    <button class="btn btn-secondary" id="filterCourses">סינון</button></section>` +
    panel(viewState.courses, 'אין רשומות.', table(viewState.courses.data, [['CourseID','מזהה'],['Program','תוכנית'],['Status','סטטוס'],['Instructor','מדריך']], isManager() && !isInstructor()));
    document.getElementById('filterCourses')?.addEventListener('click', () => {
      viewState.courses.filters = {
        search: document.getElementById('searchText')?.value.trim() || '',
        program: document.getElementById('programFilter')?.value.trim() || '',
        status: document.getElementById('statusFilter')?.value.trim() || ''
      };
      loadCourses();
    });
    bindEditButtons();
    return;
  }

  if (currentRoute === 'my-requests') {
    main.innerHTML = head('הבקשות שלי', 'טיוטות, סטטוסים והערות') + panel(viewState.requests, 'אין בקשות.',
      table(viewState.requests.data, [['RequestID','מזהה בקשה'],['CourseID','קורס'],['ChangeSummary','תקציר'],['ApprovalStatus','סטטוס'],['ApprovalNotes','הערות']], false));
    return;
  }

  if (currentRoute === 'approvals' || currentRoute === 'final-approvals') {
    const title = currentRoute === 'approvals' ? 'מסך אישורי בקרה ותפעול' : 'מסך אישור סופי של עידן';
    main.innerHTML = head(title, 'השוואה בין מקור לשינוי לפני החלטה') + panel(viewState.approvals, 'אין בקשות.',
      table(viewState.approvals.data, [['RequestID','מזהה'],['CourseID','קורס'],['ChangeSummary','תקציר'],['OriginalDataView','מקור'],['RequestedDataView','שינוי']], false, true));
    bindApprovalButtons();
    return;
  }

  if (currentRoute === 'eden-view') {
    main.innerHTML = head('תצוגת עדן', 'שכבת ביניים מאושרת לפני אישור סופי') + panel(viewState.eden, 'אין נתונים.',
      table(viewState.eden.data, [['RequestID','מזהה'],['CourseID','קורס'],['ChangeSummary','תקציר'],['ApprovalStatus','סטטוס']], false));
  }
}

function panel(state, empty, content) {
  if (state.loading) return '<section class="panel-state">טוען...</section>';
  if (state.error) return `<section class="panel-state error">${esc(state.error)}</section>`;
  const hasRows = Array.isArray(state.data) ? state.data.length : state.data;
  return hasRows ? content : `<section class="panel-state">${empty}</section>`;
}

function table(rows, cols, canEdit, canApprove) {
  const body = (rows || []).map((r, i) => `<tr>${cols.map((c) => {
    if (c[0] === 'ApprovalStatus') return `<td><span class="status-chip ${statusClass(r[c[0]])}">${statusLabel(r[c[0]])}</span></td>`;
    return `<td>${esc(r[c[0]] || '')}</td>`;
  }).join('')}<td>${canEdit ? `<button class="btn btn-secondary" data-edit-row="${i}">בקשת שינוי</button>` : canApprove ? `<button class="btn btn-primary" data-approve-row="${i}">אשר</button> <button class="btn btn-secondary" data-reject-row="${i}">דחה</button>` : ''}</td></tr>`).join('');
  return `<section class="table-wrap"><table><thead><tr>${cols.map((c) => `<th>${c[1]}</th>`).join('')}<th>פעולה</th></tr></thead><tbody>${body}</tbody></table></section>`;
}

function bindEditButtons() {
  document.querySelectorAll('[data-edit-row]').forEach((b) => b.addEventListener('click', () => {
    const row = viewState.courses.data[Number(b.dataset.editRow)] || {};
    const payload = {
      CourseID: row.CourseID,
      Team: row.Team || '',
      ChangeSummary: 'עדכון פעילות',
      ApprovalStatus: 'pending_eden',
      requestedData: { instructor: row.Instructor }
    };
    api.submitEditRequest(payload).then((res) => {
      if (!res?.success) window.alert(res?.message || 'הפעולה נכשלה');
      else loadMyRequests();
    });
  }));
}

function bindApprovalButtons() {
  document.querySelectorAll('[data-approve-row]').forEach((b) => b.addEventListener('click', () => doDecision(b, true)));
  document.querySelectorAll('[data-reject-row]').forEach((b) => b.addEventListener('click', () => doDecision(b, false)));
}

async function doDecision(button, approved) {
  const row = viewState.approvals.data[Number(button.dataset.approveRow || button.dataset.rejectRow)] || {};
  const fn = approved ? api.approveRequest : api.rejectRequest;
  const res = await fn({ RequestID: row.RequestID, ApprovalNotes: '' });
  if (!res?.success) return window.alert(res?.message || 'הפעולה נכשלה');
  await loadApprovals();
  await loadEdenView();
}

async function onLogin() {
  const userId = document.getElementById('userId').value.trim();
  const code = document.getElementById('loginCode').value.trim();
  const res = await api.login({ userId, code });
  if (!res?.authenticated) {
    document.getElementById('loginError').textContent = res?.message || 'ההתחברות נכשלה.';
    return;
  }
  setUserState(res);
  setRoute('dashboard');
}

async function loadRouteData() {
  if (!isAuth()) return;
  if (currentRoute === 'dashboard') return loadDashboard();
  if (currentRoute === 'courses' || currentRoute === 'instructor-view') return loadCourses();
  if (currentRoute === 'my-requests') return loadMyRequests();
  if (currentRoute === 'approvals' || currentRoute === 'final-approvals') return loadApprovals();
  if (currentRoute === 'eden-view') return loadEdenView();
}

async function loadDashboard() { await withLoad('dashboard', api.getDashboard, null, 'לא ניתן לטעון דשבורד.'); }
async function loadCourses() { await withLoad('courses', () => api.getMyCourses(viewState.courses.filters), [], 'לא ניתן לטעון פעילות.'); }
async function loadMyRequests() { await withLoad('requests', api.getMyRequests, [], 'לא ניתן לטעון בקשות.'); }
async function loadEdenView() { await withLoad('eden', api.getEdenView, [], 'לא ניתן לטעון את תצוגת עדן.'); }

async function loadApprovals() {
  viewState.approvals.loading = true; viewState.approvals.error = ''; renderScreen();
  const res = await api.getApprovals();
  viewState.approvals.loading = false;
  if (!res?.success) { viewState.approvals.error = res?.message || 'לא ניתן לטעון אישורים.'; viewState.approvals.data = []; renderScreen(); return; }
  viewState.approvals.data = (res?.data?.items || []).map((item) => ({
    ...item,
    OriginalDataView: toHuman(item.OriginalData),
    RequestedDataView: toHuman(item.RequestedData)
  }));
  renderScreen();
}

async function withLoad(key, fn, emptyValue, errorText) {
  viewState[key].loading = true; viewState[key].error = ''; renderScreen();
  const res = await fn();
  viewState[key].loading = false;
  if (!res?.success) {
    viewState[key].error = res?.message || errorText;
    viewState[key].data = emptyValue;
  } else {
    viewState[key].data = res?.data?.items || res?.data || emptyValue;
  }
  renderScreen();
}

function toHuman(raw) {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
    return Object.entries(obj).filter(([,v]) => String(v || '').trim()).map(([k,v]) => `${k}: ${v}`).join(' | ');
  } catch { return ''; }
}

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'draft') return 'טיוטה';
  if (s === 'pending_eden') return 'ממתין לבדיקת בקרה ותפעול';
  if (s === 'eden_approved') return 'אושר לתצוגת בקרה ותפעול';
  if (s === 'pending_final') return 'ממתין לאישור סופי';
  if (s === 'final_approved') return 'אושר לדאטה הראשית';
  if (s === 'declined') return 'נדחה';
  return 'ללא סטטוס';
}
function statusClass(status) { return `status-${String(status || '').toLowerCase().replace('_', '-') || 'none'}`; }
function esc(v) { return String(v || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escAttr(v) { return esc(v).replace(/"/g, '&quot;'); }

async function boot() {
  hydrateUserState();
  if (isAuth()) {
    const profile = await api.getSessionProfile();
    if (profile?.authenticated) {
      setUserState(profile);
      setRoute('dashboard');
      return;
    }
    clearUserState();
  }
  setRoute('login');
}

boot();
