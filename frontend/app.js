import { api } from './api.js';
import { userState, setUserState, clearUserState, hydrateUserState } from './state.js';
import {
  initDataEngine,
  getStoreSnapshot,
  getCoursesForUser,
  getPermissionForUser,
  refreshCourse,
  createEditRequest,
  createDataMasterRecord,
  buildFilterOptions,
  loadEditRequests,
  loadReviewItems,
  loadSettings,
  reloadCourses,
  ensureCoursesLoaded,
  resetClientDataStore,
  isCoursesCacheFresh,
  isReviewCacheFresh,
  loadContacts,
  loadFinanceItems,
  loadFinanceArchiveItems,
  updateFinanceStatus,
  syncFinance,
  listEnabledCapabilities
} from './data-engine.js';
import {
  COURSE_FIELDS,
  EXCEPTION_FIELDS,
  TAASIYEDA_DATA_CONTRACTS,
  getSessionProgress,
  courseMeetingDateRaw,
  hasCourseDelays,
  getExceptionTreatmentStatus,
  parseDelayInfo
} from './data-contracts.js';

const app = document.getElementById('app');
const APP_NAME = 'Dashboard Taasiyeda';
let currentRoute = 'login';
let mobileNavOpen = false;
let sidebarOpen = true;
const recentlyResolvedExceptions = new Set();
let initEnginePromise = null;
const SEARCH_RENDER_DEBOUNCE_MS = 180;
const routeSearchDebouncers = new Map();
const runtimeRules = {
  allowAdminDirectDataEdit: false,
  showOnlyNonZeroKpis: false,
  useStatusWithDates: false
};
let runtimeRulesLoaded = false;

function toSettingBool(value, fallback = false) {
  if (value === null || typeof value === 'undefined' || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['yes', 'true', '1', 'y', 'כן'].includes(normalized)) return true;
  if (['no', 'false', '0', 'n', 'לא'].includes(normalized)) return false;
  return fallback;
}

function getSettingValueFromStore(key, fallback) {
  const rows = getStoreSnapshot().settings || [];
  const hit = rows.find((row) => String(row?.key || '').trim() === key);
  return hit ? hit.value : fallback;
}

async function ensureRuntimeRulesLoaded(force = false) {
  if (runtimeRulesLoaded && !force) return runtimeRules;
  await loadSettings();
  const resolveRule = async (key, fallback = false) => {
    const fromStore = getSettingValueFromStore(key, '');
    if (String(fromStore ?? '').trim() !== '') return toSettingBool(fromStore, fallback);
    const fromApi = await api.getSetting?.(key, '');
    if (fromApi?.success) {
      const value = fromApi?.data?.value ?? fromApi?.value ?? '';
      if (String(value ?? '').trim() !== '') return toSettingBool(value, fallback);
    }
    return fallback;
  };
  const [r1, r2, r3] = await Promise.all([
    resolveRule('allow_admin_direct_data_edit', false),
    resolveRule('show_only_nonzero_kpis', false),
    resolveRule('use_status_with_dates', false)
  ]);
  runtimeRules.allowAdminDirectDataEdit = r1;
  runtimeRules.showOnlyNonZeroKpis = r2;
  runtimeRules.useStatusWithDates = r3;
  runtimeRulesLoaded = true;
  return runtimeRules;
}

const viewState = {
  dashboard: { loading: false, error: '', data: null, timeframe: 'day' },
  courses: {
    loading: false,
    error: '',
    data: [],
    filters: { authority: '', school: '', courseManager: '', employee: '', courseMonth: '', activityType: '' },
    filterOptions: { authority: [], school: [], courseManager: [], employee: [], activityType: [] },
    quickFilter: '',
    selectedInstructor: '',
    selectedCourseId: '',
    selectedCourseDetails: null,
    openDetailsId: '',
    selectedInstructorDayCourseId: '',
    meetingsByCourseId: {},
    view: 'table'
  },
  requests: { loading: false, error: '', data: [] },
  approvals: { loading: false, error: '', data: [] },
  eden: { loading: false, error: '', data: { queue: [], exceptions: [], counters: {} }, filters: { workflow: '', origin: '', instructor: '', authority: '', school: '', search: '' } },
  week: { loading: false, error: '', rangeStart: '', rangeEnd: '', filters: { authority: '', employee: '', courseManager: '' }, selected: null, instructorPanel: null },
  month: { loading: false, error: '', monthDate: '', filters: { authority: '', employee: '', courseManager: '', program: '' }, selectedDate: '' },
  instructors: { loading: false, error: '', filters: { authority: '', courseManager: '', program: '' }, selectedInstructor: '' },
  endDates: { loading: false, error: '', filters: { authority: '', employee: '', courseManager: '', month: '' } },
  exceptions: { loading: false, error: '', filters: { authority: '', employee: '', courseManager: '', treatmentStatus: '' } }
  ,
  contacts: { loading: false, error: '', data: [], expandedRowKey: '' },
  adminSettings: { loading: false, error: '', data: [] },
  adminLists: { loading: false, error: '', data: [] },
  adminPermissions: { loading: false, error: '', data: [] },
  finance: {
    loading: false,
    error: '',
    tab: 'active',
    activeItems: [],
    archiveItems: [],
    selectedFinanceRowId: '',
    selectedMeetingsRowId: '',
    displayMonth: '',
    view: 'table'
  },
  uiContext: {
    coursesSubtitle: '',
    monthSubtitle: '',
    searchTermByRoute: {}
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
  'admin-home': 'ניהול',
  'operations-home': 'מסך תפעול ראשי',
  'admin-settings': 'הגדרות מערכת',
  'admin-lists': 'רשימות מערכת',
  'admin-permissions': 'הרשאות משתמשים',
  dashboard: 'דשבורד',
  courses: 'פעילויות',
  'my-requests': 'הבקשות שלי',
  approvals: 'אישורי בקרה ותפעול',
  'eden-view': 'מסך עדן',
  'final-approvals': 'אישור סופי הנהלה',
  'instructor-view': 'תצוגת מדריכים',
  week: 'שבוע',
  month: 'חודש',
  instructors: 'מדריכים',
  'end-dates': 'תאריכי סיום',
  exceptions: 'חריגות',
  contacts: 'אנשי קשר',
  finance: 'כספים'
};

const routeIcons = {
  'admin-home': '🛠️',
  'operations-home': '🧭',
  'admin-settings': '⚙️',
  'admin-lists': '📚',
  'admin-permissions': '🔐',
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
  exceptions: '⚠️',
  contacts: '📇',
  finance: '💳',
  logout: '↩'
};

const ROUTE_UI_SCALES = {
  'admin-home': 1,
  'operations-home': 1,
  'admin-settings': 1,
  'admin-lists': 1,
  'admin-permissions': 1,
  dashboard: 1,
  courses: 0.8,
  week: 0.8,
  month: 0.8,
  instructors: 0.8,
  'end-dates': 0.8,
  exceptions: 0.8,
  contacts: 0.8,
  finance: 0.8,
  'my-requests': 0.8,
  'eden-view': 0.8
};


const ROUTE_CAPABILITY_MAP = {
  'admin-home': 'view_admin',
  'admin-settings': 'view_settings',
  'admin-lists': 'view_lists',
  'admin-permissions': 'view_permissions',
  dashboard: 'view_dashboard',
  courses: 'view_activities',
  week: 'view_week',
  month: 'view_month',
  instructors: 'view_instructors',
  'end-dates': 'view_exceptions',
  exceptions: 'view_exceptions',
  contacts: 'view_contacts',
  finance: 'view_finance',
  'my-requests': 'view_edit_requests',
  approvals: 'view_operations_data',
  'eden-view': 'view_operations_data',
  'final-approvals': 'view_operations_data',
  'instructor-view': 'view_my_data',
  'operations-home': 'view_operations_data'
};

const MENU_ROUTE_ORDER = [
  'admin-home', 'operations-home', 'admin-settings', 'admin-lists', 'admin-permissions', 'dashboard', 'courses', 'week', 'month', 'instructors', 'end-dates', 'exceptions',
  'contacts', 'finance', 'my-requests', 'approvals', 'eden-view', 'final-approvals', 'instructor-view'
];

const HIDDEN_IN_HOME_ROUTES = new Set(['week', 'month', 'end-dates', 'exceptions']);

const ADMIN_LANDING_LINKS = [
  { key: 'settings', label: 'הגדרות', route: 'admin-settings' },
  { key: 'lists', label: 'רשימות', route: 'admin-lists' },
  { key: 'permissions', label: 'הרשאות', route: 'admin-permissions' },
  { key: 'dashboard', label: 'דשבורד', route: 'dashboard' },
  { key: 'activities', label: 'פעילויות', route: 'courses' },
  { key: 'finance', label: 'כספים', route: 'finance' },
  { key: 'exceptions', label: 'חריגות', route: 'exceptions' },
  { key: 'endDates', label: 'תאריכי סיום', route: 'end-dates' },
  { key: 'contacts', label: 'אנשי קשר', route: 'contacts' },
  { key: 'week', label: 'שבוע', route: 'week' },
  { key: 'month', label: 'חודש', route: 'month' },
  { key: 'instructors', label: 'מדריכים', route: 'instructors' }
];

const COURSES_SCREEN_CONFIG = {
  progress: { successRatio: 0.9, warningRatio: 0.6 },
  meetingFields: { start: 1, end: 35, fallbackEndField: COURSE_FIELDS.END }
};

const TAASIYEDA_CONFIG = TAASIYEDA_DATA_CONTRACTS;
const COURSE_DATE_FIELDS = COURSE_FIELDS.DATE_FIELDS || [];
const COURSE_DATE_RANGE_FIELDS = COURSE_DATE_FIELDS;
const EXCEPTION_MISSING_START_DATE = 'חסר תאריך מפגש ראשון';
const COURSE_END_RANGE_FIELDS = [COURSE_FIELDS.END];
const INSTRUCTOR_FALLBACK_FIELD = 'Employee';
const ACTIVITY_COLORS_BY_CODE = Object.freeze({
  '6089': '#4caf50',
  '53828': '#ffaec6',
  '9545': '#2600ff',
  '57646': '#edffed',
  '57651': '#cdf5ff',
  '53819': '#e4d6fa',
  '90001': '#87ff8c',
  '3604': '#ff4ec4',
  '90004': '#ffefd4',
  '46091': '#e61c59',
  '90002': '#f3faff',
  '90003': '#0292b7',
  '60025': '#f5a623',
  '60026': '#ffe0ad',
  '60027': '#ffd522',
  '13990': '#87ff8c',
  '1001': '#cb6ce6'
});


function logUi(event, meta = {}) {
  console.warn(`[app:${event}]`, meta);
}


function getCourseField(row, fieldName) {
  return row?.[fieldName];
}

function getExceptionField(row, fieldName) {
  return row?.[fieldName];
}

function role() { return String(userState.role || userState.SystemRole || '').trim().toLowerCase(); }
function actionMode() {
  if (hasCapability('edit_activities') || hasCapability('edit_admin') || hasCapability('edit_operations_data')) return 'edit';
  if (hasCapability('edit_edit_requests')) return 'request_edit';
  const permission = currentPermission();
  return String(permission?.editScope || userState.EditScope || '').trim().toLowerCase();
}
function currentPermission() { return getPermissionForUser(userState); }
function getCapabilities() {
  const permission = currentPermission();
  if (permission?.capabilities && typeof permission.capabilities === 'object') return permission.capabilities;
  if (userState.Capabilities && typeof userState.Capabilities === 'object') return userState.Capabilities;
  return {};
}
function hasCapability(capabilityKey) {
  if (!capabilityKey) return false;
  return Boolean(getCapabilities()[capabilityKey]);
}
function isAdminUser() {
  return hasCapability('view_admin') || hasCapability('edit_admin');
}
function canEditPermissions() {
  return hasCapability('edit_admin');
}
function isOperationsUser() {
  return !isAdminUser() && getAllowedBusinessRoutes().length > 0;
}
function canAccessRoute(route) {
  if (route === 'admin-home') return isAdminUser();
  if (route === 'operations-home') return !isAdminUser() && hasCapability('view_operations_data');
  if (route === 'admin-settings' || route === 'admin-lists' || route === 'admin-permissions') {
    return isAdminUser() || hasCapability(ROUTE_CAPABILITY_MAP[route]);
  }
  return hasCapability(ROUTE_CAPABILITY_MAP[route]);
}
function getAllowedRoutes() {
  return MENU_ROUTE_ORDER.filter((route) => canAccessRoute(route));
}
function getAllowedBusinessRoutes() {
  return MENU_ROUTE_ORDER.filter((route) => !['admin-home', 'operations-home'].includes(route) && hasCapability(ROUTE_CAPABILITY_MAP[route]));
}
function getFirstAllowedRoute() {
  const routes = getAllowedRoutes();
  return routes[0] || 'login';
}
function getHomeRoute() {
  if (canAccessRoute('admin-home')) return 'admin-home';
  if (canAccessRoute('operations-home')) return 'operations-home';
  return null;
}
function normalizeRouteAlias(route) {
  if (route === 'assignments') return 'dashboard';
  return route;
}
function normalizeDefaultRoute(rawRoute) {
  const route = String(rawRoute || '').trim();
  if (!route) return '';
  const normalized = route.replace(/^view_/, '').replace(/_/g, '-').toLowerCase();
  const aliasMap = {
    admin: 'admin-home',
    'admin-home': 'admin-home',
    operations: 'operations-home',
    'operations-home': 'operations-home',
    'main-ops': 'operations-home',
    main: 'operations-home',
    settings: 'admin-settings',
    lists: 'admin-lists',
    permissions: 'admin-permissions',
    activities: 'courses',
    'operations-data': 'approvals',
    'edit-requests': 'my-requests',
    'my-data': 'instructor-view'
  };
  return aliasMap[normalized] || normalized;
}

function getDefaultViewSource() {
  const permission = currentPermission();
  return String(
    permission?.defaultView
    || userState.default_view
    || userState.DefaultView
    || userState.UiProfile
    || ''
  ).trim();
}

function resolveAdminLandingTargets() {
  return ADMIN_LANDING_LINKS
    .map((item) => ({ ...item }))
    .filter((item) => item.route && canAccessRoute(item.route));
}

function getStartupRoute() {
  const allowedRoutes = getAllowedRoutes();
  if (!allowedRoutes.length) return 'login';
  const requested = normalizeDefaultRoute(getDefaultViewSource());
  if (requested && allowedRoutes.includes(requested)) return requested;
  return allowedRoutes[0];
}
function displayRole() {
  const permission = currentPermission();
  if (permission?.displayRole) return permission.displayRole;
  const display = String(userState.DisplayRole || '').trim();
  if (display) return display;
  return roleMap[role()] || 'ללא תפקיד מוגדר';
}
function isAuth() { return Boolean(userState.authenticated && userState.userId); }
function isInstructor() { return role() === 'instructor'; }
function isIdan() { return isAdminUser(); }
function isEden() { return hasCapability('view_operations_data') || hasCapability('edit_operations_data'); }
function isManager() { return hasCapability('edit_activities') || hasCapability('edit_week') || hasCapability('edit_month'); }
function canEditMasterCourses() {
  if (isAdminUser() && runtimeRules.allowAdminDirectDataEdit) return true;
  return actionMode() === 'edit' || hasCapability('edit_activities');
}
function canRequestEditCourses() {
  return actionMode() === 'request_edit' || hasCapability('edit_edit_requests');
}
function canAccessEdenView() {
  return hasCapability('view_operations_data');
}
function canAccessFinanceActive() {
  const permission = currentPermission();
  if (permission) return Boolean(permission.canAccessFinance || hasCapability('view_finance'));
  return Boolean(userState.CanAccessFinance || hasCapability('view_finance'));
}

function canEditFinanceActive() {
  const permission = currentPermission();
  if (permission) return Boolean(permission.canEditFinance || hasCapability('edit_finance'));
  return Boolean(userState.CanEditFinance || hasCapability('edit_finance'));
}
function canSyncFinance() {
  return hasCapability('sync_finance');
}
function canEditContacts() {
  return hasCapability('edit_contacts');
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
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function toggleMobileNav(force) {
  mobileNavOpen = typeof force === 'boolean' ? force : !mobileNavOpen;
  document.body.classList.toggle('nav-open', mobileNavOpen);
  render();
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  if (!sidebarOpen) {
    mobileNavOpen = false;
    document.body.classList.remove('nav-open');
  }
  render();
}

function toggleHeaderSidebarControl() {
  if (isMobileViewport()) {
    toggleMobileNav();
    return;
  }
  toggleSidebar();
}

function resetCoursesNavFromMenu() {
  viewState.uiContext.coursesSubtitle = '';
  viewState.courses.quickFilter = '';
  viewState.courses.filters = {
    authority: '', school: '', courseManager: '', employee: '', courseMonth: '', activityType: ''
  };
}

function setRoute(route) {
  const nextRoute = normalizeRouteAlias(route);
  if (!isAuth() && nextRoute !== 'login') {
    logUi('route_redirect_to_login', { reason: 'not_authenticated', from: nextRoute });
    currentRoute = 'login';
  } else if (nextRoute === 'login') {
    currentRoute = 'login';
  } else {
    const allowedRoutes = getAllowedRoutes();
    if (!allowedRoutes.includes(nextRoute)) {
      logUi('route_fallback_unauthorized', { requested: nextRoute, fallback: getFirstAllowedRoute() });
    }
    currentRoute = allowedRoutes.includes(nextRoute) ? nextRoute : getFirstAllowedRoute();
  }
  mobileNavOpen = false;
  document.body.classList.remove('nav-open');
  render();
  triggerPageEnter();
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

  app.innerHTML = `<div class="dashboard-viewport">
    <div class="dashboard-canvas" style="--ui-scale:${getUiScaleForRoute(currentRoute)};">
      <div class="layout ${sidebarOpen ? '' : 'sidebar-collapsed'}">
        <button class="mobile-nav-toggle" id="mobileNavToggle" aria-label="פתיחת תפריט ניווט" aria-expanded="${mobileNavOpen ? 'true' : 'false'}">☰</button>
        <aside class="sidebar ${mobileNavOpen ? 'open' : ''}" id="sidebar" aria-hidden="${(!sidebarOpen && !isMobileViewport()) ? 'true' : 'false'}"><div class="brand"><img class="brand-logo" src="./assets/logo-white.png" alt="" aria-hidden="true" /><span class="brand-name">${APP_NAME}</span></div>
        <div class="sidebar-user">${esc(userState.displayName || userState.userId)}</div>
        <div class="sidebar-role">${esc(displayRole())}</div><nav class="nav-list">
        ${buildMenuNavigation()}
        </nav><button class="nav-btn nav-btn-logout" data-route="logout"><span class="nav-icon" aria-hidden="true">${routeIcons.logout}</span><span>יציאה</span></button></aside>
        <button class="mobile-nav-backdrop ${mobileNavOpen ? 'show' : ''}" id="mobileNavBackdrop" aria-label="סגירת תפריט"></button>
        <section class="main-shell">
          <header class="app-top-header">
            <div class="app-top-header-brand-wrap">
              <div class="app-top-header-page-title">${esc(routeLabels[currentRoute] || routeLabels.dashboard)}</div>
            </div>
            <div class="app-top-header-user">
              <button class="app-top-header-toggle" id="topSubbarToggle" type="button" aria-expanded="${isMobileViewport() ? (mobileNavOpen ? 'true' : 'false') : (sidebarOpen ? 'true' : 'false')}" aria-label="${isMobileViewport() ? (mobileNavOpen ? 'סגור סרגל צד' : 'פתח סרגל צד') : (sidebarOpen ? 'סגור סרגל צד' : 'פתח סרגל צד')}">
                <span class="app-top-header-arrow" aria-hidden="true">${isMobileViewport() ? (mobileNavOpen ? '✕' : '☰') : (sidebarOpen ? '⇥' : '⇤')}</span>
              </button>
            </div>
          </header>
          <main class="main" id="main"></main>
        </section>
      </div>
    </div>
  </div>`;

  document.querySelectorAll('[data-route]').forEach((b) => b.addEventListener('click', async () => {
    const route = b.dataset.route;
    if (route === 'logout') {
      await api.logout();
      clearUserState();
      resetClientDataStore();
      api.clearCache?.();
      setRoute('login');
      return;
    }
    if (route === 'courses' || route === 'instructor-view') {
      resetCoursesNavFromMenu();
    }
    setRoute(route);
  }));


  document.getElementById('mobileNavToggle')?.addEventListener('click', () => toggleMobileNav());
  document.getElementById('mobileNavBackdrop')?.addEventListener('click', () => toggleMobileNav(false));
  document.getElementById('topSubbarToggle')?.addEventListener('click', toggleHeaderSidebarControl);

  renderScreen();
}

function buildMenuNavigation() {
  const hiddenForAdmin = isAdminUser() ? new Set(['admin-settings', 'admin-lists', 'admin-permissions', 'finance', 'exceptions', 'end-dates', 'contacts']) : null;
  const hasHome = Boolean(getHomeRoute());
  return getAllowedRoutes()
    .filter((route) => !(hiddenForAdmin && hiddenForAdmin.has(route)))
    .filter((route) => !(hasHome && HIDDEN_IN_HOME_ROUTES.has(route)))
    .map((route) => nav(route, routeLabels[route] || route))
    .join('');
}

function mapCapabilityLabels(codes = [], kind = 'view') {
  const source = Array.isArray(codes) ? codes : String(codes || '').split(',').map((code) => code.trim()).filter(Boolean);
  const prefix = `${kind}_`;
  const labels = source
    .map((code) => String(code || '').trim())
    .filter((code) => code.startsWith(prefix))
    .map((code) => {
      const route = code.slice(prefix.length).replace(/_/g, '-');
      return routeLabels[route] || code;
    });
  return labels;
}

function nav(route, label) { return `<button class="nav-btn ${currentRoute === route ? 'active' : ''}" data-route="${route}"><span class="nav-icon" aria-hidden="true">${routeIcons[route] || '•'}</span><span>${label}</span></button>`; }
function head(_title, sub) { return sub ? `<header class="screen-head"><p>${sub}</p></header>` : ''; }
function getRouteSearchTerm(route = currentRoute) {
  return String(viewState.uiContext.searchTermByRoute?.[route] || '').trim();
}

function setRouteSearchTerm(route = currentRoute, value = '') {
  if (!viewState.uiContext.searchTermByRoute) viewState.uiContext.searchTermByRoute = {};
  viewState.uiContext.searchTermByRoute[route] = String(value || '').trim();
}

function filterBySearch(rows, fields = [], route = currentRoute) {
  const list = Array.isArray(rows) ? rows : [];
  const term = getRouteSearchTerm(route).toLowerCase();
  if (!term) return list;
  if (!fields.length) return list;
  return list.filter((row) => {
    const haystack = fields
      .map((field) => String(typeof field === 'function' ? field(row) : row?.[field] || ''))
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
}

function getHeaderKpis(route = currentRoute, context = {}) {
  if (route === 'admin-home' || route === 'operations-home') {
    return [
      { label: 'יעדים זמינים', value: context.destinationsCount || 0 },
      { label: 'הרשאות פעילות', value: getAllowedBusinessRoutes().length },
      { label: 'תפקיד', value: route === 'admin-home' ? 'אדמין' : 'תפעול' }
    ];
  }
  if (route === 'admin-settings' || route === 'admin-lists' || route === 'admin-permissions') {
    return [
      { label: 'רשומות', value: context.itemsCount || 0 },
      { label: 'מסך', value: routeLabels[route] || route },
      { label: 'משתמש', value: String(userState.displayName || userState.userId || '').slice(0, 24) }
    ];
  }
  if (route === 'dashboard') {
    const d = context.dashboard || viewState.dashboard.data || {};
    return [
      { label: 'קורסים פעילים', value: d.activeThisMonthCount || 0 },
      { label: 'סה"כ חריגות', value: d.totalExceptionsCount || 0 },
      { label: 'כמות מדריכים', value: d.instructorsCount || 0 }
    ];
  }
  if (route === 'courses' || route === 'instructor-view') {
    return [
      { label: 'פעילויות מוצגות', value: context.visibleCount || 0 },
      { label: 'מדריכים', value: context.instructorsCount || 0 }
    ];
  }
  if (route === 'week') {
    return [
      { label: 'קורסים בתצוגה', value: context.coursesCount || 0 },
      { label: 'ימים עם פעילות', value: context.activeDays || 0 },
      { label: 'מפגשים', value: context.sessionsCount || 0 }
    ];
  }
  if (route === 'month') {
    return [
      { label: 'קורסים בתצוגה', value: context.coursesCount || 0 },
      { label: 'ימים פעילים', value: context.activeDays || 0 },
      { label: 'אירועים', value: context.sessionsCount || 0 }
    ];
  }
  if (route === 'instructors') {
    return [
      { label: 'מדריכים', value: context.instructorsCount || 0 },
      { label: 'קורסים מוצגים', value: context.coursesCount || 0 }
    ];
  }
  if (route === 'end-dates') {
    return [
      { label: 'קורסים מסתיימים', value: context.itemsCount || 0 },
      { label: 'נדחו', value: context.postponedCount || 0 },
      { label: 'דורשים בקרה', value: context.reviewCount || 0 }
    ];
  }
  if (route === 'exceptions') {
    return [
      { label: 'חריגות', value: context.itemsCount || 0 },
      { label: 'ללא מדריך', value: context.noInstructorCount || 0 },
      { label: 'חסר start_date', value: context.missingDateCount || 0 }
    ];
  }
  if (route === 'finance') {
    return [
      { label: 'רשומות מוצגות', value: context.itemsCount || 0 },
      { label: 'פתוח', value: context.openCount || 0 },
      { label: 'סגור', value: context.closedCount || 0 }
    ];
  }
  if (route === 'contacts') {
    return [
      { label: 'אנשי קשר', value: context.itemsCount || 0 },
      { label: 'ניתן לעריכה', value: canEditContacts() ? 'כן' : 'לא' }
    ];
  }
  if (route === 'my-requests' || route === 'approvals' || route === 'final-approvals' || route === 'eden-view') {
    return [
      { label: 'רשומות מוצגות', value: context.itemsCount || 0 },
      { label: 'סה"כ רשומות', value: context.totalCount || context.itemsCount || 0 }
    ];
  }
  return [];
}

function renderUnifiedScreenHeader(route = currentRoute, subtitle = '', context = {}) {
  const searchTerm = getRouteSearchTerm(route);
  const kpis = getHeaderKpis(route, context).slice(0, 3);
  const homeRoute = getHomeRoute();
  const backBtn = (homeRoute && HIDDEN_IN_HOME_ROUTES.has(route))
    ? `<button class="btn-back-home" type="button" data-back-home="${escAttr(homeRoute)}">&#x2192; חזור</button>`
    : '';
  return `<section class="screen-top-unified">
    <div class="screen-top-main">
      ${backBtn}
      <h1>${esc(routeLabels[route] || routeLabels.dashboard)}</h1>
      ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
    </div>
    <div class="screen-top-tools">
      <label class="screen-search-wrap" for="screenSearchInput">
        <span>חיפוש</span>
        <input id="screenSearchInput" type="search" placeholder="חיפוש מהיר במסך הנוכחי" value="${escAttr(searchTerm)}" />
      </label>
      <div class="screen-mini-kpis">
        ${kpis.map((item) => `<article class="screen-mini-kpi"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></article>`).join('')}
      </div>
    </div>
  </section>`;
}

function bindUnifiedScreenHeader(route = currentRoute) {
  document.querySelectorAll('[data-back-home]').forEach((btn) => {
    btn.addEventListener('click', () => setRoute(btn.dataset.backHome));
  });
  const input = document.getElementById('screenSearchInput');
  if (!input) return;
  applyInPlaceSearchFilter(route, getRouteSearchTerm(route));
  input.addEventListener('input', () => {
    setRouteSearchTerm(route, input.value || '');
    const prev = routeSearchDebouncers.get(route);
    if (prev) clearTimeout(prev);
    const handle = setTimeout(() => {
      routeSearchDebouncers.delete(route);
      if (currentRoute !== route) return;
      const freshTerm = getRouteSearchTerm(route);
      applyInPlaceSearchFilter(route, freshTerm);
    }, SEARCH_RENDER_DEBOUNCE_MS);
    routeSearchDebouncers.set(route, handle);
  });
}

function applyInPlaceSearchFilter(route = currentRoute, rawTerm = '') {
  if (route !== currentRoute) return;
  const term = String(rawTerm || '').trim().toLowerCase();
  const main = document.getElementById('main');
  if (!main) return;

  const tableBodies = main.querySelectorAll('tbody');
  tableBodies.forEach((tbody) => {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach((row) => {
      const isDetails = row.classList.contains('contact-details-row');
      if (isDetails) return;
      const next = row.nextElementSibling;
      const linkedDetails = next && next.classList.contains('contact-details-row') ? next : null;
      if (!term) {
        row.style.display = '';
        if (linkedDetails) linkedDetails.style.display = '';
        return;
      }
      const text = String(row.textContent || '').toLowerCase();
      const visible = text.includes(term);
      row.style.display = visible ? '' : 'none';
      if (linkedDetails) linkedDetails.style.display = visible ? '' : 'none';
    });
  });

  const cards = main.querySelectorAll('.management-card, .mini-card, .control-board-card');
  cards.forEach((el) => {
    if (!term) {
      el.style.display = '';
      return;
    }
    const text = String(el.textContent || '').toLowerCase();
    el.style.display = text.includes(term) ? '' : 'none';
  });
}

function getUiScaleForRoute(route) {
  return ROUTE_UI_SCALES[route] || 1;
}

function getBusinessCourseName(row = {}) {
  return getCourseField(row, COURSE_FIELDS.PROGRAM)
    || getCourseField(row, COURSE_FIELDS.ACTIVITY)
    || 'שם קורס לא זמין';
}

function updateDocumentTitle() {
  const pageLabel = routeLabels[currentRoute] || routeLabels.dashboard;
  document.title = `${APP_NAME} | ${pageLabel}`;
}

function triggerPageEnter() {
  const main = document.getElementById('main');
  if (!main) return;
  main.classList.remove('page-enter');
  void main.offsetWidth;
  main.classList.add('page-enter');
}

function renderScreen() {
  const main = document.getElementById('main');
  if (!main) return;

  if (currentRoute === 'admin-home' || currentRoute === 'operations-home') {
    const isAdminHome = currentRoute === 'admin-home';
    const targets = isAdminHome
      ? resolveAdminLandingTargets()
      : getAllowedBusinessRoutes().map((route) => ({ key: route, label: routeLabels[route] || route, route }));
    const landingTargets = targets.length
      ? targets
      : (isAdminHome && canAccessRoute('dashboard')
        ? [{ key: 'dashboard', label: 'דשבורד', route: 'dashboard' }]
        : targets);
    main.innerHTML = renderUnifiedScreenHeader(currentRoute, '', { destinationsCount: landingTargets.length }) + `
      <section class="control-board-grid">
        ${landingTargets.map((item) => `<button class="control-board-card" type="button" data-primary-nav="${escAttr(item.route)}"><strong>${esc(item.label)}</strong><span>${esc(routeLabels[item.route] || item.route)}</span></button>`).join('')}
      </section>`;
    document.querySelectorAll('[data-primary-nav]').forEach((button) => button.addEventListener('click', () => setRoute(button.dataset.primaryNav || 'dashboard')));
    bindUnifiedScreenHeader(currentRoute);
    return;
  }

  if (currentRoute === 'admin-settings') {
    const rows = filterBySearch(
      (viewState.adminSettings.data || []).slice().sort((a, b) => String(a.key || '').localeCompare(String(b.key || ''), 'he')),
      ['key', 'value', 'type', 'notes'],
      'admin-settings'
    );
    main.innerHTML = renderUnifiedScreenHeader('admin-settings', 'הגדרות פעילות מהשרת', { itemsCount: rows.length })
      + panel(viewState.adminSettings, 'אין הגדרות להצגה.',
        `<section class="panel-block admin-screen-shell"><div class="panel-block-head"><h3 class="section-title">הגדרות מערכת</h3><span class="status-chip status-none">תצוגה בלבד</span></div><div class="table-shell admin-table-shell"><table><thead><tr><th>מפתח</th><th>ערך</th><th>סוג</th><th>הערות</th></tr></thead><tbody>
          ${rows.map((row) => `<tr><td>${esc(row.key)}</td><td>${esc(String(row.value))}</td><td>${esc(row.type || '')}</td><td>${esc(row.notes || '')}</td></tr>`).join('')}
        </tbody></table></div></section>`);
    bindUnifiedScreenHeader('admin-settings');
    return;
  }

  if (currentRoute === 'admin-lists') {
    const rows = filterBySearch(viewState.adminLists.data || [], ['list_name', 'value', 'label', 'activity_type', 'activity_name'], 'admin-lists');
    main.innerHTML = renderUnifiedScreenHeader('admin-lists', 'פריטי רשימות מהשרת', { itemsCount: rows.length })
      + panel(viewState.adminLists, 'אין רשימות להצגה.',
        `<section class="panel-block admin-screen-shell"><div class="panel-block-head"><h3 class="section-title">רשימות מערכת</h3><span class="status-chip status-none">תצוגה בלבד</span></div><div class="table-shell admin-table-shell"><table><thead><tr><th>רשימה</th><th>ערך</th><th>תווית</th><th>סוג פעילות</th><th>שם פעילות</th></tr></thead><tbody>
          ${rows.map((row) => `<tr><td>${esc(row.list_name)}</td><td>${esc(row.value)}</td><td>${esc(row.label)}</td><td>${esc(row.activity_type)}</td><td>${esc(row.activity_name)}</td></tr>`).join('')}
        </tbody></table></div></section>`);
    bindUnifiedScreenHeader('admin-lists');
    return;
  }

  if (currentRoute === 'admin-permissions') {
    const perms = filterBySearch(
      viewState.adminPermissions.data || [],
      [
        'employeeName',
        'displayRole',
        'defaultView',
        (row) => (Array.isArray(row.allowedViews) ? row.allowedViews.join(' ') : String(row.viewScope || ''))
      ],
      'admin-permissions'
    );
    const canEditPerms = canEditPermissions();
    main.innerHTML = renderUnifiedScreenHeader('admin-permissions', 'סיכום הרשאות משתמשים', { itemsCount: perms.length })
      + panel(viewState.adminPermissions, 'אין נתוני הרשאות.',
        `<section class="panel-block admin-screen-shell"><div class="panel-block-head"><h3 class="section-title">הרשאות משתמשים</h3>${canEditPerms ? '' : '<span class="status-chip status-none">תצוגה בלבד</span>'}</div><div class="table-shell admin-table-shell"><table><thead><tr><th>שם</th><th>תפקיד</th><th>ברירת מחדל</th><th>פעיל</th><th>פירוט</th>${canEditPerms ? '<th>עריכה</th>' : ''}</tr></thead><tbody>
          ${perms.map((row, idx) => {
      const summaryId = `perm-summary-${cssEscape(row.employeeId || row.employeeName || '')}`;
      const detailsId = `perm-details-${cssEscape(row.employeeId || row.employeeName || '')}`;
      const viewPermissions = mapCapabilityLabels(row.allowedViews || row.viewScope, 'view');
      const editPermissions = mapCapabilityLabels(row.allowedEdits || row.editScope, 'edit');
      const viewPermsText = viewPermissions.length ? viewPermissions.join(', ') : 'ללא הרשאות צפייה';
      const editPermsText = editPermissions.length ? editPermissions.join(', ') : 'ללא הרשאות עריכה';
      return `<tr class="permissions-summary-row" id="${summaryId}"><td>${esc(row.employeeName)}</td><td>${esc(row.displayRole || row.systemRole || '-')}</td><td>${esc(row.defaultView || '-')}</td><td>${row.activeFlag ? 'כן' : 'לא'}</td><td><button class="btn btn-secondary btn-xxs permissions-toggle-btn" type="button" data-perm-toggle="${escAttr(detailsId)}" aria-expanded="false" aria-controls="${detailsId}">פירוט</button></td>${canEditPerms ? `<td><button class="btn btn-secondary btn-xxs" type="button" data-edit-perm="${idx}">עריכה</button></td>` : ''}</tr>
      <tr class="permissions-details-row" id="${detailsId}" hidden><td colspan="${canEditPerms ? 6 : 5}"><div class="permission-details-grid">
      <article><span>מספר עובד</span><strong>${esc(row.employeeId || '-')}</strong></article>
      <article><span>קוד כניסה</span><strong>${esc(row.entryCode || '-')}</strong></article>
      <article><span>תפקיד</span><strong>${esc(row.displayRole || row.systemRole || '-')}</strong></article>
      <article><span>פעיל</span><strong>${row.activeFlag ? 'כן' : 'לא'}</strong></article>
      <article><span>מסך ברירת מחדל</span><strong>${esc(row.defaultView || '-')}</strong></article>
      <article class="permission-details-full"><span>הרשאות צפייה</span><strong>${esc(viewPermsText)}</strong></article>
      <article class="permission-details-full"><span>הרשאות עריכה</span><strong>${esc(editPermsText)}</strong></article>
      </div></td></tr>`;
    }).join('')}
        </tbody></table></div></section>`);
    document.querySelectorAll('[data-perm-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const detailsId = button.getAttribute('data-perm-toggle');
        const detailsRow = detailsId ? document.getElementById(detailsId) : null;
        if (!detailsRow) return;
        const isExpanded = !detailsRow.hasAttribute('hidden');
        detailsRow.toggleAttribute('hidden', isExpanded);
        button.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
        button.textContent = isExpanded ? 'פירוט' : 'סגור';
      });
    });
    document.querySelectorAll('[data-edit-perm]').forEach((button) => {
      button.addEventListener('click', async () => {
        const idx = Number(button.dataset.editPerm);
        const row = perms[idx];
        if (!row) return;
        const updated = await openPermissionEditForm(row);
        if (!updated) return;
        const res = await api.updatePermission(updated);
        if (!res?.success) return showToast(res?.message || 'עדכון הרשאה נכשל.', 'error');
        await loadAdminPermissionsView();
        showToast('ההרשאה עודכנה בהצלחה.', 'success');
      });
    });
    bindUnifiedScreenHeader('admin-permissions');
    return;
  }

  if (currentRoute === 'dashboard') {
    const d = viewState.dashboard.data || {};
    const managers = ['גיל נאמן', 'לינוי שמואל מזרחי'];
    const allTopKpis = [
      { title: 'סך קורסים', value: d.totalCoursesCount || 0, filter: 'all_courses' },
      { title: 'סך סדנאות', value: d.workshopsCount || 0, filter: 'workshops_only' },
      { title: 'סך סיורים', value: d.toursCount || 0, filter: 'tours_only' },
      { title: 'סיומי קורסים', value: d.endingCurrentMonthCount || 0, filter: 'ending_this_month' },
      { title: 'פעילים החודש', value: d.activeThisMonthCount || 0, filter: 'active_this_month' },
      { title: 'חריגים', value: d.totalExceptionsCount || 0, filter: 'exceptions' }
    ];
    const topKpis = runtimeRules.showOnlyNonZeroKpis
      ? allTopKpis.filter((item) => {
        if (item.filter === 'ending_this_month') return true;
        return Number(item.value || 0) !== 0;
      })
      : allTopKpis;
    main.innerHTML = renderUnifiedScreenHeader('dashboard', '', { dashboard: d }) + `<div class="dashboard-home">` + panel(viewState.dashboard, 'אין נתונים.',
      `<section class="kpi-section dashboard-kpi-top-section">
        <div class="dashboard-kpi-row-centered">
          <div class="kpi-grid dashboard-kpi-grid dashboard-kpi-grid-top">
            ${topKpis.map((item) => kpiCard(item.title, item.value, item.filter)).join('')}
          </div>
        </div>
      </section>
      <section class="dashboard-managers-below">
        <div class="dashboard-managers-grid">${managers.map((managerName) => `
        <article class="panel-block dashboard-manager-column">
          <div class="panel-block-head"><h3>${esc(managerName)}</h3></div>
          <div class="kpi-grid dashboard-kpi-grid manager-kpi-grid">
            ${[
              { title: 'מדריכים', value: d.instructorsByManager?.[managerName] || 0, filter: 'all_courses', context: `manager:${managerName}|subtitle:מדריכים` },
              { title: 'פעילים החודש', value: d.activeByManager?.[managerName] || 0, filter: 'active_this_month', context: `manager:${managerName}|subtitle:פעילים החודש - ${managerName}` },
              { title: 'סיומי קורסים', value: d.endingByManager?.[managerName] || 0, filter: 'ending_this_month', context: `manager:${managerName}|subtitle:סיומי קורסים - ${managerName}` },
              { title: 'דורשים טיפול', value: d.requiresTreatmentByManager?.[managerName] || 0, filter: 'requires_treatment', context: `manager:${managerName}|subtitle:דורשים טיפול - ${managerName}` }
            ].filter((item) => Number(item.value || 0) !== 0).map((item) => kpiCard(item.title, item.value, item.filter, '', item.context)).join('')}
          </div>
        </article>`).join('')}
        </div>
      </section>
      `) + `</div>`;
    document.querySelectorAll('[data-kpi-filter]').forEach((button) => button.addEventListener('click', () => onKpiClick(button.dataset.kpiFilter, button.dataset.kpiContext || '')));
    bindUnifiedScreenHeader('dashboard');
    return;
  }

  if (currentRoute === 'courses' || currentRoute === 'instructor-view') {
    const subtitle = viewState.uiContext.coursesSubtitle || (isInstructor() ? 'רק קורסים שמשויכים אליך' : '');
    const searchableFields = isInstructor()
      ? [COURSE_FIELDS.PROGRAM, COURSE_FIELDS.ACTIVITY, COURSE_FIELDS.AUTHORITY, COURSE_FIELDS.SCHOOL, COURSE_FIELDS.COURSE_ID]
      : [COURSE_FIELDS.PROGRAM, COURSE_FIELDS.ACTIVITY, COURSE_FIELDS.AUTHORITY, COURSE_FIELDS.SCHOOL, COURSE_FIELDS.COURSE_MANAGER, COURSE_FIELDS.EMPLOYEE, COURSE_FIELDS.COURSE_ID];
    const filteredCourses = filterBySearch(
      applyCourseQuickFilter(viewState.courses.data).filter((row) => !isCourseCompleted(row)),
      searchableFields,
      currentRoute
    );
    const selectedInstructor = viewState.courses.selectedInstructor;
    const instructorOverview = buildInstructorOverview(filteredCourses);
    const visibleCourses = currentRoute === 'instructor-view' && selectedInstructor
      ? filteredCourses.filter((row) => String(row?.Instructor || '').trim() === selectedInstructor)
      : filteredCourses;
    const courseMonthRaw = viewState.courses.filters.courseMonth || '';
    main.innerHTML = renderUnifiedScreenHeader(currentRoute, subtitle, {
      visibleCount: visibleCourses.length,
      totalCount: filteredCourses.length,
      instructorsCount: new Set(visibleCourses.map((row) => resolveInstructorName(row)).filter(Boolean)).size
    }) +
    (currentRoute === 'courses' ? renderActivityTypeSummary(visibleCourses) : '') +
    (currentRoute === 'courses' ? `<div class="courses-quick-nav">${[
      { route: 'end-dates', label: 'תאריכי סיום', icon: '⏳' },
      { route: 'week',      label: 'שבוע',         icon: '🗓️' },
      { route: 'month',     label: 'חודש',         icon: '📅' },
      { route: 'exceptions',label: 'חריגות',       icon: '⚠️' }
    ].filter((item) => canAccessRoute(item.route))
      .map((item) => `<button class="btn courses-nav-pill" type="button" data-courses-nav="${escAttr(item.route)}">${item.icon} ${esc(item.label)}</button>`)
      .join('')}</div>` : '') +
    `<section class="filters-wrap courses-filters">
      <label>סוג פעילות<select id="activityTypeFilter">${renderActivityTypeOptions(viewState.courses.filterOptions.activityType, viewState.courses.filters.activityType)}</select></label>
      <label>רשות<select id="authorityFilter">${renderSelectOptions(viewState.courses.filterOptions.authority, viewState.courses.filters.authority)}</select></label>
      <label>בית ספר<select id="schoolFilter">${renderSelectOptions(viewState.courses.filterOptions.school, viewState.courses.filters.school)}</select></label>
      <label>מנהל קורס<select id="courseManagerFilter">${renderSelectOptions(viewState.courses.filterOptions.courseManager, viewState.courses.filters.courseManager)}</select></label>
      <label>מדריך<select id="employeeFilter">${renderSelectOptions(viewState.courses.filterOptions.employee, viewState.courses.filters.employee)}</select></label>
      <label>חודש<select id="courseMonthFilter">${buildCourseMonthSelectOptions(viewState.courses.filters.courseMonth)}</select></label>
      <div class="filter-actions">
        <button class="btn btn-secondary" id="filterCourses">סינון</button>
        <button class="btn btn-secondary" id="resetCourseFilters">נקה סינון</button>
        ${canEditMasterCourses() ? '<button class="btn btn-primary" id="addCourseRecordBtn">＋ רשומה חדשה</button>' : ''}
        <div class="view-toggle-group">
          <button class="btn btn-icon${viewState.courses.view === 'table' ? ' active' : ''}" id="coursesViewTable" title="תצוגת טבלה">☰</button>
          <button class="btn btn-icon${viewState.courses.view === 'cards' ? ' active' : ''}" id="coursesViewCards" title="תצוגת כרטיסים">⊞</button>
        </div>
      </div>
    </section>` +
    panel(viewState.courses, 'אין רשומות.', `${currentRoute === 'instructor-view' ? renderInstructorCards(instructorOverview, selectedInstructor) : ''}
    ${selectedInstructor ? `<section class="instructor-details-head"><span>מדריך</span><strong>${esc(selectedInstructor)}</strong><button class="btn btn-secondary" id="clearInstructorDetails">חזרה לכל המדריכים</button></section>` : ''}
    ${currentRoute === 'courses'
      ? (viewState.courses.view === 'cards'
          ? renderCourseCards(visibleCourses, { canEdit: canEditMasterCourses() })
          : renderCourseTable(visibleCourses, { canEdit: canEditMasterCourses(), openDetailsId: viewState.courses.openDetailsId }))
      : renderCourseCards(visibleCourses, { canEdit: canEditMasterCourses(), showInstructorManager: true })}`) +
    renderCourseDetailsPanel(viewState.courses.selectedCourseDetails, { canEdit: canEditMasterCourses() });
    document.getElementById('filterCourses')?.addEventListener('click', () => {
      viewState.courses.quickFilter = '';
      viewState.courses.selectedInstructor = '';
      viewState.courses.filters = {
        authority: document.getElementById('authorityFilter')?.value.trim() || '',
        school: document.getElementById('schoolFilter')?.value.trim() || '',
        courseManager: document.getElementById('courseManagerFilter')?.value.trim() || '',
        employee: document.getElementById('employeeFilter')?.value.trim() || '',
        courseMonth: document.getElementById('courseMonthFilter')?.value.trim() || '',
        activityType: document.getElementById('activityTypeFilter')?.value.trim() || ''
      };
      loadCourses();
    });
    document.getElementById('resetCourseFilters')?.addEventListener('click', () => {
      viewState.courses.quickFilter = '';
      viewState.courses.selectedInstructor = '';
      viewState.courses.filters = { authority: '', school: '', courseManager: '', employee: '', courseMonth: '', activityType: '' };
      loadCourses();
    });
    document.getElementById('clearInstructorDetails')?.addEventListener('click', () => {
      viewState.courses.selectedInstructor = '';
      renderScreen();
    });
    document.getElementById('addCourseRecordBtn')?.addEventListener('click', async () => {
      const formResult = await openAddRecordForm();
      if (!formResult) return;
      const res = await createDataMasterRecord(formResult, userState);
      if (!res?.success) return showToast(res?.message || 'יצירת רשומה נכשלה.', 'error');
      await loadCourses();
      showToast('הרשומה נוספה בהצלחה ל-DATA_MASTER.', 'success');
    });
    document.getElementById('coursesViewTable')?.addEventListener('click', () => { viewState.courses.view = 'table'; renderScreen(); });
    document.getElementById('coursesViewCards')?.addEventListener('click', () => { viewState.courses.view = 'cards'; renderScreen(); });
    document.querySelectorAll('[data-courses-nav]').forEach((btn) => btn.addEventListener('click', () => setRoute(btn.dataset.coursesNav)));
    bindInstructorCards();
    bindCourseActions();
    bindUnifiedScreenHeader(currentRoute);
    return;
  }

  if (currentRoute === 'week') {
    const weekCourses = filterBySearch(
      getRoleScopedCourses(viewState.week.filters),
      [COURSE_FIELDS.PROGRAM, COURSE_FIELDS.ACTIVITY, COURSE_FIELDS.AUTHORITY, COURSE_FIELDS.SCHOOL, COURSE_FIELDS.EMPLOYEE, COURSE_FIELDS.COURSE_MANAGER],
      'week'
    );
    const weekData = buildWeeklyBuckets(weekCourses, viewState.week.rangeStart);
    const weekSideOpen = Boolean(viewState.week.selected || viewState.week.instructorPanel);
    const weekSessionsCount = weekData.days.reduce((sum, day) => sum + (day.items?.length || 0), 0);
    main.innerHTML = renderUnifiedScreenHeader('week', 'תמונת מצב שבועית תפעולית', {
      coursesCount: weekCourses.length,
      activeDays: weekData.days.filter((day) => (day.items?.length || 0) > 0).length,
      sessionsCount: weekSessionsCount
    }) +
      `<div class="week-page-shell${weekSideOpen ? ' week-page-shell--open' : ''}"><div class="week-page-main">` +
      renderWeekFilters() +
      panel({ loading: viewState.week.loading, error: viewState.week.error, data: weekData.days }, 'אין מפגשים לשבוע זה.', renderWeekGrid(weekData.days)) +
      `</div>${viewState.week.selected ? renderWeekDetails(viewState.week.selected) : ''}${viewState.week.instructorPanel ? renderWeekInstructorSidePanel(viewState.week.instructorPanel) : ''}${weekSideOpen ? '<button type="button" class="week-side-backdrop" id="weekBackdrop" aria-label="סגור"></button>' : ''}</div>`;
    bindWeekActions(weekData);
    bindUnifiedScreenHeader('week');
    return;
  }

  if (currentRoute === 'contacts') {
    const contactsRows = filterBySearch(viewState.contacts.data || [], ['name', 'mobile', 'email', 'address', 'employment'], 'contacts');
    const expandedRowKey = viewState.contacts.expandedRowKey || '';
    const AVATAR_PALETTE = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#6366f1','#0ea5e9','#d97706'];
    const avatarColor = (name) => { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff; return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]; };
    const initials = (name) => { const p = String(name || '').trim().split(/\s+/); return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]) : String(name || '').slice(0, 2); };
    main.innerHTML = renderUnifiedScreenHeader('contacts', '', { itemsCount: contactsRows.length }) +
      panel(viewState.contacts, 'אין אנשי קשר להצגה.',
        `<div class="contacts-grid">
          ${contactsRows.map((row, index) => {
            const rowKey = String(row._rowNumber || index);
            const isExpanded = expandedRowKey === rowKey;
            const bg = avatarColor(row.name || '');
            const ini = initials(row.name || '?');
            return `<article class="contact-card${isExpanded ? ' contact-card--open' : ''}">
              <div class="contact-card-head">
                <div class="contact-avatar" style="background:${bg}">${esc(ini)}</div>
                <div class="contact-card-body">
                  <button type="button" class="contact-name-toggle" data-contact-expand="${escAttr(rowKey)}">${esc(row.name || '-')}</button>
                  ${row.employment ? `<span class="contact-employment">${esc(row.employment)}</span>` : ''}
                </div>
                <div class="contact-card-quick">
                  ${row.mobile ? `<a class="contact-action-icon" href="tel:${escAttr(row.mobile)}" title="חייג ל${escAttr(row.name || '')}">📞</a>` : ''}
                  ${row.email ? `<button type="button" class="contact-action-icon" data-copy-email="${escAttr(row.email)}" title="העתק אימייל">✉️</button>` : ''}
                </div>
              </div>
              ${isExpanded ? `<div class="contact-card-details">
                ${row.mobile ? `<div class="contact-detail-item"><span class="contact-detail-icon">📱</span><span class="contact-detail-value">${esc(row.mobile)}</span></div>` : ''}
                ${row.email ? `<div class="contact-detail-item"><span class="contact-detail-icon">✉️</span><span class="contact-detail-value">${esc(row.email)}</span></div>` : ''}
                ${row.address ? `<div class="contact-detail-item"><span class="contact-detail-icon">📍</span><span class="contact-detail-value">${esc(row.address)}</span></div>` : ''}
                ${row.employment ? `<div class="contact-detail-item"><span class="contact-detail-icon">💼</span><span class="contact-detail-value">${esc(row.employment)}</span></div>` : ''}
                ${canEditContacts() ? `<div class="contact-details-actions"><button class="btn btn-secondary btn-sm" data-edit-contact="${index}">עריכה</button></div>` : ''}
              </div>` : ''}
            </article>`;
          }).join('')}
        </div>`);
    document.querySelectorAll('[data-contact-expand]').forEach((btn) => btn.addEventListener('click', () => {
      const rowKey = btn.dataset.contactExpand || '';
      viewState.contacts.expandedRowKey = viewState.contacts.expandedRowKey === rowKey ? '' : rowKey;
      renderScreen();
    }));
    document.querySelectorAll('[data-copy-email]').forEach((btn) => btn.addEventListener('click', async () => {
      await copyEmailToClipboard(btn.dataset.copyEmail || '');
    }));
    document.querySelectorAll('[data-edit-contact]').forEach((btn) => btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.editContact || -1);
      const current = contactsRows[idx];
      if (!current) return;
      const updated = await openContactEditForm(current);
      if (!updated) return;
      const res = await api.updateContact(updated);
      if (!res?.success) return showToast(res?.message || 'עדכון איש קשר נכשל.', 'error');
      await loadContactsView();
      showToast('איש הקשר עודכן בהצלחה.', 'success');
    }));
    bindUnifiedScreenHeader('contacts');
    return;
  }

  if (currentRoute === 'month') {
    const monthCourses = filterBySearch(
      getRoleScopedCourses(viewState.month.filters),
      [COURSE_FIELDS.PROGRAM, COURSE_FIELDS.ACTIVITY, COURSE_FIELDS.AUTHORITY, COURSE_FIELDS.SCHOOL, COURSE_FIELDS.EMPLOYEE, COURSE_FIELDS.COURSE_MANAGER],
      'month'
    );
    const monthData = buildMonthlyCalendar(monthCourses, viewState.month.monthDate);
    const monthTitleNav = monthData.monthStart ? monthData.monthStart.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }) : '';
    const sideOpen = Boolean(viewState.month.selectedDate);
    const monthSessionsCount = monthData.days.reduce((sum, day) => sum + (day.items?.length || 0), 0);
    main.innerHTML = `<div class="month-page">` + renderUnifiedScreenHeader('month', '', {
      coursesCount: monthCourses.length,
      activeDays: monthData.days.filter((day) => (day.items?.length || 0) > 0).length,
      sessionsCount: monthSessionsCount
    }) +
      `<div class="month-page-shell${sideOpen ? ' month-page-shell--open' : ''}"><div class="month-page-main">` +
      renderMonthFilters(monthTitleNav) +
      panel({ loading: viewState.month.loading, error: viewState.month.error, data: monthData.days }, 'אין נתונים לחודש שנבחר.', renderMonthGrid(monthData.days)) +
      `</div>${sideOpen ? renderMonthSidePanel(monthData.selectedItems, viewState.month.selectedDate) : ''}${sideOpen ? '<button type="button" class="month-side-backdrop" id="monthBackdrop" aria-label="סגור"></button>' : ''}</div></div>`;
    bindMonthActions(monthData);
    bindUnifiedScreenHeader('month');
    return;
  }

  if (currentRoute === 'instructors') {
    const scopedCourses = filterBySearch(
      getRoleScopedCourses(viewState.instructors.filters),
      [COURSE_FIELDS.EMPLOYEE, COURSE_FIELDS.PROGRAM, COURSE_FIELDS.ACTIVITY, COURSE_FIELDS.AUTHORITY, COURSE_FIELDS.SCHOOL],
      'instructors'
    );
    const instructorsData = buildInstructorsViewData(scopedCourses);
    main.innerHTML = `<div class="instructors-page">` + renderUnifiedScreenHeader('instructors', '', {
      instructorsCount: instructorsData.items.length,
      coursesCount: scopedCourses.length
    }) +
      renderInstructorsFilters() +
      `<section class="compact-actions-row"><button type="button" class="btn btn-secondary btn-compact" id="goContactsFromInstructors">אנשי קשר</button></section>` +
      panel({ loading: viewState.instructors.loading, error: viewState.instructors.error, data: instructorsData.items }, 'אין מדריכים להצגה.', renderInstructorsCards(instructorsData.items)) +
      renderInstructorCoursesDetails(viewState.instructors.selectedInstructor, instructorsData.coursesByInstructor) + `</div>`;
    document.getElementById('goContactsFromInstructors')?.addEventListener('click', () => setRoute('contacts'));
    bindInstructorsActions();
    bindUnifiedScreenHeader('instructors');
    return;
  }

  if (currentRoute === 'end-dates') {
    const endDateItems = filterBySearch(
      buildEndDateItems(getCoursesForUser(userState, viewState.endDates.filters)),
      ['Program', 'Authority', 'School', 'Instructor', 'CourseManager', 'issuesLabel'],
      'end-dates'
    );
    const endMonthRaw = viewState.endDates.filters.month || formatMonthInputLocal(new Date());
    main.innerHTML = renderUnifiedScreenHeader('end-dates', 'בקרת קורסים לקראת סיום', {
      itemsCount: endDateItems.length,
      postponedCount: endDateItems.filter((item) => item.postpone?.isPostponed).length,
      reviewCount: endDateItems.filter((item) => item.hasReviewDelay).length
    }) +
      renderMonthStatBadge({ count: endDateItems.length, monthRaw: endMonthRaw, noun: 'קורסים מסתיימים' }) +
      renderEndDatesFilters() +
      panel({ loading: viewState.endDates.loading, error: viewState.endDates.error, data: endDateItems }, 'אין קורסים בטווח הסיום שנבחר.', renderEndDateCards(endDateItems)) +
      renderCourseDetailsPanel(viewState.courses.selectedCourseDetails, { canEdit: canEditMasterCourses() });
    bindEndDatesActions();
    bindUnifiedScreenHeader('end-dates');
    return;
  }

  if (currentRoute === 'exceptions') {
    const exceptionRows = filterBySearch(
      buildExceptionsRows(getStoreSnapshot().reviewItems || [], getRoleScopedCourses({}), viewState.exceptions.filters),
      ['Program', 'Authority', 'School', 'Instructor', 'CourseManager', 'issuesLabel'],
      'exceptions'
    );
    main.innerHTML = renderUnifiedScreenHeader('exceptions', '', {
      itemsCount: exceptionRows.length,
      noInstructorCount: exceptionRows.filter((row) => String(row.Instructor || '').trim() === '').length,
      missingDateCount: exceptionRows.filter((row) => String(row.issuesLabel || '').includes(EXCEPTION_MISSING_START_DATE)).length
    }) +
      renderExceptionsFilters() +
      panel({ loading: viewState.exceptions.loading, error: viewState.exceptions.error, data: exceptionRows }, 'אין חריגות להצגה.', renderExceptionsCards(exceptionRows)) +
      renderCourseDetailsPanel(viewState.courses.selectedCourseDetails, { canEdit: canEditMasterCourses() });
    bindExceptionsActions();
    bindUnifiedScreenHeader('exceptions');
    return;
  }

  if (currentRoute === 'finance') {
    if (!canAccessFinanceActive() && !canAccessFinanceArchive()) {
      main.innerHTML = renderUnifiedScreenHeader('finance', 'גישה מותנית הרשאות', { itemsCount: 0, openCount: 0, closedCount: 0 }) + '<section class="panel-state error"><span class="panel-state-icon">⛔</span><span>אין הרשאה למסך כספים.</span></section>';
      bindUnifiedScreenHeader('finance');
      return;
    }
    const canActive = canAccessFinanceActive();
    const canArchive = canAccessFinanceArchive();
    const showActive = viewState.finance.tab !== 'archive';
    const rows = filterBySearch(
      showActive ? (viewState.finance.activeItems || []) : viewState.finance.archiveItems,
      ['Program', 'Authority', 'School', 'Instructor', 'CourseManager', 'FinanceStatus', 'Payment', 'Notes'],
      'finance'
    );
    const canEdit = showActive ? canEditFinanceActive() : canEditFinanceArchive();
    const dm = viewState.finance.displayMonth || '';
    const filteredFinance = (rows || []).filter((item) => financeRowInDisplayMonth(item, dm));
    const financeSummary = summarizeFinanceBuckets(filteredFinance);
    const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const pendingTotal = showActive ? (viewState.finance.activeItems || [])
      .filter((item) => {
        const d = ['MonthEnd', 'MonthStart', 'End', 'Period'].map((k) => parseDateLike(item?.[k])).filter(Boolean)[0];
        return d ? d >= currentMonthStart : true;
      })
      .reduce((sum, item) => {
        const raw = String(item?.Payment || '').replace(/[^\d.]/g, '');
        return sum + (parseFloat(raw) || 0);
      }, 0) : 0;
    const pendingTotalLabel = pendingTotal > 0 ? pendingTotal.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }) : '-';
    const dmParsed = parseMonthValue(dm) || new Date();
    const financeMonthLabel = dmParsed.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    const emptyFinanceMessage = showActive
      ? 'אין נתוני כספים להצגה.'
      : 'אין נתוני ארכיון להצגה כרגע.';

    main.innerHTML = renderUnifiedScreenHeader('finance', 'ניהול סל גבייה פעיל וארכיון', {
      itemsCount: filteredFinance.length,
      openCount: financeSummary.open,
      closedCount: financeSummary.completed
    }) +
      `<section class="finance-toolbar">
        <div class="finance-tabs">
          ${canActive ? `<button class="btn ${showActive ? 'btn-primary' : 'btn-secondary'}" data-finance-tab="active">גבייה פעילה</button>` : ''}
          ${canArchive ? `<button class="btn ${!showActive ? 'btn-primary' : 'btn-secondary'}" data-finance-tab="archive">ארכיון גבייה</button>` : ''}
        </div>
        <div class="finance-toolbar-actions">
          ${showActive ? '<button class="btn btn-secondary" id="financeExportBtn">ייצוא לאקסל</button>' : ''}
          ${showActive && canSyncFinance() ? '<button class="btn btn-primary" id="financeSyncBtn">סנכרון כספים (ניהולי)</button>' : ''}
          <button class="btn btn-icon" id="financeRefreshBtn" title="טעינה מחדש">↺</button>
          <div class="view-toggle-group">
            <button class="btn btn-icon${viewState.finance.view === 'table' ? ' active' : ''}" id="financeViewTable" title="טבלה">☰</button>
            <button class="btn btn-icon${viewState.finance.view === 'cards' ? ' active' : ''}" id="financeViewCards" title="כרטיסים">⊞</button>
          </div>
        </div>
      </section>
      <section class="finance-month-toolbar">
        <button type="button" class="btn btn-secondary" id="financeMonthPrev" aria-label="חודש קודם">◀</button>
        <span class="finance-month-label">${esc(financeMonthLabel)}</span>
        <button type="button" class="btn btn-secondary" id="financeMonthNext" aria-label="חודש הבא">▶</button>
      </section>
      <section class="kpi-grid finance-kpi-grid">
        <article class="kpi-card"><span class="kpi-title">פתוח</span><span class="kpi-value">${financeSummary.open}</span></article>
        <article class="kpi-card"><span class="kpi-title">סגור</span><span class="kpi-value">${financeSummary.completed}</span></article>
        ${showActive ? `<article class="kpi-card kpi-card--highlight"><span class="kpi-title">סה"כ לגבייה</span><span class="kpi-value kpi-value--money">${esc(pendingTotalLabel)}</span><span class="kpi-sub">חודש נוכחי + קדימה</span></article>` : ''}
      </section>` +
      panel({ loading: viewState.finance.loading, error: viewState.finance.error, data: rows }, emptyFinanceMessage,
        viewState.finance.view === 'table'
          ? renderFinanceTable(rows, { showArchive: !showActive, canEdit, displayMonth: dm, selectedMeetingsRowId: viewState.finance.selectedMeetingsRowId })
          : renderFinanceCards(rows, { showArchive: !showActive, canEdit, displayMonth: dm })) +
      renderFinanceDetailsPanel(rows.find((item) => String(item?.FinanceRowID || '') === viewState.finance.selectedFinanceRowId) || null);

    document.getElementById('financeMonthPrev')?.addEventListener('click', () => {
      viewState.finance.displayMonth = addMonthsToMonthString(viewState.finance.displayMonth || formatMonthInputLocal(new Date()), -1);
      viewState.finance.selectedFinanceRowId = '';
      renderScreen();
    });
    document.getElementById('financeMonthNext')?.addEventListener('click', () => {
      viewState.finance.displayMonth = addMonthsToMonthString(viewState.finance.displayMonth || formatMonthInputLocal(new Date()), 1);
      viewState.finance.selectedFinanceRowId = '';
      renderScreen();
    });

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
          ? 'סנכרון כספים הושלם בהצלחה'
          : (result?.message || 'סנכרון כספים נכשל'),
        result?.success ? 'success' : 'error'
      );
      await loadFinanceView({ silent: true, force: true });
    });
    document.getElementById('financeExportBtn')?.addEventListener('click', () => {
      const fileName = `מסך_כספים_${formatIsoDateLocal(new Date())}.xlsx`;
      exportFinanceToExcel(filteredFinance, fileName);
    });

    document.querySelectorAll('[data-finance-status]').forEach((select) => select.addEventListener('change', async (event) => {
      const financeRowId = event.target.dataset.financeRowId || '';
      const status = event.target.value || '';
      const sheetName = event.target.dataset.financeSheet || TAASIYEDA_CONFIG.sheets.DATA_MASTER;
      const result = await updateFinanceStatus(financeRowId, status, { sheetName });
      if (!result?.success) {
        showToast(result?.message || 'עדכון סטטוס נכשל.', 'error');
      } else if (status === 'closed') {
        showToast('הרשומה סומנה כסגורה.', 'success');
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
      const status = statusSelect?.value || 'open';
      const statusNote = noteInput?.value.trim() ?? '';
      if (!financeRowId) {
        showToast('לא נמצא מזהה רשומה.', 'warning');
        return;
      }
      const result = await updateFinanceStatus(financeRowId, status, {
        sheetName: TAASIYEDA_CONFIG.sheets.DATA_MASTER,
        statusNote
      });
      if (!result?.success) {
        showToast(result?.message || 'שמירת הערה נכשלה.', 'error');
        return;
      }
      showToast('הערה נשמרה בהצלחה.', 'success');
      await loadFinanceView({ silent: true, force: true });
    }));
    document.getElementById('financeViewTable')?.addEventListener('click', () => { viewState.finance.view = 'table'; renderScreen(); });
    document.getElementById('financeViewCards')?.addEventListener('click', () => { viewState.finance.view = 'cards'; renderScreen(); });
    document.getElementById('financeRefreshBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('financeRefreshBtn');
      if (btn) { btn.style.opacity = '0.4'; btn.disabled = true; }
      await loadFinanceView({ force: true, silent: false });
      if (btn) { btn.style.opacity = ''; btn.disabled = false; }
    });
    document.querySelectorAll('[data-finance-meetings]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.financeMeetings || '';
      viewState.finance.selectedMeetingsRowId = viewState.finance.selectedMeetingsRowId === id ? '' : id;
      renderScreen();
    }));
    document.querySelectorAll('[data-finance-export-row]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.financeExportRow || '';
      const allItems = [...(viewState.finance.activeItems || []), ...(viewState.finance.archiveItems || [])];
      const item = allItems.find((r) => String(r?.FinanceRowID || '') === id);
      if (item) exportFinanceRowDatesToExcel(item);
    }));
    bindUnifiedScreenHeader('finance');
    return;
  }

  if (currentRoute === 'my-requests') {
    const rows = filterBySearch(viewState.requests.data, ['CourseLabel', 'ApprovalStatus', 'ApprovalNotes', 'RequestedDataView'], 'my-requests');
    main.innerHTML = renderUnifiedScreenHeader('my-requests', 'טיוטות, סטטוסים והערות', {
      itemsCount: rows.length,
      totalCount: (viewState.requests.data || []).length
    }) + panel({ ...viewState.requests, data: rows }, 'אין בקשות.',
      table(rows, [['CourseLabel','קורס'],['OriginalDataView','לפני'],['RequestedDataView','אחרי'],['ApprovalStatus','סטטוס'],['ApprovalNotes','הערות']], canEditMasterCourses()));
    bindUnifiedScreenHeader('my-requests');
    return;
  }

  if (currentRoute === 'approvals' || currentRoute === 'final-approvals') {
    const rows = filterBySearch(viewState.approvals.data, ['CourseLabel', 'ApprovalStatus', 'OriginalDataView', 'RequestedDataView'], currentRoute);
    main.innerHTML = renderUnifiedScreenHeader(currentRoute, 'השוואה בין מקור לשינוי לפני החלטה', {
      itemsCount: rows.length,
      totalCount: (viewState.approvals.data || []).length
    }) + panel({ ...viewState.approvals, data: rows }, 'אין בקשות.',
      table(rows, [['CourseLabel','קורס'],['OriginalDataView','לפני'],['RequestedDataView','אחרי']], false, true, currentRoute === 'final-approvals'));
    bindApprovalButtons();
    bindUnifiedScreenHeader(currentRoute);
    return;
  }

  if (currentRoute === 'eden-view') {
    const queue = viewState.eden.data.queue || [];
    const counters = viewState.eden.data.counters || {};
    const searchFilteredQueue = filterBySearch(queue, ['CourseID', 'Origin', 'Authority', 'School', 'Instructor', 'ApprovalStatus', 'ChangeType'], 'eden-view');
    const filteredQueue = applyEdenQueueFilters(searchFilteredQueue);
    main.innerHTML = renderUnifiedScreenHeader('eden-view', 'Source / Eden Draft עם שליטה מלאה ב-workflow', {
      itemsCount: filteredQueue.length,
      totalCount: queue.length
    }) +
    `<section class="kpi-grid">
      <article class="kpi-card"><span class="kpi-title">ממתין עדן</span><span class="kpi-value">${counters.pending_eden || 0}</span></article>
      <article class="kpi-card"><span class="kpi-title">נשמר אצל עדן</span><span class="kpi-value">${counters.eden_saved || 0}</span></article>
      <article class="kpi-card"><span class="kpi-title">נשלח לאדמין</span><span class="kpi-value">${counters.pending_final || 0}</span></article>
      <article class="kpi-card"><span class="kpi-title">התראת שינוי מאסטר</span><span class="kpi-value">${counters.master_changed_warning || 0}</span></article>
      <article class="kpi-card"><span class="kpi-title">מקור: בקשה</span><span class="kpi-value">${counters.request_origin || 0}</span></article>
      <article class="kpi-card"><span class="kpi-title">מקור: יוזמת עדן</span><span class="kpi-value">${counters.eden_initiated_origin || 0}</span></article>
    </section>
    <section class="filters-wrap">
      <button class="btn btn-secondary" id="edenStartExisting">פתיחת שינוי על רשומה קיימת</button>
      <button class="btn btn-primary" id="edenStartNew">יצירת רשומה חדשה (יוזמת עדן)</button>
      <span class="status-chip">New Record = טופס מלא ידני בלבד</span>
    </section>
    <section class="filters-wrap">
      <label>סטטוס<select id="edenWorkflowFilter">${renderSelectOptions(['pending_eden','eden_saved','pending_final','final_approved','final_rejected','closed'], viewState.eden.filters.workflow)}</select></label>
      <label>מקור<select id="edenOriginFilter">${renderSelectOptions(['REQUEST','EDEN_INITIATED'], viewState.eden.filters.origin)}</select></label>
      <label>חיפוש<select id="edenAuthorityFilter">${renderSelectOptions(uniqueValues(queue, 'Authority'), viewState.eden.filters.authority)}</select></label>
      <label>בית ספר<select id="edenSchoolFilter">${renderSelectOptions(uniqueValues(queue, 'School'), viewState.eden.filters.school)}</select></label>
      <label>מדריך<select id="edenInstructorFilter">${renderSelectOptions(uniqueValues(queue, 'Instructor'), viewState.eden.filters.instructor)}</select></label>
      <label>חופשי<input id="edenSearchFilter" value="${escAttr(viewState.eden.filters.search || '')}" /></label>
      <button class="btn btn-secondary" id="filterIssues">סינון</button>
    </section>` +
    panel(viewState.eden, 'אין רשומות בתור עדן.', `${renderEdenQueue(filteredQueue)}`);
    document.getElementById('filterIssues')?.addEventListener('click', () => {
      viewState.eden.filters = {
        workflow: document.getElementById('edenWorkflowFilter')?.value.trim() || '',
        origin: document.getElementById('edenOriginFilter')?.value.trim() || '',
        instructor: document.getElementById('edenInstructorFilter')?.value.trim() || '',
        authority: document.getElementById('edenAuthorityFilter')?.value.trim() || '',
        school: document.getElementById('edenSchoolFilter')?.value.trim() || '',
        search: document.getElementById('edenSearchFilter')?.value.trim() || ''
      };
      renderScreen();
    });
    bindEdenActions();
    bindUnifiedScreenHeader('eden-view');
  }
  enforceDatePickerInputs();
  updateFilterActiveIndicators();
}

function updateFilterActiveIndicators() {
  document.querySelectorAll('.filters-wrap').forEach((wrap) => {
    const selects = Array.from(wrap.querySelectorAll('select'));
    const inputs  = Array.from(wrap.querySelectorAll('input:not([type="hidden"])'));
    const activeCount =
      selects.filter((s) => s.value && s.value !== '').length +
      inputs.filter((i)  => i.value  && i.value  !== '').length;
    wrap.querySelector('.active-filter-indicator')?.remove();
    if (activeCount > 0) {
      wrap.classList.add('filters-wrap--active');
      const badge = document.createElement('span');
      badge.className = 'active-filter-indicator';
      badge.title = `${activeCount} שדות סינון פעילים`;
      badge.textContent = `${activeCount} פעיל`;
      const actions = wrap.querySelector('.filter-actions');
      if (actions) actions.prepend(badge);
      else wrap.appendChild(badge);
    } else {
      wrap.classList.remove('filters-wrap--active');
    }
  });
}

function enforceDatePickerInputs() {
  document.querySelectorAll('input[type="date"], input[type="month"]').forEach((input) => {
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

function kpiCard(title, value, filterName, helper = '', context = '') {
  return `<button class="kpi-card kpi-action" data-kpi-filter="${filterName}" data-kpi-context="${escAttr(context)}" type="button"><span class="kpi-title" title="${escAttr(title)}">${title}</span><span class="kpi-value">${value}</span>${helper ? `<span class="kpi-helper" title="${escAttr(helper)}">${helper}</span>` : ''}</button>`;
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
  return `<section class="panel-block"><div class="panel-block-head"><h3>תור עבודה עדן</h3></div>
    ${rows.map((row) => {
      const sourceRow = safeParseJson(row.SourceData || row.OriginalData);
      const edenRow = safeParseJson(row.RequestedData);
      const compared = buildEdenComparedRows(sourceRow, edenRow);
      const changedMaster = String(row?.HasMasterChangedAfterEdenEdit || '').toLowerCase() === 'true';
      const hasDiff = String(row?.HasDiffBetweenSourceAndEden || '').toLowerCase() === 'true';
      const warning = changedMaster ? '<span class="status-chip status-declined">⚠ המאסטר השתנה מאז עריכת עדן</span>' : '';
      return `<article class="management-card">
        <div class="card-head">
          <h3>${esc(edenRow?.Program || edenRow?.EventType || row.CourseID || '-')}</h3>
          <span class="status-chip ${statusClass(row.ApprovalStatus)}">${statusLabel(row.ApprovalStatus)}</span>
        </div>
        <div class="card-meta">
          <span>CourseID: ${esc(row.CourseID || '-')}</span>
          <span>מקור: ${esc(row.Origin || 'REQUEST')}</span>
          <span>סוג: ${esc(row.ChangeType || 'UPDATE_EXISTING')}</span>
          <span>רשות: ${esc(edenRow?.Authority || sourceRow?.Authority || '-')}</span>
          <span>בית ספר: ${esc(edenRow?.School || sourceRow?.School || '-')}</span>
          <span>מדריך: ${esc(edenRow?.Instructor || sourceRow?.Instructor || '-')}</span>
          <span>${hasDiff ? 'Δ יש פער בין מקור לטיוטה' : 'ללא פערים'}</span>
          ${warning}
        </div>
        <details open><summary>לפני / אחרי</summary>
          <div class="table-wrap compact-table"><table><tbody>
          ${compared.map((item) => `<tr class="${item.changed ? 'row-changed' : ''}">
            <th>${esc(item.field)}</th><td>${esc(item.source)}</td><td>${esc(item.eden)}</td></tr>`).join('')}
          </tbody></table></div>
        </details>
        <div class="card-meta"><span>שמירה אחרונה: ${esc(formatDate(parseDateLike(row.EdenLastSavedAt)) || row.EdenLastSavedAt || '-')}</span><span>נשלח לאדמין: ${esc(formatDate(parseDateLike(row.SentToAdminAt)) || row.SentToAdminAt || '-')}</span></div>
        <label>הערות עדן<textarea data-eden-notes="${escAttr(row.RequestID || '')}" rows="2">${esc(row.EdenNotes || '')}</textarea></label>
        <div class="card-actions">
          <button class="btn btn-secondary" data-eden-edit="${escAttr(row.RequestID || '')}">שמור ב-Eden Data Master</button>
          <button class="btn btn-primary" data-eden-submit="${escAttr(row.RequestID || '')}">שליחה לאדמין</button>
          <button class="btn btn-secondary" data-eden-refresh="${escAttr(row.RequestID || '')}">רענן מקור</button>
        </div>
      </article>`;
    }).join('')}
  </section>`;
}

function buildEdenComparedRows(source = {}, eden = {}) {
  const keys = new Set([...Object.keys(source || {}), ...Object.keys(eden || {})]);
  return Array.from(keys)
    .filter((field) => !String(field).startsWith('_') && !['RequestID', 'WorkflowStatus', 'EdenNotes'].includes(String(field)))
    .map((field) => {
      const sourceText = String(source?.[field] ?? '');
      const edenText = String(eden?.[field] ?? '');
      return { field, source: sourceText || '-', eden: edenText || '-', changed: sourceText !== edenText };
    });
}

function uniqueValues(rows = [], field) {
  return Array.from(new Set((rows || []).map((item) => String(safeParseJson(item.RequestedData)?.[field] || safeParseJson(item.SourceData)?.[field] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he'));
}

function applyEdenQueueFilters(rows = []) {
  const filters = viewState.eden.filters || {};
  const workflow = String(filters.workflow || '').toLowerCase();
  const origin = String(filters.origin || '').toLowerCase();
  const authority = String(filters.authority || '').toLowerCase();
  const school = String(filters.school || '').toLowerCase();
  const instructor = String(filters.instructor || '').toLowerCase();
  const search = String(filters.search || '').toLowerCase();
  return (rows || []).filter((item) => {
    const eden = safeParseJson(item.RequestedData);
    const source = safeParseJson(item.SourceData);
    if (workflow && String(item.ApprovalStatus || '').toLowerCase() !== workflow) return false;
    if (origin && String(item.Origin || '').toLowerCase() !== origin) return false;
    if (authority && !String(eden.Authority || source.Authority || '').toLowerCase().includes(authority)) return false;
    if (school && !String(eden.School || source.School || '').toLowerCase().includes(school)) return false;
    if (instructor && !String(eden.Instructor || source.Instructor || '').toLowerCase().includes(instructor)) return false;
    if (search) {
      const haystack = `${item.CourseID || ''} ${eden.Program || ''} ${eden.EventType || ''} ${source.Program || ''} ${source.EventType || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function table(rows, cols, canEdit, canApprove, isApplyMode = false) {
  const body = (rows || []).map((r, i) => `<tr>${cols.map((c) => {
    const fieldKey = c[0];
    const rawValue = r[fieldKey];
    const textValue = String(rawValue ?? '');
    const tdClass = WRAP_TABLE_FIELDS.has(fieldKey) ? 'cell-wrap' : '';
    if (fieldKey === 'ApprovalStatus') return `<td class="${tdClass}" title="${escAttr(textValue || '-')}"><span class="status-chip ${statusClass(rawValue)}">${statusLabel(rawValue)}</span></td>`;
    return `<td class="${tdClass}" title="${escAttr(textValue || '-')}">${renderCellContent(fieldKey, rawValue)}</td>`;
  }).join('')}<td>${canEdit ? `<button class="btn btn-secondary" data-edit-row="${i}">${canEditMasterCourses() ? 'עריכה' : 'שלח בקשת שינוי'}</button>` : canApprove ? `<button class="btn btn-primary" data-approve-row="${i}">${isApplyMode ? 'Apply to Master' : 'שלח לאדמין'}</button> <button class="btn btn-secondary" data-reject-row="${i}">דחה</button>` : ''}</td></tr>`).join('');
  return `<section class="table-wrap"><table><thead><tr>${cols.map((c) => `<th>${c[1]}</th>`).join('')}<th>פעולה</th></tr></thead><tbody>${body}</tbody></table></section>`;
}

const ACTIVITY_TYPE_LABELS = { course: 'קורס', after_school: 'חוג אפטרסקול', workshop: 'סדנה', tour: 'סיור', escape_room: 'חדר בריחה' };
function renderSelectOptions(options = [], selected = '') {
  const initial = '<option value="">הכל</option>';
  const body = options.map((option) => `<option value="${escAttr(option)}" ${option === selected ? 'selected' : ''}>${esc(option)}</option>`).join('');
  return `${initial}${body}`;
}
function renderActivityTypeOptions(options = [], selected = '') {
  return '<option value="">הכל</option>' + options.map((v) => `<option value="${escAttr(v)}" ${v === selected ? 'selected' : ''}>${esc(ACTIVITY_TYPE_LABELS[v] || v)}</option>`).join('');
}

function renderActivityTypeSummary(courses) {
  if (!Array.isArray(courses) || !courses.length) return '';
  const counts = {};
  courses.forEach((row) => {
    const type = String(getCourseField(row, COURSE_FIELDS.EVENT_TYPE) || '').trim().toLowerCase();
    if (type) counts[type] = (counts[type] || 0) + 1;
  });
  const items = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `<span class="activity-type-chip">${esc(ACTIVITY_TYPE_LABELS[key] || key)}<strong>${count}</strong></span>`);
  if (!items.length) return '';
  return `<div class="activity-type-summary">${items.join('')}</div>`;
}

function getUiFilterOptions() {
  const courses = getRoleScopedCourses({});
  const collect = (fieldName, mapper) => Array.from(new Set((courses || [])
    .map((row) => mapper ? mapper(row) : getCourseField(row, fieldName))
    .map((value) => String(value || '').trim())
    .filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he'));
  return {
    authority: collect(COURSE_FIELDS.AUTHORITY),
    employee: collect(COURSE_FIELDS.EMPLOYEE, (row) => resolveInstructorName(row)),
    courseManager: collect(COURSE_FIELDS.COURSE_MANAGER),
    program: collect(COURSE_FIELDS.PROGRAM, (row) => getCourseField(row, COURSE_FIELDS.PROGRAM) || getCourseField(row, COURSE_FIELDS.ACTIVITY))
  };
}

function financeRowInDisplayMonth(item, displayMonth) {
  if (!displayMonth) return true;
  const endDate = parseDateLike(item?.End || '');
  if (endDate) return formatMonthInputLocal(endDate) === displayMonth;
  const fallbacks = ['MonthEnd', 'MonthStart', 'Period'].map((k) => parseDateLike(item?.[k])).filter(Boolean);
  if (fallbacks.length) return fallbacks.some((d) => formatMonthInputLocal(d) === displayMonth);
  return true;
}

function isGefenFundingLabel(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/["׳״'\s-]/g, '');
  return normalized === 'גפן' || normalized === 'gefen';
}

function financeMoneyValue(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(/[^\d.-]/g, '');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatFinanceMoney(value) {
  return Number(value || 0).toLocaleString('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0
  });
}

function getFinanceGroupingMeta(item = {}) {
  const funding = String(item?.Funding || '').trim();
  const isGefen = isGefenFundingLabel(funding);
  if (isGefen) {
    const school = String(item?.School || '').trim() || 'ללא בית ספר';
    return {
      type: 'gefen',
      groupKey: school,
      groupTitle: school,
      groupSummary: `סך גבייה: ${formatFinanceMoney(financeMoneyValue(item?.Payment))}`
    };
  }
  const fundingLabel = hebrifyValue(funding) || funding || 'ללא מימון';
  return {
    type: 'funding',
    groupKey: String(funding).trim() || 'ללא מימון',
    groupTitle: fundingLabel,
    groupSummary: ''
  };
}

function renderFinanceMeetingsRow(item, colSpan) {
  const dates = (COURSE_DATE_FIELDS || []).map((field, idx) => {
    const raw = financeRowDateRaw(item, field);
    if (!String(raw || '').trim()) return null;
    return { num: idx + 1, date: formatDate(parseDateLike(raw)) || String(raw) };
  }).filter(Boolean);
  if (!dates.length) return `<tr><td colspan="${colSpan}" class="finance-meetings-inline"><em>אין תאריכי ביצוע ברשומה זו.</em></td></tr>`;
  const chips = dates.map(({ num, date }) =>
    `<span class="finance-meeting-chip"><span class="finance-meeting-num">${num}</span><span class="finance-meeting-date">${esc(date)}</span></span>`
  ).join('');
  return `<tr><td colspan="${colSpan}" class="finance-meetings-inline"><div class="finance-meetings-grid">${chips}</div></td></tr>`;
}

function renderFinanceTable(rows, options = {}) {
  const displayMonth = String(options.displayMonth || '').trim();
  const prevMonth = displayMonth ? addMonthsToMonthString(displayMonth, -1) : '';
  const canEdit = Boolean(options.canEdit);
  const selectedMeetingsRowId = String(options.selectedMeetingsRowId || '');
  const allRows = sortFinanceRowsByStatus(Array.isArray(rows) ? rows : [])
    .filter((item) => {
      const courseName = String(item?.Course || item?.Program || item?.EventType || item?.CourseID || '').trim();
      const hasDates = String(item?.start_date || item?.Date1 || item?.MonthEnd || item?.End || item?.end_date || '').trim();
      return Boolean(courseName && hasDates);
    });
  const prevItems = prevMonth ? allRows.filter((item) => financeRowInDisplayMonth(item, prevMonth)) : [];
  const currItems = displayMonth ? allRows.filter((item) => financeRowInDisplayMonth(item, displayMonth)) : allRows;
  if (!prevItems.length && !currItems.length) return '<section class="panel-empty">לא נמצאו רשומות כספים לחודש שנבחר.</section>';
  function statusMini(items) {
    const counts = {};
    items.forEach((item) => {
      const b = getFinanceStatusBucket(String(item?.FinanceStatus || 'open')).key;
      counts[b] = (counts[b] || 0) + 1;
    });
    const labels = { open: 'פתוח', completed: 'סגור' };
    return Object.entries(counts).map(([k, v]) => `<span class="finance-status-mini finance-${escAttr(k)}">${v} ${esc(labels[k] || k)}</span>`).join('');
  }
  const COL_COUNT = 9;
  function renderRow(item) {
    const financeRowId = String(item?.FinanceRowID || '');
    const status = String(item?.FinanceStatus || 'open');
    const sourceSheet = TAASIYEDA_CONFIG.sheets.DATA_MASTER;
    const bucket = getFinanceStatusBucket(status);
    const schoolLine = String(item?.School || item?.SchoolsList || '').split(/[,\n|]+/).map((s) => s.trim()).filter(Boolean)[0] || '-';
    const programLine = String(item?.Course || item?.Program || item?.CourseID || item?.ProgramsList || 'פריט כספי').split(/[,\n|]+/).map((s) => s.trim()).filter(Boolean)[0] || 'פריט כספי';
    const authLine = String(item?.Authority || '').trim() || '-';
    const notes = String(item?.FinanceNotes || '').trim();
    const fundingLabel = hebrifyValue(item?.Funding) || String(item?.Funding || '-');
    const managerLine = String(item?.CourseManager || '-').split(/[,\n|]+/).map((s) => s.trim()).filter(Boolean)[0] || '-';
    const paymentRaw = item?.Payment;
    const paymentLabel = paymentRaw != null && paymentRaw !== '' ? `₪${Number(paymentRaw).toLocaleString('he-IL')}` : '-';
    const isOpen = selectedMeetingsRowId === financeRowId;
    return `<tr class="finance-tr finance-tr-${escAttr(bucket.key)}${isOpen ? ' finance-tr--open' : ''}">
      <td><span class="cell-ellipsis" title="${escAttr(programLine)}">${esc(programLine)}</span></td>
      <td><span class="cell-ellipsis" title="${escAttr(schoolLine)}">${esc(schoolLine)}</span></td>
      <td><span class="cell-ellipsis" title="${escAttr(authLine)}">${esc(authLine)}</span></td>
      <td><span class="cell-ellipsis" title="${escAttr(managerLine)}">${esc(managerLine)}</span></td>
      <td class="finance-payment-cell">${paymentLabel !== '-' ? `<strong>${esc(paymentLabel)}</strong>` : '<span style="color:var(--text-muted)">-</span>'}</td>
      <td style="white-space:nowrap" title="${escAttr(fundingLabel)}">${esc(fundingLabel)}</td>
      <td>
        ${canEdit
          ? `<select class="finance-inline-select" data-finance-status="1" data-finance-row-id="${escAttr(financeRowId)}" data-finance-sheet="${sourceSheet}">
              ${renderStatusOption('open', status)}
              ${renderStatusOption('closed', status)}
            </select>`
          : `<span class="status-chip ${statusClass(status)}">${esc(getFinanceStatusLabel(status))}</span>`}
      </td>
      <td class="finance-notes-cell finance-notes-edit-cell">
        <div class="finance-note-row">
          <input class="finance-note-input" data-finance-note-input="${escAttr(financeRowId)}" type="text" placeholder="הוסף הערה…" value="${escAttr(notes)}" />
          <button class="btn btn-xs btn-secondary finance-note-save-btn" type="button" data-finance-note-save="1" data-finance-row-id="${escAttr(financeRowId)}" title="שמור הערה">💾</button>
        </div>
      </td>
      <td style="white-space:nowrap;display:flex;gap:4px;align-items:center">
        <button class="btn btn-xs${isOpen ? ' btn-primary' : ' btn-secondary'}" data-finance-meetings="${escAttr(financeRowId)}">תאריכים ▾</button>
        <button class="btn btn-xs btn-secondary" title="ייצוא תאריכים לאקסל" data-finance-export-row="${escAttr(financeRowId)}">📥</button>
      </td>
    </tr>
    ${isOpen ? renderFinanceMeetingsRow(item, COL_COUNT) : ''}`;
  }
  function renderSection(items, label) {
    if (!items.length) return `<div class="finance-month-section"><h4 class="finance-month-section-label">${esc(label)}</h4><p class="panel-empty" style="padding:8px 0">אין רשומות לחודש זה</p></div>`;
    const grouped = items.reduce((acc, item) => {
      const groupMeta = getFinanceGroupingMeta(item);
      const groupKey = groupMeta.groupKey;
      if (!acc[groupKey]) acc[groupKey] = { ...groupMeta, items: [] };
      acc[groupKey].items.push(item);
      return acc;
    }, {});
    return `<div class="finance-month-section">
      <div class="finance-month-section-head">
        <h4 class="finance-month-section-label">${esc(label)}</h4>
        <div class="finance-status-mini-row">${statusMini(items)}</div>
      </div>
      ${Object.values(grouped).map((group) => {
        const paymentTotal = group.items.reduce((sum, item) => sum + financeMoneyValue(item?.Payment), 0);
        const activitiesCount = group.items.length;
        const summaryLabel = group.type === 'gefen'
          ? `סך גבייה: ${formatFinanceMoney(paymentTotal)}`
          : `${activitiesCount} פעילויות · סך גבייה: ${formatFinanceMoney(paymentTotal)}`;
        return `<div class="finance-group-block">
        <div class="finance-group-label">${esc(group.groupTitle)} <span class="finance-status-mini finance-open">${esc(summaryLabel)}</span></div>
        <div class="table-wrap finance-table-wrap">
          <table class="finance-table-styled">
            <thead><tr>
              <th>קורס / פעילות</th><th>בית ספר</th><th>רשות</th><th>מנהל קורס</th>
              <th>גבייה</th><th>מימון</th><th>סטטוס</th><th>הערות</th><th>פעולות</th>
            </tr></thead>
            <tbody>${group.items.map(renderRow).join('')}</tbody>
          </table>
        </div>
      </div>`;
      }).join('')}
    </div>`;
  }
  function monthLabel(monthStr) {
    const d = parseMonthValue(monthStr);
    return d ? d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }) : monthStr;
  }
  return renderSection(prevItems, monthLabel(prevMonth)) + renderSection(currItems, monthLabel(displayMonth));
}

function renderFinanceCards(rows, options = {}) {
  const displayMonth = String(options.displayMonth || '').trim();
  const prevMonth = displayMonth ? addMonthsToMonthString(displayMonth, -1) : '';
  const canEdit = Boolean(options.canEdit);
  const allRows = sortFinanceRowsByStatus(Array.isArray(rows) ? rows : [])
    .filter((item) => {
      const courseName = String(item?.Course || item?.Program || item?.EventType || item?.CourseID || '').trim();
      const hasDates = String(item?.start_date || item?.Date1 || item?.MonthEnd || item?.End || item?.end_date || '').trim();
      return Boolean(courseName && hasDates);
    });
  const prevItems = prevMonth ? allRows.filter((item) => financeRowInDisplayMonth(item, prevMonth)) : [];
  const currItems = displayMonth ? allRows.filter((item) => financeRowInDisplayMonth(item, displayMonth)) : allRows;
  if (!prevItems.length && !currItems.length) return '<section class="panel-empty">לא נמצאו רשומות כספים לחודש שנבחר.</section>';
  function renderCard(item) {
    const financeRowId = String(item?.FinanceRowID || '');
    const status = String(item?.FinanceStatus || 'open');
    const sourceSheet = TAASIYEDA_CONFIG.sheets.DATA_MASTER;
    const statusBucket = getFinanceStatusBucket(status);
    const schoolLine = String(item?.School || item?.SchoolsList || '').split(/[,\n|]+/).map((s) => s.trim()).filter(Boolean)[0] || '-';
    const programLine = String(item?.Course || item?.Program || item?.EventType || item?.CourseID || item?.ProgramsList || hebrifyValue(item?.PayerType) || 'פריט כספי').split(/[,\n|]+/).map((s) => s.trim()).filter(Boolean)[0] || 'פריט כספי';
    const authLine = String(item?.Authority || '').trim() || String(item?.AuthoritiesList || '').split(/[,\n|]+/).map((s) => s.trim()).filter(Boolean)[0] || '-';
    const datesLine = Array.from({ length: 35 }, (_, i) => item?.[`Date${i + 1}`]).map((v) => formatDate(parseDateLike(v)) || '').filter(Boolean).join(', ');
    const notes = String(item?.FinanceNotes || '').trim();
    const fundingHeb = hebrifyValue(item?.Funding);
    const payerHeb = hebrifyValue(item?.Payer);
    return `<article class="management-card finance-card finance-${escAttr(statusBucket.key)}">
      <header class="card-head">
        <div style="min-width:0;flex:1">
          <h3>${esc(programLine)}</h3>
          <p class="card-subtitle">${esc(schoolLine)} · ${esc(authLine)}</p>
        </div>
        <span class="status-chip ${statusClass(status)}">${esc(getFinanceStatusLabel(status))}</span>
      </header>
      ${notes ? `<div class="finance-notes-preview">${esc(notes)}</div>` : ''}
      <details class="finance-card-details">
        <summary class="finance-card-summary">פרטים ועדכון ▾</summary>
        <div class="card-meta">
          <span><strong>מנהל קורס</strong>${esc(String(item?.CourseManager || '-'))}</span>
          ${fundingHeb ? `<span><strong>גורם מימון</strong>${esc(fundingHeb)}</span>` : ''}
          ${payerHeb ? `<span><strong>גורם משלם</strong>${esc(payerHeb)}</span>` : ''}
          ${item?.Payment ? `<span><strong>עלות / תשלום</strong>${esc(String(item.Payment))}</span>` : ''}
          ${datesLine ? `<span style="grid-column:1/-1"><strong>תאריכים</strong>${esc(datesLine)}</span>` : ''}
        </div>
        <footer class="card-actions">
          <button class="btn btn-secondary" data-finance-open="${escAttr(financeRowId)}">תאריכי ביצוע</button>
          ${canEdit ? `<label class="finance-status-edit">סטטוס
            <select data-finance-status="1" data-finance-row-id="${escAttr(financeRowId)}" data-finance-sheet="${sourceSheet}">
              ${renderStatusOption('open', status)}
              ${renderStatusOption('closed', status)}
            </select>
          </label>` : ''}
        </footer>
        ${canEdit ? `<div class="finance-note-editor">
          <input data-finance-note-input="${escAttr(financeRowId)}" placeholder="הערות" value="${escAttr(item?.FinanceNotes || '')}" />
          <button class="btn btn-secondary finance-save-note-btn" type="button" data-finance-note-save="1" data-finance-row-id="${escAttr(financeRowId)}" title="שמור הערה">💾</button>
        </div>` : ''}
      </details>
    </article>`;
  }
  function monthLabel(monthStr) {
    const d = parseMonthValue(monthStr);
    return d ? d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }) : monthStr;
  }
  function statusMini(items) {
    const counts = {};
    items.forEach((item) => { const b = getFinanceStatusBucket(String(item?.FinanceStatus || 'open')).key; counts[b] = (counts[b] || 0) + 1; });
    const labels = { open: 'פתוח', completed: 'סגור' };
    return Object.entries(counts).map(([k, v]) => `<span class="finance-status-mini finance-${escAttr(k)}">${v} ${esc(labels[k] || k)}</span>`).join('');
  }
  function renderSection(items, label) {
    if (!items.length) return `<div class="finance-month-section"><div class="finance-month-section-head"><h4 class="finance-month-section-label">${esc(label)}</h4></div><p class="panel-empty" style="padding:12px 0">אין רשומות לחודש זה</p></div>`;
    return `<div class="finance-month-section"><div class="finance-month-section-head"><h4 class="finance-month-section-label">${esc(label)}</h4><div class="finance-status-mini-row">${statusMini(items)}</div></div><section class="cards-grid finance-grid">${items.map(renderCard).join('')}</section></div>`;
  }
  return renderSection(prevItems, monthLabel(prevMonth)) + renderSection(currItems, monthLabel(displayMonth));
}

function sortFinanceRowsByStatus(rows = []) {
  const order = { open: 0, completed: 1 };
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
  const labels = { open: 'פתוח', closed: 'סגור' };
  return `<option value="${escAttr(value)}" ${value === selected ? 'selected' : ''}>${labels[value] || esc(value)}</option>`;
}

function renderFinanceDetailsPanel(item) {
  if (!item) return '';
  const ids = String(item.CourseIDsList || item.CourseID || '').split(/[,\n|]+/).map((s) => s.trim()).filter(Boolean);
  const courses = getStoreSnapshot().courses || [];
  const blocks = ids.map((id) => {
    const row = courses.find((c) => String(c[COURSE_FIELDS.COURSE_ID] || '') === id);
    if (!row) return `<div><strong>${esc(id)}</strong><p class="details-text">לא נמצא קורס במערכת</p></div>`;
    const name = getBusinessCourseName(row);
    const dates = getScheduleDates(row).map((d) => formatDate(d)).filter(Boolean);
    return `<div><span>קורס</span><strong class="details-text">${esc(name)}</strong><p class="details-text">${esc(dates.length ? dates.join(', ') : 'אין תאריכי מפגש ברשומה')}</p></div>`;
  });
  const body = blocks.length ? blocks.join('') : '<p class="details-text">אין רשימת קורסים לשורה זו.</p>';
  return `<section class="details-panel">
    <header><h3>תאריכי ביצוע לפי קורס</h3></header>
    <div class="details-grid">${body}</div>
  </section>`;
}

function renderInfoRow(label, value) {
  if (!String(value || '').trim()) return '';
  return `<span><strong>${esc(label)}:</strong> ${esc(value)}</span>`;
}

function getActivityColor(row = {}) {
  const activityCode = String(
    getCourseField(row, COURSE_FIELDS.PROGRAM_CODE)
    || row?.activity_no
    || row?.ProgramCode
    || ''
  ).trim();
  return ACTIVITY_COLORS_BY_CODE[activityCode] || '';
}

function renderExpandableCard({ summary, details, open = false, classes = 'management-card expandable-card', activityRow = null }) {
  const accent = activityRow ? getActivityColor(activityRow) : '';
  const styleAttr = accent ? ` style="border-right:4px solid ${escAttr(accent)}"` : '';
  return `<details class="${classes}" ${open ? 'open' : ''}${styleAttr}><summary class="card-summary">${summary}</summary><div class="card-details">${details}</div></details>`;
}

function buildCourseHierarchyDetails(row = {}) {
  const meetingStats = getMeetingStatsFromDates(row);
  return {
    instructor: resolveInstructorName(row),
    programActivity: getCourseField(row, COURSE_FIELDS.PROGRAM) || getCourseField(row, COURSE_FIELDS.ACTIVITY),
    school: getCourseField(row, COURSE_FIELDS.SCHOOL),
    authority: getCourseField(row, COURSE_FIELDS.AUTHORITY),
    meetingsTotal: meetingStats.total,
    meetingsCompleted: meetingStats.completedCount,
    meetingsRemaining: meetingStats.remainingCount,
    nextMeetingDate: meetingStats.nextMeetingDate ? formatDate(meetingStats.nextMeetingDate) : '',
    isCompleted: meetingStats.isCompleted,
    endDate: formatDate(parseDateLike(getCourseField(row, COURSE_FIELDS.END))) || '',
    dayName: getCourseField(row, COURSE_FIELDS.DAY_NAME || 'DayName'),
    timeLabel: `${formatTimeValue(getCourseField(row, COURSE_FIELDS.START_TIME))}-${formatTimeValue(getCourseField(row, COURSE_FIELDS.END_TIME))}`
  };
}

function renderCourseHierarchyStrip(row = {}) {
  const hierarchy = buildCourseHierarchyDetails(row);
  const segments = [
    hierarchy.meetingsTotal ? `<span><strong>מפגשים שבוצעו:</strong> ${esc(String(hierarchy.meetingsCompleted))} / ${esc(String(hierarchy.meetingsTotal))}</span>` : '',
    (!hierarchy.isCompleted && hierarchy.meetingsRemaining > 0) ? `<span><strong>מפגשים שנותרו:</strong> ${esc(String(hierarchy.meetingsRemaining))}</span>` : '',
    (!hierarchy.isCompleted && hierarchy.nextMeetingDate) ? `<span><strong>מפגש קרוב:</strong> ${esc(hierarchy.nextMeetingDate)}</span>` : '',
    hierarchy.endDate && `<span><strong>סיום:</strong> ${esc(hierarchy.endDate)}</span>`
  ].filter(Boolean);
  return `<div class="course-hierarchy-strip">${segments.join('')}</div>`;
}

function getInstructorDayActivity(row = {}) {
  const instructorName = resolveInstructorName(row);
  const scheduleDates = getScheduleDates(row).sort((a, b) => a - b);
  const referenceDate = scheduleDates.find((date) => date >= startOfDay(new Date())) || scheduleDates[0] || null;
  if (!instructorName || !referenceDate) {
    return { instructorName, referenceDate: null, sameDayCourses: [] };
  }
  const allCourses = viewState.courses.data || [];
  const sameDayCourses = allCourses.filter((course) => {
    if (resolveInstructorName(course) !== instructorName) return false;
    return getScheduleDates(course).some((date) => formatIsoDateLocal(date) === formatIsoDateLocal(referenceDate));
  });
  return { instructorName, referenceDate, sameDayCourses };
}

function renderInstructorDayPanel(row = {}, courseId = '') {
  const isOpen = viewState.courses.selectedInstructorDayCourseId === courseId;
  const activity = getInstructorDayActivity(row);
  if (!isOpen) return '';
  const header = activity.referenceDate
    ? `פעילות המדריך בתאריך ${formatDate(activity.referenceDate)}`
    : 'פעילות המדריך באותו יום';
  const additional = activity.sameDayCourses.filter((course) => String(course?.[COURSE_FIELDS.COURSE_ID] || '') !== String(courseId));
  const list = additional.map((course) => `<li>${esc(getBusinessCourseName(course))} · ${esc(getCourseField(course, COURSE_FIELDS.SCHOOL) || '-')}</li>`).join('');
  return `<div class="instructor-day-panel">
    <strong>${esc(header)}</strong>
    ${activity.referenceDate ? '' : '<p>אין נתוני תאריך זמינים לקורס זה.</p>'}
    ${additional.length ? `<ul>${list}</ul>` : '<p>אין למדריך פעילויות נוספות באותו יום.</p>'}
  </div>`;
}

function renderCourseCards(rows, options = {}) {
  if (!rows.length) return '<section class="panel-empty">לא נמצאו קורסים לפי הסינון.</section>';
  const managerLabel = options.showInstructorManager ? 'מנהל מדריכים' : 'מנהל קורס';
  const managerValue = (row) => options.showInstructorManager ? row.InstructorManager : row.CourseManager;
  const canEdit = Boolean(options.canEdit);
  return `<section class="cards-grid course-cards-grid ${options.compact ? 'cards-grid-compact' : ''}">${rows.map((row) => {
    const issueText = summarizeIssue(row);
    const progress = courseProgress(row);
    const hierarchy = buildCourseHierarchyDetails(row);
    const issueFlag = hasException(row) || isMissingReport(row) || !hasInstructor(row);
    const courseId = String(row[COURSE_FIELDS.COURSE_ID] || '');
    const summary = `<header class="card-head"><div><h3>${esc(hierarchy.programActivity || 'שם קורס לא זמין')}</h3><p class="card-subtitle">${esc(hierarchy.school || '-')} · ${esc(hierarchy.authority || '-')}</p></div><div class="card-status">${renderIssueBadge(row)}</div></header>`;
    const instructorDayPanel = renderInstructorDayPanel(row, courseId);
    const details = `${renderCourseHierarchyStrip(row)}
      <div class="course-core-grid">
        <div class="course-core-col">
          <span><strong>${esc(managerLabel)}:</strong> ${esc(managerValue(row) || '-')}</span>
          <span><strong>מדריך:</strong> <button type="button" class="instructor-inline-trigger" data-instructor-day-toggle="${escAttr(courseId)}">${esc(hierarchy.instructor || 'לא משויך')}</button></span>
          ${instructorDayPanel}
        </div>
        <div class="course-core-col">
          ${renderInfoRow('יום', hierarchy.dayName)}
          ${renderInfoRow('שעות', hierarchy.timeLabel)}
        </div>
        <div class="course-core-col">
          ${renderInfoRow('רשות', hierarchy.authority)}
          ${renderInfoRow('בית ספר', hierarchy.school)}
          ${renderInfoRow('מפגשים', hierarchy.meetingsTotal ? `${hierarchy.meetingsTotal}` : (String(getCourseField(row, COURSE_FIELDS.PLANNED_MEETINGS) || '-')))}
        </div>
      </div>
      ${issueText ? `<div class="card-issue ${issueFlag ? 'has-issue' : ''}">${esc(issueText)}</div>` : ''}
      <footer class="card-actions">
        <button class="btn btn-secondary" data-open-course="${escAttr(row[COURSE_FIELDS.COURSE_ID] || '')}">פרטים</button>
        <button class="btn btn-primary" data-edit-row="${escAttr(row[COURSE_FIELDS.COURSE_ID] || '')}">${canEdit ? 'עריכה' : 'שלח בקשת שינוי'}</button>
      </footer>`;
    return renderExpandableCard({ summary, details, classes: `management-card expandable-card ${options.compact ? 'course-card-external' : ''}`.trim(), activityRow: row });
  }).join('')}</section>`;
}

function renderCourseInlineDetails(row) {
  const planned = Math.max(0, Number(row[COURSE_FIELDS.PLANNED_MEETINGS] || 0));
  const dateDates = (COURSE_DATE_FIELDS || [])
    .map((field) => parseDateLike(courseMeetingDateRaw(row, field)))
    .filter(Boolean);
  const now = startOfDay(new Date());
  const timeLabel = `${formatTimeValue(getCourseField(row, COURSE_FIELDS.START_TIME))}–${formatTimeValue(getCourseField(row, COURSE_FIELDS.END_TIME))}`;
  const notes = String(getCourseField(row, COURSE_FIELDS.NOTES) || '').trim();
  const completedCount = dateDates.filter((d) => d && endOfDay(d) < now).length;
  const totalSlots = Math.max(planned, dateDates.filter(Boolean).length);
  const chips = Array.from({ length: totalSlots }, (_, i) => {
    const d = dateDates[i];
    const dateStr = d ? formatDate(d) : 'טרם נקבע';
    const isPast = d ? endOfDay(d) < now : false;
    const cls = !d ? 'ci-chip--pending' : isPast ? 'ci-chip--done' : 'ci-chip--future';
    return `<span class="ci-chip ${cls}"><span class="ci-chip-num">${i + 1}</span><span class="ci-chip-date">${esc(dateStr)}</span></span>`;
  }).join('');
  return `<tr class="course-inline-details-row"><td colspan="11" class="course-inline-details-cell">
    <div class="course-inline-details">
      <div class="ci-meta">
        ${timeLabel && timeLabel !== '–' ? `<span><strong>שעות</strong>${esc(timeLabel)}</span>` : ''}
        <span><strong>בוצעו</strong>${completedCount} מתוך ${totalSlots || '-'}</span>
        ${notes ? `<span style="grid-column:1/-1"><strong>הערות</strong>${esc(notes)}</span>` : ''}
      </div>
      <div class="ci-meetings">${chips || '<em>אין תאריכים</em>'}</div>
    </div>
  </td></tr>`;
}

function renderCourseTable(rows, options = {}) {
  if (!rows.length) return '<section class="panel-empty">לא נמצאו קורסים לפי הסינון.</section>';
  const canEdit = Boolean(options.canEdit);
  const openId = String(options.openDetailsId || '');
  const COL_COUNT = 10;
  const body = rows.map((row, idx) => {
    const h = buildCourseHierarchyDetails(row);
    const courseId = String(row[COURSE_FIELDS.COURSE_ID] || '');
    const isOpen = openId === courseId;
    const statusBadge = renderIssueBadge(row);
    const statusCell = h.isCompleted
      ? '<span class="status-chip status-closed">הסתיים</span>'
      : (statusBadge || '<span class="status-chip status-active">פעיל</span>');
    const rowHtml = `<tr class="course-tr${isOpen ? ' course-tr--open' : ''}">
      <td class="ct-num">${idx + 1}</td>
      <td><span class="cell-ellipsis" title="${escAttr(h.programActivity || '')}">${esc(h.programActivity || 'לא זמין')}</span></td>
      <td><span class="cell-ellipsis" title="${escAttr(h.school || '')}">${esc(h.school || '-')}</span></td>
      <td><span class="cell-ellipsis" title="${escAttr(h.instructor || '')}">${esc(h.instructor || 'לא משויך')}</span></td>
      <td><span class="cell-ellipsis" title="${escAttr(row[COURSE_FIELDS.COURSE_MANAGER] || '')}">${esc(row[COURSE_FIELDS.COURSE_MANAGER] || '-')}</span></td>
      <td style="white-space:nowrap">${esc(h.dayName || '-')}</td>
      <td style="white-space:nowrap">${esc(h.timeLabel || '-')}</td>
      <td style="text-align:center">${esc(String(row[COURSE_FIELDS.PLANNED_MEETINGS] || '-'))}</td>
      <td style="white-space:nowrap">${esc(h.endDate || '-')}</td>
      <td>${statusCell}</td>
      <td style="white-space:nowrap;display:flex;gap:4px">
        <button class="btn btn-xs${isOpen ? ' btn-primary' : ' btn-secondary'}" data-course-inline="${escAttr(courseId)}">פרטים${isOpen ? ' ▲' : ' ▼'}</button>
        <button class="btn btn-primary btn-xs" data-edit-row="${escAttr(courseId)}">${canEdit ? 'עריכה' : 'שינוי'}</button>
      </td>
    </tr>`;
    return rowHtml + (isOpen ? renderCourseInlineDetails(row) : '');
  }).join('');
  return `<div class="table-wrap courses-table-wrap activities-table-wrap">
    <table class="courses-table-styled">
      <thead><tr>
        <th class="ct-num">#</th>
        <th>שם פעילות</th>
        <th>בית ספר</th>
        <th>מדריך</th>
        <th>מנהל קורס</th>
        <th>יום</th>
        <th>שעות</th>
        <th>מ"מ</th>
        <th>סיום</th>
        <th>מצב</th>
        <th>פעולות</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderInstructorCards(rows, selectedInstructor) {
  if (!rows.length) return '<section class="panel-empty">אין נתוני מדריכים זמינים.</section>';
  return `<section class="cards-grid instructor-grid">${rows.map((row) => {
    const summary = `<header class="card-head"><h3>${esc(row.instructor)}</h3>${renderInstructorState(row)}</header><div class="card-summary-minimal">${esc(row.coursesCount)} קורסים</div>`;
    const details = `<div class="card-meta"><span>🏛️ רשויות: ${esc(row.authorities.join(', ') || '-')}</span><span>🏫 בתי ספר: ${esc(row.schools.join(', ') || '-')}</span>${row.hasGap ? '<span>פער מדריך/נתונים</span>' : ''}</div><footer class="card-actions"><button class="btn btn-secondary" data-instructor-details="${escAttr(row.instructor)}">פרטי מדריך</button></footer>`;
    return renderExpandableCard({ summary, details, classes: `management-card instructor-card expandable-card ${selectedInstructor === row.instructor ? 'active' : ''}`, activityRow: row });
  }).join('')}</section>`;
}

function renderExceptionCards(rows) {
  if (!rows.length) return '<section class="panel-empty">לא נמצאו חריגות בהתאם לסינון.</section>';
  return `<section class="cards-grid">${rows.map((row) => {
    const summary = `<div class="card-head"><h3>${esc(row.Program || 'שם קורס לא זמין')}</h3><span class="status-chip status-declined">פתוח</span></div><div class="card-summary-minimal">${esc(row.School || '-')} · ${esc(row.Authority || '-')}</div>`;
    const details = `<div class="card-meta"><span>${esc((row.MissingTypes || []).join(' / ') || '-')}</span><span>מדריך: ${esc(row.Employee || 'לא משויך')}</span><span>מנהל קורס: ${esc(row.CourseManager || '-')}</span></div><div class="card-actions"><button class="btn btn-secondary" data-open-course="${escAttr(row.CourseID || '')}">פרטי קורס</button><button class="btn btn-primary" data-edit-row="${escAttr(row.CourseID || '')}">שלח בקשת שינוי</button></div>`;
    return renderExpandableCard({ summary, details, classes: 'management-card exception-card expandable-card', activityRow: row });
  }).join('')}</section>`;
}

function dashboardOperationalTable(rows) {
  if (!rows.length) return '<div class="panel-empty">אין קורסים בטווח הזמן שנבחר.</div>';
  const body = rows.slice(0, 8).map((row) => `<tr>
    <td>${esc(row.EventType || row.Program || '')}</td>
    <td>${esc(resolveInstructorName(row) || 'לא משויך')}</td>
    <td>${esc(joinLocation(row))}</td>
    <td>${esc(formatSchedule(row))}</td>
    <td>${esc(row.WorkflowStatus || '')}</td>
    <td>${renderIssueBadge(row)}</td>
  </tr>`).join('');
  return `<div class="table-wrap compact-table"><table><thead><tr><th>קורס</th><th>מי מלמד</th><th>איפה</th><th>מתי</th><th>סטטוס</th><th>מצב טיפול</th></tr></thead><tbody>${body}</tbody></table></div>`;
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
  return `<div class="table-wrap compact-table"><table><thead><tr><th>סוג משימה</th><th>קורס</th><th>מדריך</th><th>מיקום</th><th>פעולה</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function courseColumns(isInstructorView) {
  if (isInstructorView) {
    return [['Employee', 'מדריך'], ['InstructorManager', 'מנהל מדריכים'], ['EventType', 'פעילות'], ['Program', 'קורס'], ['Authority', 'רשות'], ['School', 'בית ספר'], ['ClassGroup', 'קבוצה'], ['PlannedMeetings', 'מתוכנן'], ['DatesListedCount', 'בוצע']];
  }
  return [['EventType', 'קורס / סדנה'], ['Program', 'תוכנית'], ['Employee', 'מי מלמד'], ['CourseManager', 'מנהל קורס'], ['InstructorManager', 'מנהל מדריכים'], ['Authority', 'רשות'], ['School', 'בית ספר'], ['DayName', 'יום'], ['StartTime', 'שעת התחלה'], ['EndTime', 'שעת סיום'], ['End', 'סיום מחזור'], ['PlannedMeetings', 'מפגשים מתוכננים'], ['DatesListedCount', 'מפגשים שבוצעו'], ['Notes', 'הערות']];
}

function onKpiClick(filterName, contextText = '') {
  if (filterName === 'open_requests') {
    setRoute('my-requests');
    return;
  }
  const context = {};
  String(contextText || '').split('|').forEach((part) => {
    const [key, ...rest] = part.split(':');
    if (!key || !rest.length) return;
    context[key.trim()] = rest.join(':').trim();
  });
  if (filterName === 'ending_this_month') {
    viewState.endDates.filters = {
      authority: '',
      employee: '',
      courseManager: context.manager || '',
      month: formatMonthInputLocal(new Date())
    };
    setRoute('end-dates');
    return;
  }
  if ((context.subtitle || '').includes('מדריכים')) {
    viewState.instructors.filters = {
      authority: '',
      courseManager: context.manager || '',
      program: ''
    };
    setRoute('instructors');
    return;
  }
  viewState.courses.quickFilter = filterName;
  viewState.courses.filters = {
    authority: '',
    school: '',
    courseManager: context.manager || '',
    employee: '',
    courseMonth: '',
    activityType: ''
  };
  viewState.uiContext.coursesSubtitle = context.subtitle || '';
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
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  if (key === 'all_courses') return list;
  if (key === 'workshops_only') {
    return list.filter((row) => String(getCourseField(row, COURSE_FIELDS.ACTIVITY) || '').includes('סדנה'));
  }
  if (key === 'tours_only') {
    return list.filter((row) => String(getCourseField(row, COURSE_FIELDS.ACTIVITY) || '').includes('סיור'));
  }
  if (key === 'ending_this_month') {
    return list.filter((row) => {
      const endDate = firstDate(row, [COURSE_FIELDS.END_DATE, COURSE_FIELDS.END]);
      return isDateInRange(endDate, currentMonthStart, currentMonthEnd);
    });
  }
  if (key === 'active_this_month') {
    return list.filter((row) => getScheduleDates(row).some((d) => isDateInRange(d, currentMonthStart, currentMonthEnd)));
  }
  if (key === 'requires_treatment') return list.filter((row) => getExceptionsPageIssues(row).length > 0);
  if (key === 'today') return list.filter((row) => getScheduleDates(row).some((d) => isDateInRange(d, now, now)));
  if (key === 'this_week') return list.filter((row) => getScheduleDates(row).some((d) => isDateInRange(d, now, weekEnd)));
  if (key === 'this_month') return list.filter((row) => getScheduleDates(row).some((d) => isDateInRange(d, startOfDay(now), monthEnd)));
  if (key === 'active_now') return list.filter((row) => isActiveCourse(row, now));
  if (key === 'active_courses') return list.filter((row) => isActiveCourse(row, now));
  if (key === 'active_instructors') return list.filter((row) => isActiveCourse(row, now) && hasInstructor(row));
  if (key === 'needs_review') return list.filter((row) => hasOperationalIssue(row));
  if (key === 'missing_report') return list.filter((row) => isMissingReport(row));
  if (key === 'missing_data') return list.filter((row) => isMissingReport(row) || !hasInstructor(row));
  if (key === 'ending_soon') return list.filter((row) => isDateInRange(firstDate(row, [COURSE_FIELDS.END_DATE, COURSE_FIELDS.END]), now, plusSeven));
  if (key === 'exceptions') return list.filter((row) => hasException(row));
  if (key === 'open_requests') return list.filter((row) => hasValue(row, ['ChangeRequest']));
  if (key === 'change_request') return list.filter((row) => hasValue(row, ['ChangeRequest']));
  if (key === 'unassigned_instructor') return list.filter((row) => !hasInstructor(row));
  if (key === 'instructor_gap') return list.filter((row) => hasInstructorGap(row));
  if (key === 'pending_eden' || key === 'pending_final' || key === 'approved_final') return [];
  return list;
}

function getRoleScopedCourses(filters = {}) {
  const sourceCourses = (isManager() && !isInstructor()) ? (getStoreSnapshot().courses || []) : getCoursesForUser(userState, filters);
  const onlyCourses = sourceCourses.filter(isCourseActivity);
  if (isManager() && !isInstructor()) {
    return applyCoursesFiltersByUiScope(onlyCourses, filters);
  }
  return applyCoursesFiltersByUiScope(onlyCourses, filters);
}
function isCourseActivity(row = {}) {
  const text = String(getCourseField(row, COURSE_FIELDS.ACTIVITY) || getCourseField(row, COURSE_FIELDS.EVENT_TYPE) || '').trim();
  if (!text) return true;
  return !text.includes('סדנה');
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

function isPostponedCourse(row) {
  return parseDelayInfo(getCourseField(row, COURSE_FIELDS.NOTES)).isPostponed;
}

/** תאריך התחלה לעמוד חריגות: start_date (מפגש ראשון; ראה DATE_FIELDS). */
function hasCourseStartDateForExceptions(row) {
  const startField = COURSE_DATE_FIELDS[0];
  return Boolean(startField && parseDateLike(courseMeetingDateRaw(row, startField)));
}

function isCourseEndInJune2026(row) {
  const end = firstDate(row, [COURSE_FIELDS.END_DATE, COURSE_FIELDS.END]);
  if (!end) return false;
  return end.getFullYear() === 2026 && end.getMonth() === 5;
}

/** כל סיבות ההצגה בעמוד חריגות לפי הדרישה העסקית */
function getExceptionsPageIssues(row) {
  const issues = [];
  if (!hasInstructor(row)) issues.push('ללא מדריך');
  if (!hasHours(row)) issues.push('ללא שעות');
  if (!isPostponedCourse(row) && !hasCourseStartDateForExceptions(row)) issues.push(EXCEPTION_MISSING_START_DATE);
  if (isCourseEndInJune2026(row)) issues.push('סיום ביוני 2026');
  return issues;
}

function firstDate(row, names) {
  for (const name of names) {
    const parsed = parseDateLike(row?.[name]);
    if (parsed) return parsed;
  }
  return null;
}

function isCourseShownOnCoursesScreen(row) {
  const startOfCurrentMonth = startOfDay(new Date());
  startOfCurrentMonth.setDate(1);
  const end = firstDate(row, [COURSE_FIELDS.END_DATE, COURSE_FIELDS.END]);
  if (end && end < startOfCurrentMonth) return false;
  return true;
}

function getScheduleDates(row) {
  const courseId = String(getCourseField(row, COURSE_FIELDS.COURSE_ID) || row?.CourseID || '').trim();
  const cachedMeetings = courseId ? viewState.courses.meetingsByCourseId?.[courseId] : null;
  if (Array.isArray(cachedMeetings) && cachedMeetings.length) {
    return cachedMeetings
      .map((meeting) => parseDateLike(meeting?.MeetingDate || meeting?.Date))
      .filter(Boolean)
      .sort((a, b) => a - b);
  }
  const dates = [];
  COURSE_DATE_FIELDS.forEach((fieldName) => {
    const parsed = parseDateLike(courseMeetingDateRaw(row, fieldName));
    if (parsed) dates.push(parsed);
  });
  const fallback = firstDate(row, COURSE_DATE_RANGE_FIELDS);
  if (!dates.length && fallback) dates.push(fallback);
  return dates;
}

function isCourseCompleted(row = {}) {
  const statusText = String(
    getCourseField(row, COURSE_FIELDS.STATUS)
    || getCourseField(row, COURSE_FIELDS.EVENT_TYPE)
    || row?.WorkflowStatus
    || ''
  ).toLowerCase();
  if (runtimeRules.useStatusWithDates && (statusText.includes('סיום') || statusText.includes('הושלם') || statusText.includes('completed') || statusText.includes('closed') || statusText.includes('ended'))) {
    return true;
  }
  const dates = getScheduleDates(row);
  if (!dates.length) return false;
  const latest = dates[dates.length - 1];
  return endOfDay(latest) < startOfDay(new Date());
}

function getMeetingStatsFromDates(row = {}) {
  const dates = getScheduleDates(row).sort((a, b) => a - b);
  const now = new Date();
  const today = startOfDay(now);
  const completedCount = dates.filter((date) => endOfDay(date) < today).length;
  const upcomingDates = dates.filter((date) => startOfDay(date) >= today);
  const nextMeetingDate = upcomingDates[0] || null;
  const remainingCount = upcomingDates.length;
  return {
    dates,
    total: dates.length,
    completedCount,
    remainingCount,
    nextMeetingDate,
    isCompleted: isCourseCompleted(row)
  };
}

function parseDateLike(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds(), value.getMilliseconds());
  }
  const normalized = String(value).trim();
  const isoDay = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDay) {
    const date = new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const isoDateTime = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
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
  const isoUtc = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{2})(?::(\d{2}))?(\.\d+)?Z$/i);
  if (isoUtc) {
    const date = new Date(Date.UTC(
      Number(isoUtc[1]),
      Number(isoUtc[2]) - 1,
      Number(isoUtc[3]),
      Number(isoUtc[4]),
      Number(isoUtc[5]),
      Number(isoUtc[6] || '0')
    ));
    return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds());
  }
  if (typeof value === 'number' && value > 20000 && value < 60000) {
    const utc = new Date((value - 25569) * 86400000);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  }
  if (/^\d{5}(?:\.\d+)?$/.test(normalized)) {
    const serial = Number(normalized);
    if (Number.isFinite(serial) && serial > 20000 && serial < 60000) {
      const utc = new Date((serial - 25569) * 86400000);
      return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
    }
  }
  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) return new Date(direct.getFullYear(), direct.getMonth(), direct.getDate(), direct.getHours(), direct.getMinutes(), direct.getSeconds(), direct.getMilliseconds());
  const m = normalized.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!m) return null;
  const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
  const d = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const date = new Date(y, mo, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMonthBoundary(value, boundary = 'start') {
  const monthMatch = String(value || '').trim().match(/^(\d{4})-(\d{1,2})$/);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]) - 1;
    if (boundary === 'end') return new Date(year, month + 1, 0, 23, 59, 59, 999);
    return new Date(year, month, 1, 0, 0, 0, 0);
  }
  return parseDateLike(value);
}

async function copyEmailToClipboard(email) {
  const value = String(email || '').trim();
  if (!value) return;
  if (!navigator?.clipboard?.writeText) {
    showToast('לא ניתן היה להעתיק דוא״ל', 'error', 2200);
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    showToast('הדוא״ל הועתק', 'success', 1600);
  } catch (_) {
    showToast('לא ניתן היה להעתיק דוא״ל', 'error', 2200);
  }
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
    const d = parseDateLike(courseMeetingDateRaw(row, fieldName));
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
  return getExceptionsPageIssues(row).length > 0;
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
    getCourseField(row, COURSE_FIELDS.SCHOOL)
  ].filter((v) => String(v || '').trim()).join(' / ');
}

function formatSchedule(row) {
  const dates = getScheduleDates(row).sort((a, b) => a - b);
  const start = dates[0] || firstDate(row, COURSE_DATE_RANGE_FIELDS);
  const listedEnd = dates.length ? dates[dates.length - 1] : null;
  const fallbackEnd = firstDate(row, COURSE_END_RANGE_FIELDS);
  const end = listedEnd || fallbackEnd;
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
  const fieldNames = COURSE_DATE_FIELDS.length
    ? COURSE_DATE_FIELDS
    : Array.from({ length: COURSES_SCREEN_CONFIG.meetingFields.end }, (_, i) => `Date${i + 1}`);
  fieldNames.forEach((fieldName, index) => {
    const date = parseDateLike(courseMeetingDateRaw(row, fieldName));
    if (date) dates.push({ label: fieldName, value: date, index: index + 1 });
  });
  dates.sort((a, b) => a.value - b.value);
  const endDate = parseDateLike(row?.[COURSES_SCREEN_CONFIG.meetingFields.fallbackEndField]);
  if (endDate) dates.push({ label: COURSES_SCREEN_CONFIG.meetingFields.fallbackEndField, value: endDate, index: dates.length + 1, isEndDate: true });
  return dates;
}

function getMeetingChangeSourceForUser() {
  if (isEden()) return 'EDEN';
  if (isIdan()) return 'ADMIN';
  return 'MANAGER';
}

function getCourseMeetingsForDisplay(course) {
  const courseId = String(course?.CourseID || '');
  const cached = viewState.courses.meetingsByCourseId?.[courseId];
  if (Array.isArray(cached) && cached.length) return cached;
  return collectCourseDates(course).map((item) => ({
    MeetingNumber: item.index,
    MeetingDate: item.value,
    OriginalMeetingDate: item.value,
    StartTime: course?.[COURSE_FIELDS.START_TIME] || '',
    EndTime: course?.[COURSE_FIELDS.END_TIME] || '',
    MeetingStatus: item.isEndDate ? 'END_DATE' : ''
  }));
}

async function loadCourseMeetings(courseId) {
  const normalized = String(courseId || '').trim();
  if (!normalized) return [];
  const res = await api.getCourseMeetings({ CourseID: normalized });
  if (!res?.success) {
    showToast(res?.message || 'טעינת המפגשים נכשלה.', 'error');
    return [];
  }
  const items = Array.isArray(res?.data?.items) ? res.data.items : [];
  viewState.courses.meetingsByCourseId[normalized] = items;
  return items;
}

function renderCourseDetailsPanel(course, options = {}) {
  if (!course) return '';
  const meetings = getCourseMeetingsForDisplay(course);
  const meetingStats = getMeetingStatsFromDates(course);
  const delayText = formatDelayNotes(course[COURSE_FIELDS.NOTES]);
  return `<div class="course-details-overlay"><section class="panel-block course-details-panel">
    <div class="panel-block-head">
      <h3>${esc(course[COURSE_FIELDS.PROGRAM] || course[COURSE_FIELDS.ACTIVITY] || 'ללא שם קורס')}</h3>
      <button class="btn btn-secondary" id="closeCourseDetails">סגור ✕</button>
    </div>
    <div class="course-core-grid">
      <div class="course-core-col"><span><strong>שם קורס:</strong> ${esc(getBusinessCourseName(course))}</span><span><strong>מדריך:</strong> ${esc(resolveInstructorName(course) || '-')}</span></div>
      <div class="course-core-col"><span><strong>בית ספר:</strong> ${esc(course[COURSE_FIELDS.SCHOOL] || '-')}</span><span><strong>רשות:</strong> ${esc(course[COURSE_FIELDS.AUTHORITY] || '-')}</span></div>
      <div class="course-core-col">${summarizeIssue(course) ? `<span>${esc(summarizeIssue(course))}</span>` : ''}<span><strong>הערות דחייה:</strong> ${esc(delayText)}</span></div>
    </div>
    <div class="table-wrap compact-table"><table><thead><tr><th>מפגש</th><th>תאריך</th><th>יום</th><th>שעות</th><th>הערה אחרונה</th><th>פעולות</th></tr></thead><tbody>
      ${meetings.length ? meetings.map((item) => {
        const meetingDate = parseDateLike(item.MeetingDate || item.value);
        const originalDate = parseDateLike(item.OriginalMeetingDate || item.value);
        const meetingNumber = Number(item.MeetingNumber || item.index || 0);
        const dayLabel = meetingDate ? meetingDate.toLocaleDateString('he-IL', { weekday: 'long' }) : '-';
        const isChanged = originalDate && meetingDate && formatDate(originalDate) !== formatDate(meetingDate);
        return `<tr>
          <td>${esc(`מפגש ${meetingNumber}`)}</td>
          <td>${esc(formatDate(meetingDate) || '-')} ${isChanged ? '<span class="status-chip status-pending">שונה</span>' : ''}</td>
          <td>${esc(dayLabel)}</td>
          <td>${esc(`${formatTimeValue(item.StartTime || course[COURSE_FIELDS.START_TIME])}-${formatTimeValue(item.EndTime || course[COURSE_FIELDS.END_TIME])}`)}</td>
          <td>${esc(String(item.ChangeNote || '-'))}</td>
          <td><button class="btn btn-tertiary" data-edit-meeting="${escAttr(`${course.CourseID}::${meetingNumber}`)}" data-meeting-date="${escAttr(meetingDate ? formatIsoDateLocal(meetingDate) : '')}">שינוי</button></td>
        </tr>`;
      }).join('') : '<tr><td colspan="6">אין תאריכי מפגש</td></tr>'}
    </tbody></table></div>
    <div class="card-kpi-row">
      <span><strong>מפגשים שבוצעו:</strong> ${esc(String(meetingStats.completedCount))} מתוך ${esc(String(meetingStats.total || 0))}</span>
      ${!meetingStats.isCompleted ? `<span><strong>מפגשים שנותרו:</strong> ${esc(String(meetingStats.remainingCount))}</span>` : ''}
      ${!meetingStats.isCompleted && meetingStats.nextMeetingDate ? `<span><strong>מפגש קרוב:</strong> ${esc(formatDate(meetingStats.nextMeetingDate))}</span>` : ''}
      ${meetingStats.isCompleted ? `<span><strong>סטטוס סיום:</strong> הסתיים</span>` : ''}
    </div>
    ${delayText !== 'אין הערות' ? `<div class="card-issue ${hasException(course) ? 'has-issue' : ''}"><strong>הערות:</strong> ${esc(delayText)}</div>` : ''}
    <footer class="card-actions">
      <button class="btn btn-primary" data-edit-row="${escAttr(course[COURSE_FIELDS.COURSE_ID] || '')}">שלח בקשת שינוי</button>
    </footer>
  </section><div class="course-details-backdrop" id="closeCourseDetailsBackdrop"></div></div>`;
}

function renderIssueBadge(row) {
  if (hasException(row)) return '<span class="status-chip status-declined">חריג</span>';
  if (isMissingReport(row)) return '<span class="status-chip status-pending">חסר דיווח</span>';
  if (!hasInstructor(row)) return '<span class="status-chip status-pending-final">חסר מדריך</span>';
  return '';
}

function renderStatusBadge(row) {
  const statusText = String(row.EventType || row.WorkflowStatus || '').trim();
  if (!statusText) return '';
  return `<span class="status-chip status-none">${esc(statusText)}</span>`;
}

function renderInstructorState(row) {
  if (!row.instructor || row.instructor === 'לא משויך') return '<span class="status-chip status-declined">חוסר שיוך</span>';
  if (row.hasGap) return '<span class="status-chip status-pending">פער תפעולי</span>';
  return '';
}

function summarizeIssue(row) {
  if (hasException(row)) return getExceptionsPageIssues(row).join(' / ');
  if (isMissingReport(row)) return row.ReviewStatus || 'דיווח מפגשים חסר';
  if (!hasInstructor(row)) return 'ללא מדריך';
  return '';
}

function formatDelayNotes(notesValue) {
  const text = String(notesValue || '').trim();
  if (!text) return 'אין הערות';
  const postponeInfo = parseDelayInfo(text);
  if (!postponeInfo.isPostponed) return text;
  if (postponeInfo.originalDate !== '-' || postponeInfo.newDate !== '-') {
    return `דחייה מתאריך ${postponeInfo.originalDate} לתאריך ${postponeInfo.newDate}`;
  }
  return 'קיימת דחייה בקורס (לפי ההערה)';
}

function recommendedAction(row) {
  if (!fieldHasValue(row, [INSTRUCTOR_FALLBACK_FIELD])) return 'שייך מדריך';
  if (isMissingReport(row)) return 'עדכן דיווח';
  if (hasException(row)) return 'פתח טיפול';
  return 'מעבר לפרטים';
}

function findCourseById(courseId) {
  const id = String(courseId || '');
  return (viewState.courses.data || []).find((row) => String(row?.CourseID || '') === id) ||
    (getStoreSnapshot().courses || []).find((row) => String(row?.CourseID || '') === id) || null;
}

function getCourseDisplayNameById(courseId) {
  const normalizedId = String(courseId || '');
  const allCourses = getStoreSnapshot().courses || [];
  const row = allCourses.find((course) => String(course?.CourseID || '') === normalizedId);
  return row?.Program || row?.EventType || 'שם קורס לא זמין';
}

function bindCourseActions() {
  bindEditButtons();
  bindMeetingEditButtons();
  document.querySelectorAll('[data-course-inline]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.courseInline || '';
    viewState.courses.openDetailsId = viewState.courses.openDetailsId === id ? '' : id;
    renderScreen();
  }));
  document.querySelectorAll('[data-instructor-day-toggle]').forEach((button) => button.addEventListener('click', () => {
    const courseId = button.dataset.instructorDayToggle || '';
    viewState.courses.selectedInstructorDayCourseId = viewState.courses.selectedInstructorDayCourseId === courseId ? '' : courseId;
    renderScreen();
  }));
  document.querySelectorAll('[data-open-course]').forEach((button) => button.addEventListener('click', async () => {
    await openCourseFromPlanner(button.dataset.openCourse);
  }));
  const closeCourseDetailsFn = () => {
    viewState.courses.selectedCourseId = '';
    viewState.courses.selectedCourseDetails = null;
    renderScreen();
  };
  document.getElementById('closeCourseDetails')?.addEventListener('click', closeCourseDetailsFn);
  document.getElementById('closeCourseDetailsBackdrop')?.addEventListener('click', closeCourseDetailsFn);
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
    const summary = window.prompt('מה לעדכן בפעילות?', `טיפול בחריגה עבור ${row.EventType || row.Program || ''}`);
    if (!summary) return;
    api.createEditRequest({
      CourseID: row.CourseID,
      InstructorManager: row.InstructorManager || 'operations',
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
      InstructorManager: row.InstructorManager || 'operations',
      ChangeSummary: 'סגירת חריגה',
      ApprovalStatus: 'pending_eden',
      requestedData: { issueStatus: 'טופל', operationalStatus: 'תקין' }
    }).then(() => loadMyRequests());
  }));
}

function bindEditButtons() {
  document.querySelectorAll('[data-edit-row]').forEach((b) => b.addEventListener('click', async () => {
    if (!canEditMasterCourses() && !canRequestEditCourses()) {
      showToast('אין הרשאה לעריכה או בקשת שינוי.', 'warning');
      return;
    }
    const row = findCourseById(b.dataset.editRow) || {};
    const mode = canEditMasterCourses() ? 'edit' : 'request';
    const formResult = await openCourseActionForm(row, mode);
    if (!formResult) return;
    const res = canEditMasterCourses()
      ? await updateCourse(row[COURSE_FIELDS.COURSE_ID], formResult.changes, userState)
      : await createEditRequest(row[COURSE_FIELDS.COURSE_ID], formResult.changes, userState);
    if (!res?.success) showToast(res?.message || 'הפעולה נכשלה', 'error');
    else {
      await loadMyRequests();
      showToast(canEditMasterCourses() ? 'הרשומה עודכנה בהצלחה.' : 'בקשת השינוי הועברה לתפעול.', 'success');
    }
  }));
}

function bindMeetingEditButtons() {
  document.querySelectorAll('[data-edit-meeting]').forEach((button) => button.addEventListener('click', async () => {
    const [courseId, meetingNumberRaw] = String(button.dataset.editMeeting || '').split('::');
    const meetingNumber = Number(meetingNumberRaw || 0);
    if (!courseId || !Number.isFinite(meetingNumber) || meetingNumber < 1) return;
    const initialDate = button.dataset.meetingDate || '';
    const result = await openMeetingChangeModal({ meetingNumber, initialDate });
    if (!result) return;
    const response = await api.updateCourseMeeting({
      CourseID: courseId,
      MeetingNumber: meetingNumber,
      NewMeetingDate: result.newDate,
      UpdateMode: result.mode,
      ChangeNote: result.note,
      ChangeSource: getMeetingChangeSourceForUser()
    });
    if (!response?.success) {
      showToast(response?.message || 'עדכון מפגש נכשל.', 'error');
      return;
    }
    await loadCourses({ silent: true, forceRefreshCourseId: courseId });
    await loadCourseMeetings(courseId);
    showToast('המפגש עודכן בהצלחה.', 'success');
    renderScreen();
  }));
}

function openMeetingChangeModal({ meetingNumber, initialDate }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'course-form-modal';
    root.innerHTML = `
      <div class="course-form-backdrop" data-form-close="1"></div>
      <div class="course-form-card">
        <h3>עדכון מפגש ${esc(String(meetingNumber))}</h3>
        <label>תאריך חדש<input id="meetingDateInput" type="date" value="${escAttr(initialDate || '')}" /></label>
        <label><input type="radio" name="meetingUpdateMode" value="single" checked /> עדכן רק את המפגש הזה</label>
        <label><input type="radio" name="meetingUpdateMode" value="shift_series" /> הזז את המפגש הזה ואת כל המפגשים שאחריו</label>
        <label>הערת שינוי (חובה)<textarea id="meetingChangeNote" rows="3" placeholder="סיבת השינוי"></textarea></label>
        <div class="card-actions">
          <button class="btn btn-secondary" data-form-close="1">ביטול</button>
          <button class="btn btn-primary" id="meetingChangeSubmit">שמירה</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    const close = (result = null) => {
      root.remove();
      resolve(result);
    };
    root.querySelectorAll('[data-form-close]').forEach((button) => button.addEventListener('click', () => close(null)));
    root.querySelector('#meetingChangeSubmit')?.addEventListener('click', () => {
      const newDate = root.querySelector('#meetingDateInput')?.value || '';
      const note = root.querySelector('#meetingChangeNote')?.value.trim() || '';
      const mode = root.querySelector('input[name="meetingUpdateMode"]:checked')?.value || 'single';
      if (!newDate) {
        showToast('יש לבחור תאריך חדש למפגש.', 'warning');
        return;
      }
      if (!note) {
        showToast('יש להזין הערת שינוי.', 'warning');
        return;
      }
      close({ newDate, note, mode });
    });
  });
}

function openCourseActionForm(course, mode) {
  return new Promise((resolve) => {
    const isDirectEdit = mode === 'edit';
    const formTitle = isDirectEdit ? 'עריכה ישירה' : 'בקשת שינוי';
    const formSubmitLabel = isDirectEdit ? 'שמירה ישירה' : 'שליחה לעדן';
    const planned = Math.max(1, Math.min(35, Number(course.PlannedMeetings || course.DatesListedCount || 10)));
    const dateInputsHtml = Array.from({ length: planned }, (_, i) => {
      const n = i + 1;
      const rawVal = course[`Date${n}`];
      const isoVal = rawVal ? (() => { const d = parseDateLike(rawVal); return d ? formatIsoDateLocal(d) : ''; })() : '';
      return `<div class="caf-date-row">
        <span class="caf-date-label">מפגש ${n}</span>
        <input class="caf-date-input" id="courseFormDate${n}" type="date" value="${escAttr(isoVal)}" data-meeting-num="${n}" />
      </div>`;
    }).join('');

    const root = document.createElement('div');
    root.className = 'course-form-modal';
    root.innerHTML = `
      <div class="course-form-backdrop" data-form-close="1"></div>
      <div class="course-form-card course-form-card--wide">
        <h3>${esc(formTitle)} — ${esc(getBusinessCourseName(course))}</h3>
        <div class="caf-meta-row">
          <label>שעת התחלה<input id="courseFormStartTime" value="${escAttr(formatTimeValue(course.StartTime))}" placeholder="hh:mm" /></label>
          <label>שעת סיום<input id="courseFormEndTime" value="${escAttr(formatTimeValue(course.EndTime))}" placeholder="hh:mm" /></label>
          <label>הערות<input id="courseFormNotes" value="${escAttr(course.Notes || '')}" /></label>
        </div>
        <div class="caf-dates-section">
          <h4 class="caf-dates-title">תאריכי מפגשים <span class="caf-dates-count">${planned} מפגשים</span></h4>
          <div class="caf-dates-grid">${dateInputsHtml}</div>
        </div>
        <div class="card-actions">
          <button class="btn btn-secondary" data-form-close="1">ביטול</button>
          <button class="btn btn-primary" id="courseFormSubmit">${esc(formSubmitLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const close = (result = null) => { root.remove(); resolve(result); };
    root.querySelectorAll('[data-form-close]').forEach((button) => button.addEventListener('click', () => close(null)));
    root.querySelector('#courseFormSubmit')?.addEventListener('click', () => {
      const changes = {
        StartTime: root.querySelector('#courseFormStartTime')?.value.trim() || '',
        EndTime: root.querySelector('#courseFormEndTime')?.value.trim() || '',
        Notes: root.querySelector('#courseFormNotes')?.value.trim() || ''
      };
      Array.from({ length: planned }, (_, i) => i + 1).forEach((n) => {
        const val = root.querySelector(`#courseFormDate${n}`)?.value.trim() || '';
        const origRaw = course[`Date${n}`];
        const origIso = origRaw ? (() => { const d = parseDateLike(origRaw); return d ? formatIsoDateLocal(d) : ''; })() : '';
        if (val !== origIso) changes[`Date${n}`] = val;
      });
      close({ changes });
    });
  });
}

function openAddRecordForm(options = {}) {
  const formTitle = String(options?.title || 'יצירת רשומה חדשה');
  const submitLabel = String(options?.submitLabel || 'יצירה');
  const enforceCourseId = Boolean(options?.enforceCourseId);
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'course-form-modal';
    root.innerHTML = `
      <div class="course-form-backdrop" data-form-close="1"></div>
      <div class="course-form-card">
        <h3>${esc(formTitle)}</h3>
        <p class="details-text">מצב New Record פעיל: הזנה ידנית מלאה ללא טעינת רשומה קיימת.</p>
        <label>CourseID (אופציונלי)<input id="newCourseId" placeholder="אם ריק ייווצר אוטומטית" /></label>
        <label>Program<input id="newProgram" /></label>
        <label>EventType<input id="newActivity" /></label>
        <label>Authority<input id="newAuthority" /></label>
        <label>School<input id="newSchool" /></label>
        <label>Instructor<input id="newInstructor" /></label>        <label>StartTime<input id="newStartTime" placeholder="hh:mm" /></label>
        <label>EndTime<input id="newEndTime" placeholder="hh:mm" /></label>
        <label>Funding<input id="newFunding" /></label>
        <label>Payment<input id="newPayment" type="number" step="0.01" min="0" /></label>        <label>Notes<input id="newNotes" /></label>
        <div class="card-actions">
          <button class="btn btn-secondary" data-form-close="1">ביטול</button>
          <button class="btn btn-primary" id="newRecordSubmit">${esc(submitLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    const close = (result = null) => {
      root.remove();
      resolve(result);
    };
    root.querySelectorAll('[data-form-close]').forEach((button) => button.addEventListener('click', () => close(null)));
    root.querySelector('#newRecordSubmit')?.addEventListener('click', () => {
      const out = {
        CourseID: root.querySelector('#newCourseId')?.value.trim() || '',
        Program: root.querySelector('#newProgram')?.value.trim() || '',
        EventType: root.querySelector('#newActivity')?.value.trim() || '',
        Authority: root.querySelector('#newAuthority')?.value.trim() || '',
        School: root.querySelector('#newSchool')?.value.trim() || '',
        Instructor: root.querySelector('#newInstructor')?.value.trim() || '',
        StartTime: root.querySelector('#newStartTime')?.value.trim() || '',
        EndTime: root.querySelector('#newEndTime')?.value.trim() || '',
        Funding: root.querySelector('#newFunding')?.value.trim() || '',
        Payment: root.querySelector('#newPayment')?.value.trim() || '',
        Notes: root.querySelector('#newNotes')?.value.trim() || ''
      };
      if (!out.Program && !out.EventType) {
        showToast('יש להזין לפחות Program או EventType.', 'warning');
        return;
      }
      if (enforceCourseId && !out.CourseID) {
        showToast('במצב New Record יש להזין CourseID.', 'warning');
        return;
      }
      close(out);
    });
  });
}

function openPermissionEditForm(perm = {}) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'course-form-modal';
    root.innerHTML = `
      <div class="course-form-backdrop" data-form-close="1"></div>
      <div class="course-form-card contact-form-card">
        <h3>עריכת הרשאה — ${escAttr(perm.employeeName || '')}</h3>
        <label>תפקיד (תצוגה)<input id="permDisplayRole" value="${escAttr(perm.displayRole || perm.systemRole || '')}" /></label>
        <label>מסך ברירת מחדל<input id="permDefaultView" value="${escAttr(perm.defaultView || '')}" /></label>
        <label>קוד כניסה<input id="permEntryCode" value="${escAttr(perm.entryCode || '')}" /></label>
        <label>היקף צפייה<input id="permViewScope" value="${escAttr(perm.viewScope || '')}" /></label>
        <label>היקף עריכה<input id="permEditScope" value="${escAttr(perm.editScope || '')}" /></label>
        <label class="perm-active-label"><input type="checkbox" id="permActive" ${perm.activeFlag ? 'checked' : ''} /> פעיל</label>
        <div class="card-actions">
          <button class="btn btn-secondary" data-form-close="1">ביטול</button>
          <button class="btn btn-primary" id="permSaveBtn">שמירה</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    const close = (value = null) => { root.remove(); resolve(value); };
    root.querySelectorAll('[data-form-close]').forEach((b) => b.addEventListener('click', () => close(null)));
    root.querySelector('#permSaveBtn')?.addEventListener('click', () => {
      close({
        _rowNumber: perm._rowNumber || perm.raw?._rowNumber,
        emp_id: perm.employeeId || '',
        DisplayRole: root.querySelector('#permDisplayRole')?.value.trim() || '',
        default_view: root.querySelector('#permDefaultView')?.value.trim() || '',
        code: root.querySelector('#permEntryCode')?.value.trim() || '',
        ViewScope: root.querySelector('#permViewScope')?.value.trim() || '',
        EditScope: root.querySelector('#permEditScope')?.value.trim() || '',
        active: root.querySelector('#permActive')?.checked ? 'yes' : 'no'
      });
    });
  });
}

function openContactEditForm(contact = {}) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'course-form-modal';
    root.innerHTML = `
      <div class="course-form-backdrop" data-form-close="1"></div>
      <div class="course-form-card contact-form-card">
        <h3>עריכת איש קשר</h3>
        <label>תפקיד<input id="contactRole" value="${escAttr(contact.role || '')}" /></label>
        <label>שם<input id="contactName" value="${escAttr(contact.name || '')}" /></label>
        <label>תעודת זהות<input id="contactIdNumber" value="${escAttr(contact.id_number || '')}" /></label>
        <label>כתובת<input id="contactAddress" value="${escAttr(contact.address || '')}" /></label>
        <label>נייד<input id="contactMobile" value="${escAttr(contact.mobile || '')}" /></label>
        <label>דוא״ל<input id="contactEmail" value="${escAttr(contact.email || '')}" /></label>
        <label>סוג העסקה<input id="contactEmployment" value="${escAttr(contact.employment || '')}" /></label>
        <div class="card-actions">
          <button class="btn btn-secondary" data-form-close="1">ביטול</button>
          <button class="btn btn-primary" id="contactSaveBtn">שמירה</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    const close = (value = null) => {
      root.remove();
      resolve(value);
    };
    root.querySelectorAll('[data-form-close]').forEach((button) => button.addEventListener('click', () => close(null)));
    root.querySelector('#contactSaveBtn')?.addEventListener('click', () => {
      close({
        _rowNumber: contact._rowNumber,
        emp_id: contact.emp_id || '',
        role: root.querySelector('#contactRole')?.value.trim() || '',
        name: root.querySelector('#contactName')?.value.trim() || '',
        id_number: root.querySelector('#contactIdNumber')?.value.trim() || '',
        address: root.querySelector('#contactAddress')?.value.trim() || '',
        mobile: root.querySelector('#contactMobile')?.value.trim() || '',
        email: root.querySelector('#contactEmail')?.value.trim() || '',
        employment: root.querySelector('#contactEmployment')?.value.trim() || ''
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
  const approveText = currentRoute === 'final-approvals' ? 'Apply to Master הושלם בהצלחה' : 'הבקשה נשלחה לאדמין בהצלחה';
  showToast(approved ? approveText : 'הבקשה נדחתה', approved ? 'success' : 'error');
}

function safeParseJson(raw) {
  try {
    return typeof raw === 'string' ? (JSON.parse(raw || '{}') || {}) : (raw || {});
  } catch (error) {
    return {};
  }
}

function bindEdenActions() {
  document.getElementById('edenStartExisting')?.addEventListener('click', async () => {
    const courseId = await openEdenCoursePicker();
    if (!courseId) return;
    const courses = getStoreSnapshot().courses || [];
    const course = courses.find((item) => String(item?.CourseID || '').trim() === courseId);
    if (!course) {
      showToast('CourseID לא נמצא ב-DATA_MASTER.', 'error');
      return;
    }
    const requestedData = { ...course };
    const res = await api.createEditRequest({
      CourseID: courseId,
      ApprovalStatus: 'pending_eden',
      Origin: 'EDEN_INITIATED',
      ChangeType: 'UPDATE_EXISTING',
      RequestedData: requestedData,
      OriginalData: requestedData,
      ChangeSummary: 'יוזמת עדן - עדכון רשומה קיימת'
    });
    if (!res?.success) return showToast(res?.message || 'פתיחת שינוי נכשלה.', 'error');
    await loadEdenView();
    showToast('נפתחה רשומת Eden על פעילות קיימת.', 'success');
  });

  document.getElementById('edenStartNew')?.addEventListener('click', async () => {
    const newRecordInput = await openAddRecordForm({
      title: 'יצירת רשומה חדשה (מצב New Record)',
      submitLabel: 'פתיחת New Record',
      enforceCourseId: true
    });
    if (!newRecordInput) return;
    const requestedData = { ...newRecordInput };
    const res = await api.createEditRequest({
      CourseID: requestedData.CourseID,
      ApprovalStatus: 'pending_eden',
      Origin: 'EDEN_INITIATED',
      ChangeType: 'NEW_RECORD',
      RequestedData: requestedData,
      OriginalData: {},
      ChangeSummary: 'יוזמת עדן - יצירת רשומה חדשה'
    });
    if (!res?.success) return showToast(res?.message || 'יצירת רשומה חדשה נכשלה.', 'error');
    await loadEdenView();
    showToast('נפתחה רשומה חדשה ב-Eden Data Master.', 'success');
  });

  document.querySelectorAll('[data-eden-edit]').forEach((button) => button.addEventListener('click', async () => {
    const requestId = button.dataset.edenEdit || '';
    const row = (viewState.eden.data.queue || []).find((item) => String(item.RequestID || '') === requestId);
    if (!row) return;
    const formResult = await openEdenFullRowForm(row, {});
    if (!formResult) return;
    const notesInput = document.querySelector(`[data-eden-notes="${cssEscape(requestId)}"]`);
    const res = await api.createEditRequest({
      operation: 'EDEN_SAVE',
      RequestID: row.RequestID,
      CourseID: row.CourseID,
      RequestedData: formResult.requestedData,
      EdenNotes: (notesInput?.value || formResult.edenNotes || '').trim()
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
      operation: 'EDEN_SUBMIT_ADMIN',
      RequestID: row.RequestID,
      CourseID: row.CourseID
    });
    if (!res?.success) {
      showToast(res?.message || 'העברה לאישור סופי נכשלה.', 'error');
      return;
    }
    await Promise.all([loadEdenView(), loadApprovals()]);
    showToast('הבקשה הועברה לאישור סופי.', 'success');
  }));

  document.querySelectorAll('[data-eden-refresh]').forEach((button) => button.addEventListener('click', async () => {
    const requestId = button.dataset.edenRefresh || '';
    if (!requestId) return;
    const res = await api.createEditRequest({ operation: 'EDEN_REFRESH_SOURCE', RequestID: requestId });
    if (!res?.success) {
      showToast(res?.message || 'רענון מקור נכשל.', 'error');
      return;
    }
    await loadEdenView();
    showToast('מקור DATA_MASTER רוענן בהצלחה.', 'success');
  }));
}

function openEdenCoursePicker() {
  return new Promise((resolve) => {
    const courses = (getStoreSnapshot().courses || []).slice();
    const options = courses
      .map((course) => {
        const courseId = String(course?.CourseID || '').trim();
        if (!courseId) return '';
        const school = String(getCourseField(course, COURSE_FIELDS.SCHOOL) || '').trim() || 'ללא בית ספר';
        const activity = String(getBusinessCourseName(course) || '').trim() || courseId;
        return `<option value="${escAttr(courseId)}">${esc(`${school} | ${activity}`)}</option>`;
      })
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'he'));
    const root = document.createElement('div');
    root.className = 'course-form-modal';
    root.innerHTML = `
      <div class="course-form-backdrop" data-form-close="1"></div>
      <div class="course-form-card">
        <h3>בחירת קורס</h3>
        <label>בית ספר | קורס / פעילות
          <select id="edenCourseSelect"><option value="">בחר/י קורס</option>${options.join('')}</select>
        </label>
        <div class="card-actions">
          <button class="btn btn-secondary" data-form-close="1">ביטול</button>
          <button class="btn btn-primary" id="edenCourseSelectSubmit">המשך</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    const close = (result = '') => {
      root.remove();
      resolve(result);
    };
    root.querySelectorAll('[data-form-close]').forEach((button) => button.addEventListener('click', () => close('')));
    root.querySelector('#edenCourseSelectSubmit')?.addEventListener('click', () => {
      const selected = root.querySelector('#edenCourseSelect')?.value.trim() || '';
      if (!selected) {
        showToast('יש לבחור קורס מהרשימה.', 'warning');
        return;
      }
      close(selected);
    });
  });
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
        <label>הערות עדן<input id="edenNotes" value="${escAttr(requestRow?.EdenNotes || '')}" placeholder="הערות פנימיות של עדן" /></label>
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
      const edenNotes = root.querySelector('#edenNotes')?.value.trim() || '';
      const raw = root.querySelector('#edenRequestedData')?.value || '{}';
      try {
        const requestedData = JSON.parse(raw);
        if (!requestedData || typeof requestedData !== 'object' || Array.isArray(requestedData)) {
          showToast('יש להזין אובייקט JSON תקין.', 'error');
          return;
        }
        close({ edenNotes, requestedData });
      } catch (error) {
        showToast('פורמט JSON לא תקין.', 'error');
      }
    });
  });
}

async function loadWeekView() {
  if (!viewState.week.rangeStart) {
    const now = new Date();
    const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    viewState.week.rangeStart = formatIsoDateLocal(startOfDay(sunday));
  }
  const needFetch = !isCoursesCacheFresh() || !isReviewCacheFresh();
  if (needFetch) {
    viewState.week.loading = true;
    renderScreen();
  }
  viewState.week.error = '';
  try {
    await Promise.all([reloadCourses(false), loadReviewItems(false)]);
  } catch (error) {
    viewState.week.error = 'לא ניתן לרענן נתוני קורסים לשבוע.';
  }
  viewState.week.loading = false;
  renderScreen();
}

async function loadMonthView() {
  if (!viewState.month.monthDate) {
    viewState.month.monthDate = formatMonthInputLocal(new Date());
  }
  const needFetch = !isCoursesCacheFresh() || !isReviewCacheFresh();
  if (needFetch) {
    viewState.month.loading = true;
    renderScreen();
  }
  viewState.month.error = '';
  try {
    await Promise.all([reloadCourses(false), loadReviewItems(false)]);
  } catch (error) {
    viewState.month.error = 'לא ניתן לרענן נתוני קורסים לחודש.';
  }
  viewState.month.loading = false;
  renderScreen();
}

async function loadInstructorsView() {
  const needFetch = !isCoursesCacheFresh() || !isReviewCacheFresh();
  if (needFetch) {
    viewState.instructors.loading = true;
    renderScreen();
  }
  viewState.instructors.error = '';
  try {
    await Promise.all([reloadCourses(false), loadReviewItems(false)]);
  } catch (error) {
    viewState.instructors.error = 'לא ניתן לרענן נתוני קורסים למדריכים.';
  }
  viewState.instructors.loading = false;
  renderScreen();
}

async function loadEndDatesView() {
  if (!viewState.endDates.filters.month) {
    viewState.endDates.filters.month = formatMonthInputLocal(new Date());
  }
  const needFetch = !isCoursesCacheFresh() || !isReviewCacheFresh();
  if (needFetch) {
    viewState.endDates.loading = true;
    renderScreen();
  }
  viewState.endDates.error = '';
  try {
    await Promise.all([reloadCourses(false), loadReviewItems(false)]);
  } catch (error) {
    viewState.endDates.error = 'לא ניתן לרענן נתוני קורסים לתאריכי סיום.';
  }
  viewState.endDates.loading = false;
  renderScreen();
}

async function loadExceptionsView() {
  viewState.exceptions.loading = true;
  viewState.exceptions.error = '';
  renderScreen();
  try {
    await Promise.all([reloadCourses(true), loadReviewItems(true)]);
  } catch (error) {
    viewState.exceptions.error = 'לא ניתן לרענן נתוני קורסים לחריגות.';
  }
  viewState.exceptions.loading = false;
  renderScreen();
}

function renderWeekFilters() {
  const options = getUiFilterOptions();
  return `<section class="filters-wrap week-filters-wrap">
    <div class="filter-actions week-nav-actions week-nav-actions-primary"><button class="btn btn-secondary" id="weekPrev" type="button" aria-label="שבוע קודם">◀ שבוע קודם</button><button class="btn btn-secondary" id="weekNext" type="button" aria-label="שבוע הבא">שבוע הבא ▶</button></div>
    <label>רשות<select id="weekAuthority">${renderSelectOptions(options.authority, viewState.week.filters.authority)}</select></label>
    <label>מדריך<select id="weekEmployee">${renderSelectOptions(options.employee, viewState.week.filters.employee)}</select></label>
    <label>מנהל קורס<select id="weekCourseManager">${renderSelectOptions(options.courseManager, viewState.week.filters.courseManager)}</select></label>
    <div class="filter-actions"><button class="btn btn-secondary" id="weekApply" type="button">סינון</button><button class="btn btn-secondary" id="weekReset" type="button">נקה סינון</button></div>
  </section>`;
}

function renderWeekGrid(days) {
  const todayIso = formatIsoDateLocal(startOfDay(new Date()));
  return `<section class="week-grid">${days.map((day) => {
    const groupedItems = groupDayItemsByInstructor(day.items);
    const countText = day.isShabbat ? '' : `${day.items.length} פעילויות`;
    const dayTitle = day.weekdayLabel;
    const emptyState = day.isShabbat ? '' : '<div class="panel-empty">אין מפגשים</div>';
    return `<article class="panel-block week-day-column ${day.isShabbat ? 'week-day-shabbat' : ''} ${day.isoDate === todayIso ? 'week-day-today' : ''}">
      <div class="panel-block-head week-day-head">
        <h3>${esc(dayTitle)}</h3>
        <small class="week-day-date">${esc(day.dateLabel)}</small>
        ${day.isShabbat ? '' : `<button class="btn btn-tertiary week-day-count" data-week-open="${escAttr(day.isoDate)}" aria-label="פתח פירוט ליום ${escAttr(day.label)}">${countText}</button>`}
      </div>
      ${groupedItems.map((group, index) => renderWeekInstructorAccordion(day, group, index)).join('') || emptyState}
    </article>`;
  }).join('')}</section>`;
}

function renderWeekInstructorAccordion(day, group) {
  const hasMultiple = group.items.length > 1;
  return `<button type="button" class="mini-card week-session-card week-instructor-tile" data-week-instructor-day="${escAttr(day.isoDate)}" data-week-instructor="${escAttr(group.instructor)}"><span class="week-instructor-tile-inner"><strong class="week-instructor-name">${esc(group.instructor)}</strong><span class="week-instructor-more" aria-hidden="true">${hasMultiple ? '➕' : ''}</span></span></button>`;
}

function groupDayItemsByInstructor(items) {
  return (items || []).reduce((groups, item) => {
    const instructor = resolveInstructorName(item) || 'טרם שויך';
    const existingGroup = groups.find((group) => group.instructor === instructor);
    if (existingGroup) {
      existingGroup.items.push(item);
      return groups;
    }
    return [...groups, { instructor, items: [item] }];
  }, []);
}

function renderWeekDetails(selected) {
  if (!selected) return '';
  return `<aside class="week-side-panel" id="weekSidePanel"><div class="week-side-panel-head"><h3 class="section-title">פרטי יום: ${esc(selected.label)}</h3><button type="button" class="btn btn-secondary" id="weekCloseDetails">סגור</button></div><div class="week-side-panel-body">${selected.items.map((item) => {
    const postpone = parseDelayInfo(item[COURSE_FIELDS.NOTES]);
    const summary = `<strong>${esc(item[COURSE_FIELDS.PROGRAM] || item[COURSE_FIELDS.ACTIVITY] || '-')} | ${esc(item[COURSE_FIELDS.SCHOOL] || '-')} | מדריך/ה: ${esc(resolveInstructorName(item) || '-')}</strong>`;
    const details = `<span>רשות/בית ספר: ${esc(item[COURSE_FIELDS.AUTHORITY] || '-')} / ${esc(item[COURSE_FIELDS.SCHOOL] || '-')}</span><span>תאריך: ${esc(formatDate(parseDateLike(item.Date || item.start_date || item.Date1)) || '-')}</span><span>מפגש ${esc(item.meetingNumber)} מתוך ${esc(item.plannedMeetings)}</span><span>דחייה: ${postpone.isPostponed ? 'כן' : 'לא'} | מקורי: ${esc(postpone.originalDate)} | חדש: ${esc(postpone.newDate)}</span><span>שעות: ${esc(formatTimeValue(item[COURSE_FIELDS.START_TIME]))}-${esc(formatTimeValue(item[COURSE_FIELDS.END_TIME]))}</span><span>הערות: ${esc(item[COURSE_FIELDS.NOTES] || '-')}</span><div class="card-actions"><button class="btn btn-tertiary" data-open-course="${escAttr(item[COURSE_FIELDS.COURSE_ID] || '')}">פתח קורס</button>${item.hasReviewItem ? '<button class="btn btn-tertiary" data-go-exceptions="1">לחריגות</button>' : ''}</div>`;
    return renderExpandableCard({ summary, details, classes: 'mini-card expandable-card', activityRow: item });
  }).join('')}</div></aside>`;
}

function renderWeekInstructorSidePanel(panel) {
  if (!panel || !panel.items?.length) return '';
  const dayLabel = formatDate(parseDateLike(panel.dayIso)) || panel.dayIso || '';
  const body = panel.items.map((item) => {
    const courseName = item[COURSE_FIELDS.PROGRAM] || item[COURSE_FIELDS.ACTIVITY] || '-';
    const school = item[COURSE_FIELDS.SCHOOL] || '-';
    const authority = item[COURSE_FIELDS.AUTHORITY] || '-';
    const mNum = esc(String(item.meetingNumber ?? '-'));
    const mPlan = esc(String(item.plannedMeetings ?? ''));
    const meetingLine = item.plannedMeetings ? `מפגש ${mNum} מתוך ${mPlan}` : `מפגש ${mNum}`;
    return `<div class="week-panel-activity-block">
      <strong class="week-panel-course-title">${esc(courseName)}</strong>
      <ul class="week-panel-activity-list">
        <li><span>בית ספר:</span> ${esc(school)}</li>
        <li><span>רשות:</span> ${esc(authority)}</li>
        <li><span>קורס:</span> ${esc(courseName)}</li>
        <li><span>מספר מפגש:</span> ${meetingLine}</li>
      </ul>
      <div class="card-actions"><button type="button" class="btn btn-tertiary" data-open-course="${escAttr(item[COURSE_FIELDS.COURSE_ID] || '')}">פתח קורס</button></div>
    </div>`;
  }).join('');
  return `<aside class="week-side-panel" id="weekSidePanel"><div class="week-side-panel-head"><h3 class="section-title">${esc(panel.instructor)} — ${esc(dayLabel)}</h3><button type="button" class="btn btn-secondary" id="weekCloseDetails">סגור</button></div><div class="week-side-panel-body">${body}</div></aside>`;
}

function bindWeekActions(weekData) {
  document.getElementById('weekApply')?.addEventListener('click', () => {
    viewState.week.filters = {
      authority: document.getElementById('weekAuthority')?.value.trim() || '',
      employee: document.getElementById('weekEmployee')?.value.trim() || '',
      courseManager: document.getElementById('weekCourseManager')?.value.trim() || ''
    };
    renderScreen();
  });
  document.getElementById('weekReset')?.addEventListener('click', () => {
    viewState.week.filters = { authority: '', employee: '', courseManager: '' };
    const now = new Date();
    const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    viewState.week.rangeStart = formatIsoDateLocal(startOfDay(sunday));
    viewState.week.selected = null;
    viewState.week.instructorPanel = null;
    renderScreen();
  });
  document.getElementById('weekPrev')?.addEventListener('click', () => {
    const current = parseDateLike(viewState.week.rangeStart) || new Date();
    const prev = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7);
    viewState.week.rangeStart = formatIsoDateLocal(prev);
    viewState.week.selected = null;
    viewState.week.instructorPanel = null;
    renderScreen();
  });
  document.getElementById('weekNext')?.addEventListener('click', () => {
    const current = parseDateLike(viewState.week.rangeStart) || new Date();
    const next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7);
    viewState.week.rangeStart = formatIsoDateLocal(next);
    viewState.week.selected = null;
    viewState.week.instructorPanel = null;
    renderScreen();
  });
  document.querySelectorAll('[data-week-open]').forEach((button) => button.addEventListener('click', () => {
    const day = weekData.days.find((item) => item.isoDate === button.dataset.weekOpen);
    viewState.week.instructorPanel = null;
    viewState.week.selected = day || null;
    renderScreen();
  }));
  document.querySelectorAll('.week-instructor-tile').forEach((button) => button.addEventListener('click', () => {
    const dayIso = button.dataset.weekInstructorDay || '';
    const instructor = button.dataset.weekInstructor || '';
    const day = weekData.days.find((item) => item.isoDate === dayIso);
    const group = day ? groupDayItemsByInstructor(day.items).find((g) => g.instructor === instructor) : null;
    if (!group) return;
    viewState.week.selected = null;
    viewState.week.instructorPanel = { dayIso, instructor, items: group.items };
    renderScreen();
  }));
  document.querySelectorAll('[data-week-exception-open]').forEach((button) => button.addEventListener('click', () => {
    viewState.exceptions.filters.treatmentStatus = 'open';
    setRoute('exceptions');
  }));
  document.querySelectorAll('[data-go-exceptions]').forEach((button) => button.addEventListener('click', () => {
    setRoute('exceptions');
  }));
  document.querySelectorAll('[data-open-course]').forEach((button) => button.addEventListener('click', async () => {
    await openCourseFromPlanner(button.dataset.openCourse);
  }));
  bindWeekAccordionState();
  document.getElementById('weekCloseDetails')?.addEventListener('click', () => {
    viewState.week.selected = null;
    viewState.week.instructorPanel = null;
    renderScreen();
  });
  document.getElementById('weekBackdrop')?.addEventListener('click', () => {
    viewState.week.selected = null;
    viewState.week.instructorPanel = null;
    renderScreen();
  });
}

function bindWeekAccordionState() {
  document.querySelectorAll('.week-accordion').forEach((accordion) => {
    const summary = accordion.querySelector('.week-accordion-summary');
    if (!summary) return;
    const syncState = () => {
      summary.setAttribute('aria-expanded', accordion.open ? 'true' : 'false');
    };
    syncState();
    accordion.addEventListener('toggle', syncState);
  });
}

function buildWeeklyBuckets(courses, weekStartValue) {
  const baseDate = parseDateLike(weekStartValue) || new Date();
  const start = startOfDay(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() - baseDate.getDay()));
  const reviewItems = getStoreSnapshot().reviewItems || [];
  const days = TAASIYEDA_CONFIG.weekdays.map((weekday, idx) => {
    const current = new Date(start.getTime() + (idx * 24 * 60 * 60 * 1000));
    return {
      weekdayLabel: idx === 6 ? 'ש' : current.toLocaleDateString('he-IL', { weekday: 'long' }),
      dateLabel: current.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
      label: current.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit' }),
      isShabbat: idx === 6,
      isoDate: formatIsoDateLocal(current),
      items: []
    };
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
    getScheduleDates(course).forEach((dateObj, dateIndex) => {
      const isoDate = formatIsoDateLocal(startOfDay(dateObj));
      const bucket = days.find((day) => day.isoDate === isoDate);
      if (bucket) {
        const sameInstructorCount = (bucket.items.filter((item) => resolveInstructorName(item) === resolveInstructorName(course)).length || 0) + 1;
        bucket.items.push({ ...course, hasReviewItem, hasDelay, meetingNumber: dateIndex + 1, plannedMeetings: sessionProgress.plannedMeetings, sameInstructorCount });
      }
    });
  });
  return { days, start };
}

function renderMonthFilters(monthTitleDisplay = '') {
  const options = getUiFilterOptions();
  const hiddenMonth = viewState.month.monthDate || formatMonthInputLocal(new Date());
  return `<section class="filters-wrap month-filters-wrap"><div class="month-nav-centered">
    <button type="button" class="btn btn-secondary" id="monthNavPrev" aria-label="חודש קודם">◀</button>
    <span class="month-nav-label">${esc(monthTitleDisplay)}</span>
    <button type="button" class="btn btn-secondary" id="monthNavNext" aria-label="חודש הבא">▶</button>
  </div>
  <input type="hidden" id="monthDate" value="${escAttr(hiddenMonth)}" />
  <label>רשות<select id="monthAuthority">${renderSelectOptions(options.authority, viewState.month.filters.authority)}</select></label><label>מדריך<select id="monthEmployee">${renderSelectOptions(options.employee, viewState.month.filters.employee)}</select></label><label>מנהל קורס<select id="monthCourseManager">${renderSelectOptions(options.courseManager, viewState.month.filters.courseManager)}</select></label><label>תוכנית<select id="monthProgram">${renderSelectOptions(options.program, viewState.month.filters.program)}</select></label><div class="filter-actions"><button class="btn btn-secondary" id="monthApply">סינון</button><button class="btn btn-secondary" id="monthReset">נקה סינון</button></div></section>`;
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
  const firstDate = days[0] ? parseDateLike(days[0].isoDate) : null;
  const firstWeekday = firstDate ? firstDate.getDay() : 0;
  const leadingCells = Array.from({ length: firstWeekday }).map(() => '<div class="month-day month-day-empty" aria-hidden="true"></div>').join('');
  const todayIso = formatIsoDateLocal(startOfDay(new Date()));
  const weekdayNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש'];
  return `<section class="month-grid">${weekdayNames.map((name) => `<div class="month-weekday">${name}</div>`).join('')}${leadingCells}${days.map((day) => {
    const n = day.items.length;
    const dotClass = n > 0 ? 'month-activity-dot month-activity-dot--on' : 'month-activity-dot month-activity-dot--off';
    const dateStr = formatDate(parseDateLike(day.isoDate));
    const activitiesLine = n > 0
      ? `<span class="month-day-activities-line">פרטי פעילויות${n > 1 ? `<span class="month-day-activities-count"> · ${n}</span>` : ''}</span>`
      : '';
    const ariaAct = n === 0 ? 'אין פעילויות' : `${n} פעילויות`;
    return `<button type="button" class="month-day ${day.hasException ? 'has-exception' : ''} ${day.isoDate === todayIso ? 'month-day-today' : ''}" data-month-open="${escAttr(day.isoDate)}" aria-label="${escAttr(`תאריך ${dateStr}, ${ariaAct}`)}"><span class="${dotClass}" aria-hidden="true"></span><div class="month-day-date-row"><span class="month-day-date-primary">${esc(dateStr)}</span>${day.hasException ? '<span class="status-chip status-declined compact-badge">!</span>' : ''}</div>${activitiesLine}</button>`;
  }).join('')}</section>`;
}

function renderMonthDayDetails(items, dateLabel) {
  if (!dateLabel) return '';
  return `<section class="panel-block"><div class="panel-block-head"><h3 class="section-title">פירוט יום ${esc(formatDate(parseDateLike(dateLabel)) || dateLabel)}</h3><button class="btn btn-secondary" id="monthCloseDetails">סגור</button></div>${items.map((item) => {
    const hierarchy = buildCourseHierarchyDetails(item);
    const summary = `<strong>${esc(hierarchy.instructor || 'טרם שויך')}</strong><span>${esc(hierarchy.programActivity || '-')}</span>`;
    const details = `<span class="meta-small">${esc([hierarchy.school, hierarchy.authority].filter(Boolean).join(' · ') || '-')}</span><span>${esc(`${hierarchy.meetingsCompleted}/${hierarchy.meetingsTotal || 0} בוצעו`)}</span><span class="meta-small">${esc(hierarchy.endDate || '-')}</span><button class="btn btn-tertiary" data-open-course="${escAttr(getCourseField(item, COURSE_FIELDS.COURSE_ID) || '')}">פרטי קורס</button>`;
    return renderExpandableCard({ summary, details, classes: 'mini-card expandable-card', activityRow: item });
  }).join('') || '<div class="panel-empty">אין מפגשים</div>'}</section>`;
}

function renderMonthSidePanel(items, dateLabel) {
  if (!dateLabel) return '';
  const inner = items.map((item) => {
    const hierarchy = buildCourseHierarchyDetails(item);
    const summary = `<strong>${esc(hierarchy.instructor || 'טרם שויך')}</strong><span>${esc(hierarchy.programActivity || '-')}</span>${hierarchy.school ? `<span class="meta-small">${esc(hierarchy.school)}</span>` : ''}`;
    const details = `<span class="meta-small">${esc([hierarchy.school, hierarchy.authority].filter(Boolean).join(' · ') || '-')}</span><span>${esc(`${hierarchy.meetingsCompleted}/${hierarchy.meetingsTotal || 0} בוצעו`)}</span><span class="meta-small">${esc(hierarchy.endDate || '-')}</span><button class="btn btn-tertiary" data-open-course="${escAttr(getCourseField(item, COURSE_FIELDS.COURSE_ID) || '')}">פרטי קורס</button>`;
    return renderExpandableCard({ summary, details, classes: 'mini-card expandable-card', activityRow: item });
  }).join('') || '<div class="panel-empty">אין מפגשים</div>';
  return `<aside class="month-side-panel" id="monthSidePanel"><div class="month-side-panel-head"><h3 class="section-title">פירוט יום ${esc(formatDate(parseDateLike(dateLabel)) || dateLabel)}</h3><button type="button" class="btn btn-secondary" id="monthCloseDetails">סגור</button></div><div class="month-side-panel-body">${inner}</div></aside>`;
}

function bindMonthActions(monthData) {
  document.getElementById('monthNavPrev')?.addEventListener('click', () => {
    viewState.month.monthDate = addMonthsToMonthString(viewState.month.monthDate || formatMonthInputLocal(new Date()), -1);
    viewState.month.selectedDate = '';
    renderScreen();
  });
  document.getElementById('monthNavNext')?.addEventListener('click', () => {
    viewState.month.monthDate = addMonthsToMonthString(viewState.month.monthDate || formatMonthInputLocal(new Date()), 1);
    viewState.month.selectedDate = '';
    renderScreen();
  });
  document.getElementById('monthApply')?.addEventListener('click', () => {
    viewState.month.monthDate = document.getElementById('monthDate')?.value.trim() || formatMonthInputLocal(new Date());
    viewState.month.filters = {
      authority: document.getElementById('monthAuthority')?.value.trim() || '',
      employee: document.getElementById('monthEmployee')?.value.trim() || '',
      courseManager: document.getElementById('monthCourseManager')?.value.trim() || '',
      program: document.getElementById('monthProgram')?.value.trim() || ''
    };
    renderScreen();
  });
  document.getElementById('monthReset')?.addEventListener('click', () => {
    viewState.month.monthDate = formatMonthInputLocal(new Date());
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
  document.getElementById('monthBackdrop')?.addEventListener('click', () => {
    viewState.month.selectedDate = '';
    renderScreen();
  });
  document.querySelectorAll('[data-open-course]').forEach((button) => button.addEventListener('click', async () => {
    await openCourseFromPlanner(button.dataset.openCourse);
  }));
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
  const options = getUiFilterOptions();
  return `<section class="filters-wrap"><label>רשות<select id="instructorsAuthority">${renderSelectOptions(options.authority, viewState.instructors.filters.authority)}</select></label><label>מנהל מדריכים<select id="instructorsManager">${renderSelectOptions(options.courseManager, viewState.instructors.filters.courseManager)}</select></label><label>תוכנית<select id="instructorsProgram">${renderSelectOptions(options.program, viewState.instructors.filters.program)}</select></label><div class="filter-actions"><button class="btn btn-secondary" id="instructorsApply">סינון</button><button class="btn btn-secondary" id="instructorsReset">נקה סינון</button></div></section>`;
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
      authorities,
      schools,
      hasIssues,
      hasGap,
      workDays: Array.from(workDays),
      workDaysCount: workDays.size
    };
  }).sort((a, b) => b.coursesCount - a.coursesCount);
  return { items, coursesByInstructor };
}

const INSTRUCTOR_PALETTE = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#6366f1'
];
function instructorColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + (name || '').charCodeAt(i)) & 0xffff;
  return INSTRUCTOR_PALETTE[h % INSTRUCTOR_PALETTE.length];
}

function renderInstructorsCards(items) {
  return `<section class="cards-grid instructor-grid instructor-grid-compact">${items.map((item) => {
    const color = instructorColor(item.name);
    const initial = String(item.name || '?')[0].toUpperCase();
    const badges = [
      item.hasIssues ? `<span class="instructor-badge instructor-badge--issues" title="חריגות פתוחות">⚠</span>` : '',
      item.hasGap ? `<span class="instructor-badge instructor-badge--gap" title="פער">⏱</span>` : ''
    ].join('');
    return `
    <article class="management-card instructor-card-tile" role="button" tabindex="0"
      data-instructor-card="${escAttr(item.name)}"
      aria-label="פתח פרטי מדריך ${escAttr(item.name)}"
      style="border-right: 4px solid ${color}">
      <div class="instructor-card-tile-head">
        <span class="instructor-avatar" style="background:${color}">${esc(initial)}</span>
        <div class="instructor-card-tile-name-wrap">
          <h3>${esc(item.name)}</h3>
          ${badges ? `<div class="instructor-badges">${badges}</div>` : ''}
        </div>
      </div>
      <div class="instructor-card-tile-meta"><strong>${esc(String(item.coursesCount))}</strong> קורסים</div>
    </article>`;
  }).join('')}</section>`;
}

function renderInstructorCoursesDetails(instructorName, coursesByInstructor) {
  if (!instructorName) return '';
  const rows = coursesByInstructor[instructorName] || [];
  return `<section class="course-form-modal" id="instructorDetailsModal"><div class="course-form-backdrop" id="instructorCloseDetails"></div><section class="course-form-card instructor-modal-card"><div class="panel-block-head"><h3>פרטי מדריך: ${esc(instructorName)}</h3><button class="btn btn-secondary" id="instructorCloseDetailsButton">סגור</button></div><section class="cards-grid instructor-course-grid">${rows.map((row) => {
    const hierarchy = buildCourseHierarchyDetails(row);
    return `<article class="instructor-course-item">
      <div class="instructor-course-item-head">${esc(hierarchy.programActivity || '-')}</div>
      <div class="instructor-course-item-body">
        <span><strong>בית ספר</strong>${esc(hierarchy.school || '-')}</span>
        <span><strong>רשות</strong>${esc(hierarchy.authority || '-')}</span>
        <span><strong>מנהל קורס</strong>${esc(getCourseField(row, COURSE_FIELDS.COURSE_MANAGER) || '-')}</span>
        <span><strong>בוצעו</strong>${esc(String(hierarchy.meetingsCompleted || 0))} / ${esc(String(hierarchy.meetingsTotal || 0))}</span>
      </div>
    </article>`;
  }).join('') || '<div class="panel-empty">אין קורסים להצגה.</div>'}</section></section></section>`;
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
  function openInstructorCard(name) {
    viewState.instructors.selectedInstructor = String(name || '').trim();
    renderScreen();
  }
  document.querySelectorAll('[data-instructor-card]').forEach((el) => {
    el.addEventListener('click', () => openInstructorCard(el.dataset.instructorCard));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openInstructorCard(el.dataset.instructorCard);
      }
    });
  });
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

function renderMonthStatBadge({ count, label, monthRaw, noun }) {
  const monthLabel = monthRaw
    ? (() => { const [y, m] = monthRaw.split('-'); const d = new Date(Number(y), Number(m) - 1, 1); return d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }); })()
    : '';
  const monthStr = monthLabel ? ` — ${monthLabel}` : '';
  return `<div class="month-stat-badge"><span class="month-stat-count">${count}</span><span class="month-stat-label">${esc(noun)}${esc(monthStr)}</span></div>`;
}

function renderEndDatesFilters() {
  const options = getUiFilterOptions();
  const monthValue = viewState.endDates.filters.month || formatMonthInputLocal(new Date());
  const monthDate = parseMonthValue(monthValue) || new Date();
  const monthLabel = monthDate.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  return `<section class="filters-wrap"><div class="month-nav-centered"><button type="button" class="btn btn-secondary" id="endMonthPrev" aria-label="חודש קודם">◀</button><span class="month-nav-label">${esc(monthLabel)}</span><button type="button" class="btn btn-secondary" id="endMonthNext" aria-label="חודש הבא">▶</button></div><input id="endMonth" type="hidden" value="${escAttr(monthValue)}" /><label>רשות<select id="endAuthority">${renderSelectOptions(options.authority, viewState.endDates.filters.authority)}</select></label><label>מדריך<select id="endEmployee">${renderSelectOptions(options.employee, viewState.endDates.filters.employee)}</select></label><label>מנהל קורס<select id="endManager">${renderSelectOptions(options.courseManager, viewState.endDates.filters.courseManager)}</select></label><div class="filter-actions"><button class="btn btn-secondary" id="endApply">סינון</button><button class="btn btn-secondary" id="endReset">נקה סינון</button></div></section>`;
}

function buildEndDateItems(courses) {
  const monthValue = String(viewState.endDates.filters.month || '').trim();
  const monthStart = parseMonthBoundary(monthValue, 'start');
  const monthEnd = parseMonthBoundary(monthValue, 'end');
  const reviewItems = getStoreSnapshot().reviewItems || [];
  return (courses || []).filter((course) => {
    const endDate = parseDateLike(getCourseField(course, COURSE_FIELDS.END));
    if (!endDate) return false;
    if (monthStart && monthEnd && !isDateInRange(endDate, monthStart, monthEnd)) return false;
    return true;
  }).map((course) => {
    const postpone = parseDelayInfo(getCourseField(course, COURSE_FIELDS.NOTES));
    const hasReviewDelay = hasCourseDelays(course, reviewItems);
    const meetingStats = getMeetingStatsFromDates(course);
    return { ...course, postpone, hasReviewDelay, meetingStats };
  }).sort((a, b) => (parseDateLike(getCourseField(a, COURSE_FIELDS.END))?.getTime() || 0) - (parseDateLike(getCourseField(b, COURSE_FIELDS.END))?.getTime() || 0));
}

function renderEndDateCards(items) {
  return `<section class="cards-grid">${items.map((item) => {
    const hierarchy = buildCourseHierarchyDetails(item);
    const summary = `<div class="card-head"><h3>${esc(hierarchy.programActivity || 'שם קורס לא זמין')}</h3>${(item.postpone.isPostponed || item.hasReviewDelay) ? '<span class="status-chip status-pending-final">נדחה</span>' : ''}</div><div class="card-summary-minimal">${[hierarchy.authority, hierarchy.school].filter(Boolean).map(s => esc(s)).join(' · ')}</div><div class="card-summary-minimal">סיום: ${esc(hierarchy.endDate || '-')}</div>`;
    const details = `${renderCourseHierarchyStrip(item)}<div class="card-meta">
      <span><strong>מפגשים שבוצעו:</strong> ${esc(String(item.meetingStats?.completedCount || 0))} / ${esc(String(item.meetingStats?.total || 0))}</span>
      ${item.meetingStats?.isCompleted ? '' : `<span><strong>מפגש קרוב:</strong> ${esc(item.meetingStats?.nextMeetingDate ? formatDate(item.meetingStats.nextMeetingDate) : '-')}</span>`}
    </div><div class="card-actions"><button class="btn btn-secondary" data-open-course="${escAttr(getCourseField(item, COURSE_FIELDS.COURSE_ID) || '')}">פרטים</button></div>`;
    return renderExpandableCard({ summary, details, activityRow: item.raw || item });
  }).join('')}</section>`;
}

function bindEndDatesActions() {
  document.getElementById('endApply')?.addEventListener('click', () => {
    viewState.endDates.filters = {
      authority: document.getElementById('endAuthority')?.value.trim() || '',
      employee: document.getElementById('endEmployee')?.value.trim() || '',
      courseManager: document.getElementById('endManager')?.value.trim() || '',
      month: document.getElementById('endMonth')?.value.trim() || formatMonthInputLocal(new Date())
    };
    renderScreen();
  });
  document.getElementById('endReset')?.addEventListener('click', () => {
    viewState.endDates.filters = { authority: '', employee: '', courseManager: '', month: formatMonthInputLocal(new Date()) };
    renderScreen();
  });
  document.getElementById('endMonthPrev')?.addEventListener('click', () => {
    viewState.endDates.filters.month = addMonthsToMonthString(viewState.endDates.filters.month || formatMonthInputLocal(new Date()), -1);
    renderScreen();
  });
  document.getElementById('endMonthNext')?.addEventListener('click', () => {
    viewState.endDates.filters.month = addMonthsToMonthString(viewState.endDates.filters.month || formatMonthInputLocal(new Date()), 1);
    renderScreen();
  });
  document.querySelectorAll('[data-open-course]').forEach((button) => button.addEventListener('click', async () => {
    await openCourseFromPlanner(button.dataset.openCourse);
  }));
  const closeCourseDetailsWeekFn = () => {
    viewState.courses.selectedCourseId = '';
    viewState.courses.selectedCourseDetails = null;
    renderScreen();
  };
  document.getElementById('closeCourseDetails')?.addEventListener('click', closeCourseDetailsWeekFn);
  document.getElementById('closeCourseDetailsBackdrop')?.addEventListener('click', closeCourseDetailsWeekFn);
}

function renderExceptionsFilters() {
  const options = getUiFilterOptions();
  return `<section class="filters-wrap"><label>מדריך<select id="exceptionsEmployee">${renderSelectOptions(options.employee, viewState.exceptions.filters.employee)}</select></label><label>רשות<select id="exceptionsAuthority">${renderSelectOptions(options.authority, viewState.exceptions.filters.authority)}</select></label><label>מנהל קורס<select id="exceptionsManager">${renderSelectOptions(options.courseManager, viewState.exceptions.filters.courseManager)}</select></label><label>סטטוס טיפול<select id="exceptionsTreatment">${renderSelectOptions(['open', 'resolved'], viewState.exceptions.filters.treatmentStatus)}</select></label><div class="filter-actions"><button class="btn btn-secondary" id="exceptionsApply">סינון</button><button class="btn btn-secondary" id="exceptionsReset">נקה סינון</button></div></section>`;
}

function buildExceptionsRows(reviewRows, courses, filters) {
  const clean = Object.fromEntries(Object.entries(filters || {}).map(([key, value]) => [key, String(value || '').trim().toLowerCase()]));
  return (courses || []).map((course) => {
    const missingTypes = getExceptionsPageIssues(course);
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
      Date: getCourseField(course, COURSE_DATE_FIELDS[0]) || getCourseField(course, 'Date1') || getCourseField(course, COURSE_FIELDS.END) || '',
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
  return `<section class="cards-grid">${rows.map((row) => {
    const issueChips = (row.MissingTypes || []).map((t) => `<span class="status-chip status-alert">${esc(t)}</span>`).join('');
    const summary = `<div class="card-head"><h3>${esc(row.Program || 'שם קורס לא זמין')}</h3></div><div class="card-summary-minimal">${esc(row.Authority || '-')} · ${esc(row.School || '-')}</div>${issueChips ? `<div class="card-chips">${issueChips}</div>` : ''}`;
    const details = `<div class="card-meta">${row.Employee ? `<span>מדריך: ${esc(row.Employee)}</span>` : ''}<span>מנהל קורס: ${esc(row.CourseManager || '-')}</span></div><div class="card-actions"><button class="btn btn-secondary" data-open-course="${escAttr(row.CourseID || '')}">פרטי קורס</button><button class="btn btn-primary" data-edit-row="${escAttr(row.CourseID || '')}">${canEditMasterCourses() ? 'עריכה' : 'שלח בקשת שינוי'}</button></div>`;
    return renderExpandableCard({ summary, details, activityRow: row });
  }).join('')}</section>`;
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
  bindCourseActions();
}

function financeRowDateRaw(row, field) {
  const keys = [field];
  if (field === 'start_date') keys.push('Date1');
  else if (/^date\d+$/i.test(field)) {
    const m = field.match(/\d+/);
    if (m) keys.push('Date' + m[0]);
  }
  for (let i = 0; i < keys.length; i += 1) {
    const v = row?.[keys[i]];
    if (String(v ?? '').trim()) return v;
  }
  return '';
}

function exportFinanceRowDatesToExcel(item) {
  const programLine = String(item?.Course || item?.Program || item?.CourseID || 'פריט כספי').split(/[,\n|]+/).map((s) => s.trim()).filter(Boolean)[0] || 'פריט כספי';
  const today = endOfDay(new Date());
  const dates = [];
  const seenTs = new Set();
  (COURSE_DATE_FIELDS || []).forEach((field, idx) => {
    const raw = financeRowDateRaw(item, field);
    const parsed = parseDateLike(raw);
    if (parsed) {
      const ts = parsed.getTime();
      if (!seenTs.has(ts)) {
        seenTs.add(ts);
        dates.push({ num: idx + 1, date: formatDate(parsed) || String(raw), past: parsed <= today });
      }
    }
  });
  if (!dates.length) { showToast('לא נמצאו תאריכים לשורה זו', 'error'); return; }
  const headers = ['#', 'תאריך', 'סטטוס'];
  const dataRows = dates.map(({ num, date, past }) => [num, date, past ? 'בוצע' : 'מתוכנן']);
  const tableHtml = `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${dataRows.map((cells) => `<tr>${cells.map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const safeProgram = programLine.replace(/[^\u05D0-\u05EAa-zA-Z0-9]/g, '_').slice(0, 30);
  const filename = `תאריכים_${safeProgram}_${formatIsoDateLocal(new Date())}.xlsx`;
  const blob = new Blob([`\uFEFF${tableHtml}`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function exportFinanceToExcel(rows, filename) {
  if (!rows.length) return;
  const dateHeaders = COURSE_DATE_FIELDS.map((field) => field.toLowerCase());
  const headers = [
    'שם פעילות / תוכנית', 'סוג פעילות', 'רשות', 'בית ספר', 'מימון',
    'מדריך', 'מנהל קורס', 'סטטוס כספי', 'מחיר / גבייה', 'הערות כספים',
    ...dateHeaders
  ];
  const collectPerformedDates = (row) => {
    const values = {};
    const today = endOfDay(new Date());
    const seenTs = new Set();
    COURSE_DATE_FIELDS.forEach((field) => {
      const raw = financeRowDateRaw(row, field);
      const parsed = parseDateLike(raw);
      if (parsed && parsed <= today) {
        const ts = parsed.getTime();
        values[field.toLowerCase()] = !seenTs.has(ts) ? (formatDate(parsed) || String(raw || '')) : '';
        seenTs.add(ts);
      } else {
        values[field.toLowerCase()] = '';
      }
    });
    return values;
  };
  const dataRows = rows.map((row) => {
    const performedDates = collectPerformedDates(row);
    return [
      String(row?.Course || row?.Program || row?.CourseID || ''),
      String(row?.EventType || row?.activity_type || ''),
      String(row?.Authority || ''),
      String(row?.School || ''),
      hebrifyValue(row?.Funding) || String(row?.Funding || ''),
      String(row?.Instructor || row?.Employee || ''),
      String(row?.CourseManager || ''),
      getFinanceStatusLabel(row?.FinanceStatus || row?.finance_status || ''),
      String(row?.Payment || ''),
      String(row?.FinanceNotes || ''),
      ...dateHeaders.map((field) => String(performedDates[field] || ''))
    ];
  });
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

function formatMonthInputLocal(date) {
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonthsToMonthString(monthStr, delta) {
  const d = parseMonthValue(monthStr) || new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  return formatMonthInputLocal(next);
}

function cssEscape(value) {
  return String(value || '').replace(/"/g, '\\"');
}

function getDisplayRoleForInstructor(instructorName, employeeId = '') {
  const permission = (getStoreSnapshot().permissions || []).find((row) => String(row.employeeName || '').trim() === String(instructorName || '').trim()
    || (employeeId && String(row.employeeId || '') === String(employeeId || '')));
  return permission?.displayRole || '';
}

async function loadAdminSettingsView() {
  await withLoad('adminSettings', () => api.getAllSettings(), [], 'לא ניתן לטעון הגדרות.');
}

async function loadAdminListsView() {
  await withLoad('adminLists', () => api.getAllLists(), [], 'לא ניתן לטעון רשימות.');
}

async function loadAdminPermissionsView() {
  await withLoad('adminPermissions', async () => {
    if (initEnginePromise) {
      try {
        await initEnginePromise;
      } catch (e) {
        logUi('admin_permissions_engine_wait_failed', { message: e?.message || String(e || '') });
      }
    }
    const snap = getStoreSnapshot();
    const items = (snap.permissions || []).map((row) => ({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      entryCode: row.entryCode,
      systemRole: row.systemRole,
      displayRole: row.displayRole,
      defaultView: row.defaultView,
      viewScope: row.viewScope,
      editScope: row.editScope,
      allowedViews: row.allowedViews,
      allowedEdits: listEnabledCapabilities(row.capabilities || {}, 'edit_'),
      activeFlag: row.activeFlag
    }));
    return { success: true, data: { items } };
  }, [], 'לא ניתן לטעון הרשאות.');
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
    logUi('login_failed', { hasUserId: Boolean(userId), message: res?.message || '' });
    errorEl.textContent = res?.message || 'ההתחברות נכשלה.';
    button.disabled = false;
    button.classList.remove('is-loading');
    button.textContent = 'התחבר';
    return;
  }
  setUserState(res);
  initEnginePromise = initDataEngine(api, { userState }).catch((error) => {
    logUi('init_data_engine_failed_after_login', { message: error?.message || String(error || '') });
    throw error;
  });
  button.classList.remove('is-loading');
  button.textContent = 'התחבר';
  setRoute(getStartupRoute());
}

const ROUTES_NEEDING_COURSES = new Set([
  'dashboard', 'courses', 'instructor-view', 'week', 'month', 'instructors', 'end-dates', 'exceptions',
  'my-requests', 'approvals', 'eden-view', 'final-approvals'
]);

const ROUTES_NEEDING_RUNTIME_RULES = new Set([
  'dashboard', 'courses', 'instructor-view', 'week', 'month', 'instructors', 'end-dates', 'exceptions'
]);

async function loadRouteData() {
  if (!isAuth()) return;
  if (currentRoute !== 'login' && !getAllowedRoutes().includes(currentRoute)) {
    logUi('current_route_not_allowed', { currentRoute, fallback: getFirstAllowedRoute() });
    setRoute(getFirstAllowedRoute());
    return;
  }
  const needsRules = ROUTES_NEEDING_RUNTIME_RULES.has(currentRoute);
  const needsCourses = ROUTES_NEEDING_COURSES.has(currentRoute);
  if (needsRules || needsCourses) {
    const parallelLoads = [];
    if (needsRules) parallelLoads.push(ensureRuntimeRulesLoaded());
    if (needsCourses) parallelLoads.push(ensureCoursesLoaded());
    await Promise.all(parallelLoads);
  } else if (!runtimeRulesLoaded) {
    void ensureRuntimeRulesLoaded().catch(() => {});
  }
  if (currentRoute === 'admin-home' || currentRoute === 'operations-home') return null;
  if (currentRoute === 'admin-settings') return loadAdminSettingsView();
  if (currentRoute === 'admin-lists') return loadAdminListsView();
  if (currentRoute === 'admin-permissions') {
    if (initEnginePromise) await initEnginePromise.catch(() => {});
    return loadAdminPermissionsView();
  }
  if (currentRoute === 'dashboard') return loadDashboard();
  if (currentRoute === 'courses' || currentRoute === 'instructor-view') return loadCourses();
  if (currentRoute === 'week') return loadWeekView();
  if (currentRoute === 'month') return loadMonthView();
  if (currentRoute === 'instructors') return loadInstructorsView();
  if (currentRoute === 'end-dates') return loadEndDatesView();
  if (currentRoute === 'exceptions') return loadExceptionsView();
  if (currentRoute === 'contacts') return loadContactsView();
  if (currentRoute === 'finance') return loadFinanceView();
  if (currentRoute === 'my-requests') return loadMyRequests();
  if (currentRoute === 'approvals' || currentRoute === 'final-approvals') return loadApprovals();
  if (currentRoute === 'eden-view') return loadEdenView();
}

async function loadDashboard() {
  await withLoad('dashboard', async () => {
    const [dashboardRes] = await Promise.all([
      api.getDashboard(),
      ensureCoursesLoaded()
    ]);
    if (!dashboardRes?.success) return dashboardRes;
    const allActivities = getCoursesForUser(userState, {}).filter(isCourseShownOnCoursesScreen);
    const allActivityCourses = allActivities.filter(isCourseActivity);
    const courses = allActivityCourses.filter((row) => !isCourseCompleted(row));
    return {
      success: true,
      data: withOperationalMetrics(dashboardRes.data || {}, courses, { endingCourses: allActivityCourses, allActivities })
    };
  }, null, 'לא ניתן לטעון דשבורד.');
}
async function loadCourses(options = {}) {
  const { silent = false, forceRefreshCourseId = '' } = options;
  await ensureCoursesLoaded();
  if (!silent) {
    viewState.courses.loading = true;
    viewState.courses.error = '';
    renderScreen();
  }
  if (forceRefreshCourseId) {
    await refreshCourse(forceRefreshCourseId);
  }
  const filtered = getCoursesForUser(userState, viewState.courses.filters).filter(isCourseActivity);
  viewState.courses.loading = false;
  viewState.courses.error = '';
  viewState.courses.data = applyCoursesFiltersByUiScope(filtered, viewState.courses.filters).filter(isCourseShownOnCoursesScreen);
  viewState.courses.filterOptions = buildFilterOptions(getCoursesForUser(userState, {}).filter(isCourseActivity));
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

async function loadContactsView() {
  await withLoad('contacts', async () => {
    const rows = await loadContacts();
    return { success: true, data: { items: Array.isArray(rows) ? rows : [] } };
  }, [], 'לא ניתן לטעון אנשי קשר.');
}

async function loadFinanceView(options = {}) {
  const { silent = false, force = false } = options;
  if (!viewState.finance.displayMonth) {
    viewState.finance.displayMonth = formatMonthInputLocal(new Date());
  }
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

const FINANCE_VALUE_HEB = {
  'authority': 'רשות',
  'municipality': 'עירייה',
  'municipal': 'עירייה',
  'school': 'בית ספר',
  'ministry': 'משרד החינוך',
  'ministry of education': 'משרד החינוך',
  'government': 'ממשלה',
  'fund': 'קרן',
  'foundation': 'קרן',
  'self': 'עצמי',
  'parents': 'הורים',
  'parent': 'הורים',
  'budget': 'תקציב',
  'joint': 'שותפות',
  'taasiyeda': 'תעשיידע',
  'other': 'אחר',
  'none': '-',
  'yes': 'כן',
  'no': 'לא',
  'true': 'כן',
  'false': 'לא',
};
function hebrifyValue(val) {
  if (!val) return val;
  const str = String(val).trim();
  const lower = str.toLowerCase();
  return FINANCE_VALUE_HEB[lower] || str;
}

function getFinanceStatusBucket(statusValue) {
  const clean = String(statusValue || '').trim().toLowerCase();
  if (clean === 'closed') return { key: 'completed', label: 'סגור' };
  return { key: 'open', label: 'פתוח' };
}

function summarizeFinanceBuckets(rows = []) {
  return (rows || []).reduce((acc, item) => {
    const bucket = getFinanceStatusBucket(item?.FinanceStatus);
    if (bucket.key === 'completed') acc.completed += 1;
    else acc.open += 1;
    return acc;
  }, { open: 0, completed: 0 });
}
async function loadEdenView() {
  viewState.eden.loading = true; viewState.eden.error = ''; renderScreen();
  const queueRes = await api.getEdenView();
  viewState.eden.loading = false;
  if (!queueRes?.success) {
    viewState.eden.error = queueRes?.message || 'לא ניתן לטעון את תצוגת עדן.';
    viewState.eden.data = { queue: [], exceptions: [], counters: {} };
    renderScreen();
    return;
  }
  const courses = getStoreSnapshot().courses || [];
  viewState.eden.data = {
    queue: queueRes?.data?.items || [],
    exceptions: buildExceptionRecords(courses),
    counters: queueRes?.data?.counters || {}
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
    const missingTypes = getExceptionsPageIssues(course);
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
    out[fieldName] = parseDateLike(courseMeetingDateRaw(raw, fieldName));
  });
  out[COURSE_FIELDS.END] = parseDateLike(raw[COURSE_FIELDS.END]);
  return out;
}

function courseOverlapsSelectedMonth(row, monthValue) {
  const raw = String(monthValue || '').trim();
  if (!raw) return true;
  const ms = parseMonthBoundary(raw, 'start');
  const me = parseMonthBoundary(raw, 'end');
  if (!ms || !me) return true;
  if (getScheduleDates(row).some((d) => d >= startOfDay(ms) && d <= endOfDay(me))) return true;
  const end = parseDateLike(getCourseField(row, COURSE_FIELDS.END));
  if (end && isDateInRange(end, ms, me)) return true;
  const start = firstDate(row, COURSE_DATE_RANGE_FIELDS);
  if (start && end) {
    if (!(end < startOfDay(ms) || start > endOfDay(me))) return true;
  } else if (start && start <= endOfDay(me)) return true;
  else if (end && end >= startOfDay(ms)) return true;
  return false;
}

function buildCourseMonthSelectOptions(selectedValue) {
  const now = new Date();
  const selected = String(selectedValue || '').trim();
  const opts = ['<option value="">כל החודשים</option>'];
  for (let offset = -12; offset <= 12; offset += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    const sel = val === selected ? ' selected' : '';
    opts.push(`<option value="${escAttr(val)}"${sel}>${esc(label)}</option>`);
  }
  return opts.join('');
}

function applyCoursesFiltersByUiScope(rows, filters) {
  const list = Array.isArray(rows) ? rows : [];
  const rawFilters = filters || {};
  const courseMonthRaw = String(rawFilters.courseMonth || '').trim();
  const clean = Object.fromEntries(Object.entries(rawFilters).map(([key, value]) => [key, String(value || '').trim().toLowerCase()]));
  return list.filter((row) => {
    if (clean.activityType && String(getCourseField(row, COURSE_FIELDS.EVENT_TYPE) || row?.EventType || '').toLowerCase() !== clean.activityType) return false;
    if (clean.authority && !String(getCourseField(row, COURSE_FIELDS.AUTHORITY) || '').toLowerCase().includes(clean.authority)) return false;
    if (clean.school && !String(getCourseField(row, COURSE_FIELDS.SCHOOL) || '').toLowerCase().includes(clean.school)) return false;
    if (clean.courseManager && !String(getCourseField(row, COURSE_FIELDS.COURSE_MANAGER) || '').toLowerCase().includes(clean.courseManager)) return false;
    if (clean.employee && !String(resolveInstructorName(row) || '').toLowerCase().includes(clean.employee)) return false;
    if (clean.program) {
      const text = `${String(getCourseField(row, COURSE_FIELDS.PROGRAM) || '')} ${String(getCourseField(row, COURSE_FIELDS.PROGRAM_CODE) || '')}`.toLowerCase();
      if (!text.includes(clean.program)) return false;
    }
    if (courseMonthRaw && !courseOverlapsSelectedMonth(row, courseMonthRaw)) return false;
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
  if (hasCapability('view_admin') || hasCapability('edit_admin')) return true;
  const managerName = String(getCourseField(row, COURSE_FIELDS.COURSE_MANAGER) || '').trim();
  const instructorManager = String(getCourseField(row, COURSE_FIELDS.INSTRUCTOR_MANAGER) || '').trim();
  const currentName = String(userState.displayName || '').trim();
  if (!currentName) return false;
  return managerName === currentName || instructorManager === currentName;
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
  if (s === 'eden_saved') return 'נשמר אצל עדן';
  if (s === 'eden_approved') return 'אושר לתצוגת בקרה ותפעול';
  if (s === 'pending_final') return 'ממתין לאישור סופי';
  if (s === 'final_approved') return 'אושר לדאטה הראשית';
  if (s === 'final_rejected') return 'נדחה סופית';
  if (s === 'closed') return 'נסגר';
  if (s === 'declined') return 'נדחה';
  return 'ללא סטטוס';
}
function statusClass(status) { return `status-${String(status || '').toLowerCase().replace('_', '-') || 'none'}`; }
function getFinanceStatusLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'closed' ? 'סגור' : 'פתוח';
}
function esc(v) { return String(v || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escAttr(v) { return esc(v).replace(/"/g, '&quot;'); }

function withOperationalMetrics(baseData, courses, options = {}) {
  const allActivities = Array.isArray(options.allActivities) ? options.allActivities : courses;
  const endingCourses = Array.isArray(options.endingCourses) ? options.endingCourses : courses;
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const activeThisMonth = allActivities.filter((row) => isActiveInMonthByStatusAndDates(row, currentMonthStart, currentMonthEnd));
  const managers = ['גיל נאמן', 'לינוי שמואל מזרחי'];
  const activeByManager = {};
  const endingByManager = {};
  const instructorsByManager = {};
  const requiresTreatmentByManager = {};
  managers.forEach((managerName) => {
    const managerCourses = endingCourses.filter((row) => String(getCourseField(row, COURSE_FIELDS.COURSE_MANAGER) || '').trim() === managerName);
    const managerEndingCourses = endingCourses.filter((row) => String(getCourseField(row, COURSE_FIELDS.COURSE_MANAGER) || '').trim() === managerName);
    const managerActiveCourses = managerCourses.filter((row) => isActiveInMonthByStatusAndDates(row, currentMonthStart, currentMonthEnd));
    instructorsByManager[managerName] = new Set(managerCourses.map((row) => resolveInstructorName(row)).filter(Boolean)).size;
    endingByManager[managerName] = managerEndingCourses.filter((row) => {
      const endDate = firstDate(row, [COURSE_FIELDS.END_DATE, COURSE_FIELDS.END]);
      return isDateInRange(endDate, currentMonthStart, currentMonthEnd);
    }).length;
    requiresTreatmentByManager[managerName] = managerCourses.filter((row) => getExceptionsPageIssues(row).length > 0).length;
    activeByManager[managerName] = managerActiveCourses.length;
  });
  const missing = courses.map((row) => getExceptionsPageIssues(row));
  const activeWorkshopsNow = courses.filter((row) => String(getCourseField(row, COURSE_FIELDS.ACTIVITY) || '').includes('סדנה'));
  const activeToursNow = courses.filter((row) => String(getCourseField(row, COURSE_FIELDS.ACTIVITY) || '').includes('סיור'));
  return {
    ...baseData,
    totalCoursesCount: courses.length,
    workshopsCount: activeWorkshopsNow.length,
    toursCount: activeToursNow.length,
    endingCurrentMonthCount: endingCourses.filter((row) => {
      const endDate = firstDate(row, [COURSE_FIELDS.END_DATE, COURSE_FIELDS.END]);
      return isDateInRange(endDate, currentMonthStart, currentMonthEnd);
    }).length,
    activeThisMonthCount: activeThisMonth.length,
    activeByManager,
    endingByManager,
    instructorsByManager,
    requiresTreatmentByManager,
    missingHoursCount: missing.filter((types) => types.includes('ללא שעות')).length,
    missingDateCount: missing.filter((types) => types.includes(EXCEPTION_MISSING_START_DATE)).length,
    missingInstructorCount: missing.filter((types) => types.includes('ללא מדריך')).length,
    totalExceptionsCount: missing.filter((types) => (types || []).length > 0).length,
    instructorsCount: new Set(endingCourses.map((row) => resolveInstructorName(row)).filter(Boolean)).size,
    juneEndingCount: endingCourses.filter((row) => isCourseEndInJune2026(row)).length
  };
}


function isClosedByStatus(row = {}) {
  const statusText = String(getCourseField(row, COURSE_FIELDS.STATUS) || row?.WorkflowStatus || '').trim().toLowerCase();
  return ['closed', 'ended', 'completed', 'הסתיים', 'הושלם', 'סגור'].some((marker) => statusText.includes(marker));
}

function isActiveInMonthByStatusAndDates(row, monthStart, monthEnd) {
  if (runtimeRules.useStatusWithDates && isClosedByStatus(row)) return false;
  const scheduleDates = getScheduleDates(row);
  if (scheduleDates.some((d) => isDateInRange(d, monthStart, monthEnd))) return true;
  const start = firstDate(row, [COURSE_DATE_FIELDS[0], COURSE_FIELDS.START_DATE, 'start_date']);
  const end = firstDate(row, [COURSE_FIELDS.END_DATE, COURSE_FIELDS.END]);
  if (start && end) return !(end < monthStart || start > monthEnd);
  return false;
}

function isActiveByStatusAndDates(row, refDate = new Date()) {
  if (runtimeRules.useStatusWithDates && isClosedByStatus(row)) return false;
  return isActiveCourse(row, refDate);
}

async function openCourseFromPlanner(courseId) {
  const row = findCourseById(courseId);
  if (!row) return;
  viewState.courses.quickFilter = '';
  viewState.courses.filters = { authority: '', school: '', courseManager: '', employee: '', courseMonth: '', activityType: '' };
  viewState.uiContext.coursesSubtitle = 'נפתח מהתצוגה השבועית/חודשית';
  viewState.courses.selectedCourseId = String(row.CourseID || '');
  viewState.courses.selectedCourseDetails = row;
  await loadCourseMeetings(row.CourseID);
  showToast(`נפתח קורס: ${getBusinessCourseName(row)}`, 'info', 2200);
  setRoute('courses');
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
    const activity = row?.EventType || row?.Program || 'שם קורס לא זמין';
    const instructor = resolveInstructorName(row) || '';
    const location = joinLocation(row);
    if (!instructor) items.push({ type: 'חסר מדריך', activity: activity, instructor: '', location: location, filter: 'unassigned_instructor' });
    if (isMissingReport(row)) items.push({ type: 'חסר דיווח', activity: activity, instructor: instructor, location: location, filter: 'missing_report' });
    if (hasException(row)) items.push({ type: getExceptionsPageIssues(row).join(' / '), activity: activity, instructor: instructor, location: location, filter: 'exceptions' });
    if (hasOperationalIssue(row)) {
      items.push({ type: 'דורש בקרה', activity: activity, instructor: instructor, location: location, filter: 'needs_review' });
    }
    if (isDateInRange(firstDate(row, ['End', 'End']), new Date(), new Date(new Date().getTime() + (7 * 24 * 60 * 60 * 1000)))) {
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
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const nextWorker = registration.installing;
          if (!nextWorker) return;
          nextWorker.addEventListener('statechange', () => {
            if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        });
      })
      .catch(() => {});
  });
}

function registerGlobalCardCloseBehavior() {
  return undefined;
}

async function boot() {
  hydrateUserState();
  if (isAuth()) {
    initEnginePromise = initDataEngine(api, { userState }).catch((error) => {
      logUi('init_data_engine_failed_on_boot', { message: error?.message || String(error || '') });
      throw error;
    });
    setRoute(getStartupRoute());
    void api.getSessionProfile().then((profile) => {
      if (profile?.authenticated) {
        logUi('session_restored', { userId: String(profile?.userId || '') ? 'present' : 'missing' });
        setUserState(profile);
        return;
      }
      logUi('session_restore_failed', { message: profile?.message || 'not_authenticated' });
      clearUserState();
      resetClientDataStore();
      api.clearCache?.();
      setRoute('login');
    }).catch((error) => {
      logUi('session_restore_failed_network', { message: error?.message || String(error || '') });
    });
    return;
  }
  setRoute('login');
}

registerServiceWorker();
registerGlobalCardCloseBehavior();
boot();
