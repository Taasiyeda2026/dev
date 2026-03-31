var CONFIG = (function () {
  var SHEETS = {
    DATA_MASTER: 'DATA_MASTER',
    COURSES: 'COURSES',
    PERMISSIONS: 'PERMISSIONS',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    DASHBOARD_EXPORT: 'DASHBOARD_EXPORT',
    EDIT_REQUESTS: 'EDIT_REQUESTS'
  };

  var STRUCTURE = {
    HEADER_ROW: 1,
    DISPLAY_ROW: 2,
    DATA_START_ROW: 3
  };

  var EDIT_REQUESTS_HEADER_ROW = [
    'RequestID',
    'CourseID',
    'RequestedBy',
    'RequestedAt',
    'ApprovalStatus',
    'ApprovalNotes',
    'ChangeSummary',
    'OriginalData',
    'RequestedData',
    'EditableBy',
    'AssignedEditor',
    'Date',
    'Day',
    'StartTime',
    'EndTime',
    'ClassGroup',
    'ActualMeetings',
    'CourseManager',
    'Instructor',
    'Notes'
  ];

  var EDIT_REQUESTS_DISPLAY_ROW = [
    'מזהה בקשה',
    'מזהה קורס',
    'מבקש',
    'תאריך בקשה',
    'סטטוס אישור',
    'הערות אישור',
    'תקציר שינוי',
    'נתונים מקוריים',
    'נתונים מבוקשים',
    'ניתן לעריכה על ידי',
    'עורך משויך',
    'תאריך',
    'יום',
    'שעת התחלה',
    'שעת סיום',
    'כיתה / קבוצה',
    'מספר מפגשים בפועל',
    'מנהל קורס',
    'מדריך',
    'הערות'
  ];

  var FIELDS = {
    USER_ID: ['UserID', 'EmployeeID', 'LoginID', 'מזהה משתמש', 'מספר עובד'],
    DISPLAY_NAME: ['DisplayName', 'EmployeeName', 'שם מלא', 'שם עובד'],
    LOGIN_CODE: ['LoginCode', 'EntryCode', 'Password', 'קוד כניסה'],
    BASE_ROLE: ['BaseRole', 'תפקיד בסיס'],
    SYSTEM_ROLE: ['SystemRole', 'תפקיד מערכת'],
    ACCESS_SCOPE: ['AccessScope', 'תחום גישה']
  };

  EDIT_REQUESTS_HEADER_ROW.forEach(function (field) {
    FIELDS[field] = [field];
  });

  var FRONTEND_FIELDS = {
    COURSES: ['CourseID', 'Program', 'Status'],
    REQUESTS: EDIT_REQUESTS_HEADER_ROW.slice(),
    APPROVALS: EDIT_REQUESTS_HEADER_ROW.slice()
  };

  var STATUSES = {
    DRAFT: 'Draft',
    PENDING: 'Pending',
    APPROVED: 'Approved',
    DECLINED: 'Declined'
  };

  return {
    SHEETS: SHEETS,
    STRUCTURE: STRUCTURE,
    FIELDS: FIELDS,
    FRONTEND_FIELDS: FRONTEND_FIELDS,
    STATUSES: STATUSES,
    EDIT_REQUESTS_HEADER_ROW: EDIT_REQUESTS_HEADER_ROW,
    EDIT_REQUESTS_DISPLAY_ROW: EDIT_REQUESTS_DISPLAY_ROW,
    REQUESTS_SOURCE_SHEET: 'EDIT_REQUESTS',
    SESSION_KEY: 'P2026_SESSION'
  };
})();
