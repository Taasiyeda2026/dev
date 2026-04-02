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
  IsDualMode: '',
  TeamScope: '',
  AccessScope: '',
  displayName: ''
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
    IsDualMode: String(next?.IsDualMode || ''),
    TeamScope: String(next?.TeamScope || ''),
    AccessScope: String(next?.AccessScope || ''),
    displayName: String(next?.displayName || '')
  };
}

export function hydrateUserState() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    setUserState(JSON.parse(raw));
  } catch (error) {
    clearUserState();
  }
}

export function setUserState(next) {
  Object.assign(userState, pickAllowed(next));
  persist();
}

export function clearUserState() {
  Object.assign(userState, baseState);
  persist();
}
