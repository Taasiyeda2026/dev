var CONFIG = (function () {
  var SHEETS = {
    DATA_MASTER: 'DATA_MASTER',
    COURSE_MEETINGS: 'COURSE_MEETINGS',
    COURSES: 'COURSES',
    PERMISSIONS: 'PERMISSIONS',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    DASHBOARD_EXPORT: 'DASHBOARD_EXPORT',
    SUMMARY: 'SUMMARY',
    LISTS: 'LISTS',
    PROGRAM_CODES: 'PROGRAM_CODES',
    README: 'README',
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
    'ChangeSummary',
    'OriginalData',
    'RequestedData',
    'RequestStatus',
    'EdenViewStatus',
    'FinalApprovalStatus',
    'ApprovalStatus',
    'ApprovalNotes',
    'EdenApprovedAt',
    'FinalizedAt',
    'RejectedAt',
    'AssignedEditor',
    'EditableBy',
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
    'מקור שינוי',
    'סוג שינוי',
    'מבקש',
    'תאריך בקשה',
    'תקציר שינוי',
    'נתונים מקוריים',
    'נתונים מבוקשים',
    'סטטוס בקשה',
    'סטטוס תצוגת עדן',
    'סטטוס אישור סופי',
    'סטטוס כולל',
    'הערות',
    'אושר לעדן בתאריך',
    'אושר סופית בתאריך',
    'נדחה בתאריך',
    'גורם מאשר',
    'ניתן לעריכה על ידי',
    'תאריך',
    'יום',
    'שעת התחלה',
    'שעת סיום',
    'כיתה / קבוצה',
    'מספר מפגשים בפועל',
    'מנהל קורס',
    'מדריך',
    'הערות פעילות'
  ];

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
    SYSTEM_ROLE: ['SystemRole', 'תפקיד מערכת'],
    ACCESS_SCOPE: ['AccessScope', 'תחום גישה'],
    PROGRAM: ['Program', 'תוכנית'],
    INSTRUCTOR: ['Instructor', 'מדריך', 'AssignedInstructor'],
    EVENT_TYPE: ['EventType', 'פעילות', 'Workshop', 'CourseName', 'ActivityName'],
    AUTHORITY: ['Authority', 'רשות', 'Municipality'],
    SCHOOL: ['School', 'בית ספר', 'SchoolName'],
    COURSE_MANAGER: ['CourseManager', 'מנהל קורס'],
    TEAM: ['InstructorManager', 'מנהל מדריכים', 'TeamLead'],
    INSTRUCTOR_MANAGER: ['InstructorManager', 'מנהל מדריכים', 'TeamLead'],
    START_DATE: ['MonthStart', 'Date1'],
    END_DATE: ['End', 'תאריך סיום', 'EndTime'],
    PLANNED_MEETINGS: ['PlannedMeetings', 'מפגשים מתוכננים', 'MeetingsPlanned'],
    ACTUAL_MEETINGS: ['DatesListedCount'],
    REVIEW_STATUS: ['ReviewStatus'],
    ISSUE_STATUS: ['ReviewStatus', 'ReviewNotes'],
    CHANGE_REQUEST: ['ChangeRequest', 'בקשת שינוי']
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
    DRAFT: 'draft',
    PENDING_EDEN: 'pending_eden',
    EDEN_APPROVED: 'eden_approved',
    PENDING_FINAL: 'pending_final',
    FINAL_APPROVED: 'final_approved',
    DECLINED: 'declined'
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
