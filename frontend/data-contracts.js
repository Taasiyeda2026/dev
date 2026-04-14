export const TAASIYEDA_DATA_CONTRACTS = {
  sheets: {
    DATA_MASTER: 'DATA_MASTER',
    COURSE_MEETINGS: 'COURSE_MEETINGS',
    EDIT_REQUESTS: 'EDIT_REQUESTS',
    PERMISSIONS: 'permissions',
    FINANCE: 'DATA_MASTER',
    FINANCE_ARCHIVE: 'DATA_MASTER',
    LISTS: 'lists',
    PROGRAM_CODES: 'PROGRAM_CODES'
  },
  fields: {
    course: {
      COURSE_ID: 'CourseID',
      PROGRAM_CODE: 'ProgramCode',
      PROGRAM: 'Program',
      EVENT_TYPE: 'EventType',
      AUTHORITY: 'Authority',
      SCHOOL: 'School',
      EMPLOYEE: 'Employee',
      EMPLOYEE_ID: 'EmployeeID',
      COURSE_MANAGER: 'CourseManager',
      INSTRUCTOR_MANAGER: 'InstructorManager',
      START_TIME: 'StartTime',
      END_TIME: 'EndTime',
      END: 'End',
      NOTES: 'Notes',
      PLANNED_MEETINGS: 'PlannedMeetings',
      PERIOD: 'Period',
      MONTH_START: 'MonthStart',
      MONTH_END: 'MonthEnd',
      REVIEW_STATUS: 'ReviewStatus',
      REVIEW_NOTES: 'ReviewNotes',
      REVIEW_HANDLED_BY: 'ReviewHandledBy',
      REVIEW_HANDLED_AT: 'ReviewHandledAt',
      DATE_FIELDS: Array.from({ length: 30 }, (_, index) => `Date${index + 1}`)
    },
    exception: {
      REVIEW_ID: 'ReviewID',
      ROW_NUMBER: '_rowNumber',
      COURSE_ID: 'CourseID',
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
      REQUEST_ID: 'RequestID',
      COURSE_ID: 'CourseID',
      REQUESTED_BY: 'RequestedBy',
      APPROVAL_STATUS: 'ApprovalStatus',
      WORKFLOW_STAGE: 'FinalApprovalStatus'
    },
    permission: {
      EMPLOYEE_NAME: 'EmployeeName',
      EMPLOYEE_ID: 'EmployeeID',
      ENTRY_CODE: 'EntryCode',
      SYSTEM_ROLE: 'SystemRole',
      DISPLAY_ROLE: 'DisplayRole',
      VIEW_SCOPE: 'ViewScope',
      EDIT_SCOPE: 'EditScope',
      APPROVAL_SCOPE: 'ApprovalScope',
      UI_PROFILE: 'UiProfile',
      TEAM_SCOPE: 'TeamScope',
      INSTRUCTOR_MANAGER: 'InstructorManager',
      ACTIVE_FLAG: 'ActiveFlag',
      CAN_ACCESS_FINANCE: 'CanAccessFinance',
      CAN_EDIT_FINANCE: 'CanEditFinance',
      CAN_ACCESS_FINANCE_ARCHIVE: 'CanAccessFinanceArchive',
      CAN_EDIT_FINANCE_ARCHIVE: 'CanEditFinanceArchive'
    }
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
