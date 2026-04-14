export const TAASIYEDA_DATA_CONTRACTS = {
  sheets: {
    DATA_MASTER: 'data',
    EDIT_REQUESTS: 'operations_data',
    OPERATIONS_DATA: 'operations_data',
    PERMISSIONS: 'permissions',
    FINANCE: 'data',
    FINANCE_ARCHIVE: 'data',
    LISTS: 'lists',
    SETTINGS: 'settings',
    CONTACTS: 'contacts'
  },
  fields: {
    course: {
      COURSE_ID: 'RowID',
      PROGRAM_CODE: 'activity_no',
      PROGRAM: 'activity_name',
      EVENT_TYPE: 'activity_type',
      AUTHORITY: 'authority',
      SCHOOL: 'school',
      EMPLOYEE: 'name',
      EMPLOYEE_ID: 'emp_id',
      COURSE_MANAGER: 'activity_manager',
      INSTRUCTOR_MANAGER: 'manager',
      START_TIME: 'start_time',
      END_TIME: 'end_time',
      END: 'end_date',
      NOTES: 'notes',
      PLANNED_MEETINGS: 'sessions',
      PERIOD: 'Period',
      MONTH_START: 'MonthStart',
      MONTH_END: 'MonthEnd',
      REVIEW_STATUS: 'status',
      REVIEW_NOTES: 'operations_notes',
      REVIEW_HANDLED_BY: 'ReviewHandledBy',
      REVIEW_HANDLED_AT: 'ReviewHandledAt',
      DATE_FIELDS: ['start_date', ...Array.from({ length: 34 }, (_, index) => `date${index + 2}`)]
    },
    exception: {
      REVIEW_ID: 'ReviewID',
      ROW_NUMBER: '_rowNumber',
      COURSE_ID: 'RowID',
      STATUS: 'Status',
      TREATMENT_STATUS: 'TreatmentStatus',
      ISSUES: 'Issues',
      TYPE: 'Type',
      NOTES: 'notes',
      DATE: 'Date',
      EMPLOYEE: 'name',
      AUTHORITY: 'authority',
      SCHOOL: 'school',
      COURSE_MANAGER: 'CourseManager'
    },
    request: {
      REQUEST_ID: 'RequestID',
      COURSE_ID: 'RowID',
      REQUESTED_BY: 'requested_by',
      APPROVAL_STATUS: 'admin_status',
      WORKFLOW_STAGE: 'admin_status'
    },
    permission: {
      EMPLOYEE_NAME: 'EmployeeName',
      EMPLOYEE_ID: 'emp_id',
      ENTRY_CODE: 'EntryCode',
      SYSTEM_ROLE: 'SystemRole',
      DISPLAY_ROLE: 'DisplayRole',
      VIEW_SCOPE: 'ViewScope',
      EDIT_SCOPE: 'EditScope',
      APPROVAL_SCOPE: 'ApprovalScope',
      UI_PROFILE: 'UiProfile',
      DEFAULT_VIEW: 'default_view',
      TEAM_SCOPE: 'TeamScope',
      INSTRUCTOR_MANAGER: 'manager',
      ACTIVE_FLAG: 'ActiveFlag',
      CAN_ACCESS_FINANCE: 'CanAccessFinance',
      CAN_EDIT_FINANCE: 'CanEditFinance',
      CAN_ACCESS_FINANCE_ARCHIVE: 'CanAccessFinanceArchive',
      CAN_EDIT_FINANCE_ARCHIVE: 'CanEditFinanceArchive'
    }
  },
  resolvedMarkers: ['resolved', 'closed', 'done', 'טופל', 'טופלה', 'נסגר', 'סגור'],
  delayKeywords: ['נדחה', 'דחוי', 'delay', 'postpone', 'postponed'],
  delayRangePattern: /מ[-\\s]*(\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4})\\s*ל[-\\s]*(\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4})/i,
  weekdays: [0, 1, 2, 3, 4, 5, 6]
};

export const COURSE_FIELDS = TAASIYEDA_DATA_CONTRACTS.fields.course;
export const EXCEPTION_FIELDS = TAASIYEDA_DATA_CONTRACTS.fields.exception;
export const REQUEST_FIELDS = TAASIYEDA_DATA_CONTRACTS.fields.request;
export const PERMISSION_FIELDS = TAASIYEDA_DATA_CONTRACTS.fields.permission;
export const SHEET_NAMES = TAASIYEDA_DATA_CONTRACTS.sheets;

function numberFrom(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

export function getSessionProgress(course = {}) {
  const plannedMeetings = Math.max(0, numberFrom(course?.[COURSE_FIELDS.PLANNED_MEETINGS]));
  const datesListed = (COURSE_FIELDS.DATE_FIELDS || []).reduce((count, field) => {
    return String(course?.[field] || '').trim() ? count + 1 : count;
  }, 0);
  const actualMeetings = datesListed;
  return {
    plannedMeetings,
    actualMeetings,
    meetingNumber: Math.max(1, Math.min(actualMeetings, plannedMeetings || 1))
  };
}

export function getExceptionTreatmentStatus(reviewItem = {}) {
  const statusText = [
    reviewItem?.[EXCEPTION_FIELDS.STATUS],
    reviewItem?.[EXCEPTION_FIELDS.TREATMENT_STATUS],
    reviewItem?.[EXCEPTION_FIELDS.NOTES]
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  const resolved = TAASIYEDA_DATA_CONTRACTS.resolvedMarkers
    .some((marker) => statusText.includes(String(marker).toLowerCase()));
  return resolved ? 'resolved' : 'open';
}

export function hasCourseDelays(course = {}, reviewItems = []) {
  const notesText = String(course?.[COURSE_FIELDS.NOTES] || '').toLowerCase();
  const notesDelay = TAASIYEDA_DATA_CONTRACTS.delayKeywords.some((keyword) => notesText.includes(keyword));
  const courseId = String(course?.[COURSE_FIELDS.COURSE_ID] || '');
  const reviewDelay = (reviewItems || []).some((review) => {
    const sameCourse = String(review?.[EXCEPTION_FIELDS.COURSE_ID] || '') === courseId;
    if (!sameCourse) return false;
    const reviewText = `${review?.[EXCEPTION_FIELDS.ISSUES] || ''} ${review?.[EXCEPTION_FIELDS.TYPE] || ''} ${review?.[EXCEPTION_FIELDS.NOTES] || ''}`.toLowerCase();
    return TAASIYEDA_DATA_CONTRACTS.delayKeywords.some((keyword) => reviewText.includes(keyword));
  });
  return notesDelay || reviewDelay;
}

export function parseDelayInfo(notesValue) {
  const text = String(notesValue || '').trim();
  const isPostponed = TAASIYEDA_DATA_CONTRACTS.delayKeywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));
  const match = text.match(TAASIYEDA_DATA_CONTRACTS.delayRangePattern);
  return {
    isPostponed,
    originalDate: match?.[1] || '-',
    newDate: match?.[2] || '-'
  };
}
