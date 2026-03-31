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

  var EDIT_REQUESTS_COLUMNS = {
    SYSTEM: [
      'RequestID', 'CourseID', 'RequestedBy', 'RequestedAt', 'ApprovalStatus', 'ApprovalNotes', 'ChangeSummary', 'OriginalData',
      'RequestedData', 'EditableBy', 'AssignedEditor', 'Date', 'Day', 'StartTime', 'EndTime', 'ClassGroup', 'ActualMeetings',
      'CourseManager', 'Instructor', 'Notes'
    ],
    DISPLAY: [
      'מזהה בקשה', 'מזהה קורס', 'מבקש', 'תאריך בקשה', 'סטטוס אישור', 'הערות אישור', 'תקציר שינוי', 'נתונים מקוריים',
      'נתונים מבוקשים', 'ניתן לעריכה על ידי', 'עורך משויך', 'תאריך', 'יום', 'שעת התחלה', 'שעת סיום', 'כיתה / קבוצה',
      'מספר מפגשים בפועל', 'מנהל קורס', 'מדריך', 'הערות'
    ]
  };

  var FIELDS = {
    USER_ID: ['UserID', 'EmployeeID', 'LoginID', 'מזהה משתמש', 'מספר עובד'],
    DISPLAY_NAME: ['DisplayName', 'EmployeeName', 'שם מלא', 'שם עובד'],
    LOGIN_CODE: ['LoginCode', 'EntryCode', 'Password', 'קוד כניסה'],
    BASE_ROLE: ['BaseRole', 'תפקיד בסיס'],
    SYSTEM_ROLE: ['SystemRole', 'תפקיד מערכת'],
    ACCESS_SCOPE: ['AccessScope', 'תחום גישה'],
    PROGRAM: ['Program', 'תוכנית'],
    STATUS: ['Status', 'סטטוס'],
    REQUEST_ID: ['RequestID'],
    COURSE_ID: ['CourseID'],
    REQUESTED_BY: ['RequestedBy'],
    REQUESTED_AT: ['RequestedAt'],
    APPROVAL_STATUS: ['ApprovalStatus'],
    APPROVAL_NOTES: ['ApprovalNotes'],
    CHANGE_SUMMARY: ['ChangeSummary'],
    ORIGINAL_DATA: ['OriginalData'],
    REQUESTED_DATA: ['RequestedData'],
    EDITABLE_BY: ['EditableBy'],
    ASSIGNED_EDITOR: ['AssignedEditor'],
    DATE: ['Date'],
    DAY: ['Day'],
    START_TIME: ['StartTime'],
    END_TIME: ['EndTime'],
    CLASS_GROUP: ['ClassGroup'],
    ACTUAL_MEETINGS: ['ActualMeetings'],
    COURSE_MANAGER: ['CourseManager'],
    INSTRUCTOR: ['Instructor'],
    NOTES: ['Notes']
  };

  var FRONTEND_FIELDS = {
    COURSES: ['CourseID', 'Program', 'Status'],
    REQUESTS: EDIT_REQUESTS_COLUMNS.SYSTEM
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
    EDIT_REQUESTS_COLUMNS: EDIT_REQUESTS_COLUMNS,
    FIELDS: FIELDS,
    FRONTEND_FIELDS: FRONTEND_FIELDS,
    STATUSES: STATUSES,
    SESSION_KEY: 'P2026_SESSION',
    SINGLE_EDIT_REQUESTS_SOURCE: true
  };
})();
