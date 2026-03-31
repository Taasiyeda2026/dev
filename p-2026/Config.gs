var CONFIG = (function () {
  var SHEETS = {
    DATA_MASTER: 'DATA_MASTER',
    COURSES: 'COURSES',
    PERMISSIONS: 'PERMISSIONS',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    EDIT_REQUESTS: 'EDIT_REQUESTS',
    DASHBOARD_EXPORT: 'DASHBOARD_EXPORT'
  };

  var STRUCTURE = {
    HEADER_ROW: 1,
    DISPLAY_ROW: 2,
    DATA_START_ROW: 3
  };

  var FIELDS = {
    USER_ID: ['UserID', 'EmployeeID', 'LoginID', 'מזהה משתמש', 'מספר עובד'],
    DISPLAY_NAME: ['DisplayName', 'EmployeeName', 'שם מלא', 'שם עובד'],
    LOGIN_CODE: ['LoginCode', 'EntryCode', 'Password', 'קוד כניסה'],
    BASE_ROLE: ['BaseRole', 'תפקיד בסיס'],
    SYSTEM_ROLE: ['SystemRole', 'תפקיד מערכת'],
    ACCESS_SCOPE: ['AccessScope', 'תחום גישה'],
    COURSE_ID: ['CourseID', 'CourseId', 'מזהה קורס'],
    PROGRAM: ['Program', 'תוכנית'],
    STATUS: ['Status', 'סטטוס'],
    REQUEST_ID: ['RequestID', 'RequestId', 'מזהה בקשה'],
    REQUESTED_BY: ['RequestedBy', 'מבקש'],
    REQUESTED_AT: ['RequestedAt', 'תאריך בקשה'],
    APPROVAL_STATUS: ['ApprovalStatus', 'סטטוס אישור'],
    APPROVAL_NOTES: ['ApprovalNotes', 'הערות אישור'],
    CHANGE_SUMMARY: ['ChangeSummary', 'תקציר שינוי'],
    ORIGINAL_DATA: ['OriginalData', 'נתונים מקוריים'],
    REQUESTED_DATA: ['RequestedData', 'נתונים מבוקשים'],
    EDITABLE_BY: ['EditableBy', 'ניתן לעריכה על ידי'],
    ASSIGNED_EDITOR: ['AssignedEditor', 'עורך משויך'],
    DATE: ['Date', 'תאריך'],
    DAY: ['Day', 'יום'],
    START_TIME: ['StartTime', 'שעת התחלה'],
    END_TIME: ['EndTime', 'שעת סיום'],
    CLASS_GROUP: ['ClassGroup', 'כיתה / קבוצה'],
    ACTUAL_MEETINGS: ['ActualMeetings', 'מספר מפגשים בפועל'],
    COURSE_MANAGER: ['CourseManager', 'מנהל קורס'],
    INSTRUCTOR: ['Instructor', 'מדריך'],
    NOTES: ['Notes', 'הערות']
  };

  return {
    SHEETS: SHEETS,
    STRUCTURE: STRUCTURE,
    FIELDS: FIELDS,
    SESSION_KEY: 'P2026_SESSION'
  };
})();
