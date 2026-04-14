const STORAGE_KEY = 'p2026_user_state';

const baseState = {
  authenticated: false,
  userId: '',
  EmployeeID: '',
  BaseRole: '',
  SystemRole: '',
  DisplayRole: '',
  ViewScope: '',
  EditScope: '',
  ApprovalScope: '',
  UiProfile: '',
  DefaultView: '',
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
  return {
    authenticated: Boolean(next?.authenticated),
    userId: String(next?.userId || ''),
    EmployeeID: String(next?.EmployeeID || ''),
    BaseRole: String(next?.BaseRole || ''),
    SystemRole: String(next?.SystemRole || ''),
    DisplayRole: String(next?.DisplayRole || ''),
    ViewScope: String(next?.ViewScope || ''),
    EditScope: String(next?.EditScope || ''),
    ApprovalScope: String(next?.ApprovalScope || ''),
    UiProfile: String(next?.UiProfile || ''),
    DefaultView: String(next?.DefaultView || next?.UiProfile || ''),
    AllowedViews: Array.isArray(next?.AllowedViews) ? next.AllowedViews.map((v) => String(v || '').trim()).filter(Boolean) : [],
    Capabilities: (next?.Capabilities && typeof next.Capabilities === 'object' && !Array.isArray(next.Capabilities)) ? { ...next.Capabilities } : {},
    IsDualMode: String(next?.IsDualMode || ''),
    TeamScope: String(next?.TeamScope || ''),
    AccessScope: String(next?.AccessScope || ''),
    displayName: String(next?.displayName || ''),
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
