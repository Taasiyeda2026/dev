var CONFIG = (function () {
  var DATE_FIELDS_COUNT = 35;

  // ── Real spreadsheet sheet names ─────────────────────────────────────────────
  // These are the ONLY real sheets. No phantom aliases that invent extra sheets.
  var SHEETS = {
    DATA_MASTER:     'data',           // פעילויות (primary data)
    PERMISSIONS:     'permissions',    // הרשאות
    OPERATIONS_DATA: 'operations_data',// בקשות / אישורים
    LISTS:           'lists',          // רשימות
    SETTINGS:        'settings',       // הגדרות
    CONTACTS:        'contacts',       // אנשי קשר

    // Backward-compat aliases — not separate sheets, just shortcuts
    EDIT_REQUESTS:   'operations_data' // kept for code that hasn't migrated yet
  };

  // ── Sheet aliases (minimal — only truly required) ──────────────────────────────────────────
  var SHEET_ALIASES = {
    DATA_MASTER: 'data'  // allows callers to pass 'DATA_MASTER' as sheet name
  };

  var STRUCTURE = {
    HEADER_ROW:   1,
    DISPLAY_ROW:  2,
    DATA_START_ROW: 3
  };

  // ── All 30 granular permission columns from the permissions sheet ──────────────────
  var PERM_COLS = [
    'view_admin',         'edit_admin',
    'view_dashboard',     'edit_dashboard',
    'view_finance',       'edit_finance',
    'view_operations_data','edit_operations_data',
    'view_activities',    'edit_activities',
    'view_month',         'edit_month',
    'view_week',          'edit_week',
    'view_exceptions',    'edit_exceptions',
    'view_instructors',   'edit_instructors',
    'view_my_data',       'edit_my_data',
    'view_edit_requests', 'edit_edit_requests',
    'view_contacts',      'edit_contacts',
    'view_lists',         'edit_lists',
    'view_permissions',   'edit_permissions',
    'view_settings',      'edit_settings'
  ];

  // ── Field alias lists for Utils.resolveIndex ──────────────────────────────────────────────
  // Actual sheet column names listed first; internal/legacy names after.
  var FIELDS = {
    // ── data sheet ──────────────────────────────────────────────────────────
    ROW_ID:             ['RowID'],
    EMP_ID:             ['emp_id', 'EmployeeID'],
    NAME:               ['name', 'Employee', 'EmployeeName'],
    ACTIVITY_MANAGER:   ['activity_manager', 'CourseManager'],
    MANAGER:            ['manager', 'InstructorManager'],
    AUTHORITY:          ['authority', 'Authority'],
    SCHOOL:             ['school', 'School'],
    ACTIVITY_TYPE:      ['activity_type', 'EventType'],
    ACTIVITY_NO:        ['activity_no', 'ProgramCode'],
    ACTIVITY_NAME:      ['activity_name', 'Program'],
    SESSIONS:           ['sessions', 'PlannedMeetings'],
    PRICE:              ['price', 'Payment'],
    FUNDING:            ['funding', 'Funding'],
    START_TIME:         ['start_time', 'StartTime'],
    END_TIME:           ['end_time', 'EndTime'],
    START_DATE:         ['start_date', 'Date1'],
    END_DATE:           ['end_date', 'End'],
    STATUS:             ['status', 'WorkflowStatus'],
    NOTES:              ['notes', 'Notes'],
    FINANCE_STATUS:     ['finance_status', 'FinanceStatus'],
    FINANCE_NOTES:      ['finance_notes', 'FinanceNotes'],
    REQUESTED_BY:       ['requested_by', 'RequestedBy'],
    REQUESTED_AT:       ['requested_at', 'RequestedAt'],
    OPERATIONS_NOTES:   ['operations_notes', 'ReviewNotes'],
    SENT_TO_ADMIN_AT:   ['sent_to_admin_at', 'SentToAdminAt'],
    ADMIN_STATUS:       ['admin_status', 'FinalApprovalStatus'],
    ADMIN_DECISION_AT:  ['admin_decision_at', 'FinalizedAt'],
    SOURCE_ROW_ID:      ['source_row_id', 'SourceRowID'],

    // ── permissions sheet ──────────────────────────────────────────────────────────
    PERM_EMP_ID:        ['emp_id', 'EmployeeID'],
    PERM_CODE:          ['code', 'EntryCode'],
    PERM_NAME:          ['name', 'EmployeeName'],
    PERM_ROLE:          ['role', 'SystemRole'],
    PERM_DEFAULT_VIEW:  ['default_view', 'UiProfile'],
    PERM_ACTIVE:        ['active', 'ActiveFlag'],
    PERM_MANAGER:       ['manager', 'InstructorManager'],

    // ── contacts sheet ──────────────────────────────────────────────────────────
    CONTACT_EMP_ID:     ['emp_id'],
    CONTACT_ROLE:       ['role'],
    CONTACT_NAME:       ['name'],
    CONTACT_ID_NUMBER:  ['id_number'],
    CONTACT_ADDRESS:    ['address'],
    CONTACT_MOBILE:     ['mobile'],
    CONTACT_EMAIL:      ['email'],
    CONTACT_EMPLOYMENT: ['employment'],

    // ── lists sheet ──────────────────────────────────────────────────────────────
    LIST_NAME:          ['list_name'],
    LIST_VALUE:         ['value'],
    LIST_LABEL:         ['label'],
    LIST_ACTIVITY_TYPE: ['activity_type'],
    LIST_ACTIVITY_NO:   ['activity_no'],
    LIST_ACTIVITY_NAME: ['activity_name'],
    LIST_ACTIVE:        ['active'],

    // ── settings sheet ──────────────────────────────────────────────────────────────
    SETTING_KEY:        ['key'],
    SETTING_VALUE:      ['value'],
    SETTING_TYPE:       ['type'],
    SETTING_ACTIVE:     ['active'],
    SETTING_NOTES:      ['notes']
  };

  // ── Backward-compat field aliases used in Logic.gs ───────────────────────────────────────
  FIELDS.USER_ID            = FIELDS.PERM_EMP_ID;
  FIELDS.EMPLOYEE_ID        = FIELDS.EMP_ID;
  FIELDS.ENTRY_CODE         = FIELDS.PERM_CODE;
  FIELDS.DISPLAY_NAME       = FIELDS.PERM_NAME;
  FIELDS.LOGIN_CODE         = FIELDS.PERM_CODE;
  FIELDS.SYSTEM_ROLE        = FIELDS.PERM_ROLE;
  FIELDS.PROGRAM            = FIELDS.ACTIVITY_NAME;
  FIELDS.INSTRUCTOR         = FIELDS.NAME;
  FIELDS.EVENT_TYPE         = FIELDS.ACTIVITY_TYPE;
  FIELDS.COURSE_MANAGER     = FIELDS.ACTIVITY_MANAGER;
  FIELDS.TEAM               = FIELDS.MANAGER;
  FIELDS.INSTRUCTOR_MANAGER = FIELDS.MANAGER;
  FIELDS.PLANNED_MEETINGS   = FIELDS.SESSIONS;

  // ── Frontend field list for API responses ─────────────────────────────────────────────
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
    ]
  };

  var STATUSES = {
    DRAFT:          'pending_eden',
    PENDING_EDEN:   'pending_eden',
    EDEN_APPROVED:  'pending_final',
    PENDING_FINAL:  'pending_final',
    FINAL_APPROVED: 'final_approved',
    DECLINED:       'final_rejected'
  };

  return {
    DATE_FIELDS_COUNT:     DATE_FIELDS_COUNT,
    SHEETS:                SHEETS,
    SHEET_ALIASES:         SHEET_ALIASES,
    STRUCTURE:             STRUCTURE,
    PERM_COLS:             PERM_COLS,
    FIELDS:                FIELDS,
    FRONTEND_FIELDS:       FRONTEND_FIELDS,
    STATUSES:              STATUSES,
    SESSION_KEY:           'P2026_SESSION',
    REQUESTS_SOURCE_SHEET: 'operations_data'
  };
})();