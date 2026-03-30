var AuthService = (function () {
  function login(loginInput, codeInput) {
    var userText = Utils.normalize(loginInput);
    var codeText = Utils.normalize(codeInput);

    if (Utils.isEmpty(userText) || Utils.isEmpty(codeText)) {
      return { success: false, message: 'יש למלא שם משתמש/מספר עובד וקוד כניסה.' };
    }

    var table = SheetService.getRecords(CONFIG.SHEETS.PERMISSIONS, true);
    var idx = SheetService.resolveFieldIndexes(table.headers, CONFIG.FIELD_ALIASES);

    if (idx.EmployeeID === -1 && idx.EmployeeName === -1) {
      return { success: false, message: 'לא נמצאה עמודת זיהוי משתמש בגיליון ההרשאות.' };
    }
    if (idx.LoginCode === -1) {
      return { success: false, message: 'לא נמצאה עמודת קוד כניסה בגיליון ההרשאות.' };
    }

    var userLower = userText.toLowerCase();
    var matchRow = null;

    table.rows.some(function (row) {
      var employeeId = idx.EmployeeID > -1 ? Utils.normalize(row[idx.EmployeeID]) : '';
      var employeeName = idx.EmployeeName > -1 ? Utils.normalize(row[idx.EmployeeName]) : '';
      var loginCode = Utils.normalize(row[idx.LoginCode]);

      var idMatch = employeeId && employeeId.toLowerCase() === userLower;
      var nameMatch = employeeName && employeeName.toLowerCase() === userLower;
      var codeMatch = loginCode === codeText;

      if ((idMatch || nameMatch) && codeMatch) {
        matchRow = row;
        return true;
      }
      return false;
    });

    if (!matchRow) {
      return { success: false, message: 'שם המשתמש או קוד הכניסה שגויים.' };
    }

    var profile = {
      EmployeeName: idx.EmployeeName > -1 ? Utils.normalize(matchRow[idx.EmployeeName]) : '',
      EmployeeID: idx.EmployeeID > -1 ? Utils.normalize(matchRow[idx.EmployeeID]) : '',
      BaseRole: idx.BaseRole > -1 ? Utils.normalize(matchRow[idx.BaseRole]) : '',
      SystemRole: idx.SystemRole > -1 ? Utils.normalize(matchRow[idx.SystemRole]) : '',
      AccessScope: idx.AccessScope > -1 ? Utils.normalize(matchRow[idx.AccessScope]) : '',
      Flags: extractFlags(table.headers, matchRow)
    };

    storeSession(profile);

    return {
      success: true,
      message: 'התחברת בהצלחה.',
      userProfile: profile
    };
  }

  function extractFlags(headers, row) {
    var flags = {};
    headers.forEach(function (header, i) {
      if (/^Can|^Allow|הרשאה|Permission/i.test(header)) {
        flags[header] = row[i];
      }
    });
    return flags;
  }

  function storeSession(profile) {
    var expiresAt = Date.now() + CONFIG.SETTINGS.SESSION_TTL_MINUTES * 60 * 1000;
    var payload = {
      userProfile: profile,
      expiresAt: expiresAt
    };

    PropertiesService.getUserProperties().setProperty(
      CONFIG.SETTINGS.SESSION_KEY,
      JSON.stringify(payload)
    );
  }

  function getSession() {
    var raw = PropertiesService.getUserProperties().getProperty(CONFIG.SETTINGS.SESSION_KEY);
    if (!raw) return null;

    try {
      var parsed = JSON.parse(raw);
      if (!parsed.expiresAt || Date.now() > parsed.expiresAt) {
        logout();
        return null;
      }
      return parsed.userProfile || null;
    } catch (err) {
      logout();
      return null;
    }
  }

  function isLoggedIn() {
    return !!getSession();
  }

  function logout() {
    PropertiesService.getUserProperties().deleteProperty(CONFIG.SETTINGS.SESSION_KEY);
    return { success: true };
  }

  return {
    login: login,
    getSession: getSession,
    isLoggedIn: isLoggedIn,
    logout: logout
  };
})();
