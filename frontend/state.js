const STORAGE_KEY = 'p2026_user_state';

const baseState = {
  authenticated: false,
  userId: '',
  EmployeeID: '',
  emp_id: '',
  BaseRole: '',
  SystemRole: '',
  role: '',
  DisplayRole: '',
  ViewScope: '',
  EditScope: '',
  ApprovalScope: '',
  UiProfile: '',
  DefaultView: '',
  default_view: '',
  name: '',
  EmployeeName: '',
  active: '',
  manager: '',
  AllowedViews: [],
  Capabilities: {},
  IsDualMode: '',
  TeamScope: '',
  AccessScope: '',
  displayName: '',
  CanAccessFinance: false,
  CanEditFinance: false,
  CanAccessFinanceArchive: false,
  CanEditFinanceArchive: false
};

export const userState = { ...baseState };

function persist() {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(userState));
}

function pickAllowed(next) {
  const name = String(next?.name || next?.displayName || next?.EmployeeName || '').trim();
  const role = String(next?.role || next?.SystemRole || '').trim();
  const defaultView = String(next?.default_view || next?.DefaultView || next?.UiProfile || '').trim();
  const empId = String(next?.EmployeeID || next?.userId || next?.emp_id || '').trim();
  return {
    authenticated: Boolean(next?.authenticated),
    userId: String(next?.userId || ''),
    EmployeeID: empId,
    emp_id: empId,
    BaseRole: String(next?.BaseRole || ''),
    SystemRole: role,
    role,
    DisplayRole: String(next?.DisplayRole || role || ''),
    ViewScope: String(next?.ViewScope || next?.viewScope || next?.view_scope || ''),
    EditScope: String(next?.EditScope || next?.editScope || next?.edit_scope || ''),
    ApprovalScope: String(next?.ApprovalScope || next?.approvalScope || ''),
    UiProfile: String(next?.UiProfile || defaultView || ''),
    DefaultView: defaultView,
    default_view: defaultView,
    name,
    EmployeeName: String(next?.EmployeeName || name || ''),
    active: String(next?.active || next?.ActiveFlag || '').trim(),
    manager: String(next?.manager || next?.InstructorManager || '').trim(),
    AllowedViews: Array.isArray(next?.AllowedViews) ? next.AllowedViews.map((v) => String(v || '').trim()).filter(Boolean) : [],
    Capabilities: (next?.Capabilities && typeof next.Capabilities === 'object' && !Array.isArray(next.Capabilities)) ? { ...next.Capabilities } : {},
    IsDualMode: String(next?.IsDualMode || ''),
    TeamScope: String(next?.TeamScope || ''),
    AccessScope: String(next?.AccessScope || ''),
    displayName: String(next?.displayName || name || ''),
    CanAccessFinance: Boolean(next?.CanAccessFinance),
    CanEditFinance: Boolean(next?.CanEditFinance),
    CanAccessFinanceArchive: Boolean(next?.CanAccessFinanceArchive),
    CanEditFinanceArchive: Boolean(next?.CanEditFinanceArchive)
  };
}

export function hydrateUserState() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    setUserState(JSON.parse(raw));
  } catch (error) {
    console.warn('[session:hydrate_failed]', { reason: error?.message || String(error || '') });
    clearUserState();
  }
}

export function setUserState(next) {
  Object.assign(userState, pickAllowed(next));
  if (userState.authenticated && !userState.userId) {
    console.warn('[session:invalid_user_state]', { authenticated: true, hasUserId: false });
  }
  persist();
}

export function clearUserState() {
  Object.assign(userState, baseState);
  persist();
}
