import { api } from './api.js';
import { userState, setUserState, clearUserState, hydrateUserState } from './state.js';
import {
  initDataEngine,
  getStoreSnapshot,
  getCoursesForUser,
  getPermissionForUser,
  refreshCourse,
  updateCourse,
  createEditRequest,
  buildFilterOptions,
  loadEditRequests,
  loadReviewItems,
  reloadCourses
} from './data-engine.js';
import {
  COURSE_FIELDS,
  EXCEPTION_FIELDS,
  TAASIYEDA_DATA_CONTRACTS,
  getSessionProgress,
  getInstructorLoad,
  hasCourseDelays,
  getExceptionTreatmentStatus,
  parseDelayInfo
} from './data-contracts.js';

const app = document.getElementById('app');
const APP_NAME = 'Dashboard Taasiyeda';
let currentRoute = 'login';
let mobileNavOpen = false;

const viewState = {
  dashboard: { loading: false, error: '', data: null, timeframe: 'day' },
  courses: {
    loading: false,
    error: '',
    data: [],
    filters: { authority: '', school: '', courseManager: '', employee: '', period: '', monthStart: '', monthEnd: '' },
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
};

const roleMap = {
  admin: 'מנהל מערכת ראשי',
  'admin-ops': 'אחראית בקרה ותפעול',
  manager: 'מנהל פעילות',
  'manager-lead': 'מנהלת תחום',
  instructor: 'מדריך'
};

const routeLabels = {
  login: 'כניסה למערכת',
  dashboard: 'דשבורד פעילות ארצי',
  courses: 'פעילות / קורסים / סדנאות',
  'my-requests': 'הבקשות שלי',
  approvals: 'אישורי בקרה ותפעול',
  'eden-view': 'תצוגת בקרה ותפעול',
  'final-approvals': 'אישור סופי הנהלה',
  'instructor-view': 'תצוגת מדריכים',
  week: 'שבוע',
  month: 'חודש',
  instructors: 'מדריכים',
  'end-dates': 'תאריכי סיום',
  assignments: 'שיבוץ',
  exceptions: 'חריגות'
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
  logout: '↩'
};

const COURSES_SCREEN_CONFIG = {
  progress: { successRatio: 0.9, warningRatio: 0.6 },
  meetingFields: { start: 1, end: 15, fallbackEndField: COURSE_FIELDS.END }
};

const TAASIYEDA_CONFIG = TAASIYEDA_DATA_CONTRACTS;

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
function canDirectEditCourses() {
  const permission = currentPermission();
  if (permission) {
    return String(permission.systemRole || '').toUpperCase() === 'IDAN_MAIN_ADMIN'
      || String(permission.editScope || '').toUpperCase() === 'MAIN_DATA_DIRECT_EDIT'
      || permission.canEditMasterData;
  }
  return isIdan();
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
    <h1 class="login-title">כניסה למערכת</h1>
    <p class="login-subtitle">${APP_NAME}</p>
    <input id="userId" class="login-input" placeholder="מזהה משתמש" aria-label="מזהה משתמש" autocomplete="username" />
    <input id="loginCode" class="login-input" type="password" placeholder="קוד כניסה" aria-label="קוד כניסה" autocomplete="current-password" />
    <button class="btn btn-primary login-btn" id="loginBtn">התחבר</button><p class="error" id="loginError"></p></div></section>`;
    document.getElementById('loginBtn').addEventListener('click', onLogin);
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
    ${nav('my-requests', 'הבקשות שלי')}
    ${isEden() ? nav('approvals', 'אישורי בקרה ותפעול') : ''}
    ${(isEden() || isIdan()) ? nav('eden-view', 'תצוגת בקרה ותפעול') : ''}
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

function updateDocumentTitle() {
  const pageLabel = routeLabels[currentRoute] || routeLabels.dashboard;
  document.title = `${APP_NAME} | ${pageLabel}`;
}

function renderScreen() {
  const main = document.getElementById('main');
  if (!main) return;

  if (currentRoute === 'dashboard') {
    const d = viewState.dashboard.data || {};
    const timeframe = viewState.dashboard.timeframe || 'day';
    const timeItems = d.timeViews?.[timeframe] || [];
    const instructorItems = d.instructorOverview || [];
    const actionItems = d.actionItems || [];
    main.innerHTML = head('דשבורד פעילות ארצי', 'מוקד ניהולי לפעילות, קורסים ומדריכים לצד בקרה תפעולית') + panel(viewState.dashboard, 'אין נתונים.',
      `<section class="kpi-section"><h3>ליבת הפעילות והתפעול</h3><div class="kpi-grid">
      ${kpiCard('פעילויות היום', d.todayActivitiesCount || 0, 'today')}
      ${kpiCard('פעילויות השבוע', d.weekActivitiesCount || 0, 'this_week')}
      ${kpiCard('פעילויות החודש', d.monthActivitiesCount || 0, 'this_month')}
      ${kpiCard('פעילויות מתקיימות עכשיו', d.activeNowCount || 0, 'active_now')}
      ${kpiCard('קורסים פעילים', d.activeCoursesCount || 0, 'active_courses')}
      ${kpiCard('מדריכים פעילים', d.activeInstructorsCount || 0, 'active_instructors')}
      ${kpiCard('דורש בקרה', d.reviewRequiredCount || 0, 'needs_review')}
      ${kpiCard('חסר בדיווח', d.missingReportCount || 0, 'missing_report')}
      ${kpiCard('עומד להסתיים (7 ימים)', d.endingSoonCount || 0, 'ending_soon')}
      ${kpiCard('חריגה / אי התאמה', d.exceptionCount || 0, 'exceptions')}
      ${kpiCard('בקשת שינוי פתוחה', d.changeRequestCount || 0, 'change_request')}
      </div></section>
      <section class="kpi-section"><h3>מבט מדריכים</h3><div class="kpi-grid compact">
      ${kpiCard('מדריך בעומס', d.instructorOverloadCount || 0, 'instructor_overload')}
      ${kpiCard('ללא שיוך מדריך', d.unassignedInstructorCount || 0, 'unassigned_instructor')}
      ${kpiCard('פער תפעולי למדריך', d.instructorGapCount || 0, 'instructor_gap')}
      </div></section>
      <section class="panel-block">
        <div class="panel-block-head">
          <h3>תצוגת זמן תפעולית</h3>
          <div class="timeframe-switch">
            <button class="btn btn-secondary ${timeframe === 'day' ? 'active' : ''}" data-timeframe="day">יום</button>
            <button class="btn btn-secondary ${timeframe === 'week' ? 'active' : ''}" data-timeframe="week">שבוע</button>
            <button class="btn btn-secondary ${timeframe === 'month' ? 'active' : ''}" data-timeframe="month">חודש</button>
          </div>
        </div>
        ${dashboardOperationalTable(timeItems)}
      </section>
      <section class="split-grid">
        <article class="panel-block">
          <div class="panel-block-head"><h3>מבט מדריכים</h3><button class="btn btn-secondary" data-open-filter="active_instructors">לכל המדריכים הפעילים</button></div>
          ${dashboardInstructorTable(instructorItems)}
        </article>
        <article class="panel-block">
          <div class="panel-block-head"><h3>חריגות, חוסרים ומשימות טיפול</h3><button class="btn btn-secondary" data-open-filter="exceptions">לכל המשימות</button></div>
          ${dashboardActionTable(actionItems)}
        </article>
      </section>
      <section class="kpi-section secondary"><h3>בקשות ואישורים (משני)</h3><div class="kpi-grid compact">
      ${kpiCard('ממתין לבקרת תפעול', d.pendingRequests || 0, 'pending_eden')}
      ${kpiCard('ממתין לאישור הנהלה', d.pendingFinal || 0, 'pending_final')}
      ${kpiCard('בקשות שאושרו סופית', d.approvedFinal || 0, 'approved_final')}
      </div></section>`);
    document.querySelectorAll('[data-kpi-filter]').forEach((button) => button.addEventListener('click', () => onKpiClick(button.dataset.kpiFilter)));
    document.querySelectorAll('[data-timeframe]').forEach((button) => button.addEventListener('click', () => {
      viewState.dashboard.timeframe = button.dataset.timeframe || 'day';
      renderScreen();
    }));
    document.querySelectorAll('[data-open-filter]').forEach((button) => button.addEventListener('click', () => onKpiClick(button.dataset.openFilter)));
    return;
  }

  if (currentRoute === 'courses' || currentRoute === 'instructor-view') {
    const subtitle = isInstructor() ? 'רק קורסים שמשויכים אליך' : `תפקיד פעיל: ${displayRole()}`;
    const filteredCourses = applyCourseQuickFilter(viewState.courses.data);
    const selectedInstructor = viewState.courses.selectedInstructor;
    const instructorOverview = buildInstructorOverview(filteredCourses);
    const visibleCourses = currentRoute === 'instructor-view' && selectedInstructor
      ? filteredCourses.filter((row) => String(row?.Instructor || '').trim() === selectedInstructor)
      : filteredCourses;
    const activeFiltersCount = Object.values(viewState.courses.filters).filter((value) => String(value || '').trim()).length;
    main.innerHTML = head(currentRoute === 'courses' ? 'ניהול קורסים' : 'תצוגת מדריכים', `${subtitle} · קורסים מוצגים: ${visibleCourses.length} · פילטרים פעילים: ${activeFiltersCount}`) +
    `<section class="filters-wrap courses-filters">
      <label>רשות<select id="authorityFilter">${renderSelectOptions(viewState.courses.filterOptions.authority, viewState.courses.filters.authority)}</select></label>
      <label>בית ספר<select id="schoolFilter">${renderSelectOptions(viewState.courses.filterOptions.school, viewState.courses.filters.school)}</select></label>
      <label>מנהל קורס<select id="courseManagerFilter">${renderSelectOptions(viewState.courses.filterOptions.courseManager, viewState.courses.filters.courseManager)}</select></label>
      <label>מדריך<select id="employeeFilter">${renderSelectOptions(viewState.courses.filterOptions.employee, viewState.courses.filters.employee)}</select></label>
      <label>תקופה<input id="periodFilter" placeholder="למשל: 04/2026" value="${escAttr(viewState.courses.filters.period)}"></label>
      <label>מתאריך חודש<input id="monthStartFilter" placeholder="MonthStart" value="${escAttr(viewState.courses.filters.monthStart)}"></label>
      <label>עד תאריך חודש<input id="monthEndFilter" placeholder="MonthEnd" value="${escAttr(viewState.courses.filters.monthEnd)}"></label>
      <div class="filter-actions">
        <button class="btn btn-secondary" id="filterCourses">סינון</button>
        <button class="btn btn-secondary" id="resetCourseFilters">נקה סינון</button>
      </div>
    </section>` +
    panel(viewState.courses, 'אין רשומות.', `${currentRoute === 'instructor-view' ? renderInstructorCards(instructorOverview, selectedInstructor) : ''}
    ${selectedInstructor ? `<section class="drilldown-head"><span>מדריך</span><strong>${esc(selectedInstructor)}</strong><button class="btn btn-secondary" id="clearInstructorDrilldown">חזרה לכל המדריכים</button></section>` : ''}
    ${renderCourseCards(visibleCourses, { canEdit: canDirectEditCourses() })}`) +
    renderCourseDetailsPanel(viewState.courses.selectedCourseDetails, { canEdit: canDirectEditCourses() });
    document.getElementById('filterCourses')?.addEventListener('click', () => {
      viewState.courses.quickFilter = '';
      viewState.courses.selectedInstructor = '';
      viewState.courses.filters = {
        authority: document.getElementById('authorityFilter')?.value.trim() || '',
        school: document.getElementById('schoolFilter')?.value.trim() || '',
        courseManager: document.getElementById('courseManagerFilter')?.value.trim() || '',
        employee: document.getElementById('employeeFilter')?.value.trim() || '',
        period: document.getElementById('periodFilter')?.value.trim() || '',
        monthStart: document.getElementById('monthStartFilter')?.value.trim() || '',
        monthEnd: document.getElementById('monthEndFilter')?.value.trim() || ''
      };
      loadCourses();
    });
    document.getElementById('resetCourseFilters')?.addEventListener('click', () => {
      viewState.courses.quickFilter = '';
      viewState.courses.selectedInstructor = '';
      viewState.courses.filters = { authority: '', school: '', courseManager: '', employee: '', period: '', monthStart: '', monthEnd: '' };
      loadCourses();
    });
    document.getElementById('clearInstructorDrilldown')?.addEventListener('click', () => {
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
    main.innerHTML = head('מסך שבוע', 'תמונת מצב שבועית תפעולית') +
      renderWeekFilters() +
      panel({ loading: viewState.week.loading, error: viewState.week.error, data: weekData.days }, 'אין מפגשים לשבוע זה.', renderWeekGrid(weekData.days)) +
      renderWeekDetails(viewState.week.selected);
    bindWeekActions(weekData);
    return;
  }

  if (currentRoute === 'month') {
    const monthCourses = getRoleScopedCourses(viewState.month.filters);
    const monthData = buildMonthlyCalendar(monthCourses, viewState.month.monthDate);
    main.innerHTML = head('מסך חודש', 'מבט חודשי על עומסים ופעילויות') +
      renderMonthFilters() +
      panel({ loading: viewState.month.loading, error: viewState.month.error, data: monthData.days }, 'אין נתונים לחודש שנבחר.', renderMonthGrid(monthData.days)) +
      renderMonthDayDetails(monthData.selectedItems, viewState.month.selectedDate);
    bindMonthActions(monthData);
    return;
  }

  if (currentRoute === 'instructors') {
    const instructorsData = buildInstructorsViewData(getRoleScopedCourses(viewState.instructors.filters));
    main.innerHTML = head('מסך מדריכים', 'עומסים, חריגות ופעילות לפי מדריך') +
      renderInstructorsFilters() +
      panel({ loading: viewState.instructors.loading, error: viewState.instructors.error, data: instructorsData.items }, 'אין מדריכים להצגה.', renderInstructorsCards(instructorsData.items)) +
      renderInstructorCoursesDrilldown(viewState.instructors.selectedInstructor, instructorsData.coursesByInstructor);
    bindInstructorsActions();
    return;
  }

  if (currentRoute === 'end-dates') {
    const endDateItems = buildEndDateItems(getCoursesForUser(userState, viewState.endDates.filters));
    main.innerHTML = head('מסך תאריכי סיום', 'בקרת קורסים לקראת סיום') +
      renderEndDatesFilters() +
      panel({ loading: viewState.endDates.loading, error: viewState.endDates.error, data: endDateItems }, 'אין קורסים בטווח הסיום שנבחר.', renderEndDateCards(endDateItems));
    bindEndDatesActions();
    return;
  }

  if (currentRoute === 'assignments') {
    const assignmentRows = buildAssignmentsRows(getRoleScopedCourses(viewState.assignments.filters));
    main.innerHTML = head('מסך שיבוץ', 'תצפית עומסים לשיבוץ (ללא כתיבה)') +
      renderAssignmentsFilters() +
      panel({ loading: viewState.assignments.loading, error: viewState.assignments.error, data: assignmentRows }, 'אין נתוני שיבוץ להצגה.', renderAssignmentsTable(assignmentRows));
    bindAssignmentsActions();
    return;
  }

  if (currentRoute === 'exceptions') {
    const exceptionRows = buildExceptionsRows(getStoreSnapshot().reviewItems || [], getRoleScopedCourses({}), viewState.exceptions.filters);
    main.innerHTML = head('מסך חריגות', 'רשומות REVIEW_REQUIRED וחריגות תפעוליות') +
      renderExceptionsFilters() +
      panel({ loading: viewState.exceptions.loading, error: viewState.exceptions.error, data: exceptionRows }, 'אין חריגות להצגה.', renderExceptionsCards(exceptionRows));
    bindExceptionsActions();
    return;
  }

  if (currentRoute === 'my-requests') {
    main.innerHTML = head('הבקשות שלי', 'טיוטות, סטטוסים והערות') + panel(viewState.requests, 'אין בקשות.',
      table(viewState.requests.data, [['RequestID','מזהה בקשה'],['CourseID','קורס'],['ChangeSummary','תקציר'],['ApprovalStatus','סטטוס'],['ApprovalNotes','הערות']], false));
    return;
  }

  if (currentRoute === 'approvals' || currentRoute === 'final-approvals') {
    const title = currentRoute === 'approvals' ? 'מסך אישורי בקרה ותפעול' : 'מסך אישור סופי הנהלה';
    main.innerHTML = head(title, 'השוואה בין מקור לשינוי לפני החלטה') + panel(viewState.approvals, 'אין בקשות.',
      table(viewState.approvals.data, [['RequestID','מזהה'],['CourseID','קורס'],['ChangeSummary','תקציר'],['OriginalDataView','מקור'],['RequestedDataView','שינוי']], false, true));
    bindApprovalButtons();
    return;
  }

  if (currentRoute === 'eden-view') {
    const exceptions = applyExceptionFilters(viewState.eden.data.exceptions || []);
    main.innerHTML = head('חריגות וחוסרים', 'מסך עבודה אופרטיבי לטיפול בבעיות') +
    `<section class="filters-wrap"><label>סוג בעיה<input id="issueTypeFilter" value="${escAttr(viewState.eden.filters.type)}"></label>
    <label>מדריך<input id="issueInstructorFilter" value="${escAttr(viewState.eden.filters.instructor)}"></label>
    <label>רשות<input id="issueAuthorityFilter" value="${escAttr(viewState.eden.filters.authority)}"></label>
    <label>סטטוס טיפול<input id="issueTreatmentFilter" value="${escAttr(viewState.eden.filters.treatment)}"></label>
    <button class="btn btn-secondary" id="filterIssues">סינון</button></section>` +
    panel(viewState.eden, 'אין חריגות פתוחות.', `${renderExceptionCards(exceptions)}
    <section class="panel-block"><div class="panel-block-head"><h3>תור אישורי בקרה</h3></div>${table(viewState.eden.data.queue || [], [['RequestID','מזהה'],['CourseID','קורס'],['ChangeSummary','תקציר'],['ApprovalStatus','סטטוס']], false)}</section>`);
    document.getElementById('filterIssues')?.addEventListener('click', () => {
      viewState.eden.filters = {
        type: document.getElementById('issueTypeFilter')?.value.trim() || '',
        instructor: document.getElementById('issueInstructorFilter')?.value.trim() || '',
        authority: document.getElementById('issueAuthorityFilter')?.value.trim() || '',
        treatment: document.getElementById('issueTreatmentFilter')?.value.trim() || ''
      };
      renderScreen();
    });
    bindExceptionActions();
  }
}

function panel(state, empty, content) {
  if (state.loading) return '<section class="panel-state">טוען...</section>';
  if (state.error) return `<section class="panel-state error">${esc(state.error)}</section>`;
  const hasRows = Array.isArray(state.data) ? state.data.length : state.data;
  return hasRows ? content : `<section class="panel-state">${empty}</section>`;
}

function kpiCard(title, value, filterName, helper = '') {
  return `<button class="kpi-card kpi-action" data-kpi-filter="${filterName}" type="button"><span class="kpi-title" title="${escAttr(title)}">${title}</span><span class="kpi-value">${value}</span>${helper ? `<span class="kpi-helper" title="${escAttr(helper)}">${helper}</span>` : ''}</button>`;
}

function table(rows, cols, canEdit, canApprove) {
  const body = (rows || []).map((r, i) => `<tr>${cols.map((c) => {
    if (c[0] === 'ApprovalStatus') return `<td><span class="status-chip ${statusClass(r[c[0]])}">${statusLabel(r[c[0]])}</span></td>`;
    return `<td>${esc(r[c[0]] || '')}</td>`;
  }).join('')}<td>${canEdit ? `<button class="btn btn-secondary" data-edit-row="${i}">בקשת שינוי</button>` : canApprove ? `<button class="btn btn-primary" data-approve-row="${i}">אשר</button> <button class="btn btn-secondary" data-reject-row="${i}">דחה</button>` : ''}</td></tr>`).join('');
  return `<section class="table-wrap"><table><thead><tr>${cols.map((c) => `<th>${c[1]}</th>`).join('')}<th>פעולה</th></tr></thead><tbody>${body}</tbody></table></section>`;
}

function renderSelectOptions(options = [], selected = '') {
  const initial = '<option value="">הכל</option>';
  const body = options.map((option) => `<option value="${escAttr(option)}" ${option === selected ? 'selected' : ''}>${esc(option)}</option>`).join('');
  return `${initial}${body}`;
}

function renderCourseCards(rows, options = {}) {
  if (!rows.length) return '<section class="panel-empty">לא נמצאו פעילויות לפי הסינון.</section>';
  return `<section class="cards-grid">${rows.map((row, index) => {
    const issueText = summarizeIssue(row);
    const progress = courseProgress(row);
    const sessionProgress = getSessionProgress(row);
    const actual = sessionProgress.actualMeetings;
    const planned = sessionProgress.plannedMeetings;
    const timeLabel = `${formatTimeValue(row[COURSE_FIELDS.START_TIME])}-${formatTimeValue(row[COURSE_FIELDS.END_TIME])}`;
    return `<article class="management-card">
      <header class="card-head">
        <div>
          <h3>${esc(row.Program || row.Activity || 'פעילות ללא שם')}</h3>
          <p>רשות: ${esc(row.Authority || '-')} · בית ספר: ${esc(row.School || '-')}</p>
        </div>
        <div class="card-status">${renderStatusBadge(row)}${renderIssueBadge(row)}</div>
      </header>
      <div class="course-core-grid">
        <div class="course-core-col">
          <span><strong>מדריך:</strong> ${esc(resolveInstructorName(row) || 'טרם שויך')}</span>
          <span><strong>מנהל קורס:</strong> ${esc(row.CourseManager || '-')}</span>
          <span><strong>מנהל מדריכים:</strong> ${esc(row.InstructorManager || '-')}</span>
        </div>
        <div class="course-core-col">
          <span><strong>יום:</strong> ${esc(row.DayName || '-')}</span>
          <span><strong>שעות:</strong> ${esc(timeLabel)}</span>
        </div>
        <div class="course-core-col">
          <span><strong>מפגשים:</strong> ${esc(actual)} מתוך ${esc(planned)}</span>
          <span><strong>מפגש:</strong> ${esc(Math.min(actual, planned || actual || 0))} מתוך ${esc(planned || 0)}</span>
          <div class="progress-mini">
            <div class="progress-mini-fill ${progress.level}" style="width:${progress.percent}%"></div>
          </div>
        </div>
      </div>
      <div class="card-kpi-row">
        <span>${esc(row.ClassGroup || 'ללא קבוצה')}</span>
        <span>סיום קורס: ${esc(formatDate(parseDateLike(row[COURSE_FIELDS.END])) || '-')}</span>
      </div>
      <div class="card-issue ${hasException(row) || isMissingReport(row) ? 'has-issue' : ''}">
        <strong>בעיה/חוסר:</strong> ${esc(issueText)}
      </div>
      <footer class="card-actions">
        <button class="btn btn-secondary" data-open-course="${escAttr(row[COURSE_FIELDS.COURSE_ID] || '')}">פרטים</button>
        ${options.canEdit ? `<button class="btn btn-primary" data-edit-row="${escAttr(row[COURSE_FIELDS.COURSE_ID] || '')}">עריכת קורס</button>` : `<button class="btn btn-secondary" data-edit-row="${escAttr(row[COURSE_FIELDS.COURSE_ID] || '')}">בקשת שינוי</button>`}
      </footer>
    </article>`;
  }).join('')}</section>`;
}

function renderInstructorCards(rows, selectedInstructor) {
  if (!rows.length) return '<section class="panel-empty">אין נתוני מדריכים זמינים.</section>';
  return `<section class="cards-grid instructor-grid">${rows.map((row) => {
    const loadLevel = row.coursesCount >= 6 ? 'גבוה' : row.coursesCount >= 3 ? 'בינוני' : 'נמוך';
    return `<article class="management-card instructor-card ${selectedInstructor === row.instructor ? 'active' : ''}">
      <header class="card-head">
        <h3>${esc(row.instructor)}</h3>
        ${renderInstructorState(row)}
      </header>
      <div class="card-meta">
        <span>📚 פעילויות: ${esc(row.coursesCount)}</span>
        <span>🏛️ רשויות: ${esc(row.authorities.join(', ') || '-')}</span>
        <span>🏫 בתי ספר: ${esc(row.schools.join(', ') || '-')}</span>
        <span>⚖️ עומס: ${esc(loadLevel)}</span>
      </div>
      <footer class="card-actions"><button class="btn btn-secondary" data-instructor-drilldown="${escAttr(row.instructor)}">כניסה ל-Drill-down</button></footer>
    </article>`;
  }).join('')}</section>`;
}

function renderExceptionCards(rows) {
  if (!rows.length) return '<section class="panel-empty">לא נמצאו חריגות בהתאם לסינון.</section>';
  return `<section class="cards-grid">${rows.map((item) => `<article class="management-card exception-card">
    <header class="card-head">
      <h3>${esc(item.type)}</h3>
      <span class="status-chip ${statusClass(item.treatmentStatus)}">${esc(item.treatmentStatusLabel)}</span>
    </header>
    <div class="card-meta">
      <span>🧩 פעילות: ${esc(item.activity)}</span>
      <span>👤 מדריך: ${esc(item.instructor || 'לא משויך')}</span>
      <span>🏛️ רשות: ${esc(item.authority || '-')}</span>
      <span>🏫 בית ספר: ${esc(item.school || '-')}</span>
    </div>
    <div class="card-issue has-issue"><strong>מה הבעיה:</strong> ${esc(item.description)}</div>
    <div class="card-kpi-row">
      <span>סטטוס טיפול: ${esc(item.treatmentStatusLabel)}</span>
      <span>קורס: ${esc(item.courseId || '-')}</span>
    </div>
    <footer class="card-actions">
      <button class="btn btn-secondary" data-contact-instructor="${escAttr(item.instructor)}">פתח בקשת שינוי</button>
      <button class="btn btn-secondary" data-update-course="${escAttr(item.courseId)}">נווט לקורס</button>
      <button class="btn btn-primary" data-close-issue="${escAttr(item.courseId)}">סמן כטופל</button>
    </footer>
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
  return `<div class="table-wrap compact-table"><table><thead><tr><th>מדריך</th><th>כמות קורסים</th><th>רשויות</th><th>בתי ספר</th><th>סטטוס עומס/פער</th></tr></thead><tbody>${body}</tbody></table></div>`;
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
    return [['Employee', 'מדריך'], ['EmployeeID', 'מזהה עובד'], ['InstructorManager', 'מנהל מדריכים'], ['Activity', 'פעילות'], ['Program', 'קורס'], ['Authority', 'רשות'], ['School', 'בית ספר'], ['Location', 'מיקום'], ['ClassGroup', 'קבוצה'], ['PlannedMeetings', 'מתוכנן'], ['ActualMeetings', 'בוצע'], ['SourceActualMeetings', 'מקור ביצוע'], ['CourseID', 'מזהה טכני']];
  }
  return [['Activity', 'פעילות / קורס / סדנה'], ['Program', 'תוכנית'], ['ProgramCode', 'קוד תוכנית'], ['Employee', 'מי מלמד'], ['EmployeeID', 'מזהה מדריך'], ['CourseManager', 'מנהל קורס'], ['InstructorManager', 'מנהל מדריכים'], ['Authority', 'רשות'], ['School', 'בית ספר'], ['Location', 'מיקום'], ['DayName', 'יום'], ['StartTime', 'שעת התחלה'], ['EndTime', 'שעת סיום'], ['End', 'סיום מחזור'], ['PlannedMeetings', 'מפגשים מתוכננים'], ['ActualMeetings', 'מפגשים שבוצעו'], ['SourceActualMeetings', 'מקור ביצוע'], ['Funding', 'מימון'], ['Payment', 'תשלום'], ['Notes', 'הערות'], ['CourseID', 'מזהה טכני']];
}

function onKpiClick(filterName) {
  viewState.courses.quickFilter = filterName;
  viewState.courses.filters = { authority: '', school: '', courseManager: '', employee: '', period: '', monthStart: '', monthEnd: '' };
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
  if (key === 'ending_soon') return list.filter((row) => isDateInRange(firstDate(row, ['EndDate', 'End']), now, plusSeven));
  if (key === 'exceptions') return list.filter((row) => hasException(row));
  if (key === 'change_request') return list.filter((row) => hasValue(row, ['ChangeRequest']));
  if (key === 'instructor_overload') return list.filter((row) => isInstructorOverload(row));
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
  return hasValue(row, ['Employee', 'EmployeeID', 'Instructor']);
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
  Object.keys(row || {}).forEach((key) => {
    if (/^Date([1-9]|[12][0-9]|30)$/.test(String(key))) {
      const parsed = parseDateLike(row?.[key]);
      if (parsed) dates.push(parsed);
    }
  });
  const fallback = firstDate(row, ['Date', 'StartDate']);
  if (!dates.length && fallback) dates.push(fallback);
  return dates;
}

function parseDateLike(value) {
  if (!value) return null;
  if (typeof value === 'number' && value > 20000 && value < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + (value * 24 * 60 * 60 * 1000));
  }
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
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
  const startDate = firstDate(row, ['StartDate', 'Date']);
  const endDate = firstDate(row, ['EndDate', 'End']);
  if (startDate && endDate) return now >= startOfDay(startDate) && now <= endOfDay(endDate);
  return scheduleDates.some((d) => d >= startOfDay(now));
}

function isMissingReport(row) {
  const planned = numberFrom(row?.PlannedMeetings);
  const actual = numberFrom(row?.ActualMeetings, row?.SourceActualMeetings);
  return planned > 0 && actual < planned;
}

function hasException(row) {
  const planned = numberFrom(row?.PlannedMeetings);
  const actual = numberFrom(row?.ActualMeetings, row?.SourceActualMeetings);
  return planned > 0 && actual > planned;
}

function isInstructorOverload(row) {
  const planned = numberFrom(row?.PlannedMeetings);
  return hasInstructor(row) && planned >= 10;
}

function hasInstructorGap(row) {
  return isMissingReport(row) || !hasInstructor(row);
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

function loadLevelByMeetings(meetingsCount) {
  if (meetingsCount >= TAASIYEDA_CONFIG.loadThresholds.dayMeetings.high) return { key: 'high', label: 'גבוה', status: 'declined' };
  if (meetingsCount >= TAASIYEDA_CONFIG.loadThresholds.dayMeetings.medium) return { key: 'medium', label: 'בינוני', status: 'pending-final' };
  return { key: 'low', label: 'נמוך', status: 'approved' };
}

function isResolvedException(row = {}) {
  return getExceptionTreatmentStatus(row) === 'resolved';
}

function joinLocation(row) {
  return [row.Authority, row.School, row.Location].filter((v) => String(v || '').trim()).join(' / ');
}

function formatSchedule(row) {
  const start = firstDate(row, ['StartDate', 'Date']);
  const end = firstDate(row, ['EndDate', 'End']);
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
  const reviewFlag = String(course.ReviewRequired || course.RequiresReview || '').trim();
  const postponeInfo = parseDelayInfo(course[COURSE_FIELDS.NOTES]);
  const progress = getSessionProgress(course);
  return `<section class="panel-block course-details-panel">
    <div class="panel-block-head">
      <h3>Drill-down לקורס: ${esc(course[COURSE_FIELDS.PROGRAM] || course[COURSE_FIELDS.ACTIVITY] || course[COURSE_FIELDS.COURSE_ID] || '')}</h3>
      <button class="btn btn-secondary" id="closeCourseDetails">סגור</button>
    </div>
    <div class="course-core-grid">
      <div class="course-core-col"><span><strong>CourseID:</strong> ${esc(course[COURSE_FIELDS.COURSE_ID] || '-')}</span><span><strong>ProgramCode:</strong> ${esc(course[COURSE_FIELDS.PROGRAM_CODE] || '-')}</span></div>
      <div class="course-core-col"><span><strong>מימון:</strong> ${esc(course.Funding || '-')}</span><span><strong>לתשלום:</strong> ${esc(course.Payment || '-')}</span></div>
      <div class="course-core-col"><span><strong>סטטוס דיווח:</strong> ${esc(summarizeIssue(course))}</span><span><strong>חריגה ב-REVIEW_REQUIRED:</strong> ${esc(reviewFlag || 'לא')}</span></div>
    </div>
    <div class="table-wrap compact-table"><table><thead><tr><th>מפגש</th><th>תאריך</th><th>יום</th><th>שעות</th><th>התקדמות</th><th>דחייה</th><th>תאריך מקורי</th><th>תאריך חדש</th></tr></thead><tbody>
      ${meetings.length ? meetings.map((item) => {
        const meetingNumber = item.isEndDate ? Math.max(progress.plannedMeetings, meetings.length - 1) : item.index;
        const dayLabel = item.value.toLocaleDateString('he-IL', { weekday: 'long' });
        const postponed = postponeInfo.isPostponed && !item.isEndDate;
        return `<tr>
          <td>${esc(item.label)}</td>
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
    <div class="card-issue ${reviewFlag ? 'has-issue' : ''}"><strong>הערות:</strong> ${esc(course[COURSE_FIELDS.NOTES] || 'אין הערות')}</div>
    <footer class="card-actions">
      ${options.canEdit ? `<button class="btn btn-primary" data-edit-row="${escAttr(course[COURSE_FIELDS.COURSE_ID] || '')}">עריכת קורס</button>` : `<button class="btn btn-secondary" data-edit-row="${escAttr(course[COURSE_FIELDS.COURSE_ID] || '')}">בקשת שינוי</button>`}
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
  if (row.coursesCount >= 10) return '<span class="status-chip status-pending-final">עומס גבוה</span>';
  if (row.hasGap) return '<span class="status-chip status-pending">פער תפעולי</span>';
  return '<span class="status-chip status-approved">מאוזן</span>';
}

function summarizeIssue(row) {
  if (hasException(row)) return row.IssueStatus || 'זוהתה חריגה תפעולית הדורשת טיפול.';
  if (isMissingReport(row)) return row.ReportStatus || 'חסר דיווח ביחס לתכנון.';
  if (!hasInstructor(row)) return 'הפעילות טרם שובצה למדריך.';
  return 'ללא חריגה כרגע.';
}

function recommendedAction(row) {
  if (!fieldHasValue(row, ['Instructor'])) return 'שייך מדריך';
  if (isMissingReport(row)) return 'עדכן דיווח';
  if (hasException(row)) return 'פתח טיפול';
  return 'מעבר לפרטים';
}

function findCourseById(courseId) {
  return (viewState.courses.data || []).find((row) => String(row?.CourseID || '') === String(courseId || ''));
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
  document.querySelectorAll('[data-instructor-drilldown]').forEach((button) => button.addEventListener('click', () => {
    viewState.courses.selectedInstructor = button.dataset.instructorDrilldown || '';
    renderScreen();
  }));
}

function bindExceptionActions() {
  document.querySelectorAll('[data-contact-instructor]').forEach((button) => button.addEventListener('click', () => {
    const instructor = button.dataset.contactInstructor || 'המדריך';
    window.alert(`נשלחה משימת קשר ל-${instructor}.`);
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
    const mode = canDirectEditCourses() ? 'edit' : 'request';
    const formResult = await openCourseActionForm(row, mode);
    if (!formResult) return;
    if (canDirectEditCourses()) {
      const res = await updateCourse(row.CourseID, formResult.changes, userState);
      if (!res?.success) {
        window.alert(res?.message || 'עדכון הקורס נכשל');
        return;
      }
      const updated = await refreshCourse(row.CourseID);
      if (updated) {
        viewState.courses.data = viewState.courses.data.map((course) => (String(course.CourseID) === String(updated.CourseID) ? { ...course, ...updated } : course));
        if (viewState.courses.selectedCourseId && String(viewState.courses.selectedCourseId) === String(updated.CourseID)) {
          viewState.courses.selectedCourseDetails = { ...viewState.courses.selectedCourseDetails, ...updated };
        }
      }
      renderScreen();
      window.alert('הקורס עודכן בהצלחה מול הגיליון.');
      return;
    }
    const res = await createEditRequest(row.CourseID, formResult.changes, userState);
    if (!res?.success) window.alert(res?.message || 'הפעולה נכשלה');
    else {
      await loadMyRequests();
      window.alert('בקשת השינוי נפתחה ונרשמה ב-EDIT_REQUESTS.');
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
        <h3>${mode === 'edit' ? 'עריכת קורס' : 'בקשת שינוי'}</h3>
        <p>${esc(course.Program || course.Activity || course.CourseID || '')}</p>
        <label>שעת התחלה<input id="courseFormStartTime" value="${escAttr(formatTimeValue(course.StartTime))}" placeholder="hh:mm" /></label>
        <label>שעת סיום<input id="courseFormEndTime" value="${escAttr(formatTimeValue(course.EndTime))}" placeholder="hh:mm" /></label>
        <label>הערות<input id="courseFormNotes" value="${escAttr(course.Notes || '')}" /></label>
        <label>תקציר שינוי<input id="courseFormSummary" value="" placeholder="${mode === 'edit' ? 'עדכון שעות/הערות' : 'בקשת שינוי במסך קורסים'}" /></label>
        <div class="card-actions">
          <button class="btn btn-secondary" data-form-close="1">ביטול</button>
          <button class="btn btn-primary" id="courseFormSubmit">${mode === 'edit' ? 'שמור' : 'שלח בקשה'}</button>
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
      const summary = root.querySelector('#courseFormSummary')?.value.trim() || (mode === 'edit' ? 'עדכון קורס' : 'בקשת שינוי');
      close({
        changes: {
          StartTime: root.querySelector('#courseFormStartTime')?.value.trim() || '',
          EndTime: root.querySelector('#courseFormEndTime')?.value.trim() || '',
          Notes: root.querySelector('#courseFormNotes')?.value.trim() || '',
          summary
        }
      });
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
  const res = await fn({ RequestID: row.RequestID, ApprovalNotes: '' });
  if (!res?.success) return window.alert(res?.message || 'הפעולה נכשלה');
  await loadApprovals();
  await loadEdenView();
}

async function loadWeekView() {
  viewState.week.loading = true;
  viewState.week.error = '';
  renderScreen();
  try {
    await Promise.all([reloadCourses(), loadReviewItems(true)]);
  } catch (error) {
    viewState.week.error = 'לא ניתן לרענן נתוני קורסים למסך שבוע.';
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
    viewState.month.error = 'לא ניתן לרענן נתוני קורסים למסך חודש.';
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
    viewState.instructors.error = 'לא ניתן לרענן נתוני קורסים למסך מדריכים.';
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
    viewState.endDates.error = 'לא ניתן לרענן נתוני קורסים למסך תאריכי סיום.';
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
    viewState.assignments.error = 'לא ניתן לרענן נתוני קורסים למסך שיבוץ.';
  }
  viewState.assignments.loading = false;
  renderScreen();
}

async function loadExceptionsView() {
  viewState.exceptions.loading = true;
  viewState.exceptions.error = '';
  await Promise.all([reloadCourses(), loadReviewItems(true)]);
  viewState.exceptions.loading = false;
  renderScreen();
}

function renderWeekFilters() {
  return `<section class="filters-wrap">
    <label>מתחילת שבוע<input id="weekStart" placeholder="dd/MM/yyyy" value="${escAttr(viewState.week.rangeStart)}" /></label>
    <label>רשות<input id="weekAuthority" value="${escAttr(viewState.week.filters.authority)}" /></label>
    <label>מדריך<input id="weekEmployee" value="${escAttr(viewState.week.filters.employee)}" /></label>
    <label>מנהל קורס<input id="weekCourseManager" value="${escAttr(viewState.week.filters.courseManager)}" /></label>
    <div class="filter-actions"><button class="btn btn-secondary" id="weekApply">סינון</button><button class="btn btn-secondary" id="weekReset">נקה סינון</button></div>
  </section>`;
}

function renderWeekGrid(days) {
  return `<section class="week-grid">${days.map((day) => {
    const dayExceptionCount = day.items.filter((item) => item.hasReviewItem).length;
    return `<article class="panel-block"><div class="panel-block-head"><h3>${esc(day.label)} ${dayExceptionCount ? `<span class="status-chip status-pending">${dayExceptionCount} חריגות</span>` : ''}</h3><button class="btn btn-tertiary" data-week-open="${escAttr(day.isoDate)}">${day.items.length} מפגשים</button></div>${day.items.map((item) => `<div class="mini-card"><strong>${esc(item[COURSE_FIELDS.PROGRAM] || item[COURSE_FIELDS.ACTIVITY] || 'ללא שם')}</strong><span>${esc(item[COURSE_FIELDS.SCHOOL] || '-')}</span>${isInstructor() ? '' : `<span>${esc(resolveInstructorName(item) || '-')}</span>`}<span>${esc(`${formatTimeValue(item[COURSE_FIELDS.START_TIME])}-${formatTimeValue(item[COURSE_FIELDS.END_TIME])}`)}</span><span>מפגש ${esc(item.meetingNumber)} מתוך ${esc(item.plannedMeetings)}</span>${item.hasReviewItem ? `<button class="btn btn-tertiary" data-week-exception-open="${escAttr(item[COURSE_FIELDS.COURSE_ID] || '')}">חריגה פעילה</button>` : ''}</div>`).join('') || '<div class="panel-empty">אין מפגשים</div>'}</article>`;
  }).join('')}</section>`;
}

function renderWeekDetails(selected) {
  if (!selected) return '';
  return `<section class="panel-block"><div class="panel-block-head"><h3>פרטי יום: ${esc(selected.label)}</h3><button class="btn btn-secondary" id="weekCloseDetails">סגור</button></div>${selected.items.map((item) => {
    const postpone = parseDelayInfo(item[COURSE_FIELDS.NOTES]);
    return `<article class="mini-card"><strong>${esc(item[COURSE_FIELDS.PROGRAM] || item[COURSE_FIELDS.ACTIVITY] || '')}</strong><span>מדריך: ${esc(resolveInstructorName(item) || '-')}</span><span>רשות/בית ספר: ${esc(item[COURSE_FIELDS.AUTHORITY] || '-')} / ${esc(item[COURSE_FIELDS.SCHOOL] || '-')}</span><span>סוג פעילות: ${esc(item[COURSE_FIELDS.EVENT_TYPE] || '-')}</span><span>סטטוס מפגש: ${esc(item[COURSE_FIELDS.STATUS] || item[COURSE_FIELDS.PERIOD] || '-')}</span><span>מפגש ${esc(item.meetingNumber)} מתוך ${esc(item.plannedMeetings)}</span><span>דחייה: ${postpone.isPostponed ? 'כן' : 'לא'} | מקורי: ${esc(postpone.originalDate)} | חדש: ${esc(postpone.newDate)}</span><span>שעות: ${esc(formatTimeValue(item[COURSE_FIELDS.START_TIME]))}-${esc(formatTimeValue(item[COURSE_FIELDS.END_TIME]))}</span><span>הערות: ${esc(item[COURSE_FIELDS.NOTES] || '-')}</span><div class="card-actions"><button class="btn btn-tertiary" data-open-course="${escAttr(item[COURSE_FIELDS.COURSE_ID] || '')}">פתח קורס</button>${item.hasReviewItem ? '<button class="btn btn-tertiary" data-go-exceptions="1">למסך חריגות</button>' : ''}</div></article>`;
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
    return { label: current.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit' }), isoDate: current.toISOString().slice(0, 10), items: [] };
  });
  (courses || []).forEach((course) => {
    const hasReviewItem = reviewItems.some((review) => String(review[EXCEPTION_FIELDS.COURSE_ID] || '') === String(course[COURSE_FIELDS.COURSE_ID] || '') && !isResolvedException(review));
    const sessionProgress = getSessionProgress(course);
    const hasDelay = hasCourseDelays(course, reviewItems);
    getScheduleDates(course).forEach((dateObj) => {
      const isoDate = dateObj.toISOString().slice(0, 10);
      const bucket = days.find((day) => day.isoDate === isoDate);
      if (bucket) bucket.items.push({ ...course, hasReviewItem, hasDelay, meetingNumber: sessionProgress.meetingNumber, plannedMeetings: sessionProgress.plannedMeetings });
    });
  });
  return { days, start };
}

function renderMonthFilters() {
  return `<section class="filters-wrap"><label>חודש<input id="monthDate" placeholder="MM/yyyy" value="${escAttr(viewState.month.monthDate)}" /></label><label>רשות<input id="monthAuthority" value="${escAttr(viewState.month.filters.authority)}" /></label><label>מדריך<input id="monthEmployee" value="${escAttr(viewState.month.filters.employee)}" /></label><label>מנהל קורס<input id="monthCourseManager" value="${escAttr(viewState.month.filters.courseManager)}" /></label><label>תוכנית<input id="monthProgram" value="${escAttr(viewState.month.filters.program)}" /></label><div class="filter-actions"><button class="btn btn-secondary" id="monthApply">סינון</button><button class="btn btn-secondary" id="monthReset">נקה סינון</button></div></section>`;
}

function buildMonthlyCalendar(courses, monthValue) {
  const parsedMonth = parseMonthValue(monthValue) || new Date();
  const monthStart = new Date(parsedMonth.getFullYear(), parsedMonth.getMonth(), 1);
  const monthEnd = new Date(parsedMonth.getFullYear(), parsedMonth.getMonth() + 1, 0);
  const days = [];
  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const current = new Date(parsedMonth.getFullYear(), parsedMonth.getMonth(), day);
    const isoDate = current.toISOString().slice(0, 10);
    const items = (courses || []).filter((course) => getScheduleDates(course).some((dateObj) => dateObj.toISOString().slice(0, 10) === isoDate));
    const loadLevel = loadLevelByMeetings(items.length);
    days.push({ day, isoDate, items, loadLevel, hasException: items.some((item) => hasException(item) || isMissingReport(item)) });
  }
  const selectedItems = days.find((item) => item.isoDate === viewState.month.selectedDate)?.items || [];
  return { monthStart, days, selectedItems };
}

function renderMonthGrid(days) {
  return `<section class="month-grid">${days.map((day) => `<button class="month-day ${day.hasException ? 'has-exception' : ''} load-${escAttr(day.loadLevel.key)}" data-month-open="${escAttr(day.isoDate)}"><strong>${day.day}</strong><span>${day.items.length} מפגשים</span><small>עומס: ${esc(day.loadLevel.label)}</small></button>`).join('')}</section>`;
}

function renderMonthDayDetails(items, dateLabel) {
  if (!dateLabel) return '';
  return `<section class="panel-block"><div class="panel-block-head"><h3>פירוט יום ${esc(formatDate(parseDateLike(dateLabel)) || dateLabel)}</h3><button class="btn btn-secondary" id="monthCloseDetails">סגור</button></div>${items.map((item) => `<article class="mini-card"><strong>${esc(item.Program || item.Activity || '')}</strong><span>${esc(item.Authority || '-')} · ${esc(item.School || '-')}</span><span>${esc(resolveInstructorName(item) || '-')}</span><span>${esc(formatTimeValue(item.StartTime))}-${esc(formatTimeValue(item.EndTime))}</span><span>מפגש ${esc(buildMeetingMeta(item).meetingNumber)} מתוך ${esc(buildMeetingMeta(item).plannedMeetings)}</span><button class="btn btn-tertiary" data-open-course="${escAttr(item.CourseID || '')}">פתח קורס</button></article>`).join('') || '<div class="panel-empty">אין מפגשים</div>'}</section>`;
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
    const meetings = list.reduce((sum, item) => sum + getScheduleDates(item).length, 0);
    const authorities = Array.from(new Set(list.map((item) => item.Authority).filter(Boolean)));
    const schools = Array.from(new Set(list.map((item) => item.School).filter(Boolean)));
    const hasIssues = list.some((item) => reviewItems.some((review) => String(review[EXCEPTION_FIELDS.COURSE_ID] || '') === String(item[COURSE_FIELDS.COURSE_ID] || '') && !isResolvedException(review)));
    const loadLevel = getInstructorLoad(list);
    return { name, employeeId, coursesCount: list.length, meetingsCount: meetings, authorities, schools, hasIssues, loadLevel };
  }).sort((a, b) => b.meetingsCount - a.meetingsCount);
  return { items, coursesByInstructor };
}

function renderInstructorsCards(items) {
  return `<section class="cards-grid instructor-grid">${items.map((item) => `<article class="management-card"><div class="card-head"><h3>${esc(item.name)}</h3><span class="status-chip status-${escAttr(item.loadLevel.status)}">${esc(item.loadLevel.label)}</span></div><div class="card-meta"><span>תפקיד: ${esc(getDisplayRoleForInstructor(item.name, item.employeeId) || '-')}</span><span>קורסים פעילים: ${esc(item.coursesCount)}</span><span>מפגשים בתקופה: ${esc(item.meetingsCount)}</span><span>רשויות: ${esc(item.authorities.join(', ') || '-')}</span><span>בתי ספר: ${esc(item.schools.join(', ') || '-')}</span><span>חריגות פעילות: ${item.hasIssues ? 'יש' : 'אין'}</span></div><div class="card-actions"><button class="btn btn-secondary" data-instructor-open="${escAttr(item.name)}">Drill-down</button></div></article>`).join('')}</section>`;
}

function renderInstructorCoursesDrilldown(instructorName, coursesByInstructor) {
  if (!instructorName) return '';
  const rows = coursesByInstructor[instructorName] || [];
  return `<section class="panel-block"><div class="panel-block-head"><h3>קורסים של ${esc(instructorName)}</h3><button class="btn btn-secondary" id="instructorCloseDrilldown">סגור</button></div>${renderCourseCards(rows, { canEdit: canDirectEditCourses() })}</section>`;
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
  document.getElementById('instructorCloseDrilldown')?.addEventListener('click', () => {
    viewState.instructors.selectedInstructor = '';
    renderScreen();
  });
  bindCourseActions();
}

function renderEndDatesFilters() {
  return `<section class="filters-wrap"><label>רשות<input id="endAuthority" value="${escAttr(viewState.endDates.filters.authority)}" /></label><label>מדריך<input id="endEmployee" value="${escAttr(viewState.endDates.filters.employee)}" /></label><label>מנהל קורס<input id="endManager" value="${escAttr(viewState.endDates.filters.courseManager)}" /></label><label>מתאריך סיום<input id="endFrom" placeholder="dd/MM/yyyy" value="${escAttr(viewState.endDates.filters.endFrom)}" /></label><label>עד תאריך סיום<input id="endTo" placeholder="dd/MM/yyyy" value="${escAttr(viewState.endDates.filters.endTo)}" /></label><div class="filter-actions"><button class="btn btn-secondary" id="endApply">סינון</button><button class="btn btn-secondary" id="endReset">נקה סינון</button></div></section>`;
}

function buildEndDateItems(courses) {
  const from = parseDateLike(viewState.endDates.filters.endFrom);
  const to = parseDateLike(viewState.endDates.filters.endTo);
  const reviewItems = getStoreSnapshot().reviewItems || [];
  return (courses || []).filter((course) => {
    const endDate = parseDateLike(course[COURSE_FIELDS.END]);
    if (!endDate) return false;
    if (from && endDate < startOfDay(from)) return false;
    if (to && endDate > endOfDay(to)) return false;
    return true;
  }).map((course) => {
    const postpone = parseDelayInfo(course[COURSE_FIELDS.NOTES]);
    const hasReviewDelay = hasCourseDelays(course, reviewItems);
    const progress = getSessionProgress(course);
    const remaining = Math.max(0, progress.plannedMeetings - progress.actualMeetings);
    return { ...course, postpone, hasReviewDelay, remaining };
  }).sort((a, b) => (parseDateLike(a[COURSE_FIELDS.END])?.getTime() || 0) - (parseDateLike(b[COURSE_FIELDS.END])?.getTime() || 0));
}

function renderEndDateCards(items) {
  return `<section class="cards-grid">${items.map((item) => `<article class="management-card"><div class="card-head"><h3>${esc(item.Program || item.Activity || '')}</h3><span class="status-chip ${(item.postpone.isPostponed || item.hasReviewDelay) ? 'status-pending-final' : 'status-approved'}">${(item.postpone.isPostponed || item.hasReviewDelay) ? 'עם דחיות' : 'ללא דחיות'}</span></div><div class="card-meta"><span>מדריך: ${esc(resolveInstructorName(item) || '-')}</span><span>רשות/בית ספר: ${esc(item.Authority || '-')} / ${esc(item.School || '-')}</span><span>תאריך סיום: ${esc(formatDate(parseDateLike(item.End)) || '-')}</span><span>מפגשים שנותרו: ${esc(item.remaining)}</span><span>דחיות שזוהו: ${(item.postpone.isPostponed || item.hasReviewDelay) ? '1+' : '0'}</span><span>השפעה על End: ${(item.postpone.isPostponed || item.hasReviewDelay) ? 'נדרשת בדיקה' : 'לא זוהתה'}</span></div><div class="card-actions"><button class="btn btn-secondary" data-open-course="${escAttr(item.CourseID || '')}">Drill-down קורס</button></div></article>`).join('')}</section>`;
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
      const programText = `${String(course.Program || '')} ${String(course.ProgramCode || '')}`.toLowerCase();
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
    const authorities = Array.from(new Set(list.map((course) => course.Authority).filter(Boolean)));
    const schools = Array.from(new Set(list.map((course) => course.School).filter(Boolean)));
    const loadLevel = getInstructorLoad(list);
    return { instructor, activeCourses, upcomingMeetings, authorities, schools, loadLevel };
  }).sort((a, b) => b.upcomingMeetings - a.upcomingMeetings);
}

function renderAssignmentsTable(rows) {
  const body = rows.map((row) => `<tr><td>${esc(row.instructor)}</td><td>${esc(row.activeCourses)}</td><td>${esc(row.upcomingMeetings)}</td><td>${esc(row.authorities.join(', ') || '-')}</td><td>${esc(row.schools.join(', ') || '-')}</td><td><span class="status-chip status-${escAttr(row.loadLevel.status)}">${esc(row.loadLevel.label)}</span></td></tr>`).join('');
  return `<section class="table-wrap"><table><thead><tr><th>מדריך</th><th>קורסים פעילים</th><th>מפגשים קרובים</th><th>רשויות</th><th>בתי ספר</th><th>עומס</th></tr></thead><tbody>${body || '<tr><td colspan=\"6\">אין נתונים</td></tr>'}</tbody></table></section>`;
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
  return (reviewRows || []).map((row) => {
    const linkedCourse = (courses || []).find((course) => String(course[COURSE_FIELDS.COURSE_ID] || '') === String(row[EXCEPTION_FIELDS.COURSE_ID] || '')) || {};
    return {
      ...row,
      ReviewRowNumber: Number(row[EXCEPTION_FIELDS.ROW_NUMBER] || 0),
      Program: row[COURSE_FIELDS.PROGRAM] || linkedCourse[COURSE_FIELDS.PROGRAM] || linkedCourse[COURSE_FIELDS.ACTIVITY] || '',
      Employee: row[EXCEPTION_FIELDS.EMPLOYEE] || linkedCourse[COURSE_FIELDS.EMPLOYEE] || resolveInstructorName(linkedCourse) || '',
      CourseManager: row[EXCEPTION_FIELDS.COURSE_MANAGER] || linkedCourse[COURSE_FIELDS.COURSE_MANAGER] || '',
      Authority: row[EXCEPTION_FIELDS.AUTHORITY] || linkedCourse[COURSE_FIELDS.AUTHORITY] || '',
      School: row[EXCEPTION_FIELDS.SCHOOL] || linkedCourse[COURSE_FIELDS.SCHOOL] || '',
      ExceptionType: row[EXCEPTION_FIELDS.TYPE] || row[EXCEPTION_FIELDS.ISSUES] || row.IssueStatus || '',
      TreatmentStatus: getExceptionTreatmentStatus(row),
      Date: row[EXCEPTION_FIELDS.DATE] || linkedCourse[COURSE_FIELDS.DATE] || linkedCourse[COURSE_FIELDS.END] || '',
      CourseID: row[EXCEPTION_FIELDS.COURSE_ID] || linkedCourse[COURSE_FIELDS.COURSE_ID] || ''
    };
  }).filter((row) => {
    if (clean.employee && !String(row.Employee || '').toLowerCase().includes(clean.employee)) return false;
    if (clean.authority && !String(row.Authority || '').toLowerCase().includes(clean.authority)) return false;
    if (clean.courseManager && !String(row.CourseManager || '').toLowerCase().includes(clean.courseManager)) return false;
    if (clean.treatmentStatus && !String(row.TreatmentStatus || '').toLowerCase().includes(clean.treatmentStatus)) return false;
    return true;
  });
}

function renderExceptionsCards(rows) {
  return `<section class="cards-grid">${rows.map((row) => `<article class="management-card"><div class="card-head"><h3>${esc(row.ExceptionType || 'חריגה')}</h3><span class="status-chip ${row.TreatmentStatus === 'resolved' ? 'status-approved' : 'status-pending'}">${row.TreatmentStatus === 'resolved' ? 'טופל' : 'פתוח'}</span></div><div class="card-meta"><span>בעיה: ${esc(row.Issues || row.ExceptionType || '-')}</span><span>קורס: ${esc(row.Program || '-')} (${esc(row.CourseID || '-')})</span><span>מדריך/מנהל: ${esc(row.Employee || '-')} / ${esc(row.CourseManager || '-')}</span><span>רשות/בית ספר: ${esc(row.Authority || '-')} / ${esc(row.School || '-')}</span><span>תאריך רלוונטי: ${esc(formatDate(parseDateLike(row.Date)) || row.Date || '-')}</span></div><div class="card-actions"><button class="btn btn-secondary" data-open-course="${escAttr(row.CourseID || '')}">פתח קורס</button>${row.TreatmentStatus === 'open' ? `<button class="btn btn-secondary" data-mark-exception="${escAttr(row.CourseID || '')}" data-mark-review-row="${escAttr(row.ReviewRowNumber || '')}" data-mark-review-id="${escAttr(row.ReviewID || row.RowID || row.ExceptionID || '')}">סמן כטופל</button>` : ''}</div></article>`).join('')}</section>`;
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
  document.querySelectorAll('[data-mark-exception]').forEach((button) => button.addEventListener('click', async () => {
    const reviewRowNumber = Number(button.dataset.markReviewRow || 0);
    const reviewId = button.dataset.markReviewId || '';
    const res = await api.markExceptionResolved({
      reviewRowNumber,
      ReviewID: reviewId,
      CourseID: button.dataset.markException || ''
    });
    if (!res?.success) {
      window.alert(res?.message || 'לא ניתן לעדכן סטטוס חריגה.');
      return;
    }
    await loadReviewItems(true);
    renderScreen();
    window.alert('החריגה סומנה כטופלה.');
  }));
}

function getDisplayRoleForInstructor(instructorName, employeeId = '') {
  const permission = (getStoreSnapshot().permissions || []).find((row) => String(row.employeeName || '').trim() === String(instructorName || '').trim()
    || (employeeId && String(row.employeeId || '') === String(employeeId || '')));
  return permission?.displayRole || '';
}

async function onLogin() {
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
    if (apiRes?.success) return apiRes;
    return { success: true, data: { items: sheetRows } };
  }, [], 'לא ניתן לטעון בקשות.');
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
  out.CourseID = String(raw.CourseID || '');
  out.ProgramCode = numberFrom(raw.ProgramCode);
  out.EmployeeID = numberFrom(raw.EmployeeID);
  out.PlannedMeetings = numberFrom(raw.PlannedMeetings);
  out.ActualMeetings = numberFrom(raw.ActualMeetings, raw.SourceActualMeetings);
  out.StartTime = formatTimeValue(raw.StartTime);
  out.EndTime = formatTimeValue(raw.EndTime);
  for (let index = 1; index <= 15; index += 1) {
    const fieldName = `Date${index}`;
    out[fieldName] = parseDateLike(raw[fieldName]);
  }
  out.End = parseDateLike(raw.End);
  return out;
}

function applyCoursesFiltersByUiScope(rows, filters) {
  const list = Array.isArray(rows) ? rows : [];
  const clean = Object.fromEntries(Object.entries(filters || {}).map(([key, value]) => [key, String(value || '').trim().toLowerCase()]));
  return list.filter((row) => {
    if (clean.authority && !String(row.Authority || '').toLowerCase().includes(clean.authority)) return false;
    if (clean.school && !String(row.School || '').toLowerCase().includes(clean.school)) return false;
    if (clean.courseManager && !String(row.CourseManager || '').toLowerCase().includes(clean.courseManager)) return false;
    if (clean.employee && !String(resolveInstructorName(row) || '').toLowerCase().includes(clean.employee)) return false;
    if (clean.program) {
      const text = `${String(row.Program || '')} ${String(row.ProgramCode || '')}`.toLowerCase();
      if (!text.includes(clean.program)) return false;
    }
    if (clean.period) {
      const monthly = `${String((row.End?.getMonth?.() || 0) + 1).padStart(2, '0')}/${row.End?.getFullYear?.() || ''}`;
      if (!monthly.includes(clean.period)) return false;
    }
    if (clean.monthStart) {
      const monthStart = parseDateLike(clean.monthStart);
      if (monthStart && row.End && row.End < startOfDay(monthStart)) return false;
    }
    if (clean.monthEnd) {
      const monthEnd = parseDateLike(clean.monthEnd);
      if (monthEnd && row.End && row.End > endOfDay(monthEnd)) return false;
    }
    if (isDualMode()) return isManagedByCurrentUser(row) || isTaughtByCurrentUser(row);
    if (isInstructor()) return isTaughtByCurrentUser(row);
    return true;
  });
}

function isTaughtByCurrentUser(row) {
  const byId = String(row.EmployeeID || '').trim();
  const sessionId = String(userState.EmployeeID || userState.userId || '').trim();
  const byName = String(resolveInstructorName(row) || '').trim();
  const sessionName = String(userState.displayName || '').trim();
  return Boolean((sessionId && byId && byId === sessionId) || (sessionName && byName && byName === sessionName));
}

function isManagedByCurrentUser(row) {
  const teamScope = String(userState.TeamScope || '').trim();
  const viewScope = String(userState.ViewScope || '').trim();
  if (teamScope && String(row.Authority || '').includes(teamScope)) return true;
  if (viewScope && String(row.Authority || '').includes(viewScope)) return true;
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
    endingSoonCount: courses.filter((row) => isDateInRange(firstDate(row, ['EndDate', 'End']), now, plusSeven)).length,
    exceptionCount: courses.filter((row) => hasException(row)).length,
    changeRequestCount: courses.filter((row) => hasValue(row, ['ChangeRequest'])).length,
    instructorOverloadCount: courses.filter((row) => isInstructorOverload(row)).length,
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
    const activity = row?.Activity || row?.Program || row?.CourseID || '';
    const instructor = resolveInstructorName(row) || '';
    const location = joinLocation(row);
    if (!instructor) items.push({ type: 'חסר מדריך', activity: activity, instructor: '', location: location, filter: 'unassigned_instructor' });
    if (isMissingReport(row)) items.push({ type: 'חסר דיווח', activity: activity, instructor: instructor, location: location, filter: 'missing_report' });
    if (hasException(row)) items.push({ type: 'חריגה תפעולית', activity: activity, instructor: instructor, location: location, filter: 'exceptions' });
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
  return String(row?.Employee || row?.Instructor || row?.EmployeeID || '').trim();
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
