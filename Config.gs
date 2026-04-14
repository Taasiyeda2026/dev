var CONFIG = (function () {
  var SHEETS = {
    DATA_MASTER: 'DATA_MASTER',
    COURSE_MEETINGS: 'COURSE_MEETINGS',
    COURSES: 'COURSES',
    PERMISSIONS: 'permissions',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    DASHBOARD_EXPORT: 'DASHBOARD_EXPORT',
    SUMMARY: 'SUMMARY',
    LISTS: 'lists',
    PROGRAM_CODES: 'PROGRAM_CODES',
    README: 'settings',
    EDIT_REQUESTS: 'EDIT_REQUESTS',
    EDEN_DATA_MASTER: 'EDEN_DATA_MASTER'
  };

  var STRUCTURE = {
    HEADER_ROW: 1,
    DISPLAY_ROW: 2,
    DATA_START_ROW: 3
  };

  var EDIT_REQUESTS_HEADER_ROW = [
    'RequestID',
    'CourseID',
    'Origin',
    'ChangeType',
    'RequestedBy',
    'RequestedAt',
    'RequestStatus',
    'EdenViewStatus',
    'FinalApprovalStatus',
    'ApprovalStatus',
    'ApprovalNotes',
    'ChangeSummary',
    'OriginalData',
    'RequestedData',
    'EditableBy',
    'AssignedEditor',
    'EdenApprovedAt',
    'FinalizedAt',
    'RejectedAt',
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

  var EDIT_REQUESTS_DISPLAY_ROW = EDIT_REQUESTS_HEADER_ROW.slice();


  var COURSE_MEETINGS_HEADER_ROW = [
    'MeetingID', 'RowID', 'CourseID', 'MeetingNumber', 'MeetingDate', 'OriginalMeetingDate',
    'StartTime', 'EndTime', 'MeetingStatus', 'ChangedBy', 'ChangedAt', 'ChangeSource', 'ShiftGroupID', 'ChangeNote'
  ];

  var COURSE_MEETINGS_DISPLAY_ROW = [
    'מזהה מפגש', 'מזהה שורה', 'מזהה קורס', 'מספר מפגש', 'תאריך מפגש', 'תאריך מקורי',
    'שעת התחלה', 'שעת סיום', 'סטטוס מפגש', 'שונה על ידי', 'תאריך שינוי', 'מקור שינוי', 'קבוצת הזזה', 'הערת שינוי'
  ];

  var FIELDS = {
    USER_ID: ['UserID', 'EmployeeID', 'LoginID', 'מזהה משתמש', 'מספר עובד'],
    EMPLOYEE_ID: ['EmployeeID', 'UserID', 'InstructorID', 'מספר עובד', 'מזהה עובד'],
    ENTRY_CODE: ['EntryCode', 'LoginCode', 'Password', 'קוד כניסה'],
    DISPLAY_NAME: ['DisplayName', 'EmployeeName', 'שם מלא', 'שם עובד'],
    LOGIN_CODE: ['LoginCode', 'EntryCode', 'Password', 'קוד כניסה'],
    SYSTEM_ROLE: ['SystemRole'],
    ACCESS_SCOPE: ['AccessScope'],
    PROGRAM: ['Program'],
    INSTRUCTOR: ['Instructor', 'Employee'],
    EVENT_TYPE: ['EventType'],
    AUTHORITY: ['Authority'],
    SCHOOL: ['School'],
    COURSE_MANAGER: ['CourseManager'],
    TEAM: ['InstructorManager', 'TeamScope'],
    INSTRUCTOR_MANAGER: ['InstructorManager', 'מנהל מדריכים', 'TeamLead'],
    START_DATE: ['MonthStart', 'Date1'],
    END_DATE: ['End'],
    PLANNED_MEETINGS: ['PlannedMeetings'],
    ACTUAL_MEETINGS: ['DatesListedCount'],
    REVIEW_STATUS: ['ReviewStatus'],
    ISSUE_STATUS: ['ReviewStatus', 'ReviewNotes'],
    CHANGE_REQUEST: ['ChangeRequest', 'בקשת שינוי'],
    STATUS: ['WorkflowStatus']
  };

  EDIT_REQUESTS_HEADER_ROW.forEach(function (field) {
    FIELDS[field] = [field];
  });

  var FRONTEND_FIELDS = {
    COURSES: [
      'CourseID', 'ProgramCode', 'Program', 'EventType',
      'Employee', 'EmployeeID', 'Instructor', 'CourseManager', 'InstructorManager',
      'Authority', 'School', 'ClassGroup',
      'DayName', 'StartTime', 'EndTime', 'End', 'MonthStart', 'MonthEnd', 'Period',
      'PlannedMeetings',
      'Funding', 'Payment', 'ReviewStatus', 'ReviewNotes',
      'Notes', 'WorkflowStatus'
    ],
    REQUESTS: EDIT_REQUESTS_HEADER_ROW.slice(),
    APPROVALS: EDIT_REQUESTS_HEADER_ROW.slice()
  };

  var STATUSES = {
    DRAFT: 'pending_eden',
    PENDING_EDEN: 'pending_eden',
    EDEN_APPROVED: 'pending_final',
    PENDING_FINAL: 'pending_final',
    FINAL_APPROVED: 'final_approved',
    DECLINED: 'final_rejected'
  };

  return {
    SHEETS: SHEETS,
    STRUCTURE: STRUCTURE,
    FIELDS: FIELDS,
    FRONTEND_FIELDS: FRONTEND_FIELDS,
    STATUSES: STATUSES,
    EDIT_REQUESTS_HEADER_ROW: EDIT_REQUESTS_HEADER_ROW,
    EDIT_REQUESTS_DISPLAY_ROW: EDIT_REQUESTS_DISPLAY_ROW,
    COURSE_MEETINGS_HEADER_ROW: COURSE_MEETINGS_HEADER_ROW,
    COURSE_MEETINGS_DISPLAY_ROW: COURSE_MEETINGS_DISPLAY_ROW,
    REQUESTS_SOURCE_SHEET: 'EDIT_REQUESTS',
    SESSION_KEY: 'P2026_SESSION'
  };
})();
