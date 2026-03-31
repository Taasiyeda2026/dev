import { api } from './api.js';
import { userState, setUserState, clearUserState } from './state.js';

const app = document.getElementById('app');
let currentRoute = 'login';
let viewData = { dashboard: null, courses: [], requests: [], approvals: [] };

function canSeeApprovals() {
  return /(master|admin|approval|approver|מנהל|מאשר|מאסטר)/i.test(`${userState.BaseRole} ${userState.SystemRole}`);
}

function setRoute(route) {
  if (!userState.authenticated && route !== 'login') route = 'login';
  if (route === 'approvals' && !canSeeApprovals()) route = 'dashboard';
  currentRoute = route;
  render();
  loadRouteData();
}

function render() {
  if (!userState.authenticated) {
    app.innerHTML = loginTemplate();
    bindLogin();
    return;
  }

  app.innerHTML = shellTemplate();
  bindNav();
  renderScreen();
}

function shellTemplate() {
  return `<div class="layout">
    <aside class="sidebar">
      <div class="brand">מערכת ניהול</div>
      ${navButton('dashboard', 'דשבורד')}
      ${navButton('my-courses', 'הקורסים שלי')}
      ${navButton('my-requests', 'הבקשות שלי')}
      ${canSeeApprovals() ? navButton('approvals', 'אישורים') : ''}
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
  if (currentRoute === 'my-requests') main.innerHTML = myRequestsTemplate();
  if (currentRoute === 'approvals') main.innerHTML = approvalsTemplate();
  bindScreenActions();
}

function loginTemplate() {
  return `<div class="main" style="max-width:420px;margin:8vh auto;">
    <div class="card">
      <div class="row"><input id="userId" aria-label="זיהוי משתמש"></div>
      <div class="row"><input id="loginCode" type="password" aria-label="קוד כניסה"></div>
      <button class="primary" id="loginBtn">התחבר</button>
      <div class="error" id="loginError"></div>
    </div>
  </div>`;
}

function dashboardTemplate() {
  const d = viewData.dashboard || {};
  const kpis = [
    ['רשומות פעילות', d.totalDataMaster || 0],
    ['דורש בדיקה', d.reviewRequiredCount || 0],
    ['בקשות ממתינות', d.pendingRequests || 0],
    ['רשומות יצוא', d.exportRows || 0]
  ];
  return `<div class="grid-4">${kpis.map((k) => `<div class="card"><div class="kpi-title">${k[0]}</div><div class="kpi-value">${k[1]}</div></div>`).join('')}</div>`;
}

function coursesTemplate() {
  const columns = [
    ['CourseID', 'מזהה קורס'],
    ['Program', 'תוכנית'],
    ['Status', 'סטטוס']
  ];

  return `<div class="row">
      <input id="searchText">
      <input id="programFilter">
      <input id="statusFilter">
      <button class="secondary" id="filterCourses">סנן</button>
    </div>
    ${tableTemplate(viewData.courses, columns, { edit: true })}`;
}

function myRequestsTemplate() {
  const columns = [
    ['RequestID', 'מזהה בקשה'],
    ['CourseID', 'מזהה קורס'],
    ['ChangeSummary', 'תקציר שינוי'],
    ['ApprovalStatus', 'סטטוס'],
    ['ApprovalNotes', 'הערות אישור'],
    ['RequestedAt', 'תאריך בקשה']
  ];
  return tableTemplate(viewData.requests, columns, { editDraft: true });
}

function approvalsTemplate() {
  const columns = [
    ['RequestID', 'מזהה בקשה'],
    ['CourseID', 'מזהה קורס'],
    ['RequestedBy', 'מבקש'],
    ['ChangeSummary', 'תקציר שינוי'],
    ['OriginalData', 'נתונים מקוריים'],
    ['RequestedData', 'נתונים מבוקשים'],
    ['Notes', 'הערות']
  ];
  return tableTemplate(viewData.approvals, columns, { approvals: true });
}

function tableTemplate(rows, columns, options) {
  const opts = options || {};
  const head = columns.map((c) => `<th>${c[1]}</th>`).join('');
  const extra = opts.edit || opts.editDraft || opts.approvals ? '<th></th>' : '';
  const body = rows.map((r, i) => {
    const cells = columns.map((c) => `<td>${r[c[0]] ?? ''}</td>`).join('');
    let action = '';
    if (opts.edit) action = `<td><button class="secondary" data-edit-row="${i}">בקשת עריכה</button></td>`;
    if (opts.editDraft) {
      const isDraft = String(r.ApprovalStatus || '').toLowerCase() === 'draft';
      action = `<td>${isDraft ? `<button class="secondary" data-edit-draft-row="${i}">עריכת טיוטה</button>` : ''}</td>`;
    }
    if (opts.approvals) action = `<td><button class="secondary" data-approve-row="${i}">אשר</button> <button class="secondary" data-reject-row="${i}">דחה</button></td>`;
    return `<tr>${cells}${action}</tr>`;
  }).join('');
  return `<table><thead><tr>${head}${extra}</tr></thead><tbody>${body}</tbody></table>`;
}

function bindLogin() {
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const userId = document.getElementById('userId').value;
    const code = document.getElementById('loginCode').value;
    const err = document.getElementById('loginError');
    err.textContent = '';
    try {
      const res = await api.login({ userId, code });
      if (!res.authenticated) {
        err.textContent = res.message || 'ההתחברות נכשלה.';
        return;
      }
      setUserState(res);
      setRoute('dashboard');
    } catch {
      err.textContent = 'ההתחברות נכשלה.';
    }
  });
}

function bindNav() {
  document.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => {
      const route = el.dataset.route;
      if (route === 'logout') {
        clearUserState();
        setRoute('login');
        return;
      }
      setRoute(route);
    });
  });
}

function bindScreenActions() {
  const filterBtn = document.getElementById('filterCourses');
  if (filterBtn) filterBtn.addEventListener('click', () => loadCourses());

  document.querySelectorAll('[data-edit-row]').forEach((el) => {
    el.addEventListener('click', () => openEditModal(viewData.courses[Number(el.dataset.editRow)] || {}, null));
  });

  document.querySelectorAll('[data-edit-draft-row]').forEach((el) => {
    const row = viewData.requests[Number(el.dataset.editDraftRow)] || {};
    el.addEventListener('click', () => openEditModal({ CourseID: row.CourseID }, row));
  });

  document.querySelectorAll('[data-approve-row]').forEach((el) => {
    el.addEventListener('click', async () => {
      const row = viewData.approvals[Number(el.dataset.approveRow)] || {};
      await api.approveRequest({ RequestID: row.RequestID, ApprovalNotes: '' });
      loadApprovals();
    });
  });

  document.querySelectorAll('[data-reject-row]').forEach((el) => {
    el.addEventListener('click', async () => {
      const row = viewData.approvals[Number(el.dataset.rejectRow)] || {};
      await api.rejectRequest({ RequestID: row.RequestID, ApprovalNotes: '' });
      loadApprovals();
    });
  });
}

function openEditModal(course, requestRow) {
  const html = `<div class="modal-backdrop" id="editBackdrop"><div class="modal">
    <div class="row"><input id="editDate" value="${escapeAttr(requestRow?.Date)}"></div>
    <div class="row"><input id="editDay" value="${escapeAttr(requestRow?.Day)}"></div>
    <div class="row"><input id="editStart" value="${escapeAttr(requestRow?.StartTime)}"></div>
    <div class="row"><input id="editEnd" value="${escapeAttr(requestRow?.EndTime)}"></div>
    <div class="row"><input id="editClass" value="${escapeAttr(requestRow?.ClassGroup)}"></div>
    <div class="row"><input id="editMeetings" value="${escapeAttr(requestRow?.ActualMeetings)}"></div>
    <div class="row"><input id="editManager" value="${escapeAttr(requestRow?.CourseManager)}"></div>
    <div class="row"><input id="editInstructor" value="${escapeAttr(requestRow?.Instructor)}"></div>
    <div class="row"><textarea id="editNotes">${escapeText(requestRow?.Notes)}</textarea></div>
    <div class="row">
      <button class="secondary" id="saveDraft">שמור טיוטה</button>
      <button class="primary" id="sendPending">שלח לאישור</button>
    </div>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const close = () => document.getElementById('editBackdrop')?.remove();

  document.getElementById('saveDraft').addEventListener('click', async () => {
    await submitRequest(course, requestRow, 'Draft');
    close();
    loadMyRequests();
  });
  document.getElementById('sendPending').addEventListener('click', async () => {
    await submitRequest(course, requestRow, 'Pending');
    close();
    loadMyRequests();
  });
  document.getElementById('editBackdrop').addEventListener('click', (e) => { if (e.target.id === 'editBackdrop') close(); });
}

async function submitRequest(course, requestRow, status) {
  const payload = {
    RequestID: requestRow?.RequestID || '',
    CourseID: course.CourseID || '',
    ApprovalStatus: status,
    ChangeSummary: 'עדכון פרטי קורס',
    Date: document.getElementById('editDate').value,
    Day: document.getElementById('editDay').value,
    StartTime: document.getElementById('editStart').value,
    EndTime: document.getElementById('editEnd').value,
    ClassGroup: document.getElementById('editClass').value,
    ActualMeetings: document.getElementById('editMeetings').value,
    CourseManager: document.getElementById('editManager').value,
    Instructor: document.getElementById('editInstructor').value,
    Notes: document.getElementById('editNotes').value,
    requestedData: {
      date: document.getElementById('editDate').value,
      day: document.getElementById('editDay').value,
      startTime: document.getElementById('editStart').value,
      endTime: document.getElementById('editEnd').value,
      classGroup: document.getElementById('editClass').value,
      actualMeetings: document.getElementById('editMeetings').value,
      courseManager: document.getElementById('editManager').value,
      instructor: document.getElementById('editInstructor').value,
      notes: document.getElementById('editNotes').value
    }
  };
  await api.submitEditRequest(payload);
}

async function loadRouteData() {
  if (!userState.authenticated) return;
  if (currentRoute === 'dashboard') await loadDashboard();
  if (currentRoute === 'my-courses') await loadCourses();
  if (currentRoute === 'my-requests') await loadMyRequests();
  if (currentRoute === 'approvals') await loadApprovals();
}

async function loadDashboard() {
  const res = await api.getDashboard();
  viewData.dashboard = res.data || null;
  renderScreen();
}

async function loadCourses() {
  const filters = {
    search: document.getElementById('searchText')?.value || '',
    program: document.getElementById('programFilter')?.value || '',
    status: document.getElementById('statusFilter')?.value || ''
  };
  const res = await api.getMyCourses(filters);
  viewData.courses = (res.data && res.data.items) || [];
  renderScreen();
}

async function loadMyRequests() {
  const res = await api.getMyRequests();
  viewData.requests = (res.data && res.data.items) || [];
  renderScreen();
}

async function loadApprovals() {
  const res = await api.getApprovals();
  viewData.approvals = (res.data && res.data.items) || [];
  renderScreen();
}

function escapeAttr(value) {
  return String(value || '').replace(/"/g, '&quot;');
}

function escapeText(value) {
  return String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

render();
