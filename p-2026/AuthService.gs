var AuthService = (function () {
  function login(userIdInput, codeInput) {
    try {
      var userId = Utils.normalize(userIdInput);
      var code = Utils.normalize(codeInput);
      if (Utils.isEmpty(userId) || Utils.isEmpty(code)) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var table = SheetService.readTable(CONFIG.SHEETS.PERMISSIONS, true);
      var h = table.headers;

      var idxUser = SheetService.resolveIndex(h, CONFIG.FIELDS.USER_ID);
      var idxCode = SheetService.resolveIndex(h, CONFIG.FIELDS.LOGIN_CODE);
      var idxBaseRole = SheetService.resolveIndex(h, CONFIG.FIELDS.BASE_ROLE);
      var idxSystemRole = SheetService.resolveIndex(h, CONFIG.FIELDS.SYSTEM_ROLE);
      var idxScope = SheetService.resolveIndex(h, CONFIG.FIELDS.ACCESS_SCOPE);
      var idxName = SheetService.resolveIndex(h, CONFIG.FIELDS.DISPLAY_NAME);

      if (idxUser === -1 || idxCode === -1) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var match = null;
      table.rows.some(function (row) {
        var sameUser = Utils.toKey(row[idxUser]) === Utils.toKey(userId);
        var sameCode = Utils.normalize(row[idxCode]) === code;
        if (sameUser && sameCode) {
          match = row;
          return true;
        }
        return false;
      });

      if (!match) return { authenticated: false, message: 'ההתחברות נכשלה.' };

      var profile = {
        authenticated: true,
        userId: Utils.normalize(match[idxUser]),
        BaseRole: idxBaseRole > -1 ? Utils.normalize(match[idxBaseRole]) : '',
        SystemRole: idxSystemRole > -1 ? Utils.normalize(match[idxSystemRole]) : '',
        AccessScope: idxScope > -1 ? Utils.normalize(match[idxScope]) : '',
        displayName: idxName > -1 ? Utils.normalize(match[idxName]) : ''
      };

      PropertiesService.getUserProperties().setProperty(CONFIG.SESSION_KEY, JSON.stringify(profile));
      return profile;
    } catch (err) {
      return { authenticated: false, message: 'ההתחברות נכשלה.' };
    }
  }

  function getSession() {
    try {
      var raw = PropertiesService.getUserProperties().getProperty(CONFIG.SESSION_KEY);
      if (!raw) return null;
      var profile = JSON.parse(raw);
      if (!profile || !profile.authenticated || Utils.isEmpty(profile.userId)) return null;
      return profile;
    } catch (err) {
      return null;
    }
  }

  function logout() {
    PropertiesService.getUserProperties().deleteProperty(CONFIG.SESSION_KEY);
    return { success: true };
  }

  function canAccessApprovals(profile) {
    if (!profile) return false;
    var roleText = (Utils.normalize(profile.BaseRole) + ' ' + Utils.normalize(profile.SystemRole)).toLowerCase();
    return /(master|admin|approval|approver|מנהל|מאשר|מאסטר)/.test(roleText);
  }

  return {
    login: login,
    getSession: getSession,
    logout: logout,
    canAccessApprovals: canAccessApprovals
  };
})();
