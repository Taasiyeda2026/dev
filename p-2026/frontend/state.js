export const userState = {
  authenticated: false,
  userId: '',
  BaseRole: '',
  SystemRole: '',
  AccessScope: '',
  displayName: ''
};

export function setUserState(next) {
  Object.assign(userState, next || {});
}

export function clearUserState() {
  setUserState({ authenticated: false, userId: '', BaseRole: '', SystemRole: '', AccessScope: '', displayName: '' });
}
