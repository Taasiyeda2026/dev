import { api } from './api.js';
import { userState, setUserState, clearUserState, hydrateUserState } from './state.js';

const app = document.getElementById('app');
let currentRoute = 'login';

const viewState = {
  dashboard: createPanelState(),
  courses: createPanelState([], { search: '', program: '', status: '' }),
  requests: createPanelState([]),
  approvals: createPanelState([])
};

function createPanelState(data = null, filters = null) {
  return { loading: false, error: '', data, filters };
}

function isAuthenticated() {
  return Boolean(userState.authenticated && userState.userId);
}

function roleText() {
  return `${userState.BaseRole || ''} ${userState.SystemRole || ''} ${userState.userId || ''}`;
}

function isIdan() { return /עידן|idan/i.test(roleText()); }
function isEden() { return /עדן|eden/i.test(roleText()); }
function canSeeApprovals() { return /(master|admin|approval|approver|מאשר|מאסטר)/i.test(roleText()) || isIdan() || isEden(); }
function isManager() { return canSeeApprovals() || /(manager|מנהל)/i.test(roleText()); }
function isInstructor() { return /(instructor|מדריך)/i.test(roleText()) && !isManager(); }

function resetDataState() {
  viewState.dashboard = createPanelState();
  viewState.courses = createPanelState([], { search: '', program: '', status: '' });
  viewState.requests = createPanelState([]);
  viewState.approvals = createPanelState([]);
}

function setRoute(route) {
  if (!isAuthenticated() && route !== 'login') currentRoute = 'login';
  else if (route === 'approvals' && !canSeeApprovals()) currentRoute = 'dashboard';
  else currentRoute = route;
  render();
  loadRouteData();
}

function render() {
  if (!isAuthenticated()) {
    app.innerHTML = loginTemplate();
    bindLogin();
    return;
  }

  app.innerHTML = shellTemplate();
  bindNav();
  renderScreen();
}

function loginTemplate() {
  return `<section class="login-wrap">
    <div class="login-card">
      <h1>כניסה למערכת הניהול</h1>
      <p class="login-subtitle">גישה מאובטחת למערכת הפעילות</p>
      <label>מזהה משתמש<input id="userId" autocomplete="username" /></label>
      <label>קוד כניסה<input id="loginCode" type="password" autocomplete="current-password" /></label>
      <button class="btn btn-primary" id="loginBtn">התחבר</button>
      <p class="error" id="loginError"></p>
    </div>
  </section>`;
}

function shellTemplate() {
  const displayName = userState.displayName || userState.userId;
  const role = isIdan() ? 'עידן · גישת שליטה מלאה' : isEden() ? 'עדן · שכבת ביניים' : isManager() ? 'מנהל פעילות' : 'מדריך';
  return `<div class="layout">
    <aside class="sidebar">
      <div class="brand">DASHBOARD2026</div>
      <div class="sidebar-user">${escapeText(displayName)}</div>
      <div class="sidebar-role">${role}</div>
      <nav class="nav-list">
        ${navButton('dashboard', 'דשבורד')}
        ${navButton('my-courses', isInstructor() ? 'הפעילויות שלי' : 'פעילויות / דאטה')}
        ${navButton('my-requests', 'הבקשות שלי')}
        ${canSeeApprovals() ? navButton('approvals', 'אישורים') : ''}
        ${isEden() || isIdan() ? navButton('eden-view', 'תצוגת עדן') : ''}
        ${isInstructor() ? navButton('instructor-view', 'תצוגת מדריך') : ''}
      </nav>
      <button class="nav-btn" data-route="logout">יציאה</button>
    </aside>
    <main class="main" id="main"></main>
  </div>`;
}

function navButton(route, label) {
  return `<button class="nav-btn ${currentRoute === route ? 'active' : ''}" data-route="${route}">${label}</button>`;
}

function renderScreen() {
  const main = document.getElementById('main');
  if (currentRoute === 'dashboard') main.innerHTML = dashboardTemplate();
  if (currentRoute === 'my-courses') main.innerHTML = coursesTemplate();
  if (currentRoute === 'my-requests') main.innerHTML = requestsTemplate();
  if (currentRoute === 'approvals') main.innerHTML = approvalsTemplate();
  if (currentRoute === 'eden-view') main.innerHTML = edenTemplate();
  if (currentRoute === 'instructor-view') main.innerHTML = instructorTemplate();
  bindScreenActions();
}

function screenHead(title, subtitle, actions = '') {
  return `<header class="screen-head"><div><h2>${title}</h2><p>${subtitle}</p></div><div>${actions}</div></header>`;
}

function panelStateTemplate(panel, emptyText, contentHtml) {
  if (panel.loading) return '<section class="panel-state">טוען נתונים...</section>';
  if (panel.error) return `<section class="panel-state error">${escapeText(panel.error)}</section>`;
  const hasRows = Array.isArray(panel.data) ? panel.data.length > 0 : Boolean(panel.data);
  if (!hasRows) return `<section class="panel-state">${emptyText}</section>`;
  return contentHtml;
}

function dashboardTemplate() {
  const panel = viewState.dashboard;
  const roleSubtitle = isIdan()
    ? 'שליטה מלאה: צפייה, אישור ומיזוג סופי לדאטה הראשית.'
    : isEden()
      ? 'שכבת ביניים: בקרה ואישור לתצוגת עדן לפני אישור סופי.'
      : isManager()
        ? 'ניהול פעילות: עריכה דרך בקשות שינוי ומעקב סטטוסים.'
        : 'תצוגת עבודה ממוקדת מדריך עם מידע משויך בלבד.';
  return screenHead('דשבורד ניהולי', roleSubtitle) + panelStateTemplate(panel, 'אין נתונים להצגה בדשבורד.', (() => {
    const d = panel.data || {};
    const kpis = [
      ['רשומות פעילות', d.totalDataMaster || 0, 'כלל הדאטה הזמינה לעבודה'],
      ['דורש בדיקה', d.reviewRequiredCount || 0, 'רשומות שדורשות השלמה או תיקון'],
      ['בקשות ממתינות', d.pendingRequests || 0, 'ממתינות לשכבת אישור'],
      ['רשומות יצוא', d.exportRows || 0, 'רשומות מוכנות לייצוא']
    ];
    const quickActions = isInstructor()
      ? ['מעבר מהיר לפעילויות שלי', 'צפייה בסטטוס הבקשות שלי']
      : ['מעבר למסך אישורים', 'פתיחת בקשת שינוי חדשה'];
    return `<section class="kpi-grid">${kpis.map((k) => `<article class="kpi-card"><div class="kpi-title">${k[0]}</div><div class="kpi-value">${k[1]}</div><div class="kpi-note">${k[2]}</div></article>`).join('')}</section>
    <section class="kpi-card">
      <div class="kpi-title">פעולות מומלצות</div>
      <div class="kpi-note">${quickActions.map((a) => `• ${a}`).join('<br/>')}</div>
    </section>`;
  })());
}

function coursesTemplate() {
  const panel = viewState.courses;
  const filters = panel.filters || { search: '', program: '', status: '' };
  const content = panelStateTemplate(panel, 'אין פעילויות להצגה.', tableTemplate(panel.data, [
    ['CourseID', 'מזהה קורס'], ['Program', 'תוכנית'], ['Status', 'סטטוס']
  ], { edit: isManager() && !isInstructor() }));

  return `${screenHead('פעילויות / הדאטה', 'ניהול שוטף, סינון מהיר ועדכון מבוקר.')}
    <section class="filters-wrap">
      <label>חיפוש חופשי<input id="searchText" value="${escapeAttr(filters.search)}" /></label>
      <label>תוכנית<input id="programFilter" value="${escapeAttr(filters.program)}" /></label>
      <label>סטטוס<input id="statusFilter" value="${escapeAttr(filters.status)}" /></label>
      <button class="btn btn-secondary" id="filterCourses">סנן</button>
    </section>${content}`;
}

function requestsTemplate() {
  const panel = viewState.requests;
  return screenHead('הבקשות שלי', 'מעקב סטטוסים, הערות, ותיקון טיוטות.') + panelStateTemplate(panel, 'אין בקשות להצגה.', tableTemplate(panel.data, [
    ['RequestID', 'מזהה בקשה'], ['CourseID', 'מזהה קורס'], ['ChangeSummary', 'תקציר שינוי'], ['ApprovalStatus', 'סטטוס'], ['ApprovalNotes', 'הערות'], ['RequestedAt', 'תאריך']
  ], { editDraft: true }));
}

function approvalsTemplate() {
  const panel = viewState.approvals;
  return screenHead('מסך אישורים', 'השוואה מהירה בין מקור לשינוי לפני החלטה.') + panelStateTemplate(panel, 'אין בקשות ממתינות לאישור.', tableTemplate(panel.data, [
    ['RequestID', 'מזהה בקשה'], ['CourseID', 'מזהה קורס'], ['RequestedBy', 'מבקש'], ['ChangeSummary', 'תקציר'], ['OriginalDataView', 'מקור'], ['RequestedDataView', 'שינוי'], ['ApprovalNotesDraft', 'הערת אישור']
  ], { approvals: true }));
}

function edenTemplate() {
  const rows = Array.isArray(viewState.requests.data) ? viewState.requests.data : [];
  const pending = rows.filter((r) => normStatus(r.ApprovalStatus) === 'pending').length;
  const draft = rows.filter((r) => normStatus(r.ApprovalStatus) === 'draft').length;
  const approved = rows.filter((r) => normStatus(r.ApprovalStatus) === 'approved').length;
  const declined = rows.filter((r) => normStatus(r.ApprovalStatus) === 'declined').length;
  return `${screenHead('תצוגת עדן', 'שכבת ביניים: מה ממתין, מה אושר, ומה עדיין בטיוטה.')}
  <section class="kpi-grid compact">
    <article class="kpi-card"><div class="kpi-title">ממתין</div><div class="kpi-value">${pending}</div></article>
    <article class="kpi-card"><div class="kpi-title">טיוטה</div><div class="kpi-value">${draft}</div></article>
    <article class="kpi-card"><div class="kpi-title">אושר</div><div class="kpi-value">${approved}</div></article>
    <article class="kpi-card"><div class="kpi-title">נדחה</div><div class="kpi-value">${declined}</div></article>
  </section>
  ${requestsTemplateTableOnly(rows)}`;
}

function instructorTemplate() {
  const rows = Array.isArray(viewState.courses.data) ? viewState.courses.data : [];
  return `${screenHead('תצוגת מדריך', 'רק הפעילויות המשויכות אליך, ללא עומס מיותר.')}
  ${panelStateTemplate({ loading: viewState.courses.loading, error: viewState.courses.error, data: rows }, 'אין פעילויות משויכות להצגה.', tableTemplate(rows, [
    ['CourseID', 'מזהה קורס'], ['Program', 'תוכנית'], ['Status', 'סטטוס']
  ], {}))}`;
}

function requestsTemplateTableOnly(rows) {
  return tableTemplate(rows, [
    ['RequestID', 'מזהה בקשה'], ['CourseID', 'מזהה קורס'], ['ChangeSummary', 'תקציר שינוי'], ['ApprovalStatus', 'סטטוס'], ['ApprovalNotes', 'הערות']
  ], {});
}

function tableTemplate(rows, columns, options = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const headers = columns.map((c) => `<th>${c[1]}</th>`).join('');
  const actionHeader = (options.edit || options.editDraft || options.approvals) ? '<th>פעולה</th>' : '';

  const body = safeRows.map((row, i) => {
    const cells = columns.map((c) => {
      if (c[0] === 'ApprovalNotesDraft' && options.approvals) {
        return `<td><input data-approval-notes="${i}" value="${escapeAttr(row?.ApprovalNotesDraft || '')}" /></td>`;
      }
      if (c[0] === 'ApprovalStatus') {
        return `<td><span class="status-chip ${statusClass(row?.ApprovalStatus)}">${statusLabel(row?.ApprovalStatus, row?.AssignedEditor)}</span></td>`;
      }
      return `<td>${escapeText(row?.[c[0]] ?? '')}</td>`;
    }).join('');

    let action = '<td></td>';
    if (options.edit) action = `<td><button class="btn btn-secondary" data-edit-row="${i}">בקשת שינוי</button></td>`;
    if (options.editDraft) {
      const isDraft = normStatus(row?.ApprovalStatus) === 'draft';
      action = `<td>${isDraft ? `<button class="btn btn-secondary" data-edit-draft-row="${i}">עריכת טיוטה</button>` : ''}</td>`;
    }
    if (options.approvals) {
      const approveLabel = isIdan() ? 'אשר סופית' : 'אשר לשלב הבא';
      action = `<td class="action-group"><button class="btn btn-primary" data-approve-row="${i}">${approveLabel}</button><button class="btn btn-secondary" data-reject-row="${i}">דחה</button></td>`;
    }

    return `<tr>${cells}${action}</tr>`;
  }).join('');

  return `<section class="table-wrap"><table><thead><tr>${headers}${actionHeader}</tr></thead><tbody>${body}</tbody></table></section>`;
}

function bindLogin() {
  const loginBtn = document.getElementById('loginBtn');
  loginBtn.addEventListener('click', async () => {
    const userId = document.getElementById('userId').value.trim();
    const code = document.getElementById('loginCode').value.trim();
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';
    if (!userId || !code) {
      errorEl.textContent = 'יש למלא מזהה משתמש וקוד כניסה.';
      return;
    }
    loginBtn.disabled = true;
    const res = await api.login({ userId, code });
    loginBtn.disabled = false;
    if (!res?.authenticated) {
      errorEl.textContent = res?.message || 'ההתחברות נכשלה.';
      return;
    }
    setUserState(res);
    resetDataState();
    setRoute('dashboard');
  });
}

function bindNav() {
  document.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', async () => {
      const route = el.dataset.route;
      if (route === 'logout') {
        await api.logout();
        clearUserState();
        resetDataState();
        setRoute('login');
        return;
      }
      setRoute(route);
    });
  });
}

function bindScreenActions() {
  document.getElementById('filterCourses')?.addEventListener('click', () => {
    viewState.courses.filters = {
      search: document.getElementById('searchText')?.value.trim() || '',
      program: document.getElementById('programFilter')?.value.trim() || '',
      status: document.getElementById('statusFilter')?.value.trim() || ''
    };
    loadCourses();
  });

  document.querySelectorAll('[data-edit-row]').forEach((el) => {
    el.addEventListener('click', () => {
      const row = viewState.courses.data[Number(el.dataset.editRow)] || {};
      openEditModal(row, null);
    });
  });

  document.querySelectorAll('[data-edit-draft-row]').forEach((el) => {
    el.addEventListener('click', () => {
      const row = viewState.requests.data[Number(el.dataset.editDraftRow)] || {};
      openEditModal({ CourseID: row.CourseID }, row);
    });
  });

  document.querySelectorAll('[data-approve-row]').forEach((el) => el.addEventListener('click', async () => {
    const index = Number(el.dataset.approveRow);
    const row = viewState.approvals.data[index] || {};
    await updateApproval(row.RequestID, row.ApprovalNotesDraft || '', 'approve', el);
  }));

  document.querySelectorAll('[data-reject-row]').forEach((el) => el.addEventListener('click', async () => {
    const index = Number(el.dataset.rejectRow);
    const row = viewState.approvals.data[index] || {};
    await updateApproval(row.RequestID, row.ApprovalNotesDraft || '', 'reject', el);
  }));

  document.querySelectorAll('[data-approval-notes]').forEach((el) => el.addEventListener('input', () => {
    const index = Number(el.dataset.approvalNotes);
    if (!Number.isNaN(index) && viewState.approvals.data[index]) viewState.approvals.data[index].ApprovalNotesDraft = el.value;
  }));
}

function openEditModal(course, requestRow) {
  const html = `<div class="modal-backdrop" id="editBackdrop"><div class="modal" role="dialog" aria-label="בקשת שינוי">
      <header class="modal-head"><h3>בקשת שינוי לקורס ${escapeText(course?.CourseID || '')}</h3><p>שמירה כטיוטה או שליחה לאישור.</p></header>
      <div class="form-grid">
        <label>תאריך<input id="editDate" value="${escapeAttr(requestRow?.Date)}" /></label>
        <label>יום<input id="editDay" value="${escapeAttr(requestRow?.Day)}" /></label>
        <label>שעת התחלה<input id="editStart" value="${escapeAttr(requestRow?.StartTime)}" /></label>
        <label>שעת סיום<input id="editEnd" value="${escapeAttr(requestRow?.EndTime)}" /></label>
        <label>כיתה / קבוצה<input id="editClass" value="${escapeAttr(requestRow?.ClassGroup)}" /></label>
        <label>מספר מפגשים בפועל<input id="editMeetings" value="${escapeAttr(requestRow?.ActualMeetings)}" /></label>
        <label>מנהל קורס<input id="editManager" value="${escapeAttr(requestRow?.CourseManager)}" /></label>
        <label>מדריך<input id="editInstructor" value="${escapeAttr(requestRow?.Instructor)}" /></label>
      </div>
      <label>הערות<textarea id="editNotes">${escapeText(requestRow?.Notes)}</textarea></label>
      <p class="error" id="editError"></p>
      <div class="action-group"><button class="btn btn-secondary" id="saveDraft">שמור טיוטה</button><button class="btn btn-primary" id="sendPending">שלח לאישור</button></div>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  const close = () => document.getElementById('editBackdrop')?.remove();
  const handleSubmit = async (status, button) => {
    button.disabled = true;
    const result = await submitRequest(course, requestRow, status);
    button.disabled = false;
    if (!result.success) {
      document.getElementById('editError').textContent = result.message || 'לא ניתן לשמור את הבקשה.';
      return;
    }
    close();
    await loadMyRequests();
  };

  document.getElementById('saveDraft').addEventListener('click', () => handleSubmit('Draft', document.getElementById('saveDraft')));
  document.getElementById('sendPending').addEventListener('click', () => handleSubmit('Pending', document.getElementById('sendPending')));
  document.getElementById('editBackdrop').addEventListener('click', (e) => { if (e.target?.id === 'editBackdrop') close(); });
}

async function submitRequest(course, requestRow, status) {
  const form = {
    RequestID: requestRow?.RequestID || '', CourseID: course?.CourseID || '', ApprovalStatus: status, ChangeSummary: 'עדכון פרטי קורס',
    Date: document.getElementById('editDate')?.value.trim() || '', Day: document.getElementById('editDay')?.value.trim() || '',
    StartTime: document.getElementById('editStart')?.value.trim() || '', EndTime: document.getElementById('editEnd')?.value.trim() || '',
    ClassGroup: document.getElementById('editClass')?.value.trim() || '', ActualMeetings: document.getElementById('editMeetings')?.value.trim() || '',
    CourseManager: document.getElementById('editManager')?.value.trim() || '', Instructor: document.getElementById('editInstructor')?.value.trim() || '',
    Notes: document.getElementById('editNotes')?.value.trim() || ''
  };
  if (!form.CourseID) return { success: false, message: 'לא נבחר קורס לבקשת שינוי.' };
  form.requestedData = { date: form.Date, day: form.Day, startTime: form.StartTime, endTime: form.EndTime, classGroup: form.ClassGroup, actualMeetings: form.ActualMeetings, courseManager: form.CourseManager, instructor: form.Instructor, notes: form.Notes };
  const res = await api.submitEditRequest(form);
  return { success: Boolean(res?.success), message: res?.message || '' };
}

async function updateApproval(requestId, notes, actionType, button) {
  if (!requestId) return;
  if (button) button.disabled = true;
  const payload = { RequestID: requestId, ApprovalNotes: (notes || '').trim() };
  const res = actionType === 'approve' ? await api.approveRequest(payload) : await api.rejectRequest(payload);
  if (button) button.disabled = false;
  if (!res?.success) return window.alert(res?.message || 'הפעולה לא בוצעה.');
  await loadApprovals();
  await loadMyRequests();
}

async function loadRouteData() {
  if (!isAuthenticated()) return;
  if (currentRoute === 'dashboard') await loadDashboard();
  if (currentRoute === 'my-courses' || currentRoute === 'instructor-view') await loadCourses();
  if (currentRoute === 'my-requests' || currentRoute === 'eden-view') await loadMyRequests();
  if (currentRoute === 'approvals') await loadApprovals();
}

async function loadDashboard() {
  viewState.dashboard.loading = true; viewState.dashboard.error = ''; renderScreen();
  const res = await api.getDashboard();
  viewState.dashboard.loading = false;
  if (!res?.success) { viewState.dashboard.data = null; viewState.dashboard.error = res?.message || 'לא ניתן לטעון דשבורד.'; }
  else viewState.dashboard.data = res.data || null;
  renderScreen();
}

async function loadCourses() {
  viewState.courses.loading = true; viewState.courses.error = ''; renderScreen();
  const res = await api.getMyCourses(viewState.courses.filters);
  viewState.courses.loading = false;
  if (!res?.success) { viewState.courses.data = []; viewState.courses.error = res?.message || 'לא ניתן לטעון פעילויות.'; }
  else viewState.courses.data = Array.isArray(res?.data?.items) ? res.data.items : [];
  renderScreen();
}

async function loadMyRequests() {
  viewState.requests.loading = true; viewState.requests.error = ''; renderScreen();
  const res = await api.getMyRequests();
  viewState.requests.loading = false;
  if (!res?.success) { viewState.requests.data = []; viewState.requests.error = res?.message || 'לא ניתן לטעון בקשות.'; }
  else viewState.requests.data = Array.isArray(res?.data?.items) ? res.data.items : [];
  renderScreen();
}

async function loadApprovals() {
  if (!canSeeApprovals()) return setRoute('dashboard');
  viewState.approvals.loading = true; viewState.approvals.error = ''; renderScreen();
  const res = await api.getApprovals();
  viewState.approvals.loading = false;
  if (!res?.success) { viewState.approvals.data = []; viewState.approvals.error = res?.message || 'לא ניתן לטעון אישורים.'; }
  else {
    const rows = Array.isArray(res?.data?.items) ? res.data.items : [];
    viewState.approvals.data = rows.map((item) => ({ ...item, OriginalDataView: toHumanObject(item.OriginalData), RequestedDataView: toHumanObject(item.RequestedData), ApprovalNotesDraft: item.ApprovalNotes || '' }));
  }
  renderScreen();
}

function toHumanObject(raw) {
  if (!raw) return '';
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Object.entries(obj || {}).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '').map(([k, v]) => `${humanField(k)}: ${v}`).join(' | ');
  } catch (e) { return String(raw); }
}

function humanField(field) {
  const map = { date: 'תאריך', day: 'יום', startTime: 'שעת התחלה', endTime: 'שעת סיום', classGroup: 'כיתה / קבוצה', actualMeetings: 'מפגשים בפועל', courseManager: 'מנהל קורס', instructor: 'מדריך', notes: 'הערות' };
  return map[field] || field;
}

function normStatus(v) { return String(v || '').trim().toLowerCase(); }
function statusClass(status) { return `status-${normStatus(status) || 'none'}`; }
function statusLabel(status, editor) {
  const s = normStatus(status);
  if (s === 'draft') return 'טיוטה';
  if (s === 'pending') return 'ממתין לאישור';
  if (s === 'declined') return 'נדחה';
  if (s === 'approved') {
    if (/עדן|eden/i.test(`${editor || ''}`)) return 'אושר לתצוגת עדן';
    if (/עידן|idan/i.test(`${editor || ''}`)) return 'אושר סופית';
    return 'אושר';
  }
  return 'ללא סטטוס';
}

function escapeAttr(value) { return String(value || '').replace(/"/g, '&quot;'); }
function escapeText(value) { return String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function boot() {
  hydrateUserState();
  if (isAuthenticated()) {
    const profileRes = await api.getSessionProfile();
    if (profileRes?.authenticated) { setUserState(profileRes); setRoute('dashboard'); return; }
    clearUserState();
  }
  setRoute('login');
}

boot();
