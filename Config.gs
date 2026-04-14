var CONFIG = (function () {
  var DATE_FIELDS_COUNT = 35;

  var SHEETS = {
    DATA_MASTER: 'data',
    COURSE_MEETINGS: 'operations_data',
    COURSES: 'data',
    PERMISSIONS: 'permissions',
    REVIEW_REQUIRED: 'operations_data',
    DASHBOARD_EXPORT: 'operations_data',
    SUMMARY: 'operations_data',
    LISTS: 'lists',
    PROGRAM_CODES: 'lists',
    README: 'settings',
    SETTINGS: 'settings',
    EDIT_REQUESTS: 'operations_data',
    EDEN_DATA_MASTER: 'operations_data',
    CONTACTS: 'contacts',
    OPERATIONS_DATA: 'operations_data'
  };

  var SHEET_ALIASES = {
    DATA_MASTER: 'data',
    EDIT_REQUESTS: 'operations_data',
    EDEN_DATA_MASTER: 'operations_data',
    COURSE_MEETINGS: 'operations_data',
    PROGRAM_CODES: 'lists',
    REVIEW_REQUIRED: 'operations_data',
    SUMMARY: 'operations_data',
    DASHBOARD_EXPORT: 'operations_data',
    FINANCE: 'data',
    FINANCE_ARCHIVE: 'data'
  };

  var STRUCTURE = {
    HEADER_ROW: 1,
    DISPLAY_ROW: 2,
    DATA_START_ROW: 3
  };

  var EDIT_REQUESTS_HEADER_ROW = [
    'RequestID', 'SourceRowID', 'CourseID', 'ChangeType', 'RequestedBy', 'RequestedAt',
    'WorkflowStatus', 'ApprovalStatus', 'FinalApprovalStatus', 'ApprovalNotes', 'CourseManager',
    'InstructorManager', 'Authority', 'School', 'EventType', 'ProgramCode', 'Program',
    'PlannedMeetings', 'Payment', 'Funding', 'StartTime', 'EndTime', 'EmployeeID', 'Employee',
    'Instructor', 'Date1', 'End', 'Notes', 'SentToAdminAt', 'FinalizedAt', 'is_new_record'
  ];
  var EDIT_REQUESTS_DISPLAY_ROW = EDIT_REQUESTS_HEADER_ROW.slice();

  var COURSE_MEETINGS_HEADER_ROW = EDIT_REQUESTS_HEADER_ROW.slice();
  var COURSE_MEETINGS_DISPLAY_ROW = COURSE_MEETINGS_HEADER_ROW.slice();

  var FIELDS = {
    USER_ID: ['UserID', 'EmployeeID', 'emp_id', 'LoginID', 'מזהה משתמש', 'מספר עובד'],
    EMPLOYEE_ID: ['EmployeeID', 'emp_id', 'UserID', 'InstructorID', 'מספר עובד', 'מזהה עובד'],
    ENTRY_CODE: ['EntryCode', 'code', 'LoginCode', 'Password', 'קוד כניסה'],
    DISPLAY_NAME: ['DisplayName', 'EmployeeName', 'name', 'שם מלא', 'שם עובד'],
    LOGIN_CODE: ['LoginCode', 'EntryCode', 'code', 'Password', 'קוד כניסה'],
    SYSTEM_ROLE: ['SystemRole', 'role'],
    ACCESS_SCOPE: ['AccessScope'],
    PROGRAM: ['Program', 'activity_name'],
    INSTRUCTOR: ['Instructor', 'Employee', 'name'],
    EVENT_TYPE: ['EventType', 'activity_type'],
    AUTHORITY: ['Authority', 'authority'],
    SCHOOL: ['School', 'school'],
    COURSE_MANAGER: ['CourseManager', 'activity_manager'],
    TEAM: ['InstructorManager', 'manager', 'TeamScope'],
    INSTRUCTOR_MANAGER: ['InstructorManager', 'manager', 'מנהל מדריכים', 'TeamLead'],
    START_DATE: ['MonthStart', 'Date1', 'start_date'],
    END_DATE: ['End', 'end_date'],
    PLANNED_MEETINGS: ['PlannedMeetings', 'sessions'],
    ACTUAL_MEETINGS: ['DatesListedCount'],
    REVIEW_STATUS: ['ReviewStatus'],
    ISSUE_STATUS: ['ReviewStatus', 'ReviewNotes'],
    CHANGE_REQUEST: ['ChangeRequest', 'בקשת שינוי'],
    STATUS: ['WorkflowStatus', 'status']
  };

  EDIT_REQUESTS_HEADER_ROW.forEach(function (field) {
    FIELDS[field] = [field];
  });

  var FRONTEND_FIELDS = {
    COURSES: [
      'RowID', 'CourseID', 'ProgramCode', 'Program', 'EventType',
      'Employee', 'EmployeeID', 'Instructor', 'CourseManager', 'InstructorManager',
      'Authority', 'School', 'ClassGroup',
      'DayName', 'StartTime', 'EndTime', 'End', 'MonthStart', 'MonthEnd', 'Period',
      'PlannedMeetings', 'DatesListedCount',
      'Funding', 'Payment', 'ReviewStatus', 'ReviewNotes',
      'Notes', 'WorkflowStatus', 'FinanceStatus', 'FinanceNotes',
      'RequestedBy', 'RequestedAt', 'SourceRowID', 'FinalApprovalStatus', 'FinalizedAt'
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
    DATE_FIELDS_COUNT: DATE_FIELDS_COUNT,
    SHEETS: SHEETS,
    SHEET_ALIASES: SHEET_ALIASES,
    STRUCTURE: STRUCTURE,
    FIELDS: FIELDS,
    FRONTEND_FIELDS: FRONTEND_FIELDS,
    STATUSES: STATUSES,
    EDIT_REQUESTS_HEADER_ROW: EDIT_REQUESTS_HEADER_ROW,
    EDIT_REQUESTS_DISPLAY_ROW: EDIT_REQUESTS_DISPLAY_ROW,
    COURSE_MEETINGS_HEADER_ROW: COURSE_MEETINGS_HEADER_ROW,
    COURSE_MEETINGS_DISPLAY_ROW: COURSE_MEETINGS_DISPLAY_ROW,
    REQUESTS_SOURCE_SHEET: 'operations_data',
    SESSION_KEY: 'P2026_SESSION'
  };
})();
