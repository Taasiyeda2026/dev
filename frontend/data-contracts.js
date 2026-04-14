export const TAASIYEDA_DATA_CONTRACTS = {
  sheets: {
    DATA_MASTER: 'DATA',
    COURSE_MEETINGS: 'COURSE_MEETINGS',
    EDIT_REQUESTS: 'תפעול',
    PERMISSIONS: 'permissions',
    FINANCE: 'DATA',
    FINANCE_ARCHIVE: 'DATA',
    LISTS: 'lists',
    PROGRAM_CODES: 'PROGRAM_CODES'
  },
  fields: {
    course: {
      COURSE_ID: 'row_id',
      PROGRAM_CODE: 'activity_no',
      PROGRAM: 'activity_name',
      EVENT_TYPE: 'activity_type',
      AUTHORITY: 'authority',
      SCHOOL: 'school',
      EMPLOYEE: 'name',
      EMPLOYEE_ID: 'emp_id',
      COURSE_MANAGER: 'manager',
      INSTRUCTOR_MANAGER: 'activity_manager',
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
      COURSE_ID: 'source_row_id',
      STATUS: 'Status',
      TREATMENT_STATUS: 'TreatmentStatus',
      ISSUES: 'Issues',
      TYPE: 'Type',
      NOTES: 'Notes',
      DATE: 'Date',
      EMPLOYEE: 'Employee',
      AUTHORITY: 'Authority',
      SCHOOL: 'School',
      COURSE_MANAGER: 'CourseManager'
    },
    request: {
      REQUEST_ID: 'request_id',
      COURSE_ID: 'CourseID',
      REQUESTED_BY: 'requested_by',
      APPROVAL_STATUS: 'workflow_status',
      WORKFLOW_STAGE: 'admin_status'
    },
    permission: {
      EMPLOYEE_NAME: 'employee_name',
      EMPLOYEE_ID: 'employee_id',
      ENTRY_CODE: 'entry_code',
      SYSTEM_ROLE: 'system_role',
      DISPLAY_ROLE: 'display_role',
      VIEW_SCOPE: 'view_scope',
      EDIT_SCOPE: 'action_mode',
      APPROVAL_SCOPE: 'approval_scope',
      UI_PROFILE: 'ui_profile',
      TEAM_SCOPE: 'team_scope',
      INSTRUCTOR_MANAGER: 'activity_manager',
      ACTIVE_FLAG: 'active_flag',
      CAN_ACCESS_FINANCE: 'can_access_finance',
      CAN_EDIT_FINANCE: 'can_edit_finance',
      CAN_ACCESS_FINANCE_ARCHIVE: 'can_access_finance_archive',
      CAN_EDIT_FINANCE_ARCHIVE: 'can_edit_finance_archive'
    }
  },
  aliases: {
    // הנחה: בשלב מעבר החוזים, השדה Instructor משמש כגיבוי לשם מדריך כש-Employee ריק.
    instructorNameFallback: 'Instructor'
  },
  // הנחה: חריגה נחשבת כ"טופלה" אם שדה Status/TreatmentStatus/Notes כולל אחד מהסימנים הבאים.
  resolvedMarkers: ['resolved', 'closed', 'done', 'טופל', 'טופלה', 'נסגר', 'סגור'],
  // הנחה: דחייה מזוהה דרך Notes או REVIEW_REQUIRED עם אחת מהמילים הבאות.
  delayKeywords: ['נדחה', 'דחוי', 'delay', 'postpone', 'postponed'],
  // הנחה: תאריך מקורי/חדש מזוהים מהתבנית "מ-dd/MM/yyyy ל-dd/MM/yyyy" בתוך Notes.
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
