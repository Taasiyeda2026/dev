var CONFIG = (function () {
  var SHEETS = {
    DATA_MASTER: 'DATA_MASTER',
    COURSES: 'COURSES',
    PERMISSIONS: 'PERMISSIONS',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    DASHBOARD_EXPORT: 'DASHBOARD_EXPORT',
    EDIT_REQUESTS: 'EDIT_REQUESTS'
  };

  var FIELD_ALIASES = {
    EmployeeName: ['EmployeeName', 'שם עובד', 'שם המדריך', 'שם'],
    EmployeeID: ['EmployeeID', 'EmployeeId', 'מספר עובד', 'תעודת זהות'],
    BaseRole: ['BaseRole', 'תפקיד בסיס', 'Role'],
    SystemRole: ['SystemRole', 'תפקיד מערכת'],
    AccessScope: ['AccessScope', 'תחום גישה', 'Scope'],
    LoginCode: ['EntryCode', 'LoginCode', 'קוד כניסה', 'Password', 'סיסמה'],
    Program: ['Program', 'תוכנית', 'שם תוכנית'],
    CourseID: ['CourseID', 'CourseId', 'קורס', 'מזהה קורס'],
    PlannedMeetings: ['PlannedMeetings', 'מתוכנן', 'מפגשים מתוכננים'],
    ActualMeetings: ['ActualMeetings', 'בוצע', 'מפגשים שבוצעו'],
    StartTime: ['StartTime', 'שעת התחלה', 'Start'],
    EndTime: ['EndTime', 'שעת סיום', 'End'],
    Status: ['Status', 'סטטוס', 'מצב'],
    Active: ['Active', 'פעיל', 'IsActive']
  };

  var ROLES = {
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    INSTRUCTOR: 'INSTRUCTOR',
    VIEWER: 'VIEWER'
  };

  var SETTINGS = {
    SESSION_KEY: 'APP_SESSION_V1',
    SESSION_TTL_MINUTES: 240,
    DEFAULT_PAGE_TITLE: 'מערכת ניהול ארצית',
    ACTIVE_VALUE_CANDIDATES: ['פעיל', 'active', 'כן', 'true', '1']
  };

  return {
    SHEETS: SHEETS,
    FIELD_ALIASES: FIELD_ALIASES,
    ROLES: ROLES,
    SETTINGS: SETTINGS
  };
})();
