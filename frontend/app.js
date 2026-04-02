import { api } from './api.js';
import { userState, setUserState, clearUserState, hydrateUserState } from './state.js';

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
    filters: { authority: '', school: '', courseManager: '', employee: '', dayName: '', period: '' },
    quickFilter: '',
    selectedInstructor: '',
    selectedCourseId: '',
    selectedCourseDetails: null
  },
  requests: { loading: false, error: '', data: [] },
  approvals: { loading: false, error: '', data: [] },
  eden: { loading: false, error: '', data: { queue: [], exceptions: [] }, filters: { type: '', instructor: '', authority: '', treatment: '' } }
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
  'instructor-view': 'תצוגת מדריכים'
};

const routeIcons = {
  dashboard: '▦',
  courses: '📘',
  'my-requests': '📝',
  approvals: '✅',
  'eden-view': '🧭',
  'final-approvals': '🏁',
  'instructor-view': '👤',
  logout: '↩'
};

function role() { return String(userState.SystemRole || '').trim().toLowerCase(); }
function baseRole() { return String(userState.BaseRole || '').trim().toLowerCase(); }
function displayRole() {
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
function canDirectEditCourses() { return isIdan(); }


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
    main.innerHTML = head(currentRoute === 'courses' ? 'קורסים פעילים' : 'תצוגת מדריכים', `${subtitle} · קורסים מוצגים: ${visibleCourses.length} · פילטרים פעילים: ${activeFiltersCount}`) +
    `<section class="filters-wrap courses-filters">
      <label>רשות<input id="authorityFilter" value="${escAttr(viewState.courses.filters.authority)}"></label>
      <label>בית ספר<input id="schoolFilter" value="${escAttr(viewState.courses.filters.school)}"></label>
      <label>מנהל קורס<input id="courseManagerFilter" value="${escAttr(viewState.courses.filters.courseManager)}"></label>
      <label>מדריך<input id="employeeFilter" value="${escAttr(viewState.courses.filters.employee)}"></label>
      <label>יום<input id="dayNameFilter" value="${escAttr(viewState.courses.filters.dayName)}"></label>
      <label>תקופה<input id="periodFilter" placeholder="למשל: 04/2026" value="${escAttr(viewState.courses.filters.period)}"></label>
      <div class="filter-actions">
        <button class="btn btn-secondary" id="filterCourses">סינון</button>
        <button class="btn btn-secondary" id="resetCourseFilters">איפוס</button>
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
        dayName: document.getElementById('dayNameFilter')?.value.trim() || '',
        period: document.getElementById('periodFilter')?.value.trim() || ''
      };
      loadCourses();
    });
    document.getElementById('resetCourseFilters')?.addEventListener('click', () => {
      viewState.courses.quickFilter = '';
      viewState.courses.selectedInstructor = '';
      viewState.courses.filters = { authority: '', school: '', courseManager: '', employee: '', dayName: '', period: '' };
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

function renderCourseCards(rows, options = {}) {
  if (!rows.length) return '<section class="panel-empty">לא נמצאו פעילויות לפי הסינון.</section>';
  return `<section class="cards-grid">${rows.map((row, index) => {
    const issueText = summarizeIssue(row);
    const progress = courseProgress(row);
    const timeLabel = `${formatTimeValue(row.StartTime)}-${formatTimeValue(row.EndTime)}`;
    return `<article class="management-card">
      <header class="card-head">
        <div>
          <h3>${esc(row.Program || row.Activity || 'פעילות ללא שם')}</h3>
          <p>${esc([row.Authority, row.School].filter(Boolean).join(' · ') || 'ללא שיוך רשות/בית ספר')}</p>
        </div>
        ${renderIssueBadge(row)}
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
          <span><strong>מפגשים מתוכננים:</strong> ${esc(numberFrom(row.PlannedMeetings))}</span>
          <span><strong>מפגשים בפועל:</strong> ${esc(numberFrom(row.ActualMeetings))}</span>
          <div class="progress-mini">
            <div class="progress-mini-fill ${progress.level}" style="width:${progress.percent}%"></div>
          </div>
        </div>
      </div>
      <div class="card-kpi-row">
        <span>${esc(row.ClassGroup || 'ללא קבוצה')}</span>
        <span>סיום קורס: ${esc(formatDate(parseDateLike(row.End)) || '-')}</span>
      </div>
      <div class="card-issue ${hasException(row) || isMissingReport(row) ? 'has-issue' : ''}">
        <strong>בעיה/חוסר:</strong> ${esc(issueText)}
      </div>
      <footer class="card-actions">
        <button class="btn btn-secondary" data-open-course="${escAttr(row.CourseID || '')}">פרטים</button>
        ${options.canEdit ? `<button class="btn btn-primary" data-edit-row="${escAttr(row.CourseID || '')}">ערוך קורס</button>` : `<button class="btn btn-secondary" data-edit-row="${escAttr(row.CourseID || '')}">בקשת שינוי</button>`}
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
  viewState.courses.filters = { authority: '', school: '', courseManager: '', employee: '', dayName: '', period: '' };
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
  const planned = Math.max(0, numberFrom(row.PlannedMeetings));
  const actual = Math.max(0, numberFrom(row.ActualMeetings));
  const ratio = planned > 0 ? actual / planned : 0;
  const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  if (ratio >= 0.9) return { percent, level: 'progress-success' };
  if (ratio >= 0.6) return { percent, level: 'progress-warning' };
  return { percent, level: 'progress-danger' };
}

function collectCourseDates(row) {
  const dates = [];
  for (let index = 1; index <= 15; index += 1) {
    const fieldName = `Date${index}`;
    const date = parseDateLike(row?.[fieldName]);
    if (date) dates.push({ label: fieldName, value: date });
  }
  return dates;
}

function renderCourseDetailsPanel(course, options = {}) {
  if (!course) return '';
  const dates = collectCourseDates(course);
  const reviewFlag = String(course.ReviewRequired || course.RequiresReview || '').trim();
  return `<section class="panel-block course-details-panel">
    <div class="panel-block-head">
      <h3>Drill-down לקורס: ${esc(course.Program || course.Activity || course.CourseID || '')}</h3>
      <button class="btn btn-secondary" id="closeCourseDetails">סגור</button>
    </div>
    <div class="course-core-grid">
      <div class="course-core-col"><span><strong>CourseID:</strong> ${esc(course.CourseID || '-')}</span><span><strong>ProgramCode:</strong> ${esc(course.ProgramCode || '-')}</span></div>
      <div class="course-core-col"><span><strong>מימון:</strong> ${esc(course.Funding || '-')}</span><span><strong>לתשלום:</strong> ${esc(course.Payment || '-')}</span></div>
      <div class="course-core-col"><span><strong>סטטוס דיווח:</strong> ${esc(summarizeIssue(course))}</span><span><strong>חריגה ב-REVIEW_REQUIRED:</strong> ${esc(reviewFlag || 'לא')}</span></div>
    </div>
    <div class="table-wrap compact-table"><table><thead><tr><th>שדה תאריך</th><th>תאריך</th></tr></thead><tbody>
      ${dates.length ? dates.map((item) => `<tr><td>${item.label}</td><td>${formatDate(item.value)}</td></tr>`).join('') : '<tr><td colspan="2">אין תאריכי מפגש</td></tr>'}
      <tr><td>End</td><td>${esc(formatDate(parseDateLike(course.End)) || '-')}</td></tr>
    </tbody></table></div>
    <div class="card-issue ${reviewFlag ? 'has-issue' : ''}"><strong>הערות:</strong> ${esc(course.Notes || 'אין הערות')}</div>
    <footer class="card-actions">
      ${options.canEdit ? `<button class="btn btn-primary" data-edit-row="${escAttr(course.CourseID || '')}">ערוך קורס</button>` : `<button class="btn btn-secondary" data-edit-row="${escAttr(course.CourseID || '')}">בקשת שינוי</button>`}
    </footer>
  </section>`;
}

function renderIssueBadge(row) {
  if (hasException(row)) return '<span class="status-chip status-declined">דורש טיפול</span>';
  if (isMissingReport(row)) return '<span class="status-chip status-pending">חסר דיווח</span>';
  if (!hasInstructor(row)) return '<span class="status-chip status-pending-final">חסר מדריך</span>';
  return '<span class="status-chip status-approved">תקין</span>';
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
    api.submitEditRequest({
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
    api.submitEditRequest({
      CourseID: row.CourseID,
      Team: row.Team || 'operations',
      ChangeSummary: 'סגירת חריגה',
      ApprovalStatus: 'pending_eden',
      requestedData: { issueStatus: 'טופל', operationalStatus: 'תקין' }
    }).then(() => loadMyRequests());
  }));
}

function bindEditButtons() {
  document.querySelectorAll('[data-edit-row]').forEach((b) => b.addEventListener('click', () => {
    const row = findCourseById(b.dataset.editRow) || {};
    if (canDirectEditCourses()) {
      window.alert(`עריכה ישירה עבור עידן בלבד.\nקורס: ${row.Program || row.Activity || row.CourseID || '-'}`);
      return;
    }
    const summary = window.prompt('תקציר שינוי', `בקשת שינוי לקורס ${row.Program || row.CourseID || ''}`);
    if (summary === null) return;
    const payload = {
      CourseID: row.CourseID,
      Team: row.Team || '',
      ChangeSummary: summary || 'בקשת שינוי לקורס',
      ApprovalStatus: 'pending_eden',
      requestedData: {
        startTime: row.StartTime || '',
        endTime: row.EndTime || '',
        employee: resolveInstructorName(row),
        notes: row.Notes || ''
      }
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
  button.classList.remove('is-loading');
  button.textContent = 'התחבר';
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

async function loadDashboard() {
  await withLoad('dashboard', async () => {
    const [dashboardRes, coursesRes] = await Promise.all([
      api.getDashboard(),
      api.getMyCourses({})
    ]);
    if (!dashboardRes?.success) return dashboardRes;
    const courses = coursesRes?.success ? (coursesRes?.data?.items || []) : [];
    return { success: true, data: withOperationalMetrics(dashboardRes.data || {}, courses) };
  }, null, 'לא ניתן לטעון דשבורד.');
}
async function loadCourses() {
  viewState.courses.loading = true;
  viewState.courses.error = '';
  renderScreen();
  const res = await api.getMyCourses({});
  viewState.courses.loading = false;
  if (!res?.success) {
    viewState.courses.error = res?.message || 'לא ניתן לטעון פעילות.';
    viewState.courses.data = [];
    renderScreen();
    return;
  }
  const normalized = normalizeCoursesResponse(res?.data || {});
  viewState.courses.data = applyCoursesFiltersByUiScope(normalized, viewState.courses.filters);
  if (viewState.courses.selectedCourseId) {
    viewState.courses.selectedCourseDetails = viewState.courses.data.find((item) => String(item.CourseID) === viewState.courses.selectedCourseId) || null;
  }
  renderScreen();
}
async function loadMyRequests() { await withLoad('requests', api.getMyRequests, [], 'לא ניתן לטעון בקשות.'); }
async function loadEdenView() {
  viewState.eden.loading = true; viewState.eden.error = ''; renderScreen();
  const [queueRes, coursesRes] = await Promise.all([api.getEdenView(), api.getMyCourses({})]);
  viewState.eden.loading = false;
  if (!queueRes?.success) {
    viewState.eden.error = queueRes?.message || 'לא ניתן לטעון את תצוגת עדן.';
    viewState.eden.data = { queue: [], exceptions: [] };
    renderScreen();
    return;
  }
  const courses = coursesRes?.success ? (coursesRes?.data?.items || []) : [];
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
    if (clean.dayName && !String(row.DayName || '').toLowerCase().includes(clean.dayName)) return false;
    if (clean.period) {
      const monthly = `${String((row.End?.getMonth?.() || 0) + 1).padStart(2, '0')}/${row.End?.getFullYear?.() || ''}`;
      if (!monthly.includes(clean.period)) return false;
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
      setRoute('dashboard');
      return;
    }
    clearUserState();
  }
  setRoute('login');
}

registerServiceWorker();
boot();
