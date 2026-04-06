import { api } from './api.js';
import { userState, setUserState, clearUserState, hydrateUserState } from './state.js';
import {
  initDataEngine,
  getStoreSnapshot,
  getCoursesForUser,
  getPermissionForUser,
  refreshCourse,
  createEditRequest,
  buildFilterOptions,
  loadEditRequests,
  loadReviewItems,
  reloadCourses,
  loadFinanceItems,
  loadFinanceArchiveItems,
  updateFinanceStatus,
  syncFinance
} from './data-engine.js';
import {
  COURSE_FIELDS,
  EXCEPTION_FIELDS,
  TAASIYEDA_DATA_CONTRACTS,
  getSessionProgress,
  hasCourseDelays,
  getExceptionTreatmentStatus,
  parseDelayInfo
} from './data-contracts.js';

const app = document.getElementById('app');
const APP_NAME = 'Dashboard Taasiyeda';
let currentRoute = 'login';
let mobileNavOpen = false;
const recentlyResolvedExceptions = new Set();

const viewState = {
  dashboard: { loading: false, error: '', data: null, timeframe: 'day' },
  courses: {
    loading: false,
    error: '',
    data: [],
    filters: { authority: '', school: '', courseManager: '', employee: '', monthStart: '', monthEnd: '' },
    filterOptions: { authority: [], school: [], courseManager: [], employee: [] },
    quickFilter: '',
    selectedInstructor: '',
    selectedCourseId: '',
    selectedCourseDetails: null
  },
  requests: { loading: false, error: '', data: [] },
  approvals: { loading: false, error: '', data: [] },
  eden: { loading: false, error: '', data: { queue: [], exceptions: [] }, filters: { type: '', instructor: '', authority: '', treatment: '' } },
  week: { loading: false, error: '', rangeStart: '', rangeEnd: '', filters: { authority: '', employee: '', courseManager: '' }, selected: null },
  month: { loading: false, error: '', monthDate: '', filters: { authority: '', employee: '', courseManager: '', program: '' }, selectedDate: '' },
  instructors: { loading: false, error: '', filters: { authority: '', courseManager: '', program: '' }, selectedInstructor: '' },
  endDates: { loading: false, error: '', filters: { authority: '', employee: '', courseManager: '', endFrom: '', endTo: '' } },
  assignments: { loading: false, error: '', filters: { authority: '', program: '' } },
  exceptions: { loading: false, error: '', filters: { authority: '', employee: '', courseManager: '', treatmentStatus: '' } }
  ,
  finance: {
    loading: false,
    error: '',
    tab: 'active',
    activeItems: [],
    archiveItems: [],
    selectedFinanceRowId: ''
  }
};

const roleMap = {
  admin: 'מנהל מערכת ראשי',
  'admin-ops': 'אחראית בקרה ותפעול',
  manager: 'מנהל פעילות',
  'manager-lead': 'מנהלת תחום',
  instructor: 'מדריך'
};

const routeLabels = {
  login: 'התחברות',
  dashboard: 'דשבורד פעילות ארצי',
  courses: 'פעילות / קורסים / סדנאות',
  'my-requests': 'הבקשות שלי',
  approvals: 'אישורי בקרה ותפעול',
  'eden-view': 'מסך עדן',
  'final-approvals': 'אישור סופי הנהלה',
  'instructor-view': 'תצוגת מדריכים',
  week: 'שבוע',
  month: 'חודש',
  instructors: 'מדריכים',
  'end-dates': 'תאריכי סיום',
  assignments: 'שיבוץ',
  exceptions: 'חריגות',
  finance: 'כספים'
};

const routeIcons = {
  dashboard: '▦',
  courses: '📘',
  'my-requests': '📝',
  approvals: '✅',
  'eden-view': '🧭',
  'final-approvals': '🏁',
  'instructor-view': '👤',
  week: '🗓️',
  month: '📅',
  instructors: '🧑‍🏫',
  'end-dates': '⏳',
  assignments: '📌',
  exceptions: '⚠️',
  finance: '💳',
  logout: '↩'
};

const COURSES_SCREEN_CONFIG = {
  progress: { successRatio: 0.9, warningRatio: 0.6 },
  meetingFields: { start: 1, end: 30, fallbackEndField: COURSE_FIELDS.END }
};

const TAASIYEDA_CONFIG = TAASIYEDA_DATA_CONTRACTS;
const COURSE_DATE_FIELDS = COURSE_FIELDS.DATE_FIELDS || [];
const COURSE_DATE_RANGE_FIELDS = [COURSE_FIELDS.START_DATE, COURSE_FIELDS.DATE];
const COURSE_END_RANGE_FIELDS = [COURSE_FIELDS.END_DATE, COURSE_FIELDS.END];
const INSTRUCTOR_FALLBACK_FIELD = TAASIYEDA_CONFIG.aliases?.instructorNameFallback || 'Instructor';
const EXCEPTION_TYPE_FALLBACK_FIELD = TAASIYEDA_CONFIG.aliases?.exceptionTypeFallback || 'IssueStatus';

function getCourseField(row, fieldName) {
  return row?.[fieldName];
}

function getExceptionField(row, fieldName) {
  return row?.[fieldName];
}

function role() { return String(userState.SystemRole || '').trim().toLowerCase(); }
function baseRole() { return String(userState.BaseRole || '').trim().toLowerCase(); }
function displayRole() {
  const permission = currentPermission();
  if (permission?.displayRole) return permission.displayRole;
  const display = String(userState.DisplayRole || '').trim();
  if (display) return display;
  return roleMap[role()] || roleMap[baseRole()] || 'ללא תפקיד מוגדר';
}
function isAuth() { return Boolean(userState.authenticated && userState.userId); }
function isIdan() {
  return role() === 'idan_main_admin'
    || (role() === 'admin' && String(userState.EditScope || '').trim().toUpperCase() === 'MAIN_DATA_DIRECT_EDIT');
}
function isEden() { return role() === 'admin-ops'; }
function isManager() { return ['manager', 'manager-lead', 'admin', 'admin-ops'].includes(role()); }
function isInstructor() { return role() === 'instructor'; }
function isDualMode() { return String(userState.IsDualMode || '').trim().toUpperCase() === 'BOTH'; }
function currentPermission() { return getPermissionForUser(userState); }
function canAccessEdenView() {
  const permission = currentPermission();
  if (permission) {
    const systemRole = String(permission.systemRole || '').trim().toLowerCase();
    const editScope = String(permission.editScope || '').trim().toUpperCase();
    return systemRole === 'admin-ops'
      || systemRole === 'idan_main_admin'
      || (systemRole === 'admin' && editScope === 'MAIN_DATA_DIRECT_EDIT');
  }
  return isEden() || isIdan();
}
function canAccessFinanceActive() {
  const permission = currentPermission();
  if (permission) return Boolean(permission.canAccessFinance);
  return Boolean(userState.CanAccessFinance);
}

function canEditFinanceActive() {
  const permission = currentPermission();
  if (permission) return Boolean(permission.canEditFinance);
  return Boolean(userState.CanEditFinance);
}

function canAccessFinanceArchive() {
  const permission = currentPermission();
  if (permission) return Boolean(permission.canAccessFinanceArchive);
  return Boolean(userState.CanAccessFinanceArchive);
}

function canEditFinanceArchive() {
  const permission = currentPermission();
  if (permission) return Boolean(permission.canEditFinanceArchive);
  return Boolean(userState.CanEditFinanceArchive);
}

function showToast(message, type = 'info', duration = 4000) {
  const el = document.createElement('div');
  const colors = {
    success: '#16A34A', error: '#DC2626',
    warning: '#D97706', info: '#2563EB'
  };
  el.style.cssText = [
    'position:fixed;bottom:24px;left:50%;transform:translateX(-50%)',
    'background:#1E293B;color:#fff;padding:12px 22px',
    'border-radius:10px;font-size:14px;z-index:9999',
    'border-right:4px solid ' + (colors[type] || colors.info),
    'box-shadow:0 4px 20px rgba(0,0,0,0.3)',
    'animation:toastIn 0.2s ease'
  ].join(';');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function closeMobileNav() {
  mobileNavOpen = false;
  document.body.classList.remove('nav-open');
  render();
  loadRouteData();
}

function toggleMobileNav(force) {
  mobileNavOpen = typeof force === 'boolean' ? force : !mobileNavOpen;
  document.body.classList.toggle('nav-open', mobileNavOpen);
  render();
  loadRouteData();
}

function setRoute(route) {
  if (!isAuth() && route !== 'login') currentRoute = 'login';
  else currentRoute = route;
  mobileNavOpen = false;
  document.body.classList.remove('nav-open');
  render();
  loadRouteData();
}

function render() {
  document.title = APP_NAME;
  if (!isAuth()) {
    app.innerHTML = `<section class="login-wrap"><div class="login-card">
    <div class="login-logo-slot"><img class="login-logo" src="./assets/logo.png" alt="לוגו המערכת" /></div>
    <h1 class="login-title">התחברות</h1>
    <p class="login-subtitle">${APP_NAME}</p>
    <form id="loginForm" novalidate>
      <input id="userId" class="login-input" placeholder="מזהה משתמש" aria-label="מזהה משתמש" autocomplete="username" />
      <input id="loginCode" class="login-input" type="password" placeholder="קוד כניסה" aria-label="קוד כניסה" autocomplete="current-password" />
      <button class="btn btn-primary login-btn" id="loginBtn" type="submit">התחבר</button>
    </form><p class="error" id="loginError"></p></div></section>`;
    document.getElementById('loginForm').addEventListener('submit', onLogin);
    document.getElementById('userId')
      ?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('loginCode')?.focus();
        }
      });
    document.getElementById('loginCode')
      ?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onLogin(e);
        }
      });
    return;
  }

  app.innerHTML = `<div class="layout">
    <button class="mobile-nav-toggle" id="mobileNavToggle" aria-label="פתיחת תפריט ניווט" aria-expanded="${mobileNavOpen ? 'true' : 'false'}">☰</button>
    <aside class="sidebar ${mobileNavOpen ? 'open' : ''}" id="sidebar"><div class="brand">${APP_NAME}</div>
    <div class="sidebar-user">${esc(userState.displayName || userState.userId)}</div>
    <div class="sidebar-role">${esc(displayRole())}</div><nav class="nav-list">
    ${nav('dashboard', 'דשבורד פעילות ארצי')}
    ${nav('courses', 'פעילות / קורסים / סדנאות')}
    ${nav('week', 'שבוע')}
    ${nav('month', 'חודש')}
    ${nav('instructors', 'מדריכים')}
    ${nav('end-dates', 'תאריכי סיום')}
    ${nav('assignments', 'שיבוץ')}
    ${nav('exceptions', 'חריגות')}
    ${(canAccessFinanceActive() || canAccessFinanceArchive()) ? nav('finance', 'כספים') : ''}
    ${nav('my-requests', 'הבקשות שלי')}
    ${isEden() ? nav('approvals', 'אישורי בקרה ותפעול') : ''}
    ${canAccessEdenView() ? nav('eden-view', 'מסך עדן') : ''}
    ${isIdan() ? nav('final-approvals', 'אישור סופי הנהלה') : ''}
    ${isInstructor() ? nav('instructor-view', 'תצוגת מדריכים') : ''}
    </nav><button class="nav-btn nav-btn-logout" data-route="logout"><span class="nav-icon" aria-hidden="true">${routeIcons.logout}</span><span>יציאה</span></button></aside>
    <button class="mobile-nav-backdrop ${mobileNavOpen ? 'show' : ''}" id="mobileNavBackdrop" aria-label="סגירת תפריט"></button>
    <main class="main" id="main"></main></div>`;

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


  document.getElementById('mobileNavToggle')?.addEventListener('click', () => toggleMobileNav());
  document.getElementById('mobileNavBackdrop')?.addEventListener('click', () => toggleMobileNav(false));

  renderScreen();
}

function nav(route, label) { return `<button class="nav-btn ${currentRoute === route ? 'active' : ''}" data-route="${route}"><span class="nav-icon" aria-hidden="true">${routeIcons[route] || '•'}</span><span>${label}</span></button>`; }
function head(title, sub) { return `<header class="screen-head"><div><h2>${title}</h2><p>${sub}</p></div></header>`; }

function getBusinessCourseName(row = {}) {
  return getCourseField(row, COURSE_FIELDS.PROGRAM)
    || getCourseField(row, COURSE_FIELDS.ACTIVITY)
    || 'שם קורס לא זמין';
}

function updateDocumentTitle() {
  const pageLabel = routeLabels[currentRoute] || routeLabels.dashboard;
  document.title = `${APP_NAME} | ${pageLabel}`;
}

function renderScreen() {
  const main = document.getElementById('main');
  if (!main) return;

  if (currentRoute === 'dashboard') {
    const d = viewState.dashboard.data || {};
    const actionItems = d.actionItems || [];
    main.innerHTML = head('דשבורד פעילות ארצי', 'כמה? איפה הבעיה? על מה פועלים עכשיו?') + panel(viewState.dashboard, 'אין נתונים.',
      `<section class="kpi-section">
        <h3>תמונת מצב עכשיו</h3>
        <div class="kpi-grid dashboard-kpi-grid">
          ${kpiCard('פעילויות פעילות', d.activeNowCount || 0, 'active_now')}
          ${kpiCard('פעילויות עם חריגה', d.exceptionCount || 0, 'exceptions')}
          ${kpiCard('פעילויות עם חוסר', d.missingDataCount || 0, 'missing_data')}
          ${kpiCard('פעילויות שמסתיימות בקרוב', d.endingSoonCount || 0, 'ending_soon')}
          ${kpiCard('מפגשים היום', d.todayActivitiesCount || 0, 'today')}
          ${kpiCard('בקשות פתוחות/ממתינות', d.openPendingRequestsCount || 0, 'open_requests')}
        </div>
      </section>
      <section class="panel-block">
        <div class="panel-block-head">
          <h3>מוקדי סיכון לטיפול מיידי</h3>
          <button class="btn btn-secondary" data-open-filter="needs_review">לכל המוקדים</button>
        </div>
        ${dashboardActionTable(actionItems)}
      </section>
      <section class="panel-block">
        <div class="panel-block-head">
          <h3>קיצורי דרך לפעולה</h3>
        </div>
        <div class="dashboard-shortcuts">
          <button class="btn btn-secondary" data-kpi-filter="needs_review">פתיחת קורסים דורשי טיפול</button>
          <button class="btn btn-secondary" data-shortcut-route="week">פתח שבוע נוכחי</button>
          <button class="btn btn-secondary" data-shortcut-route="month">ניהול חודש</button>
          <button class="btn btn-secondary" data-shortcut-route="instructors">סטטוס מדריכים</button>
          <button class="btn btn-secondary" data-shortcut-route="end-dates">תאריכי סיום</button>
          ${(canAccessFinanceActive() || canAccessFinanceArchive()) ? '<button class="btn btn-secondary" data-shortcut-route="finance">גבייה וכספים</button>' : ''}
        </div>
      </section>`);
    document.querySelectorAll('[data-kpi-filter]').forEach((button) => button.addEventListener('click', () => onKpiClick(button.dataset.kpiFilter)));
    document.querySelectorAll('[data-open-filter]').forEach((button) => button.addEventListener('click', () => onKpiClick(button.dataset.openFilter)));
    document.querySelectorAll('[data-shortcut-route]').forEach((button) => button.addEventListener('click', () => setRoute(button.dataset.shortcutRoute || 'courses')));
    return;
  }

  if (currentRoute === 'courses' || currentRoute === 'instructor-view') {
    const subtitle = isInstructor() ? 'רק קורסים שמשויכים אליך' : 'תצוגה עסקית לפי הרשאות המשתמש';
    const filteredCourses = applyCourseQuickFilter(viewState.courses.data);
    const selectedInstructor = viewState.courses.selectedInstructor;
    const instructorOverview = buildInstructorOverview(filteredCourses);
    const visibleCourses = currentRoute === 'instructor-view' && selectedInstructor
      ? filteredCourses.filter((row) => String(row?.Instructor || '').trim() === selectedInstructor)
      : filteredCourses;
    main.innerHTML = head(currentRoute === 'courses' ? 'קורסים' : 'תצוגת מדריכים', subtitle) +
    `<section class="filters-wrap courses-filters">
      <label>רשות<select id="authorityFilter">${renderSelectOptions(viewState.courses.filterOptions.authority, viewState.courses.filters.authority)}</select></label>
      <label>בית ספר<select id="schoolFilter">${renderSelectOptions(viewState.courses.filterOptions.school, viewState.courses.filters.school)}</select></label>
      <label>מנהל קורס<select id="courseManagerFilter">${renderSelectOptions(viewState.courses.filterOptions.courseManager, viewState.courses.filters.courseManager)}</select></label>
      <label>מדריך<select id="employeeFilter">${renderSelectOptions(viewState.courses.filterOptions.employee, viewState.courses.filters.employee)}</select></label>
      <label>מתאריך<input id="monthStartFilter" type="date" value="${escAttr(viewState.courses.filters.monthStart)}"></label>
      <label>עד תאריך<input id="monthEndFilter" type="date" value="${escAttr(viewState.courses.filters.monthEnd)}"></label>
      <div class="filter-actions">
        <button class="btn btn-secondary" id="filterCourses">סינון</button>
        <button class="btn btn-secondary" id="resetCourseFilters">נקה סינון</button>
      </div>
    </section>` +
    panel(viewState.courses, 'אין רשומות.', `${currentRoute === 'instructor-view' ? renderInstructorCards(instructorOverview, selectedInstructor) : ''}
    ${selectedInstructor ? `<section class="instructor-details-head"><span>מדריך</span><strong>${esc(selectedInstructor)}</strong><button class="btn btn-secondary" id="clearInstructorDetails">חזרה לכל המדריכים</button></section>` : ''}
    ${renderCourseCards(visibleCourses, { canEdit: false })}`) +
    renderCourseDetailsPanel(viewState.courses.selectedCourseDetails, { canEdit: false });
    document.getElementById('filterCourses')?.addEventListener('click', () => {
      viewState.courses.quickFilter = '';
      viewState.courses.selectedInstructor = '';
      viewState.courses.filters = {
        authority: document.getElementById('authorityFilter')?.value.trim() || '',
        school: document.getElementById('schoolFilter')?.value.trim() || '',
        courseManager: document.getElementById('courseManagerFilter')?.value.trim() || '',
        employee: document.getElementById('employeeFilter')?.value.trim() || '',
        monthStart: document.getElementById('monthStartFilter')?.value.trim() || '',
        monthEnd: document.getElementById('monthEndFilter')?.value.trim() || ''
      };
      loadCourses();
    });
    document.getElementById('resetCourseFilters')?.addEventListener('click', () => {
      viewState.courses.quickFilter = '';
      viewState.courses.selectedInstructor = '';
      viewState.courses.filters = { authority: '', school: '', courseManager: '', employee: '', monthStart: '', monthEnd: '' };
      loadCourses();
    });
    document.getElementById('clearInstructorDetails')?.addEventListener('click', () => {
      viewState.courses.selectedInstructor = '';
      renderScreen();
    });
    bindInstructorCards();
    bindCourseActions();
    return;
  }

  if (currentRoute === 'week') {
    const weekCourses = getRoleScopedCourses(viewState.week.filters);
    const weekData = buildWeeklyBuckets(weekCourses, viewState.week.rangeStart);
    main.innerHTML = head('שבוע', 'תמונת מצב שבועית תפעולית') +
      renderWeekFilters() +
      panel({ loading: viewState.week.loading, error: viewState.week.error, data: weekData.days }, 'אין מפגשים לשבוע זה.', renderWeekGrid(weekData.days)) +
      renderWeekDetails(viewState.week.selected);
    bindWeekActions(weekData);
    return;
  }

  if (currentRoute === 'month') {
    const monthCourses = getRoleScopedCourses(viewState.month.filters);
    const monthData = buildMonthlyCalendar(monthCourses, viewState.month.monthDate);
    main.innerHTML = head('חודש', 'מבט חודשי על סטטוס פעילויות') +
      renderMonthFilters() +
      panel({ loading: viewState.month.loading, error: viewState.month.error, data: monthData.days }, 'אין נתונים לחודש שנבחר.', renderMonthGrid(monthData.days)) +
      renderMonthDayDetails(monthData.selectedItems, viewState.month.selectedDate);
    bindMonthActions(monthData);
    return;
  }

  if (currentRoute === 'instructors') {
    const instructorsData = buildInstructorsViewData(getRoleScopedCourses(viewState.instructors.filters));
    main.innerHTML = head('מדריכים', 'סטטוס, חריגות ופעילות לפי מדריך') +
      renderInstructorsFilters() +
      panel({ loading: viewState.instructors.loading, error: viewState.instructors.error, data: instructorsData.items }, 'אין מדריכים להצגה.', renderInstructorsCards(instructorsData.items)) +
      renderInstructorCoursesDetails(viewState.instructors.selectedInstructor, instructorsData.coursesByInstructor);
    bindInstructorsActions();
    return;
  }

  if (currentRoute === 'end-dates') {
    const endDateItems = buildEndDateItems(getCoursesForUser(userState, viewState.endDates.filters));
    main.innerHTML = head('תאריכי סיום', 'בקרת קורסים לקראת סיום') +
      renderEndDatesFilters() +
      panel({ loading: viewState.endDates.loading, error: viewState.endDates.error, data: endDateItems }, 'אין קורסים בטווח הסיום שנבחר.', renderEndDateCards(endDateItems));
    bindEndDatesActions();
    return;
  }

  if (currentRoute === 'assignments') {
    const assignmentRows = buildAssignmentsRows(getRoleScopedCourses(viewState.assignments.filters));
    main.innerHTML = head('שיבוץ', 'תצפית סטטוס לשיבוץ (ללא כתיבה)') +
      renderAssignmentsFilters() +
      panel({ loading: viewState.assignments.loading, error: viewState.assignments.error, data: assignmentRows }, 'אין נתוני שיבוץ להצגה.', renderAssignmentsTable(assignmentRows));
    bindAssignmentsActions();
    return;
  }

  if (currentRoute === 'exceptions') {
    const exceptionRows = buildExceptionsRows(getStoreSnapshot().reviewItems || [], getRoleScopedCourses({}), viewState.exceptions.filters);
    main.innerHTML = head('חריגות', 'רק חוסרים מהותיים בקורסים') +
      renderExceptionsFilters() +
      panel({ loading: viewState.exceptions.loading, error: viewState.exceptions.error, data: exceptionRows }, 'אין חריגות להצגה.', renderExceptionsCards(exceptionRows));
    bindExceptionsActions();
    return;
  }

  if (currentRoute === 'finance') {
    if (!canAccessFinanceActive() && !canAccessFinanceArchive()) {
      main.innerHTML = head('כספים', 'גישה מותנית הרשאות') + '<section class="panel-state error"><span class="panel-state-icon">⛔</span><span>אין הרשאה למסך כספים.</span></section>';
      return;
    }
    const canActive = canAccessFinanceActive();
    const canArchive = canAccessFinanceArchive();
    const showActive = viewState.finance.tab !== 'archive';
    const rows = showActive ? viewState.finance.activeItems : viewState.finance.archiveItems;
    const canEdit = showActive ? canEditFinanceActive() : canEditFinanceArchive();
    const financeSummary = summarizeFinanceBuckets(rows);
    const emptyFinanceMessage = showActive
      ? 'אין נתוני גבייה פעילה להצגה. אם ציפית לנתונים, בדוק הרשאות או רענן FINANCE.'
      : 'אין נתוני ארכיון להצגה כרגע.';

    main.innerHTML = head('כספים', 'ניהול סל גבייה פעיל וארכיון') +
      `<section class="finance-toolbar">
        <div class="finance-tabs">
          ${canActive ? `<button class="btn ${showActive ? 'btn-primary' : 'btn-secondary'}" data-finance-tab="active">גבייה פעילה</button>` : ''}
          ${canArchive ? `<button class="btn ${!showActive ? 'btn-primary' : 'btn-secondary'}" data-finance-tab="archive">ארכיון גבייה</button>` : ''}
        </div>
        <div class="finance-toolbar-actions">
          ${showActive ? '<button class="btn btn-secondary" id="financeExportBtn">ייצוא לאקסל</button>' : ''}
          ${showActive && canEditFinanceActive() ? '<button class="btn btn-primary" id="financeSyncBtn">רענן FINANCE</button>' : ''}
        </div>
      </section>
      <section class="kpi-grid finance-kpi-grid">
        <article class="kpi-card"><span class="kpi-title">פתוח</span><span class="kpi-value">${financeSummary.open}</span></article>
        <article class="kpi-card"><span class="kpi-title">בטיפול</span><span class="kpi-value">${financeSummary.inProgress}</span></article>
        <article class="kpi-card"><span class="kpi-title">הושלם</span><span class="kpi-value">${financeSummary.completed}</span></article>
        <article class="kpi-card"><span class="kpi-title">דורש פעולה</span><span class="kpi-value">${financeSummary.needsAction}</span></article>
      </section>` +
      panel({ loading: viewState.finance.loading, error: viewState.finance.error, data: rows }, emptyFinanceMessage, renderFinanceCards(rows, { showArchive: !showActive, canEdit })) +
      renderFinanceDetailsPanel(rows.find((item) => String(item?.FinanceRowID || '') === viewState.finance.selectedFinanceRowId) || null);

    document.querySelectorAll('[data-finance-tab]').forEach((button) => button.addEventListener('click', () => {
      viewState.finance.tab = button.dataset.financeTab || 'active';
      viewState.finance.selectedFinanceRowId = '';
      renderScreen();
      loadRouteData();
    }));

    document.getElementById('financeSyncBtn')?.addEventListener('click', async () => {
      const result = await syncFinance();
      showToast(
        result?.success
          ? 'FINANCE עודכן בהצלחה'
          : (result?.message || 'עדכון FINANCE נכשל'),
        result?.success ? 'success' : 'error'
      );
      await loadFinanceView({ silent: true, force: true });
    });
    document.getElementById('financeExportBtn')?.addEventListener('click', () => {
      const fileName = `כספים_${formatIsoDateLocal(new Date())}.xlsx`;
      exportFinanceToExcel(rows, fileName);
    });

    document.querySelectorAll('[data-finance-status]').forEach((select) => select.addEventListener('change', async (event) => {
      const financeRowId = event.target.dataset.financeRowId || '';
      const status = event.target.value || '';
      const sheetName = event.target.dataset.financeSheet || 'FINANCE';
      const result = await updateFinanceStatus(financeRowId, status, { sheetName });
      if (!result?.success) {
        viewState.finance.error = result?.message || 'עדכון סטטוס נכשל.';
      }
      await loadFinanceView({ silent: true, force: true });
    }));

    document.querySelectorAll('[data-finance-open]').forEach((button) => button.addEventListener('click', () => {
      viewState.finance.selectedFinanceRowId = button.dataset.financeOpen || '';
      renderScreen();
    }));
    document.querySelectorAll('[data-finance-note-save]').forEach((button) => button.addEventListener('click', async () => {
      const financeRowId = button.dataset.financeRowId || '';
      const noteInput = document.querySelector(`[data-finance-note-input="${cssEscape(financeRowId)}"]`);
      const statusSelect = document.querySelector(`[data-finance-status="1"][data-finance-row-id="${cssEscape(financeRowId)}"]`);
      const status = statusSelect?.value || 'ממתין';
      const statusNote = noteInput?.value.trim() || '';
      if (!financeRowId || !statusNote) {
        showToast('יש להזין הערה לפני שמירה.', 'warning');
        return;
      }
      const result = await updateFinanceStatus(financeRowId, status, {
        sheetName: showActive ? 'FINANCE' : 'FINANCE_ARCHIVE',
        statusNote
      });
      if (!result?.success) {
        showToast(result?.message || 'שמירת הערה נכשלה.', 'error');
        return;
      }
      showToast('הערה נשמרה בהצלחה.', 'success');
      await loadFinanceView({ silent: true, force: true });
    }));
    return;
  }

  if (currentRoute === 'my-requests') {
    main.innerHTML = head('הבקשות שלי', 'טיוטות, סטטוסים והערות') + panel(viewState.requests, 'אין בקשות.',
      table(viewState.requests.data, [['CourseLabel','קורס'],['ChangeSummary','תקציר'],['ApprovalStatus','סטטוס'],['ApprovalNotes','הערות']], false));
    return;
  }

  if (currentRoute === 'approvals' || currentRoute === 'final-approvals') {
    const title = currentRoute === 'approvals' ? 'אישורי בקרה ותפעול' : 'אישור סופי';
    main.innerHTML = head(title, 'השוואה בין מקור לשינוי לפני החלטה') + panel(viewState.approvals, 'אין בקשות.',
      table(viewState.approvals.data, [['CourseLabel','קורס'],['ChangeSummary','תקציר'],['OriginalDataView','מקור'],['RequestedDataView','שינוי']], false, true));
    bindApprovalButtons();
    return;
  }

  if (currentRoute === 'eden-view') {
    const exceptions = applyExceptionFilters(viewState.eden.data.exceptions || []);
    main.innerHTML = head('מסך עדן', 'עבודה על שורת קורס מלאה לפני אישור סופי') +
    `<section class="filters-wrap"><label>סוג בעיה<input id="issueTypeFilter" value="${escAttr(viewState.eden.filters.type)}"></label>
    <label>מדריך<input id="issueInstructorFilter" value="${escAttr(viewState.eden.filters.instructor)}"></label>
    <label>רשות<input id="issueAuthorityFilter" value="${escAttr(viewState.eden.filters.authority)}"></label>
    <label>סטטוס טיפול<input id="issueTreatmentFilter" value="${escAttr(viewState.eden.filters.treatment)}"></label>
    <button class="btn btn-secondary" id="filterIssues">סינון</button></section>` +
    panel(viewState.eden, 'אין חריגות פתוחות.', `${renderExceptionCards(exceptions)}
    ${renderEdenQueue(viewState.eden.data.queue || [])}`);
    document.getElementById('filterIssues')?.addEventListener('click', () => {
      viewState.eden.filters = {
        type: document.getElementById('issueTypeFilter')?.value.trim() || '',
        instructor: document.getElementById('issueInstructorFilter')?.value.trim() || '',
        authority: document.getElementById('issueAuthorityFilter')?.value.trim() || '',
        treatment: document.getElementById('issueTreatmentFilter')?.value.trim() || ''
      };
      renderScreen();
    });
    bindEdenActions();
    bindExceptionActions();
  }
  enforceDatePickerInputs();
}

function enforceDatePickerInputs() {
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    input.setAttribute('readonly', 'readonly');
    input.addEventListener('focus', () => input.showPicker?.());
    input.addEventListener('click', () => input.showPicker?.());
  });
}

function panel(state, empty, content) {
  if (state.loading) return '<section class="panel-state"><span class="panel-state-icon">⏳</span><span>טוען נתונים...</span></section>';
  if (state.error) return `<section class="panel-state error"><span class="panel-state-icon">⚠</span><span>${esc(state.error)}</span></section>`;
  const hasRows = Array.isArray(state.data) ? state.data.length : state.data;
  return hasRows ? content : `<section class="panel-state"><span class="panel-state-icon">ℹ</span><span>${esc(empty || 'אין נתונים לתצוגה')}</span></section>`;
}

function kpiCard(title, value, filterName, helper = '') {
  return `<button class="kpi-card kpi-action" data-kpi-filter="${filterName}" type="button"><span class="kpi-title" title="${escAttr(title)}">${title}</span><span class="kpi-value">${value}</span>${helper ? `<span class="kpi-helper" title="${escAttr(helper)}">${helper}</span>` : ''}</button>`;
}

const LONG_DETAILS_FIELDS = new Set(['OriginalDataView', 'RequestedDataView']);
const WRAP_TABLE_FIELDS = new Set(['ChangeSummary', 'ApprovalNotes', 'Notes']);
const LIST_VALUE_FIELDS = new Set(['SchoolsList', 'ProgramsList', 'CoursesList', 'SourceSheets']);

function parseListValue(value) {
  return String(value || '')
    .split(/[\n,|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderListChips(value, limit = 3) {
  const list = parseListValue(value);
  if (!list.length) return '<span class="list-chip list-chip-empty">-</span>';
  const hiddenCount = Math.max(list.length - limit, 0);
  const chips = list.slice(0, limit).map((item) => `<span class="list-chip">${esc(item)}</span>`).join('');
  return `<span class="list-chips" title="${escAttr(list.join(', '))}">${chips}${hiddenCount ? `<span class="list-chip list-chip-more">+${hiddenCount} עוד</span>` : ''}</span>`;
}

function renderCellContent(fieldKey, rawValue) {
  const value = String(rawValue ?? '');
  if (LONG_DETAILS_FIELDS.has(fieldKey)) {
    const preview = value ? value.slice(0, 60) : '-';
    return `<details class="cell-details"><summary title="${escAttr(value || '-')}">הצג: ${esc(preview)}${value.length > 60 ? '…' : ''}</summary><pre>${esc(value || '-')}</pre></details>`;
  }
  if (LIST_VALUE_FIELDS.has(fieldKey)) {
    return renderListChips(value);
  }
  return `<span class="cell-ellipsis">${esc(value)}</span>`;
}

function renderEdenQueue(queue = []) {
  const rows = queue || [];
  if (!rows.length) return '<section class="panel-block"><div class="panel-empty">אין בקשות ממתינות במסך עדן.</div></section>';
  const coursesById = new Map((getStoreSnapshot().courses || []).map((course) => [String(course.CourseID || ''), course]));
  return `<section class="panel-block"><div class="panel-block-head"><h3>תור עבודה עדן</h3></div>
    ${rows.map((row) => {
      const course = coursesById.get(String(row.CourseID || '')) || {};
      const fullRow = { ...course, ...safeParseJson(row.RequestedData) };
      const fullRowEntries = Object.entries(fullRow).filter(([key]) => !String(key).startsWith('_'));
      return `<article class="management-card">
        <div class="card-head">
          <h3>${esc(getBusinessCourseName(course))}</h3>
          <span class="status-chip ${statusClass(row.ApprovalStatus)}">${statusLabel(row.ApprovalStatus)}</span>
        </div>
        <div class="card-meta"><span>תקציר: ${esc(row.ChangeSummary || '-')}</span><span>מבקש: ${esc(row.RequestedBy || '-')}</span><span>רשות: ${esc(course?.Authority || '-')}</span><span>בית ספר: ${esc(course?.School || '-')}</span></div>
        <details><summary>פרטים לעדכון</summary>
          <div class="table-wrap compact-table"><table><tbody>
          ${fullRowEntries
            .filter(([key]) => !['CourseID', 'ProgramCode', 'ReviewRequired', 'RequiresReview'].includes(String(key)))
            .map(([key, value]) => `<tr><th>${esc(key)}</th><td>${esc(String(value ?? '-'))}</td></tr>`).join('')}
          </tbody></table></div>
        </details>
        <div class="card-actions">
          <button class="btn btn-secondary" data-eden-edit="${escAttr(row.RequestID || '')}">עדכון בקשה</button>
          <button class="btn btn-primary" data-eden-submit="${escAttr(row.RequestID || '')}">העבר לאישור סופי</button>
        </div>
      </article>`;
    }).join('')}
  </section>`;
}

function table(rows, cols, canEdit, canApprove) {
  const body = (rows || []).map((r, i) => `<tr>${cols.map((c) => {
    const fieldKey = c[0];
    const rawValue = r[fieldKey];
    const textValue = String(rawValue ?? '');
    const tdClass = WRAP_TABLE_FIELDS.has(fieldKey) ? 'cell-wrap' : '';
    if (fieldKey === 'ApprovalStatus') return `<td class="${tdClass}" title="${escAttr(textValue || '-')}"><span class="status-chip ${statusClass(rawValue)}">${statusLabel(rawValue)}</span></td>`;
    return `<td class="${tdClass}" title="${escAttr(textValue || '-')}">${renderCellContent(fieldKey, rawValue)}</td>`;
  }).join('')}<td>${canEdit ? `<button class="btn btn-secondary" data-edit-row="${i}">בקשת שינוי</button>` : canApprove ? `<button class="btn btn-primary" data-approve-row="${i}">אשר</button> <button class="btn btn-secondary" data-reject-row="${i}">דחה</button>` : ''}</td></tr>`).join('');
  return `<section class="table-wrap"><table><thead><tr>${cols.map((c) => `<th>${c[1]}</th>`).join('')}<th>פעולה</th></tr></thead><tbody>${body}</tbody></table></section>`;
}

function renderSelectOptions(options = [], selected = '') {
  const initial = '<option value="">הכל</option>';
  const body = options.map((option) => `<option value="${escAttr(option)}" ${option === selected ? 'selected' : ''}>${esc(option)}</option>`).join('');
  return `${initial}${body}`;
}

function renderFinanceCards(rows, options = {}) {
  const list = sortFinanceRowsByStatus(Array.isArray(rows) ? rows : []);
  if (!list.length) return '<section class="panel-empty">לא נמצאו רשומות כספים.</section>';
  const showArchive = Boolean(options.showArchive);
  const canEdit = Boolean(options.canEdit);
  return `<section class="cards-grid finance-grid">${list.map((item) => {
    const financeRowId = String(item?.FinanceRowID || '');
    const billingKey = String(item?.BillingGroupKey || '-');
    const status = String(item?.FinanceStatus || 'ממתין');
    const sourceSheet = showArchive ? 'FINANCE_ARCHIVE' : 'FINANCE';
    const statusBucket = getFinanceStatusBucket(status);
    return `<article class="management-card finance-card finance-${escAttr(statusBucket.key)}">
      <header class="card-head">
        <div>
          <h3>${esc(item?.ProgramsList || item?.BillingGroupType || 'פריט כספי')}</h3>
          <p class="card-subtitle">${esc(item?.Authority || '-')} · ${esc(item?.SchoolsList || '-')}</p>
        </div>
        <span class="status-chip ${statusClass(status)}">${esc(status)}</span>
      </header>
      <div class="course-core-grid">
        <div class="course-core-col">
          <span><strong>תאריך סיום:</strong> ${esc(formatDate(parseDateLike(item?.End)) || String(item?.End || '-'))}</span>
          <span><strong>רשות:</strong> ${esc(item?.Authority || '-')}</span>
          <span><strong>בית ספר:</strong> ${esc(item?.SchoolsList || '-')}</span>
        </div>
      </div>
      <footer class="card-actions">
        <button class="btn btn-secondary" data-finance-open="${escAttr(financeRowId)}">פרטים</button>
        ${canEdit ? `<label class=\"finance-status-edit\">סטטוס
          <select data-finance-status=\"1\" data-finance-row-id=\"${escAttr(financeRowId)}\" data-finance-sheet=\"${sourceSheet}\">
            ${renderStatusOption('ממתין', status)}
            ${renderStatusOption('במעקב', status)}
            ${renderStatusOption('בוצע-גביה', status)}
          </select>
        </label>
        <div class="finance-note-editor">
          <input data-finance-note-input="${escAttr(financeRowId)}" placeholder="הערות" value="${escAttr(item?.Notes || '')}" />
          <button class="btn btn-secondary" type="button" data-finance-note-save="1" data-finance-row-id="${escAttr(financeRowId)}">שמור הערה</button>
        </div>` : ''}
      </footer>
    </article>`;
  }).join('')}</section>`;
}

function sortFinanceRowsByStatus(rows = []) {
  const order = { open: 0, 'needs-action': 1, 'in-progress': 2, completed: 3 };
  return [...rows].sort((a, b) => {
    const aBucket = getFinanceStatusBucket(a?.FinanceStatus).key;
    const bBucket = getFinanceStatusBucket(b?.FinanceStatus).key;
    const delta = (order[aBucket] ?? 99) - (order[bBucket] ?? 99);
    if (delta !== 0) return delta;
    const aDate = parseDateLike(a?.End)?.getTime() || 0;
    const bDate = parseDateLike(b?.End)?.getTime() || 0;
    return aDate - bDate;
  });
}

function renderStatusOption(value, selected) {
  return `<option value="${escAttr(value)}" ${value === selected ? 'selected' : ''}>${value}</option>`;
}

function renderFinanceDetailsPanel(item) {
  if (!item) return '';
  return `<section class="details-panel">
    <header><h3>פרטי סל גבייה</h3></header>
    <div class="details-grid">
      <div><span>קורסים</span><strong>${renderListChips(item.CoursesList)}</strong></div>
      <div><span>רשות</span><strong>${esc(item.Authority || '-')}</strong></div>
      <div><span>בית ספר</span><strong>${renderListChips(item.SchoolsList)}</strong></div>
      <div><span>סטטוס</span><strong>${esc(item.FinanceStatus || '-')}</strong></div>
      <div><span>הערות</span><strong class="details-text" title="${escAttr(item.Notes || '-')}">${esc(item.Notes || '-')}</strong></div>
      <div><span>סך לתשלום</span><strong>₪ ${esc(numberFrom(item?.PaymentTotal).toLocaleString('he-IL'))}</strong></div>
      <div><span>מפגשים בפועל</span><strong>${esc(numberFrom(item?.ActualMeetingsTotal).toLocaleString('he-IL'))}</strong></div>
      <div><span>מפגשים מתוכננים</span><strong>${esc(numberFrom(item?.PlannedMeetingsTotal).toLocaleString('he-IL'))}</strong></div>
    </div>
  </section>`;
}

function renderInfoRow(label, value) {
  if (!String(value || '').trim()) return '';
  return `<span><strong>${esc(label)}:</strong> ${esc(value)}</span>`;
}

function buildCourseHierarchyDetails(row = {}) {
  const progress = getSessionProgress(row);
  const actual = progress.actualMeetings;
  const planned = progress.plannedMeetings;
  return {
    instructor: resolveInstructorName(row),
    programActivity: getCourseField(row, COURSE_FIELDS.PROGRAM) || getCourseField(row, COURSE_FIELDS.ACTIVITY),
    school: getCourseField(row, COURSE_FIELDS.SCHOOL),
    authority: getCourseField(row, COURSE_FIELDS.AUTHORITY),
    meetingProgressLabel: `מפגש ${Math.min(actual, planned || actual || 0)} מתוך ${planned || 0}`,
    endDate: formatDate(parseDateLike(getCourseField(row, COURSE_FIELDS.END))) || '',
    dayName: getCourseField(row, COURSE_FIELDS.DAY_NAME || 'DayName'),
    timeLabel: `${formatTimeValue(getCourseField(row, COURSE_FIELDS.START_TIME))}-${formatTimeValue(getCourseField(row, COURSE_FIELDS.END_TIME))}`
  };
}

function renderCourseHierarchyStrip(row = {}) {
  const hierarchy = buildCourseHierarchyDetails(row);
  const segments = [
    hierarchy.instructor && `<span><strong>מדריך:</strong> ${esc(hierarchy.instructor)}</span>`,
    hierarchy.programActivity && `<span><strong>קורס/פעילות:</strong> ${esc(hierarchy.programActivity)}</span>`,
    hierarchy.school && `<span><strong>בית ספר:</strong> ${esc(hierarchy.school)}</span>`,
    hierarchy.authority && `<span><strong>רשות:</strong> ${esc(hierarchy.authority)}</span>`,
    `<span><strong>${esc(hierarchy.meetingProgressLabel)}</strong></span>`,
    hierarchy.endDate && `<span><strong>סיום:</strong> ${esc(hierarchy.endDate)}</span>`
  ].filter(Boolean);
  return `<div class="course-hierarchy-strip">${segments.join('')}</div>`;
}

function renderCourseSecondaryDetails(row = {}) {
  const notes = String(getCourseField(row, COURSE_FIELDS.NOTES) || '').trim();
  const classGroup = String(getCourseField(row, COURSE_FIELDS.CLASS_GROUP || 'ClassGroup') || '').trim();
  const details = [];
  if (classGroup) details.push(`<span><strong>קבוצה:</strong> ${esc(classGroup)}</span>`);
  if (notes) details.push(`<span><strong>הערות:</strong> ${esc(notes)}</span>`);
  if (!details.length) return '';
  return `<details class="course-secondary-details"><summary>מידע משני</summary><div class="card-meta">${details.join('')}</div></details>`;
}

function renderCourseCards(rows, options = {}) {
  if (!rows.length) return '<section class="panel-empty">לא נמצאו פעילויות לפי הסינון.</section>';
  return `<section class="cards-grid">${rows.map((row) => {
    const issueText = summarizeIssue(row);
    const progress = courseProgress(row);
    const hierarchy = buildCourseHierarchyDetails(row);
    const issueFlag = hasException(row) || isMissingReport(row) || !hasInstructor(row);
    return `<article class="management-card">
      <header class="card-head">
        <div>
          <h3>${esc(hierarchy.instructor || 'טרם שויך')}</h3>
          <p class="card-subtitle">${esc(hierarchy.programActivity || 'שם קורס לא זמין')}</p>
        </div>
        <div class="card-status">${renderStatusBadge(row)}${renderIssueBadge(row)}</div>
      </header>
      ${renderCourseHierarchyStrip(row)}
      <div class="course-core-grid">
        <div class="course-core-col">
          <span><strong>מנהל קורס:</strong> ${esc(row.CourseManager || '-')}</span>
          <span><strong>מנהל מדריכים:</strong> ${esc(row.InstructorManager || '-')}</span>
        </div>
        <div class="course-core-col">
          ${renderInfoRow('יום', hierarchy.dayName)}
          ${renderInfoRow('שעות', hierarchy.timeLabel)}
        </div>
        <div class="course-core-col">
          ${renderInfoRow('מפגשים', hierarchy.meetingProgressLabel)}
          <div class="progress-mini">
            <div class="progress-mini-fill ${progress.level}" style="width:${progress.percent}%"></div>
          </div>
          <span class="meta-small">${esc(hierarchy.meetingProgressLabel)}</span>
        </div>
      </div>
      <div class="card-issue ${issueFlag ? 'has-issue' : ''}">
        <strong>מה חסר:</strong> ${esc(issueText)}
      </div>
      ${renderCourseSecondaryDetails(row)}
      <footer class="card-actions">
        <button class="btn btn-secondary" data-open-course="${escAttr(row[COURSE_FIELDS.COURSE_ID] || '')}">פרטים</button>
        <button class="btn btn-primary" data-edit-row="${escAttr(row[COURSE_FIELDS.COURSE_ID] || '')}">שלח בקשת שינוי</button>
      </footer>
    </article>`;
  }).join('')}</section>`;
}

function renderInstructorCards(rows, selectedInstructor) {
  if (!rows.length) return '<section class="panel-empty">אין נתוני מדריכים זמינים.</section>';
  return `<section class="cards-grid instructor-grid">${rows.map((row) => {
    return `<article class="management-card instructor-card ${selectedInstructor === row.instructor ? 'active' : ''}">
      <header class="card-head">
        <h3>${esc(row.instructor)}</h3>
        ${renderInstructorState(row)}
      </header>
      <div class="card-meta">
        <span>📚 פעילויות: ${esc(row.coursesCount)}</span>
        <span>🏛️ רשויות: ${esc(row.authorities.join(', ') || '-')}</span>
        <span>🏫 בתי ספר: ${esc(row.schools.join(', ') || '-')}</span>
        <span>🧩 סטטוס: ${row.hasGap ? 'דורש טיפול' : 'תקין'}</span>
      </div>
      <footer class="card-actions"><button class="btn btn-secondary" data-instructor-details="${escAttr(row.instructor)}">פרטי מדריך</button></footer>
    </article>`;
  }).join('')}</section>`;
}

function renderExceptionCards(rows) {
  if (!rows.length) return '<section class="panel-empty">לא נמצאו חריגות בהתאם לסינון.</section>';
  return `<section class="cards-grid">${rows.map((row) => `<article class="management-card exception-card">
    <div class="card-head"><h3>${esc(row.Program || 'שם קורס לא זמין')}</h3><span class="status-chip status-declined">פתוח</span></div>
    <div class="card-meta"><span>בית ספר: ${esc(row.School || '-')}</span><span>רשות: ${esc(row.Authority || '-')}</span></div>
    <details class="course-secondary-details"><summary>פרטים</summary><div class="card-meta"><span>מה חסר בפועל: ${esc((row.MissingTypes || []).join(' / ') || '-')}</span><span>מדריך: ${esc(row.Employee || 'לא משויך')}</span><span>מנהל קורס: ${esc(row.CourseManager || '-')}</span></div><div class="card-actions"><button class="btn btn-secondary" data-open-course="${escAttr(row.CourseID || '')}">פרטי קורס</button><button class="btn btn-primary" data-edit-row="${escAttr(row.CourseID || '')}">שלח בקשת שינוי</button></div></details>
  </article>`).join('')}</section>`;
}

function dashboardOperationalTable(rows) {
  if (!rows.length) return '<div class="panel-empty">אין פעילויות בטווח הזמן שנבחר.</div>';
  const body = rows.slice(0, 8).map((row) => `<tr>
    <td>${esc(row.Activity || row.Program || '')}</td>
    <td>${esc(resolveInstructorName(row) || 'לא משויך')}</td>
    <td>${esc(joinLocation(row))}</td>
    <td>${esc(formatSchedule(row))}</td>
    <td>${esc(row.Status || row.OperationalStatus || '')}</td>
    <td>${renderIssueBadge(row)}</td>
  </tr>`).join('');
  return `<div class="table-wrap compact-table"><table><thead><tr><th>פעילות</th><th>מי מלמד</th><th>איפה</th><th>מתי</th><th>סטטוס</th><th>מצב טיפול</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function dashboardInstructorTable(rows) {
  if (!rows.length) return '<div class="panel-empty">אין נתוני מדריכים זמינים.</div>';
  const body = rows.slice(0, 8).map((row) => `<tr>
    <td>${esc(row.instructor || 'לא משויך')}</td>
    <td>${esc(String(row.coursesCount || 0))}</td>
    <td>${esc(row.authorities.join(', ') || '-')}</td>
    <td>${esc(row.schools.join(', ') || '-')}</td>
    <td>${renderInstructorState(row)}</td>
  </tr>`).join('');
  return `<div class="table-wrap compact-table"><table><thead><tr><th>מדריך</th><th>כמות קורסים</th><th>רשויות</th><th>בתי ספר</th><th>סטטוס</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function dashboardActionTable(rows) {
  if (!rows.length) return '<div class="panel-empty">אין משימות טיפול פתוחות כרגע.</div>';
  const body = rows.slice(0, 8).map((row) => `<tr>
    <td>${esc(row.type)}</td>
    <td>${esc(row.activity)}</td>
    <td>${esc(row.instructor || 'לא משויך')}</td>
    <td>${esc(row.location || '-')}</td>
    <td><button class="btn btn-secondary" data-kpi-filter="${escAttr(row.filter)}">פתיחה</button></td>
  </tr>`).join('');
  return `<div class="table-wrap compact-table"><table><thead><tr><th>סוג משימה</th><th>פעילות</th><th>מדריך</th><th>מיקום</th><th>פעולה</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function courseColumns(isInstructorView) {
  if (isInstructorView) {
    return [['Employee', 'מדריך'], ['InstructorManager', 'מנהל מדריכים'], ['Activity', 'פעילות'], ['Program', 'קורס'], ['Authority', 'רשות'], ['School', 'בית ספר'], ['Location', 'מיקום'], ['ClassGroup', 'קבוצה'], ['PlannedMeetings', 'מתוכנן'], ['ActualMeetings', 'בוצע'], ['SourceActualMeetings', 'מקור ביצוע']];
  }
  return [['Activity', 'פעילות / קורס / סדנה'], ['Program', 'תוכנית'], ['Employee', 'מי מלמד'], ['CourseManager', 'מנהל קורס'], ['InstructorManager', 'מנהל מדריכים'], ['Authority', 'רשות'], ['School', 'בית ספר'], ['Location', 'מיקום'], ['DayName', 'יום'], ['StartTime', 'שעת התחלה'], ['EndTime', 'שעת סיום'], ['End', 'סיום מחזור'], ['PlannedMeetings', 'מפגשים מתוכננים'], ['ActualMeetings', 'מפגשים שבוצעו'], ['SourceActualMeetings', 'מקור ביצוע'], ['Notes', 'הערות']];
}

function onKpiClick(filterName) {
  if (filterName === 'open_requests') {
    setRoute('my-requests');
    return;
  }
  viewState.courses.quickFilter = filterName;
  viewState.courses.filters = { authority: '', school: '', courseManager: '', employee: '', monthStart: '', monthEnd: '' };
  setRoute(isInstructor() ? 'instructor-view' : 'courses');
}

function applyCourseQuickFilter(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const key = String(viewState.courses.quickFilter || '').trim();
  if (!key) return list;
  const now = new Date();
  const plusSeven = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
  const weekEnd = new Date(now.getTime() + (6 * 24 * 60 * 60 * 1000));
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  if (key === 'today') return list.filter((row) => getScheduleDates(row).some((d) => isDateInRange(d, now, now)));
  if (key === 'this_week') return list.filter((row) => getScheduleDates(row).some((d) => isDateInRange(d, now, weekEnd)));
  if (key === 'this_month') return list.filter((row) => getScheduleDates(row).some((d) => isDateInRange(d, startOfDay(now), monthEnd)));
  if (key === 'active_now') return list.filter((row) => isActiveCourse(row, now));
  if (key === 'active_courses') return list.filter((row) => isActiveCourse(row, now));
  if (key === 'active_instructors') return list.filter((row) => isActiveCourse(row, now) && hasInstructor(row));
  if (key === 'needs_review') return list.filter((row) => hasOperationalIssue(row));
  if (key === 'missing_report') return list.filter((row) => isMissingReport(row));
  if (key === 'missing_data') return list.filter((row) => isMissingReport(row) || !hasInstructor(row));
  if (key === 'ending_soon') return list.filter((row) => isDateInRange(firstDate(row, ['EndDate', 'End']), now, plusSeven));
  if (key === 'exceptions') return list.filter((row) => hasException(row));
  if (key === 'open_requests') return list.filter((row) => hasValue(row, ['ChangeRequest']));
  if (key === 'change_request') return list.filter((row) => hasValue(row, ['ChangeRequest']));
  if (key === 'unassigned_instructor') return list.filter((row) => !hasInstructor(row));
  if (key === 'instructor_gap') return list.filter((row) => hasInstructorGap(row));
  if (key === 'pending_eden' || key === 'pending_final' || key === 'approved_final') return [];
  return list;
}

function getRoleScopedCourses(filters = {}) {
  if (isManager() && !isInstructor()) {
    return applyCoursesFiltersByUiScope(getStoreSnapshot().courses || [], filters);
  }
  return applyCoursesFiltersByUiScope(getCoursesForUser(userState, filters), filters);
}

function fieldHasValue(row, names) {
  return names.some((name) => String(row?.[name] || '').trim());
}

function hasValue(row, names) {
  return fieldHasValue(row, names);
}

function hasInstructor(row) {
  return hasValue(row, [COURSE_FIELDS.EMPLOYEE, COURSE_FIELDS.EMPLOYEE_ID, INSTRUCTOR_FALLBACK_FIELD]);
}

function hasHours(row) {
  return hasValue(row, [COURSE_FIELDS.START_TIME]) && hasValue(row, [COURSE_FIELDS.END_TIME]);
}

function hasCourseDate(row) {
  const scheduleDates = getScheduleDates(row);
  if (scheduleDates.length > 0) return true;
  return Boolean(firstDate(row, [...COURSE_DATE_RANGE_FIELDS, ...COURSE_END_RANGE_FIELDS]));
}

function isPostponedCourse(row) {
  return parseDelayInfo(getCourseField(row, COURSE_FIELDS.NOTES)).isPostponed;
}

function getCourseMissingTypes(row) {
  if (isPostponedCourse(row)) return [];
  const missing = [];
  if (!hasInstructor(row)) missing.push('ללא מדריך');
  if (!hasHours(row)) missing.push('ללא שעות');
  if (!hasCourseDate(row)) missing.push('ללא תאריך');
  return missing;
}

function firstDate(row, names) {
  for (const name of names) {
    const parsed = parseDateLike(row?.[name]);
    if (parsed) return parsed;
  }
  return null;
}

function getScheduleDates(row) {
  const dates = [];
  COURSE_DATE_FIELDS.forEach((fieldName) => {
    const parsed = parseDateLike(getCourseField(row, fieldName));
    if (parsed) dates.push(parsed);
  });
  const fallback = firstDate(row, COURSE_DATE_RANGE_FIELDS);
  if (!dates.length && fallback) dates.push(fallback);
  return dates;
}

function parseDateLike(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds(), value.getMilliseconds());
  }
  const isoDay = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDay) {
    const date = new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const isoDateTime = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (isoDateTime) {
    const date = new Date(
      Number(isoDateTime[1]),
      Number(isoDateTime[2]) - 1,
      Number(isoDateTime[3]),
      Number(isoDateTime[4]),
      Number(isoDateTime[5]),
      Number(isoDateTime[6] || '0')
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'number' && value > 20000 && value < 60000) {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + (value * 24 * 60 * 60 * 1000));
  }
  const direct = new Date(String(value));
  if (!Number.isNaN(direct.getTime())) return new Date(direct.getFullYear(), direct.getMonth(), direct.getDate(), direct.getHours(), direct.getMinutes(), direct.getSeconds(), direct.getMilliseconds());
  const m = String(value).trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!m) return null;
  const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
  const d = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const date = new Date(y, mo, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateInRange(date, from, to) {
  if (!date || !from || !to) return false;
  return date >= startOfDay(from) && date <= endOfDay(to);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function isActiveCourse(row, now) {
  const scheduleDates = getScheduleDates(row);
  if (scheduleDates.some((d) => isDateInRange(d, now, now))) return true;
  const startDate = firstDate(row, COURSE_DATE_RANGE_FIELDS);
  const endDate = firstDate(row, COURSE_END_RANGE_FIELDS);
  if (startDate && endDate) return now >= startOfDay(startDate) && now <= endOfDay(endDate);
  return scheduleDates.some((d) => d >= startOfDay(now));
}

function countPastDueMeetings(row) {
  const today = startOfDay(new Date());
  return COURSE_DATE_FIELDS.reduce((count, fieldName) => {
    const d = parseDateLike(getCourseField(row, fieldName));
    return (d && d < today) ? count + 1 : count;
  }, 0);
}

function isMissingReport(row) {
  const due = countPastDueMeetings(row);
  if (due === 0) return false;
  const actual = getSessionProgress(row).actualMeetings;
  const hasApprovedDelay = parseDelayInfo(getCourseField(row, COURSE_FIELDS.NOTES)).isPostponed;
  return actual < due && !hasApprovedDelay;
}

function hasException(row) {
  return getCourseMissingTypes(row).length > 0;
}

function hasInstructorGap(row) {
  return hasException(row);
}

function hasOperationalIssue(row) {
  return hasException(row) || isMissingReport(row) || !hasInstructor(row);
}

function numberFrom(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function buildMeetingMeta(row) {
  return getSessionProgress(row);
}

function isResolvedException(row = {}) {
  return getExceptionTreatmentStatus(row) === 'resolved';
}

function joinLocation(row) {
  return [
    getCourseField(row, COURSE_FIELDS.AUTHORITY),
    getCourseField(row, COURSE_FIELDS.SCHOOL),
    getCourseField(row, 'Location')
  ].filter((v) => String(v || '').trim()).join(' / ');
}

function formatSchedule(row) {
  const start = firstDate(row, COURSE_DATE_RANGE_FIELDS);
  const end = firstDate(row, COURSE_END_RANGE_FIELDS);
  if (!start && !end) return '-';
  if (start && end) return `${formatDate(start)} - ${formatDate(end)}`;
  return formatDate(start || end);
}

function formatDate(date) {
  if (!date) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function formatTimeValue(value) {
  if (value === null || typeof value === 'undefined' || value === '') return '--:--';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
  if (typeof value === 'number') {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  const text = String(value).trim();
  if (/^\d{1,2}:\d{2}/.test(text)) return text.slice(0, 5);
  const parsed = parseDateLike(value);
  if (parsed) return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
  return '--:--';
}

function courseProgress(row) {
  const sessionProgress = getSessionProgress(row);
  const planned = sessionProgress.plannedMeetings;
  const actual = sessionProgress.actualMeetings;
  const ratio = planned > 0 ? actual / planned : 0;
  const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  if (ratio >= COURSES_SCREEN_CONFIG.progress.successRatio) return { percent, level: 'progress-success' };
  if (ratio >= COURSES_SCREEN_CONFIG.progress.warningRatio) return { percent, level: 'progress-warning' };
  return { percent, level: 'progress-danger' };
}

function collectCourseDates(row) {
  const dates = [];
  for (let index = COURSES_SCREEN_CONFIG.meetingFields.start; index <= COURSES_SCREEN_CONFIG.meetingFields.end; index += 1) {
    const fieldName = `Date${index}`;
    const date = parseDateLike(row?.[fieldName]);
    if (date) dates.push({ label: fieldName, value: date, index });
  }
  dates.sort((a, b) => a.value - b.value);
  const endDate = parseDateLike(row?.[COURSES_SCREEN_CONFIG.meetingFields.fallbackEndField]);
  if (endDate) dates.push({ label: COURSES_SCREEN_CONFIG.meetingFields.fallbackEndField, value: endDate, index: dates.length + 1, isEndDate: true });
  return dates;
}

function renderCourseDetailsPanel(course, options = {}) {
  if (!course) return '';
  const meetings = collectCourseDates(course);
  const postponeInfo = parseDelayInfo(course[COURSE_FIELDS.NOTES]);
  const progress = getSessionProgress(course);
  const delayText = postponeInfo.isPostponed
    ? `הקורס נדחה מתאריך ${postponeInfo.originalDate || '-'} לתאריך ${postponeInfo.newDate || '-'}`
    : 'ללא דחייה';
  return `<section class="panel-block course-details-panel">
    <div class="panel-block-head">
      <h3>פרטי קורס: ${esc(course[COURSE_FIELDS.PROGRAM] || course[COURSE_FIELDS.ACTIVITY] || 'ללא שם קורס')}</h3>
      <button class="btn btn-secondary" id="closeCourseDetails">סגור</button>
    </div>
    <div class="course-core-grid">
      <div class="course-core-col"><span><strong>שם קורס:</strong> ${esc(getBusinessCourseName(course))}</span><span><strong>מדריך:</strong> ${esc(resolveInstructorName(course) || '-')}</span></div>
      <div class="course-core-col"><span><strong>בית ספר:</strong> ${esc(course[COURSE_FIELDS.SCHOOL] || '-')}</span><span><strong>רשות:</strong> ${esc(course[COURSE_FIELDS.AUTHORITY] || '-')}</span></div>
      <div class="course-core-col"><span><strong>מה חסר:</strong> ${esc(summarizeIssue(course))}</span><span><strong>מצב דחייה:</strong> ${esc(delayText)}</span></div>
    </div>
    <div class="table-wrap compact-table"><table><thead><tr><th>מפגש</th><th>תאריך</th><th>יום</th><th>שעות</th><th>התקדמות</th><th>דחייה</th><th>תאריך מקורי</th><th>תאריך חדש</th></tr></thead><tbody>
      ${meetings.length ? meetings.map((item) => {
        const meetingNumber = item.isEndDate ? Math.max(progress.plannedMeetings, meetings.length - 1) : item.index;
        const dayLabel = item.value.toLocaleDateString('he-IL', { weekday: 'long' });
        const postponed = postponeInfo.isPostponed && !item.isEndDate;
        return `<tr>
          <td>${esc(item.isEndDate ? 'תאריך סיום' : `מפגש ${meetingNumber}`)}</td>
          <td>${esc(formatDate(item.value))}</td>
          <td>${esc(dayLabel)}</td>
          <td>${esc(`${formatTimeValue(course[COURSE_FIELDS.START_TIME])}-${formatTimeValue(course[COURSE_FIELDS.END_TIME])}`)}</td>
          <td>מפגש ${esc(meetingNumber)} מתוך ${esc(progress.plannedMeetings || meetings.length)}</td>
          <td>${postponed ? 'כן' : 'לא'}</td>
          <td>${esc(postponed ? postponeInfo.originalDate : '-')}</td>
          <td>${esc(postponed ? postponeInfo.newDate : '-')}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="8">אין תאריכי מפגש</td></tr>'}
    </tbody></table></div>
    <div class="card-kpi-row">
      <span><strong>מפגשים:</strong> ${esc(progress.actualMeetings)} מתוך ${esc(progress.plannedMeetings)}</span>
      <span><strong>מפגש נוכחי:</strong> ${esc(progress.meetingNumber)} מתוך ${esc(progress.plannedMeetings || 0)}</span>
    </div>
    <div class="card-issue ${hasException(course) ? 'has-issue' : ''}"><strong>הערות:</strong> ${esc(course[COURSE_FIELDS.NOTES] || 'אין הערות')}</div>
    <footer class="card-actions">
      <button class="btn btn-primary" data-edit-row="${escAttr(course[COURSE_FIELDS.COURSE_ID] || '')}">שלח בקשת שינוי</button>
    </footer>
  </section>`;
}

function renderIssueBadge(row) {
  if (hasException(row)) return '<span class="status-chip status-declined">דורש טיפול</span>';
  if (isMissingReport(row)) return '<span class="status-chip status-pending">חסר דיווח</span>';
  if (!hasInstructor(row)) return '<span class="status-chip status-pending-final">חסר מדריך</span>';
  return '<span class="status-chip status-approved">תקין</span>';
}

function renderStatusBadge(row) {
  const statusText = String(row.EventType || row.Status || row.OperationalStatus || '').trim();
  if (!statusText) return '';
  return `<span class="status-chip status-none">${esc(statusText)}</span>`;
}

function renderInstructorState(row) {
  if (!row.instructor || row.instructor === 'לא משויך') return '<span class="status-chip status-declined">חוסר שיוך</span>';
  if (row.hasGap) return '<span class="status-chip status-pending">פער תפעולי</span>';
  return '<span class="status-chip status-approved">תקין</span>';
}

function summarizeIssue(row) {
  if (hasException(row)) return getCourseMissingTypes(row).join(' / ');
  if (isMissingReport(row)) return row.ReportStatus || 'דיווח מפגשים חסר';
  if (!hasInstructor(row)) return 'ללא מדריך';
  return 'תקין';
}

function recommendedAction(row) {
  if (!fieldHasValue(row, [INSTRUCTOR_FALLBACK_FIELD])) return 'שייך מדריך';
  if (isMissingReport(row)) return 'עדכן דיווח';
  if (hasException(row)) return 'פתח טיפול';
  return 'מעבר לפרטים';
}

function findCourseById(courseId) {
  return (viewState.courses.data || []).find((row) => String(row?.CourseID || '') === String(courseId || ''));
}

function getCourseDisplayNameById(courseId) {
  const normalizedId = String(courseId || '');
  const allCourses = getStoreSnapshot().courses || [];
  const row = allCourses.find((course) => String(course?.CourseID || '') === normalizedId);
  return row?.Program || row?.Activity || 'שם קורס לא זמין';
}

function bindCourseActions() {
  bindEditButtons();
  document.querySelectorAll('[data-open-course]').forEach((button) => button.addEventListener('click', () => {
    const row = findCourseById(button.dataset.openCourse);
    if (!row) return;
    viewState.courses.selectedCourseId = String(row.CourseID || '');
    viewState.courses.selectedCourseDetails = row;
    renderScreen();
  }));
  document.getElementById('closeCourseDetails')?.addEventListener('click', () => {
    viewState.courses.selectedCourseId = '';
    viewState.courses.selectedCourseDetails = null;
    renderScreen();
  });
}

function bindInstructorCards() {
  document.querySelectorAll('[data-instructor-details]').forEach((button) => button.addEventListener('click', () => {
    viewState.courses.selectedInstructor = button.dataset.instructorDetails || '';
    renderScreen();
  }));
}

function bindExceptionActions() {
  document.querySelectorAll('[data-contact-instructor]').forEach((button) => button.addEventListener('click', () => {
    const instructor = button.dataset.contactInstructor || 'המדריך';
    showToast(`נשלחה משימת קשר ל-${instructor}.`, 'success');
  }));
  document.querySelectorAll('[data-update-course]').forEach((button) => button.addEventListener('click', () => {
    const row = findCourseById(button.dataset.updateCourse);
    if (!row) return;
    const summary = window.prompt('מה לעדכן בפעילות?', `טיפול בחריגה עבור ${row.Activity || row.Program || ''}`);
    if (!summary) return;
    api.createEditRequest({
      CourseID: row.CourseID,
      Team: row.Team || 'operations',
      ChangeSummary: summary,
      ApprovalStatus: 'pending_eden',
      requestedData: { operationalStatus: 'בטיפול' }
    }).then(() => loadMyRequests());
  }));
  document.querySelectorAll('[data-close-issue]').forEach((button) => button.addEventListener('click', () => {
    const row = findCourseById(button.dataset.closeIssue);
    if (!row) return;
    api.createEditRequest({
      CourseID: row.CourseID,
      Team: row.Team || 'operations',
      ChangeSummary: 'סגירת חריגה',
      ApprovalStatus: 'pending_eden',
      requestedData: { issueStatus: 'טופל', operationalStatus: 'תקין' }
    }).then(() => loadMyRequests());
  }));
}

function bindEditButtons() {
  document.querySelectorAll('[data-edit-row]').forEach((b) => b.addEventListener('click', async () => {
    const row = findCourseById(b.dataset.editRow) || {};
    const mode = 'request';
    const formResult = await openCourseActionForm(row, mode);
    if (!formResult) return;
    const res = await createEditRequest(row.CourseID, formResult.changes, userState);
    if (!res?.success) showToast(res?.message || 'הפעולה נכשלה', 'error');
    else {
      await loadMyRequests();
      showToast('בקשת השינוי נפתחה ונרשמה ב-EDIT_REQUESTS.', 'success');
    }
  }));
}

function openCourseActionForm(course, mode) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'course-form-modal';
    root.innerHTML = `
      <div class="course-form-backdrop" data-form-close="1"></div>
      <div class="course-form-card">
        <h3>בקשת שינוי</h3>
        <p>${esc(getBusinessCourseName(course))}</p>
        <label>שעת התחלה<input id="courseFormStartTime" value="${escAttr(formatTimeValue(course.StartTime))}" placeholder="hh:mm" /></label>
        <label>שעת סיום<input id="courseFormEndTime" value="${escAttr(formatTimeValue(course.EndTime))}" placeholder="hh:mm" /></label>
        <label>מפגשים בפועל<input id="courseFormActualMeetings" type="number" min="1" max="30" value="${escAttr(String(course.ActualMeetings || ''))}" placeholder="מספר מפגשים שבוצעו" /></label>
        <label>הערות<input id="courseFormNotes" value="${escAttr(course.Notes || '')}" /></label>
        <label>תקציר שינוי<input id="courseFormSummary" value="" placeholder="בקשת שינוי במסך קורסים" /></label>
        <div class="card-actions">
          <button class="btn btn-secondary" data-form-close="1">ביטול</button>
          <button class="btn btn-primary" id="courseFormSubmit">שלח בקשה</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const close = (result = null) => {
      root.remove();
      resolve(result);
    };

    root.querySelectorAll('[data-form-close]').forEach((button) => button.addEventListener('click', () => close(null)));
    root.querySelector('#courseFormSubmit')?.addEventListener('click', () => {
      const summary = root.querySelector('#courseFormSummary')?.value.trim() || 'בקשת שינוי';
      const actualMeetingsRaw = root.querySelector('#courseFormActualMeetings')?.value.trim() || '';
      const actualMeetingsNum = Number(actualMeetingsRaw);
      if (actualMeetingsRaw !== '' && (!Number.isFinite(actualMeetingsNum) || actualMeetingsNum < 1 || actualMeetingsNum > 30)) {
        showToast('מספר מפגשים חייב להיות בין 1 ל-30.', 'warning');
        return;
      }
      const changes = {
        StartTime: root.querySelector('#courseFormStartTime')?.value.trim() || '',
        EndTime: root.querySelector('#courseFormEndTime')?.value.trim() || '',
        Notes: root.querySelector('#courseFormNotes')?.value.trim() || '',
        summary
      };
      if (actualMeetingsRaw !== '') changes.ActualMeetings = actualMeetingsRaw;
      close({ changes });
    });
  });
}

function bindApprovalButtons() {
  document.querySelectorAll('[data-approve-row]').forEach((b) => b.addEventListener('click', () => doDecision(b, true)));
  document.querySelectorAll('[data-reject-row]').forEach((b) => b.addEventListener('click', () => doDecision(b, false)));
}

async function doDecision(button, approved) {
  const row = viewState.approvals.data[Number(button.dataset.approveRow || button.dataset.rejectRow)] || {};
  const fn = approved ? api.approveRequest : api.rejectRequest;
  let notes = '';
  if (!approved) {
    const entered = window.prompt('סיבת הדחייה (יוצג למבקש):', '');
    if (entered === null) return;
    notes = entered;
  }
  const res = await fn({ RequestID: row.RequestID, ApprovalNotes: notes });
  if (!res?.success) return showToast(res?.message || 'הפעולה נכשלה', 'error');
  await loadApprovals();
  await loadEdenView();
  showToast(approved ? 'הבקשה אושרה בהצלחה' : 'הבקשה נדחתה', approved ? 'success' : 'error');
}

function safeParseJson(raw) {
  try {
    return typeof raw === 'string' ? (JSON.parse(raw || '{}') || {}) : (raw || {});
  } catch (error) {
    return {};
  }
}

function bindEdenActions() {
  document.querySelectorAll('[data-eden-edit]').forEach((button) => button.addEventListener('click', async () => {
    const requestId = button.dataset.edenEdit || '';
    const row = (viewState.eden.data.queue || []).find((item) => String(item.RequestID || '') === requestId);
    if (!row) return;
    const course = findCourseById(row.CourseID) || {};
    const formResult = await openEdenFullRowForm(row, course);
    if (!formResult) return;
    const res = await api.createEditRequest({
      RequestID: row.RequestID,
      CourseID: row.CourseID,
      ChangeSummary: formResult.summary || row.ChangeSummary || 'עדכון בקשה',
      RequestedData: formResult.requestedData,
      ApprovalStatus: 'eden_approved'
    });
    if (!res?.success) {
      showToast(res?.message || 'עדכון בקשת עדן נכשל.', 'error');
      return;
    }
    await Promise.all([loadEdenView(), loadMyRequests()]);
    showToast('בקשת עדן עודכנה בהצלחה.', 'success');
  }));

  document.querySelectorAll('[data-eden-submit]').forEach((button) => button.addEventListener('click', async () => {
    const requestId = button.dataset.edenSubmit || '';
    const row = (viewState.eden.data.queue || []).find((item) => String(item.RequestID || '') === requestId);
    if (!row) return;
    const res = await api.createEditRequest({
      RequestID: row.RequestID,
      CourseID: row.CourseID,
      ChangeSummary: row.ChangeSummary || 'העברה לאישור סופי',
      RequestedData: safeParseJson(row.RequestedData),
      ApprovalStatus: 'pending_final'
    });
    if (!res?.success) {
      showToast(res?.message || 'העברה לאישור סופי נכשלה.', 'error');
      return;
    }
    await Promise.all([loadEdenView(), loadApprovals()]);
    showToast('הבקשה הועברה לאישור סופי.', 'success');
  }));
}

function openEdenFullRowForm(requestRow, courseRow) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    const initialRequested = { ...courseRow, ...safeParseJson(requestRow?.RequestedData) };
    const compactRequested = Object.fromEntries(Object.entries(initialRequested).filter(([key]) => !String(key).startsWith('_')));
    root.className = 'course-form-modal';
    root.innerHTML = `
      <div class="course-form-backdrop" data-form-close="1"></div>
      <div class="course-form-card">
        <h3>עדכון מלא לשורת קורס</h3>
        <p>${esc(getBusinessCourseName(courseRow))}</p>
        <label>תקציר שינוי<input id="edenSummary" value="${escAttr(requestRow?.ChangeSummary || '')}" placeholder="תקציר שינוי" /></label>
        <label>שורת קורס מלאה (JSON)
          <textarea id="edenRequestedData" rows="12">${esc(JSON.stringify(compactRequested, null, 2))}</textarea>
        </label>
        <div class="card-actions">
          <button class="btn btn-secondary" data-form-close="1">ביטול</button>
          <button class="btn btn-primary" id="edenSubmit">שמור במסך עדן</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    const close = (result = null) => {
      root.remove();
      resolve(result);
    };
    root.querySelectorAll('[data-form-close]').forEach((button) => button.addEventListener('click', () => close(null)));
    root.querySelector('#edenSubmit')?.addEventListener('click', () => {
      const summary = root.querySelector('#edenSummary')?.value.trim() || 'עדכון בקשה';
      const raw = root.querySelector('#edenRequestedData')?.value || '{}';
      try {
        const requestedData = JSON.parse(raw);
        if (!requestedData || typeof requestedData !== 'object' || Array.isArray(requestedData)) {
          showToast('יש להזין אובייקט JSON תקין.', 'error');
          return;
        }
        close({ summary, requestedData });
      } catch (error) {
        showToast('פורמט JSON לא תקין.', 'error');
      }
    });
  });
}

async function loadWeekView() {
  viewState.week.loading = true;
  viewState.week.error = '';
  renderScreen();
  try {
    await Promise.all([reloadCourses(), loadReviewItems(true)]);
  } catch (error) {
    viewState.week.error = 'לא ניתן לרענן נתוני קורסים לשבוע.';
  }
  viewState.week.loading = false;
  renderScreen();
}

async function loadMonthView() {
  viewState.month.loading = true;
  viewState.month.error = '';
  renderScreen();
  try {
    await Promise.all([reloadCourses(), loadReviewItems(true)]);
  } catch (error) {
    viewState.month.error = 'לא ניתן לרענן נתוני קורסים לחודש.';
  }
  viewState.month.loading = false;
  renderScreen();
}

async function loadInstructorsView() {
  viewState.instructors.loading = true;
  viewState.instructors.error = '';
  renderScreen();
  try {
    await Promise.all([reloadCourses(), loadReviewItems(true)]);
  } catch (error) {
    viewState.instructors.error = 'לא ניתן לרענן נתוני קורסים למדריכים.';
  }
  viewState.instructors.loading = false;
  renderScreen();
}

async function loadEndDatesView() {
  viewState.endDates.loading = true;
  viewState.endDates.error = '';
  renderScreen();
  try {
    await Promise.all([reloadCourses(), loadReviewItems(true)]);
  } catch (error) {
    viewState.endDates.error = 'לא ניתן לרענן נתוני קורסים לתאריכי סיום.';
  }
  viewState.endDates.loading = false;
  renderScreen();
}

async function loadAssignmentsView() {
  viewState.assignments.loading = true;
  viewState.assignments.error = '';
  renderScreen();
  try {
    await Promise.all([reloadCourses(), loadReviewItems(true)]);
  } catch (error) {
    viewState.assignments.error = 'לא ניתן לרענן נתוני קורסים לשיבוץ.';
  }
  viewState.assignments.loading = false;
  renderScreen();
}

async function loadExceptionsView() {
  viewState.exceptions.loading = true;
  viewState.exceptions.error = '';
  try {
    await Promise.all([reloadCourses(), loadReviewItems(true)]);
  } catch (error) {
    viewState.exceptions.error = 'לא ניתן לרענן נתוני קורסים לחריגות.';
  }
  viewState.exceptions.loading = false;
  renderScreen();
}

function renderWeekFilters() {
  return `<section class="filters-wrap">
    <label>מתחילת שבוע<input id="weekStart" type="date" value="${escAttr(viewState.week.rangeStart)}" /></label>
    <label>רשות<input id="weekAuthority" value="${escAttr(viewState.week.filters.authority)}" /></label>
    <label>מדריך<input id="weekEmployee" value="${escAttr(viewState.week.filters.employee)}" /></label>
    <label>מנהל קורס<input id="weekCourseManager" value="${escAttr(viewState.week.filters.courseManager)}" /></label>
    <div class="filter-actions"><button class="btn btn-secondary" id="weekApply">סינון</button><button class="btn btn-secondary" id="weekReset">נקה סינון</button></div>
    <div class="filter-actions week-nav-actions"><button class="btn btn-secondary" id="weekPrev" aria-label="שבוע קודם">◀ שבוע קודם</button><button class="btn btn-secondary" id="weekNext" aria-label="שבוע הבא">שבוע הבא ▶</button></div>
  </section>`;
}

function renderWeekGrid(days) {
  return `<section class="week-grid">${days.map((day) => {
    const dayExceptionCount = day.items.filter((item) => item.hasReviewItem).length;
    return `<article class="panel-block week-day-column"><div class="panel-block-head"><h3>${esc(day.label)} ${dayExceptionCount ? `<span class="status-chip status-pending">${dayExceptionCount} חריגות</span>` : ''}</h3><button class="btn btn-tertiary" data-week-open="${escAttr(day.isoDate)}">${day.items.length} מפגשים</button></div>${day.items.map((item) => {
      const hierarchy = buildCourseHierarchyDetails(item);
      return `<div class="mini-card week-session-card"><div class="mini-card-top"><strong>${esc(hierarchy.instructor || 'טרם שויך')}</strong>${(item.hasReviewItem || item.hasDelay) ? '<span class="status-chip status-declined compact-badge">חריגה</span>' : ''}</div><span class="meta-small">${esc(hierarchy.programActivity || '-')}</span><span class="meta-small">${esc(hierarchy.school || '-')} · ${esc(hierarchy.authority || '-')}</span><span>${esc(hierarchy.timeLabel || '-')}</span><span class="meta-small">${esc(hierarchy.meetingProgressLabel)}</span><button class="btn btn-tertiary" data-open-course="${escAttr(item[COURSE_FIELDS.COURSE_ID] || '')}">פרטי קורס</button>${item.hasReviewItem ? `<button class="btn btn-tertiary" data-week-exception-open="${escAttr(item[COURSE_FIELDS.COURSE_ID] || '')}">חריגה פעילה</button>` : ''}</div>`;
    }).join('') || '<div class="panel-empty">אין מפגשים</div>'}</article>`;
  }).join('')}</section>`;
}

function renderWeekDetails(selected) {
  if (!selected) return '';
  return `<section class="panel-block"><div class="panel-block-head"><h3 class="section-title">פרטי יום: ${esc(selected.label)}</h3><button class="btn btn-secondary" id="weekCloseDetails">סגור</button></div>${selected.items.map((item) => {
    const postpone = parseDelayInfo(item[COURSE_FIELDS.NOTES]);
    return `<article class="mini-card"><strong>${esc(item[COURSE_FIELDS.PROGRAM] || item[COURSE_FIELDS.ACTIVITY] || '')}</strong><span>מדריך: ${esc(resolveInstructorName(item) || '-')}</span><span>רשות/בית ספר: ${esc(item[COURSE_FIELDS.AUTHORITY] || '-')} / ${esc(item[COURSE_FIELDS.SCHOOL] || '-')}</span><span>תאריך: ${esc(formatDate(parseDateLike(item.Date || item.Date1 || item[COURSE_FIELDS.DATE])) || '-')}</span><span>מפגש ${esc(item.meetingNumber)} מתוך ${esc(item.plannedMeetings)}</span><span>דחייה: ${postpone.isPostponed ? 'כן' : 'לא'} | מקורי: ${esc(postpone.originalDate)} | חדש: ${esc(postpone.newDate)}</span><span>שעות: ${esc(formatTimeValue(item[COURSE_FIELDS.START_TIME]))}-${esc(formatTimeValue(item[COURSE_FIELDS.END_TIME]))}</span><span>הערות: ${esc(item[COURSE_FIELDS.NOTES] || '-')}</span><div class="card-actions"><button class="btn btn-tertiary" data-open-course="${escAttr(item[COURSE_FIELDS.COURSE_ID] || '')}">פתח קורס</button>${item.hasReviewItem ? '<button class="btn btn-tertiary" data-go-exceptions="1">לחריגות</button>' : ''}</div></article>`;
  }).join('')}</section>`;
}

function bindWeekActions(weekData) {
  document.getElementById('weekApply')?.addEventListener('click', () => {
    viewState.week.filters = {
      authority: document.getElementById('weekAuthority')?.value.trim() || '',
      employee: document.getElementById('weekEmployee')?.value.trim() || '',
      courseManager: document.getElementById('weekCourseManager')?.value.trim() || ''
    };
    viewState.week.rangeStart = document.getElementById('weekStart')?.value.trim() || '';
    renderScreen();
  });
  document.getElementById('weekReset')?.addEventListener('click', () => {
    viewState.week.filters = { authority: '', employee: '', courseManager: '' };
    viewState.week.rangeStart = '';
    viewState.week.selected = null;
    renderScreen();
  });
  document.getElementById('weekPrev')?.addEventListener('click', () => {
    const current = parseDateLike(viewState.week.rangeStart) || new Date();
    const prev = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7);
    viewState.week.rangeStart = formatIsoDateLocal(prev);
    viewState.week.selected = null;
    renderScreen();
  });
  document.getElementById('weekNext')?.addEventListener('click', () => {
    const current = parseDateLike(viewState.week.rangeStart) || new Date();
    const next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7);
    viewState.week.rangeStart = formatIsoDateLocal(next);
    viewState.week.selected = null;
    renderScreen();
  });
  document.querySelectorAll('[data-week-open]').forEach((button) => button.addEventListener('click', () => {
    const day = weekData.days.find((item) => item.isoDate === button.dataset.weekOpen);
    viewState.week.selected = day || null;
    renderScreen();
  }));
  document.querySelectorAll('[data-week-exception-open]').forEach((button) => button.addEventListener('click', () => {
    viewState.exceptions.filters.treatmentStatus = 'open';
    setRoute('exceptions');
  }));
  document.querySelectorAll('[data-go-exceptions]').forEach((button) => button.addEventListener('click', () => {
    setRoute('exceptions');
  }));
  bindCourseActions();
  document.getElementById('weekCloseDetails')?.addEventListener('click', () => {
    viewState.week.selected = null;
    renderScreen();
  });
}

function buildWeeklyBuckets(courses, weekStartValue) {
  const baseDate = parseDateLike(weekStartValue) || new Date();
  const start = startOfDay(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() - baseDate.getDay()));
  const reviewItems = getStoreSnapshot().reviewItems || [];
  const days = TAASIYEDA_CONFIG.weekdays.map((weekday, idx) => {
    const current = new Date(start.getTime() + (idx * 24 * 60 * 60 * 1000));
    return { label: current.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit' }), isoDate: formatIsoDateLocal(current), items: [] };
  });
  (courses || []).forEach((course) => {
    const courseId = String(getCourseField(course, COURSE_FIELDS.COURSE_ID) || '');
    const hasReviewItem = reviewItems.some((review) => {
      const rId = String(getExceptionField(review, EXCEPTION_FIELDS.COURSE_ID) || review.CourseID || '');
      const rRow = String(review._rowNumber || review.SourceRow || '');
      const matches = rId ? rId === courseId : (rRow && rRow === String(course._rowNumber || ''));
      return matches && !isResolvedException(review);
    });
    const sessionProgress = getSessionProgress(course);
    const hasDelay = hasCourseDelays(course, reviewItems);
    getScheduleDates(course).forEach((dateObj) => {
      const isoDate = formatIsoDateLocal(startOfDay(dateObj));
      const bucket = days.find((day) => day.isoDate === isoDate);
      if (bucket) bucket.items.push({ ...course, hasReviewItem, hasDelay, meetingNumber: sessionProgress.meetingNumber, plannedMeetings: sessionProgress.plannedMeetings });
    });
  });
  return { days, start };
}

function renderMonthFilters() {
  return `<section class="filters-wrap"><label>חודש<input id="monthDate" type="month" value="${escAttr(viewState.month.monthDate)}" /></label><label>רשות<input id="monthAuthority" value="${escAttr(viewState.month.filters.authority)}" /></label><label>מדריך<input id="monthEmployee" value="${escAttr(viewState.month.filters.employee)}" /></label><label>מנהל קורס<input id="monthCourseManager" value="${escAttr(viewState.month.filters.courseManager)}" /></label><label>תוכנית<input id="monthProgram" value="${escAttr(viewState.month.filters.program)}" /></label><div class="filter-actions"><button class="btn btn-secondary" id="monthApply">סינון</button><button class="btn btn-secondary" id="monthReset">נקה סינון</button></div></section>`;
}

function buildMonthlyCalendar(courses, monthValue) {
  const parsedMonth = parseMonthValue(monthValue) || new Date();
  const monthStart = new Date(parsedMonth.getFullYear(), parsedMonth.getMonth(), 1);
  const monthEnd = new Date(parsedMonth.getFullYear(), parsedMonth.getMonth() + 1, 0);
  const days = [];
  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const current = new Date(parsedMonth.getFullYear(), parsedMonth.getMonth(), day);
    const isoDate = formatIsoDateLocal(current);
    const items = (courses || []).filter((course) => getScheduleDates(course).some((dateObj) => formatIsoDateLocal(dateObj) === isoDate));
    days.push({ day, isoDate, items, hasException: items.some((item) => hasException(item) || isMissingReport(item) || !hasInstructor(item)) });
  }
  const selectedItems = days.find((item) => item.isoDate === viewState.month.selectedDate)?.items || [];
  return { monthStart, days, selectedItems };
}

function renderMonthGrid(days) {
  const monthTitle = days[0] ? new Date(`${days[0].isoDate}T00:00:00`).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }) : '';
  const firstWeekday = days[0] ? new Date(`${days[0].isoDate}T00:00:00`).getDay() : 0;
  const leadingCells = Array.from({ length: firstWeekday }).map(() => '<div class="month-day month-day-empty" aria-hidden="true"></div>').join('');
  return `<div class="month-header">${esc(monthTitle)}</div><section class="month-grid">${['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].map((name) => `<div class="month-weekday">${name}</div>`).join('')}${leadingCells}${days.map((day) => `<button class="month-day ${day.hasException ? 'has-exception' : ''}" data-month-open="${escAttr(day.isoDate)}"><span class="month-status-indicator ${day.hasException ? 'has-issue' : 'is-ok'}"></span><div class="month-day-head"><strong>${day.day}</strong>${day.hasException ? '<span class="status-chip status-declined compact-badge">!</span>' : ''}</div><span>${day.items.length} פעילויות</span><small>${esc(formatDate(parseDateLike(day.isoDate)))}</small></button>`).join('')}</section>`;
}

function renderMonthDayDetails(items, dateLabel) {
  if (!dateLabel) return '';
  return `<section class="panel-block"><div class="panel-block-head"><h3 class="section-title">פירוט יום ${esc(formatDate(parseDateLike(dateLabel)) || dateLabel)}</h3><button class="btn btn-secondary" id="monthCloseDetails">סגור</button></div>${items.map((item) => {
    const hierarchy = buildCourseHierarchyDetails(item);
    return `<article class="mini-card"><strong>${esc(hierarchy.instructor || 'טרם שויך')}</strong><span>${esc(hierarchy.programActivity || '-')}</span><span class="meta-small">${esc([hierarchy.school, hierarchy.authority].filter(Boolean).join(' · ') || '-')}</span><span>${esc(hierarchy.meetingProgressLabel)}</span><span class="meta-small">${esc(hierarchy.endDate || '-')}</span><button class="btn btn-tertiary" data-open-course="${escAttr(getCourseField(item, COURSE_FIELDS.COURSE_ID) || '')}">פרטי קורס</button></article>`;
  }).join('') || '<div class="panel-empty">אין מפגשים</div>'}</section>`;
}

function bindMonthActions(monthData) {
  document.getElementById('monthApply')?.addEventListener('click', () => {
    viewState.month.monthDate = document.getElementById('monthDate')?.value.trim() || '';
    viewState.month.filters = {
      authority: document.getElementById('monthAuthority')?.value.trim() || '',
      employee: document.getElementById('monthEmployee')?.value.trim() || '',
      courseManager: document.getElementById('monthCourseManager')?.value.trim() || '',
      program: document.getElementById('monthProgram')?.value.trim() || ''
    };
    renderScreen();
  });
  document.getElementById('monthReset')?.addEventListener('click', () => {
    viewState.month.monthDate = '';
    viewState.month.filters = { authority: '', employee: '', courseManager: '', program: '' };
    viewState.month.selectedDate = '';
    renderScreen();
  });
  document.querySelectorAll('[data-month-open]').forEach((button) => button.addEventListener('click', () => {
    viewState.month.selectedDate = button.dataset.monthOpen || '';
    renderScreen();
  }));
  document.getElementById('monthCloseDetails')?.addEventListener('click', () => {
    viewState.month.selectedDate = '';
    renderScreen();
  });
  bindCourseActions();
}

function parseMonthValue(value) {
  const text = String(value || '').trim();
  const htmlMonthMatch = text.match(/^(\d{4})-(\d{1,2})$/);
  if (htmlMonthMatch) return new Date(Number(htmlMonthMatch[1]), Number(htmlMonthMatch[2]) - 1, 1);
  const match = text.match(/^(\d{1,2})[\\/.-](\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[2]), Number(match[1]) - 1, 1);
}

function renderInstructorsFilters() {
  return `<section class="filters-wrap"><label>רשות<input id="instructorsAuthority" value="${escAttr(viewState.instructors.filters.authority)}" /></label><label>מנהל קורס<input id="instructorsManager" value="${escAttr(viewState.instructors.filters.courseManager)}" /></label><label>תוכנית<input id="instructorsProgram" value="${escAttr(viewState.instructors.filters.program)}" /></label><div class="filter-actions"><button class="btn btn-secondary" id="instructorsApply">סינון</button><button class="btn btn-secondary" id="instructorsReset">נקה סינון</button></div></section>`;
}

function buildInstructorsViewData(courses) {
  const reviewItems = getStoreSnapshot().reviewItems || [];
  const coursesByInstructor = {};
  const byEmployeeId = new Map();
  (courses || []).forEach((course) => {
    const key = resolveInstructorName(course) || 'לא משויך';
    if (!coursesByInstructor[key]) coursesByInstructor[key] = [];
    coursesByInstructor[key].push(course);
    const employeeKey = String(course[COURSE_FIELDS.EMPLOYEE_ID] || key || '0');
    if (!byEmployeeId.has(employeeKey)) byEmployeeId.set(employeeKey, []);
    byEmployeeId.get(employeeKey).push(course);
  });
  const items = Array.from(byEmployeeId.entries()).map(([employeeId, list]) => {
    const name = resolveInstructorName(list[0]) || 'לא משויך';
    const meetings = list.reduce((sum, item) => sum + Math.min(30, Math.max(1, collectCourseDates(item).filter((entry) => !entry.isEndDate).length || getSessionProgress(item).plannedMeetings || 0)), 0);
    const authorities = Array.from(new Set(list.map((item) => getCourseField(item, COURSE_FIELDS.AUTHORITY)).filter(Boolean)));
    const schools = Array.from(new Set(list.map((item) => getCourseField(item, COURSE_FIELDS.SCHOOL)).filter(Boolean)));
    const hasIssues = list.some((item) => reviewItems.some((review) => String(getExceptionField(review, EXCEPTION_FIELDS.COURSE_ID) || '') === String(getCourseField(item, COURSE_FIELDS.COURSE_ID) || '') && !isResolvedException(review)));
    const hasGap = list.some((item) => hasInstructorGap(item));
    const workDays = new Set(
      list.map((c) => String(c[COURSE_FIELDS.DAY_NAME] || '')).filter(Boolean)
    );
    return {
      name,
      employeeId,
      coursesCount: list.length,
      meetingsCount: meetings,
      authorities,
      schools,
      hasIssues,
      hasGap,
      workDays: Array.from(workDays),
      workDaysCount: workDays.size
    };
  }).sort((a, b) => b.meetingsCount - a.meetingsCount);
  return { items, coursesByInstructor };
}

function renderInstructorsCards(items) {
  return `<section class="cards-grid instructor-grid">${items.map((item) => `<article class="management-card"><div class="card-head"><div><h3>${esc(item.name)}</h3><p class="card-subtitle">${esc(getDisplayRoleForInstructor(item.name, item.employeeId) || 'ללא תפקיד')}</p></div><span class="status-chip ${item.hasIssues || item.hasGap ? 'status-pending' : 'status-approved'}">${item.hasIssues || item.hasGap ? 'דורש טיפול' : 'תקין'}</span></div><div class="card-meta"><span><strong>${esc(item.coursesCount)}</strong> קורסים / <strong>${esc(item.meetingsCount)}</strong> מפגשים</span><span><strong>${esc(item.workDaysCount || 0)}</strong> ימי עבודה בשבוע</span><span>רשויות: ${esc(item.authorities.join(', ') || '-')}</span><span>בתי ספר: ${esc(item.schools.join(', ') || '-')}</span><span>חריגות פעילות: ${item.hasIssues ? 'יש' : 'אין'}</span></div><div class="card-actions"><button class="btn btn-secondary" data-instructor-open="${escAttr(item.name)}">פרטים</button></div></article>`).join('')}</section>`;
}

function renderInstructorCoursesDetails(instructorName, coursesByInstructor) {
  if (!instructorName) return '';
  const rows = coursesByInstructor[instructorName] || [];
  return `<section class="course-form-modal" id="instructorDetailsModal"><div class="course-form-backdrop" id="instructorCloseDetails"></div><section class="course-form-card instructor-modal-card"><div class="panel-block-head"><h3>פרטי מדריך: ${esc(instructorName)}</h3><button class="btn btn-secondary" id="instructorCloseDetailsButton">סגור</button></div>${renderCourseCards(rows, { canEdit: false })}</section></section>`;
}

function bindInstructorsActions() {
  document.getElementById('instructorsApply')?.addEventListener('click', () => {
    viewState.instructors.filters = {
      authority: document.getElementById('instructorsAuthority')?.value.trim() || '',
      courseManager: document.getElementById('instructorsManager')?.value.trim() || '',
      program: document.getElementById('instructorsProgram')?.value.trim() || ''
    };
    renderScreen();
  });
  document.getElementById('instructorsReset')?.addEventListener('click', () => {
    viewState.instructors.filters = { authority: '', courseManager: '', program: '' };
    viewState.instructors.selectedInstructor = '';
    renderScreen();
  });
  document.querySelectorAll('[data-instructor-open]').forEach((button) => button.addEventListener('click', () => {
    viewState.instructors.selectedInstructor = button.dataset.instructorOpen || '';
    renderScreen();
  }));
  document.getElementById('instructorCloseDetails')?.addEventListener('click', () => {
    viewState.instructors.selectedInstructor = '';
    renderScreen();
  });
  document.getElementById('instructorCloseDetailsButton')?.addEventListener('click', () => {
    viewState.instructors.selectedInstructor = '';
    renderScreen();
  });
  bindCourseActions();
}

function renderEndDatesFilters() {
  return `<section class="filters-wrap"><label>רשות<input id="endAuthority" value="${escAttr(viewState.endDates.filters.authority)}" /></label><label>מדריך<input id="endEmployee" value="${escAttr(viewState.endDates.filters.employee)}" /></label><label>מנהל קורס<input id="endManager" value="${escAttr(viewState.endDates.filters.courseManager)}" /></label><label>מתאריך סיום<input id="endFrom" type="date" value="${escAttr(viewState.endDates.filters.endFrom)}" /></label><label>עד תאריך סיום<input id="endTo" type="date" value="${escAttr(viewState.endDates.filters.endTo)}" /></label><div class="filter-actions"><button class="btn btn-secondary" id="endApply">סינון</button><button class="btn btn-secondary" id="endReset">נקה סינון</button></div></section>`;
}

function buildEndDateItems(courses) {
  const from = parseDateLike(viewState.endDates.filters.endFrom);
  const to = parseDateLike(viewState.endDates.filters.endTo);
  const reviewItems = getStoreSnapshot().reviewItems || [];
  return (courses || []).filter((course) => {
    const endDate = parseDateLike(getCourseField(course, COURSE_FIELDS.END));
    if (!endDate) return false;
    if (from && endDate < startOfDay(from)) return false;
    if (to && endDate > endOfDay(to)) return false;
    return true;
  }).map((course) => {
    const postpone = parseDelayInfo(getCourseField(course, COURSE_FIELDS.NOTES));
    const hasReviewDelay = hasCourseDelays(course, reviewItems);
    const progress = getSessionProgress(course);
    const remaining = Math.max(0, progress.plannedMeetings - progress.actualMeetings);
    return { ...course, postpone, hasReviewDelay, remaining };
  }).sort((a, b) => (parseDateLike(getCourseField(a, COURSE_FIELDS.END))?.getTime() || 0) - (parseDateLike(getCourseField(b, COURSE_FIELDS.END))?.getTime() || 0));
}

function renderEndDateCards(items) {
  return `<section class="cards-grid">${items.map((item) => {
    const hierarchy = buildCourseHierarchyDetails(item);
    return `<article class="management-card"><div class="card-head"><h3>${esc(hierarchy.instructor || 'טרם שויך')}</h3><span class="status-chip ${(item.postpone.isPostponed || item.hasReviewDelay) ? 'status-pending-final' : 'status-approved'}">${(item.postpone.isPostponed || item.hasReviewDelay) ? 'דחייה' : 'תקין'}</span></div>${renderCourseHierarchyStrip(item)}<div class="card-meta"><span><strong>${esc(hierarchy.endDate || '-')}</strong></span><span>מפגשים שנותרו: ${esc(item.remaining)}</span></div><div class="card-actions"><button class="btn btn-secondary" data-open-course="${escAttr(getCourseField(item, COURSE_FIELDS.COURSE_ID) || '')}">פרטים</button></div></article>`;
  }).join('')}</section>`;
}

function bindEndDatesActions() {
  document.getElementById('endApply')?.addEventListener('click', () => {
    viewState.endDates.filters = {
      authority: document.getElementById('endAuthority')?.value.trim() || '',
      employee: document.getElementById('endEmployee')?.value.trim() || '',
      courseManager: document.getElementById('endManager')?.value.trim() || '',
      endFrom: document.getElementById('endFrom')?.value.trim() || '',
      endTo: document.getElementById('endTo')?.value.trim() || ''
    };
    renderScreen();
  });
  document.getElementById('endReset')?.addEventListener('click', () => {
    viewState.endDates.filters = { authority: '', employee: '', courseManager: '', endFrom: '', endTo: '' };
    renderScreen();
  });
  document.querySelectorAll('[data-open-course]').forEach((button) => button.addEventListener('click', () => {
    const row = findCourseById(button.dataset.openCourse);
    if (!row) return;
    viewState.courses.selectedCourseId = String(row.CourseID || '');
    viewState.courses.selectedCourseDetails = row;
    setRoute('courses');
  }));
}

function renderAssignmentsFilters() {
  return `<section class="filters-wrap"><label>רשות<input id="assignAuthority" value="${escAttr(viewState.assignments.filters.authority)}" /></label><label>תוכנית<input id="assignProgram" value="${escAttr(viewState.assignments.filters.program)}" /></label><div class="filter-actions"><button class="btn btn-secondary" id="assignApply">סינון</button><button class="btn btn-secondary" id="assignReset">נקה סינון</button></div></section>`;
}

function buildAssignmentsRows(courses) {
  const programFilter = String(viewState.assignments.filters.program || '').trim().toLowerCase();
  const byInstructor = new Map();
  (courses || []).forEach((course) => {
    if (programFilter) {
      const programText = `${String(getCourseField(course, COURSE_FIELDS.PROGRAM) || '')} ${String(getCourseField(course, COURSE_FIELDS.PROGRAM_CODE) || '')}`.toLowerCase();
      if (!programText.includes(programFilter)) return;
    }
    const key = String(course[COURSE_FIELDS.EMPLOYEE_ID] || resolveInstructorName(course) || 'לא משויך');
    if (!byInstructor.has(key)) byInstructor.set(key, []);
    byInstructor.get(key).push(course);
  });
  return Array.from(byInstructor.values()).map((list) => {
    const instructor = resolveInstructorName(list[0]) || 'לא משויך';
    const activeCourses = list.length;
    const upcomingMeetings = list.reduce((sum, course) => sum + getScheduleDates(course).filter((dateObj) => dateObj >= startOfDay(new Date())).length, 0);
    const authorities = Array.from(new Set(list.map((course) => getCourseField(course, COURSE_FIELDS.AUTHORITY)).filter(Boolean)));
    const schools = Array.from(new Set(list.map((course) => getCourseField(course, COURSE_FIELDS.SCHOOL)).filter(Boolean)));
    const hasIssues = list.some((course) => hasOperationalIssue(course));
    return { instructor, activeCourses, upcomingMeetings, authorities, schools, hasIssues };
  }).sort((a, b) => b.upcomingMeetings - a.upcomingMeetings);
}

function renderAssignmentsTable(rows) {
  const body = rows.map((row) => `<tr><td>${esc(row.instructor)}</td><td>${esc(row.activeCourses)}</td><td>${esc(row.upcomingMeetings)}</td><td>${esc(row.authorities.join(', ') || '-')}</td><td>${esc(row.schools.join(', ') || '-')}</td><td><span class="status-chip ${row.hasIssues ? 'status-pending' : 'status-approved'}">${row.hasIssues ? 'דורש טיפול' : 'תקין'}</span></td></tr>`).join('');
  return `<section class="table-wrap"><table><thead><tr><th>מדריך</th><th>קורסים פעילים</th><th>מפגשים קרובים</th><th>רשויות</th><th>בתי ספר</th><th>סטטוס</th></tr></thead><tbody>${body || '<tr><td colspan=\"6\">אין נתונים</td></tr>'}</tbody></table></section>`;
}

function bindAssignmentsActions() {
  document.getElementById('assignApply')?.addEventListener('click', () => {
    viewState.assignments.filters = {
      authority: document.getElementById('assignAuthority')?.value.trim() || '',
      program: document.getElementById('assignProgram')?.value.trim() || ''
    };
    renderScreen();
  });
  document.getElementById('assignReset')?.addEventListener('click', () => {
    viewState.assignments.filters = { authority: '', program: '' };
    renderScreen();
  });
}

function renderExceptionsFilters() {
  return `<section class="filters-wrap"><label>מדריך<input id="exceptionsEmployee" value="${escAttr(viewState.exceptions.filters.employee)}" /></label><label>רשות<input id="exceptionsAuthority" value="${escAttr(viewState.exceptions.filters.authority)}" /></label><label>מנהל קורס<input id="exceptionsManager" value="${escAttr(viewState.exceptions.filters.courseManager)}" /></label><label>סטטוס טיפול<select id="exceptionsTreatment">${renderSelectOptions(['open', 'resolved'], viewState.exceptions.filters.treatmentStatus)}</select></label><div class="filter-actions"><button class="btn btn-secondary" id="exceptionsApply">סינון</button><button class="btn btn-secondary" id="exceptionsReset">נקה סינון</button></div></section>`;
}

function buildExceptionsRows(reviewRows, courses, filters) {
  const clean = Object.fromEntries(Object.entries(filters || {}).map(([key, value]) => [key, String(value || '').trim().toLowerCase()]));
  return (courses || []).map((course) => {
    const missingTypes = getCourseMissingTypes(course);
    return {
      CourseID: getCourseField(course, COURSE_FIELDS.COURSE_ID) || '',
      Program: getCourseField(course, COURSE_FIELDS.PROGRAM) || getCourseField(course, COURSE_FIELDS.ACTIVITY) || '',
      Employee: resolveInstructorName(course) || '',
      CourseManager: getCourseField(course, COURSE_FIELDS.COURSE_MANAGER) || '',
      Authority: getCourseField(course, COURSE_FIELDS.AUTHORITY) || '',
      School: getCourseField(course, COURSE_FIELDS.SCHOOL) || '',
      ExceptionType: missingTypes.join(' / '),
      TreatmentStatus: 'open',
      Issues: missingTypes.join(' / '),
      Date: getCourseField(course, COURSE_FIELDS.DATE) || getCourseField(course, COURSE_FIELDS.END) || '',
      MissingTypes: missingTypes
    };
  }).filter((row) => {
    if (!row.MissingTypes.length) return false;
    if (clean.employee && !String(row.Employee || '').toLowerCase().includes(clean.employee)) return false;
    if (clean.authority && !String(row.Authority || '').toLowerCase().includes(clean.authority)) return false;
    if (clean.courseManager && !String(row.CourseManager || '').toLowerCase().includes(clean.courseManager)) return false;
    if (clean.treatmentStatus && !String(row.TreatmentStatus || '').toLowerCase().includes(clean.treatmentStatus)) return false;
    return true;
  });
}

function renderExceptionsCards(rows) {
  return `<section class="cards-grid">${rows.map((row) => `<article class="management-card"><div class="card-head"><h3>${esc(row.Program || 'שם קורס לא זמין')}</h3><span class="status-chip status-declined">פתוח</span></div><div class="card-meta"><span>בית ספר: ${esc(row.School || '-')}</span><span>רשות: ${esc(row.Authority || '-')}</span></div><details class="course-secondary-details"><summary>פרטים</summary><div class="card-meta"><span>מה חסר בפועל: ${esc((row.MissingTypes || []).join(' / ') || '-')}</span><span>מדריך: ${esc(row.Employee || 'לא משויך')}</span><span>מנהל קורס: ${esc(row.CourseManager || '-')}</span></div><div class="card-actions"><button class="btn btn-secondary" data-open-course="${escAttr(row.CourseID || '')}">פרטי קורס</button><button class="btn btn-primary" data-edit-row="${escAttr(row.CourseID || '')}">שלח בקשת שינוי</button></div></details></article>`).join('')}</section>`;
}

function bindExceptionsActions() {
  document.getElementById('exceptionsApply')?.addEventListener('click', () => {
    viewState.exceptions.filters = {
      employee: document.getElementById('exceptionsEmployee')?.value.trim() || '',
      authority: document.getElementById('exceptionsAuthority')?.value.trim() || '',
      courseManager: document.getElementById('exceptionsManager')?.value.trim() || '',
      treatmentStatus: document.getElementById('exceptionsTreatment')?.value.trim() || ''
    };
    renderScreen();
  });
  document.getElementById('exceptionsReset')?.addEventListener('click', () => {
    viewState.exceptions.filters = { authority: '', employee: '', courseManager: '', treatmentStatus: '' };
    renderScreen();
  });
  document.querySelectorAll('[data-open-course]').forEach((button) => button.addEventListener('click', () => {
    if (!button.dataset.openCourse) return;
    const row = findCourseById(button.dataset.openCourse);
    if (!row) return;
    viewState.courses.selectedCourseId = String(row.CourseID || '');
    viewState.courses.selectedCourseDetails = row;
    setRoute('courses');
  }));
  bindEditButtons();
}

function exportFinanceToExcel(rows, filename) {
  if (!rows.length) return;
  const headers = ['שם קורס', 'רשות', 'בית ספר', 'תאריך סיום', 'סטטוס', 'הערות'];
  const dataRows = rows.map((row) => [
    String(row?.ProgramsList || row?.BillingGroupType || ''),
    String(row?.Authority || ''),
    String(row?.SchoolsList || ''),
    String(formatDate(parseDateLike(row?.End)) || row?.End || ''),
    String(row?.FinanceStatus || ''),
    String(row?.Notes || '')
  ]);
  const html = `<table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${dataRows.map((cells) => `<tr>${cells.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function formatIsoDateLocal(date) {
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function cssEscape(value) {
  return String(value || '').replace(/"/g, '\\"');
}

function getDisplayRoleForInstructor(instructorName, employeeId = '') {
  const permission = (getStoreSnapshot().permissions || []).find((row) => String(row.employeeName || '').trim() === String(instructorName || '').trim()
    || (employeeId && String(row.employeeId || '') === String(employeeId || '')));
  return permission?.displayRole || '';
}

async function onLogin(event) {
  event?.preventDefault();

  const userIdInput = document.getElementById('userId');
  const codeInput = document.getElementById('loginCode');
  const button = document.getElementById('loginBtn');
  const errorEl = document.getElementById('loginError');

  const userId = userIdInput.value.trim();
  const code = codeInput.value.trim();
  errorEl.textContent = '';
  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = 'מתחבר...';

  const res = await api.login({ userId, code });
  if (!res?.authenticated) {
    errorEl.textContent = res?.message || 'ההתחברות נכשלה.';
    button.disabled = false;
    button.classList.remove('is-loading');
    button.textContent = 'התחבר';
    return;
  }
  setUserState(res);
  await initDataEngine(api, { userState });
  button.classList.remove('is-loading');
  button.textContent = 'התחבר';
  setRoute('dashboard');
}

async function loadRouteData() {
  if (!isAuth()) return;
  if (currentRoute === 'dashboard') return loadDashboard();
  if (currentRoute === 'courses' || currentRoute === 'instructor-view') return loadCourses();
  if (currentRoute === 'week') return loadWeekView();
  if (currentRoute === 'month') return loadMonthView();
  if (currentRoute === 'instructors') return loadInstructorsView();
  if (currentRoute === 'end-dates') return loadEndDatesView();
  if (currentRoute === 'assignments') return loadAssignmentsView();
  if (currentRoute === 'exceptions') return loadExceptionsView();
  if (currentRoute === 'finance') return loadFinanceView();
  if (currentRoute === 'my-requests') return loadMyRequests();
  if (currentRoute === 'approvals' || currentRoute === 'final-approvals') return loadApprovals();
  if (currentRoute === 'eden-view') return loadEdenView();
}

async function loadDashboard() {
  await withLoad('dashboard', async () => {
    const dashboardRes = await api.getDashboard();
    if (!dashboardRes?.success) return dashboardRes;
    const courses = getStoreSnapshot().courses || [];
    return { success: true, data: withOperationalMetrics(dashboardRes.data || {}, courses) };
  }, null, 'לא ניתן לטעון דשבורד.');
}
async function loadCourses(options = {}) {
  const { silent = false, forceRefreshCourseId = '' } = options;
  if (!silent) {
    viewState.courses.loading = true;
    viewState.courses.error = '';
    renderScreen();
  }
  if (forceRefreshCourseId) {
    await refreshCourse(forceRefreshCourseId);
  }
  const filtered = getCoursesForUser(userState, viewState.courses.filters);
  viewState.courses.loading = false;
  viewState.courses.error = '';
  viewState.courses.data = applyCoursesFiltersByUiScope(filtered, viewState.courses.filters);
  viewState.courses.filterOptions = buildFilterOptions(getCoursesForUser(userState, {}));
  if (viewState.courses.selectedCourseId) {
    viewState.courses.selectedCourseDetails = viewState.courses.data.find((item) => String(item.CourseID) === viewState.courses.selectedCourseId) || null;
  }
  renderScreen();
}
async function loadMyRequests() {
  await withLoad('requests', async () => {
    const [apiRes, sheetRows] = await Promise.all([api.getMyRequests(), loadEditRequests()]);
    if (apiRes?.success) {
      return {
        ...apiRes,
        data: {
          ...(apiRes.data || {}),
          items: (apiRes?.data?.items || []).map((item) => ({
            ...item,
            CourseLabel: getCourseDisplayNameById(item.CourseID)
          }))
        }
      };
    }
    return {
      success: true,
      data: {
        items: (sheetRows || []).map((item) => ({
          ...item,
          CourseLabel: getCourseDisplayNameById(item.CourseID)
        }))
      }
    };
  }, [], 'לא ניתן לטעון בקשות.');
}

async function loadFinanceView(options = {}) {
  const { silent = false, force = false } = options;
  if (!silent) {
    viewState.finance.loading = true;
    viewState.finance.error = '';
    renderScreen();
  }
  if (!canAccessFinanceActive() && !canAccessFinanceArchive()) {
    viewState.finance.loading = false;
    viewState.finance.error = 'אין הרשאה למסך כספים.';
    viewState.finance.activeItems = [];
    viewState.finance.archiveItems = [];
    renderScreen();
    return;
  }

  try {
    const tasks = [];
    tasks.push(canAccessFinanceActive() ? loadFinanceItems(force) : Promise.resolve([]));
    tasks.push(canAccessFinanceArchive() ? loadFinanceArchiveItems(force) : Promise.resolve([]));
    const results = await Promise.all(tasks);
    viewState.finance.activeItems = results[0] || [];
    viewState.finance.archiveItems = results[1] || [];
    const hasActiveData = viewState.finance.activeItems.length > 0;
    const hasArchiveData = viewState.finance.archiveItems.length > 0;
    if (viewState.finance.tab === 'archive' && !canAccessFinanceArchive()) viewState.finance.tab = 'active';
    if (viewState.finance.tab === 'active' && !canAccessFinanceActive()) viewState.finance.tab = 'archive';
    if (viewState.finance.tab === 'archive' && !hasArchiveData && hasActiveData) viewState.finance.tab = 'active';
    if (viewState.finance.tab === 'active' && !hasActiveData && hasArchiveData && canAccessFinanceArchive()) viewState.finance.tab = 'archive';
    viewState.finance.error = '';
  } catch (error) {
    viewState.finance.error = 'לא ניתן לטעון נתוני כספים.';
  }
  viewState.finance.loading = false;
  renderScreen();
}

function getFinanceStatusBucket(statusValue) {
  const clean = String(statusValue || '').trim().toLowerCase();
  if (clean.includes('בוצע') || clean.includes('complete') || clean.includes('closed')) return { key: 'completed', label: 'הושלם' };
  if (clean.includes('מעקב') || clean.includes('טיפול') || clean.includes('progress') || clean.includes('processing')) return { key: 'in-progress', label: 'בטיפול' };
  if (clean.includes('חריג') || clean.includes('חסר') || clean.includes('בעיה') || clean.includes('תקוע')) return { key: 'needs-action', label: 'דורש פעולה' };
  return { key: 'open', label: 'פתוח' };
}

function summarizeFinanceBuckets(rows = []) {
  return (rows || []).reduce((acc, item) => {
    const bucket = getFinanceStatusBucket(item?.FinanceStatus);
    if (bucket.key === 'completed') acc.completed += 1;
    else if (bucket.key === 'in-progress') acc.inProgress += 1;
    else if (bucket.key === 'needs-action') acc.needsAction += 1;
    else acc.open += 1;
    return acc;
  }, { open: 0, inProgress: 0, completed: 0, needsAction: 0 });
}
async function loadEdenView() {
  viewState.eden.loading = true; viewState.eden.error = ''; renderScreen();
  const queueRes = await api.getEdenView();
  viewState.eden.loading = false;
  if (!queueRes?.success) {
    viewState.eden.error = queueRes?.message || 'לא ניתן לטעון את תצוגת עדן.';
    viewState.eden.data = { queue: [], exceptions: [] };
    renderScreen();
    return;
  }
  const courses = getStoreSnapshot().courses || [];
  viewState.eden.data = {
    queue: queueRes?.data?.items || [],
    exceptions: buildExceptionRecords(courses)
  };
  renderScreen();
}

async function loadApprovals() {
  viewState.approvals.loading = true; viewState.approvals.error = ''; renderScreen();
  const res = await api.getApprovals();
  viewState.approvals.loading = false;
  if (!res?.success) { viewState.approvals.error = res?.message || 'לא ניתן לטעון אישורים.'; viewState.approvals.data = []; renderScreen(); return; }
  viewState.approvals.data = (res?.data?.items || []).map((item) => ({
    ...item,
    CourseLabel: getCourseDisplayNameById(item.CourseID),
    OriginalDataView: toHuman(item.OriginalData),
    RequestedDataView: toHuman(item.RequestedData)
  }));
  renderScreen();
}

function buildExceptionRecords(courses = []) {
  return (courses || []).map((course) => {
    const missingTypes = getCourseMissingTypes(course);
    return {
      courseId: getCourseField(course, COURSE_FIELDS.COURSE_ID) || '',
      activity: getCourseField(course, COURSE_FIELDS.PROGRAM) || getCourseField(course, COURSE_FIELDS.ACTIVITY) || '',
      instructor: resolveInstructorName(course) || '',
      authority: getCourseField(course, COURSE_FIELDS.AUTHORITY) || '',
      school: getCourseField(course, COURSE_FIELDS.SCHOOL) || '',
      type: missingTypes.join(' / '),
      description: missingTypes.join(' / '),
      treatmentStatus: missingTypes.length ? 'open' : 'resolved',
      treatmentStatusLabel: missingTypes.length ? 'פתוח' : 'טופל',
      missingTypes
    };
  }).filter((item) => item.missingTypes.length > 0);
}

function applyExceptionFilters(rows = []) {
  const clean = Object.fromEntries(Object.entries(viewState.eden.filters || {}).map(([key, value]) => [key, String(value || '').trim().toLowerCase()]));
  return (rows || []).filter((item) => {
    if (clean.type && !String(item.type || '').toLowerCase().includes(clean.type)) return false;
    if (clean.instructor && !String(item.instructor || '').toLowerCase().includes(clean.instructor)) return false;
    if (clean.authority && !String(item.authority || '').toLowerCase().includes(clean.authority)) return false;
    if (clean.treatment && !String(item.treatmentStatus || '').toLowerCase().includes(clean.treatment)) return false;
    return true;
  });
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

function normalizeCoursesResponse(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length && typeof items[0] === 'object' && !Array.isArray(items[0])) {
    return items.map((item) => normalizeCourseRecord(item));
  }
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  if (!rows.length) return [];
  const [headerRow, , ...dataRows] = rows;
  if (!Array.isArray(headerRow)) return [];
  return dataRows.map((row) => {
    const mapped = {};
    headerRow.forEach((header, index) => { mapped[String(header || '').trim()] = row?.[index]; });
    return normalizeCourseRecord(mapped);
  });
}

function normalizeCourseRecord(raw = {}) {
  const out = { ...raw };
  out[COURSE_FIELDS.COURSE_ID] = String(raw[COURSE_FIELDS.COURSE_ID] || '');
  out[COURSE_FIELDS.PROGRAM_CODE] = numberFrom(raw[COURSE_FIELDS.PROGRAM_CODE]);
  out[COURSE_FIELDS.EMPLOYEE_ID] = numberFrom(raw[COURSE_FIELDS.EMPLOYEE_ID]);
  out[COURSE_FIELDS.PLANNED_MEETINGS] = numberFrom(raw[COURSE_FIELDS.PLANNED_MEETINGS]);
  out[COURSE_FIELDS.ACTUAL_MEETINGS] = numberFrom(raw[COURSE_FIELDS.ACTUAL_MEETINGS], raw[COURSE_FIELDS.SOURCE_ACTUAL_MEETINGS]);
  out[COURSE_FIELDS.START_TIME] = formatTimeValue(raw[COURSE_FIELDS.START_TIME]);
  out[COURSE_FIELDS.END_TIME] = formatTimeValue(raw[COURSE_FIELDS.END_TIME]);
  COURSE_DATE_FIELDS.forEach((fieldName) => {
    out[fieldName] = parseDateLike(raw[fieldName]);
  });
  out[COURSE_FIELDS.END] = parseDateLike(raw[COURSE_FIELDS.END]);
  return out;
}

function applyCoursesFiltersByUiScope(rows, filters) {
  const list = Array.isArray(rows) ? rows : [];
  const clean = Object.fromEntries(Object.entries(filters || {}).map(([key, value]) => [key, String(value || '').trim().toLowerCase()]));
  return list.filter((row) => {
    if (clean.authority && !String(getCourseField(row, COURSE_FIELDS.AUTHORITY) || '').toLowerCase().includes(clean.authority)) return false;
    if (clean.school && !String(getCourseField(row, COURSE_FIELDS.SCHOOL) || '').toLowerCase().includes(clean.school)) return false;
    if (clean.courseManager && !String(getCourseField(row, COURSE_FIELDS.COURSE_MANAGER) || '').toLowerCase().includes(clean.courseManager)) return false;
    if (clean.employee && !String(resolveInstructorName(row) || '').toLowerCase().includes(clean.employee)) return false;
    if (clean.program) {
      const text = `${String(getCourseField(row, COURSE_FIELDS.PROGRAM) || '')} ${String(getCourseField(row, COURSE_FIELDS.PROGRAM_CODE) || '')}`.toLowerCase();
      if (!text.includes(clean.program)) return false;
    }
    if (clean.monthStart) {
      const monthStart = parseDateLike(clean.monthStart);
      const end = getCourseField(row, COURSE_FIELDS.END);
      if (monthStart && end && end < startOfDay(monthStart)) return false;
    }
    if (clean.monthEnd) {
      const monthEnd = parseDateLike(clean.monthEnd);
      const end = getCourseField(row, COURSE_FIELDS.END);
      if (monthEnd && end && end > endOfDay(monthEnd)) return false;
    }
    if (isDualMode()) return isManagedByCurrentUser(row) || isTaughtByCurrentUser(row);
    if (isInstructor()) return isTaughtByCurrentUser(row);
    return true;
  });
}

function isTaughtByCurrentUser(row) {
  const byId = String(getCourseField(row, COURSE_FIELDS.EMPLOYEE_ID) || '').trim();
  const sessionId = String(userState.EmployeeID || userState.userId || '').trim();
  const byName = String(resolveInstructorName(row) || '').trim();
  const sessionName = String(userState.displayName || '').trim();
  return Boolean((sessionId && byId && byId === sessionId) || (sessionName && byName && byName === sessionName));
}

function isManagedByCurrentUser(row) {
  const teamScope = String(userState.TeamScope || '').trim();
  const viewScope = String(userState.ViewScope || '').trim();
  if (teamScope && String(getCourseField(row, COURSE_FIELDS.AUTHORITY) || '').includes(teamScope)) return true;
  if (viewScope && String(getCourseField(row, COURSE_FIELDS.AUTHORITY) || '').includes(viewScope)) return true;
  return false;
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

function withOperationalMetrics(baseData, courses) {
  const now = new Date();
  const plusSeven = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
  const activeCourses = courses.filter((row) => isActiveCourse(row, now));
  const activeInstructors = new Set(activeCourses.map((row) => resolveInstructorName(row)).filter(Boolean));
  const dayEnd = endOfDay(now);
  const weekEnd = new Date(dayEnd.getTime() + (6 * 24 * 60 * 60 * 1000));
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const timeViews = {
    day: courses.filter((row) => getScheduleDates(row).some((d) => isDateInRange(d, now, dayEnd))),
    week: courses.filter((row) => getScheduleDates(row).some((d) => isDateInRange(d, now, weekEnd))),
    month: courses.filter((row) => getScheduleDates(row).some((d) => isDateInRange(d, startOfDay(now), monthEnd)))
  };
  const instructorOverview = buildInstructorOverview(courses);
  const actionItems = buildActionItems(courses);
  return {
    ...baseData,
    activeNowCount: activeCourses.length,
    todayActivitiesCount: timeViews.day.length,
    weekActivitiesCount: timeViews.week.length,
    monthActivitiesCount: timeViews.month.length,
    activeCoursesCount: activeCourses.length,
    activeInstructorsCount: activeInstructors.size,
    missingReportCount: courses.filter((row) => isMissingReport(row)).length,
    missingInstructorCount: courses.filter((row) => !hasInstructor(row)).length,
    missingDataCount: courses.filter((row) => isMissingReport(row) || !hasInstructor(row)).length,
    endingSoonCount: courses.filter((row) => isDateInRange(firstDate(row, ['EndDate', 'End']), now, plusSeven)).length,
    exceptionCount: courses.filter((row) => hasException(row)).length,
    changeRequestCount: courses.filter((row) => hasValue(row, ['ChangeRequest'])).length,
    openPendingRequestsCount: numberFrom(baseData.pendingRequests, baseData.pendingFinal),
    unassignedInstructorCount: courses.filter((row) => !hasInstructor(row)).length,
    instructorGapCount: courses.filter((row) => hasInstructorGap(row)).length,
    timeViews: timeViews,
    instructorOverview: instructorOverview,
    actionItems: actionItems
  };
}

function buildInstructorOverview(courses) {
  const map = new Map();
  courses.forEach((row) => {
    const name = resolveInstructorName(row) || 'לא משויך';
    if (!map.has(name)) map.set(name, { instructor: name, coursesCount: 0, authorities: new Set(), schools: new Set(), hasGap: false });
    const item = map.get(name);
    item.coursesCount += 1;
    if (row?.Authority) item.authorities.add(String(row.Authority));
    if (row?.School) item.schools.add(String(row.School));
    if (hasInstructorGap(row)) item.hasGap = true;
  });
  return Array.from(map.values())
    .map((item) => ({ ...item, authorities: Array.from(item.authorities), schools: Array.from(item.schools) }))
    .sort((a, b) => b.coursesCount - a.coursesCount);
}

function buildActionItems(courses) {
  const items = [];
  courses.forEach((row) => {
    const activity = row?.Activity || row?.Program || 'שם קורס לא זמין';
    const instructor = resolveInstructorName(row) || '';
    const location = joinLocation(row);
    if (!instructor) items.push({ type: 'חסר מדריך', activity: activity, instructor: '', location: location, filter: 'unassigned_instructor' });
    if (isMissingReport(row)) items.push({ type: 'חסר דיווח', activity: activity, instructor: instructor, location: location, filter: 'missing_report' });
    if (hasException(row)) items.push({ type: getCourseMissingTypes(row).join(' / '), activity: activity, instructor: instructor, location: location, filter: 'exceptions' });
    if (hasOperationalIssue(row)) {
      items.push({ type: 'דורש בקרה', activity: activity, instructor: instructor, location: location, filter: 'needs_review' });
    }
    if (isDateInRange(firstDate(row, ['EndDate', 'End']), new Date(), new Date(new Date().getTime() + (7 * 24 * 60 * 60 * 1000)))) {
      items.push({ type: 'מסתיים בקרוב', activity: activity, instructor: instructor, location: location, filter: 'ending_soon' });
    }
  });
  return items;
}

function resolveInstructorName(row) {
  return String(getCourseField(row, COURSE_FIELDS.EMPLOYEE)
    || row?.[INSTRUCTOR_FALLBACK_FIELD]
    || getCourseField(row, COURSE_FIELDS.EMPLOYEE_ID)
    || '').trim();
}


function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  });
}

async function boot() {
  hydrateUserState();
  if (isAuth()) {
    const profile = await api.getSessionProfile();
    if (profile?.authenticated) {
      setUserState(profile);
      await initDataEngine(api, { userState });
      setRoute('dashboard');
      return;
    }
    clearUserState();
  }
  setRoute('login');
}

registerServiceWorker();
boot();
