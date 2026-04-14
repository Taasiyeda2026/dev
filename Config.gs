var CONFIG = (function () {
  var SHEETS = {
    DATA_MASTER: 'DATA',
    COURSE_MEETINGS: 'COURSE_MEETINGS',
    COURSES: 'COURSES',
    PERMISSIONS: 'permissions',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    DASHBOARD_EXPORT: 'DASHBOARD_EXPORT',
    SUMMARY: 'SUMMARY',
    LISTS: 'lists',
    PROGRAM_CODES: 'PROGRAM_CODES',
    README: 'settings',
    EDIT_REQUESTS: 'תפעול',
    EDEN_DATA_MASTER: 'EDEN_DATA_MASTER'
  };

  var STRUCTURE = {
    HEADER_ROW: 1,
    DISPLAY_ROW: 2,
    DATA_START_ROW: 3
  };

  var EDIT_REQUESTS_HEADER_ROW = [
    'request_id',
    'source_row_id',
    'request_type',
    'workflow_status',
    'requested_by',
    'requested_at',
    'activity_manager',
    'manager',
    'authority',
    'school',
    'activity_type',
    'activity_no',
    'activity_name',
    'sessions',
    'price',
    'funding',
    'start_time',
    'end_time',
    'emp_id',
    'name',
    'start_date',
    'date2', 'date3', 'date4', 'date5', 'date6', 'date7', 'date8', 'date9', 'date10',
    'date11', 'date12', 'date13', 'date14', 'date15', 'date16', 'date17', 'date18', 'date19', 'date20',
    'date21', 'date22', 'date23', 'date24', 'date25', 'date26', 'date27', 'date28', 'date29', 'date30',
    'date31', 'date32', 'date33', 'date34', 'date35',
    'end_date',
    'status',
    'notes',
    'operations_notes',
    'sent_to_admin_at',
    'admin_status',
    'admin_decision_at',
    'is_new_record'
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
    SYSTEM_ROLE: ['SystemRole', 'system_role', 'תפקיד מערכת'],
    ACCESS_SCOPE: ['AccessScope', 'action_mode', 'תחום גישה'],
    PROGRAM: ['Program', 'activity_name', 'תוכנית'],
    INSTRUCTOR: ['Instructor', 'name', 'מדריך', 'AssignedInstructor'],
    EVENT_TYPE: ['EventType', 'activity_type', 'פעילות', 'Workshop', 'CourseName', 'ActivityName'],
    AUTHORITY: ['Authority', 'authority', 'רשות', 'Municipality'],
    SCHOOL: ['School', 'school', 'בית ספר', 'SchoolName'],
    COURSE_MANAGER: ['CourseManager', 'manager', 'activity_manager', 'מנהל קורס'],
    TEAM: ['InstructorManager', 'team_scope', 'מנהל מדריכים', 'TeamLead'],
    INSTRUCTOR_MANAGER: ['InstructorManager', 'מנהל מדריכים', 'TeamLead'],
    START_DATE: ['MonthStart', 'start_date', 'Date1'],
    END_DATE: ['End', 'end_date', 'תאריך סיום', 'EndTime'],
    PLANNED_MEETINGS: ['PlannedMeetings', 'sessions', 'מפגשים מתוכננים', 'MeetingsPlanned'],
    ACTUAL_MEETINGS: ['DatesListedCount'],
    REVIEW_STATUS: ['ReviewStatus'],
    ISSUE_STATUS: ['ReviewStatus', 'ReviewNotes'],
    CHANGE_REQUEST: ['ChangeRequest', 'בקשת שינוי'],
    STATUS: ['status', 'Status', 'WorkflowStatus']
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
    DRAFT: 'pending_operations',
    PENDING_EDEN: 'pending_operations',
    EDEN_APPROVED: 'ready_for_admin',
    PENDING_FINAL: 'ready_for_admin',
    FINAL_APPROVED: 'approved',
    DECLINED: 'rejected'
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
    REQUESTS_SOURCE_SHEET: 'תפעול',
    SESSION_KEY: 'P2026_SESSION'
  };
})();
