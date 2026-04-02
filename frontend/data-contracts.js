export const TAASIYEDA_DATA_CONTRACTS = {
  sheets: {
    COURSES: 'COURSES',
    DATA_MASTER: 'DATA_MASTER',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    EDIT_REQUESTS: 'EDIT_REQUESTS',
    PERMISSIONS: 'PERMISSIONS',
    LISTS: 'LISTS',
    PROGRAM_CODES: 'PROGRAM_CODES'
  },
  fields: {
    course: {
      COURSE_ID: 'CourseID',
      PROGRAM_CODE: 'ProgramCode',
      PROGRAM: 'Program',
      ACTIVITY: 'Activity',
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
      ACTUAL_MEETINGS: 'ActualMeetings',
      SOURCE_ACTUAL_MEETINGS: 'SourceActualMeetings',
      STATUS: 'Status',
      PERIOD: 'Period',
      EVENT_TYPE: 'EventType',
      DATE: 'Date',
      START_DATE: 'StartDate',
      END_DATE: 'EndDate',
      REVIEW_REQUIRED: 'ReviewRequired',
      REQUIRES_REVIEW: 'RequiresReview',
      DATE_FIELDS: Array.from({ length: 15 }, (_, index) => `Date${index + 1}`)
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
      WORKFLOW_STAGE: 'WorkflowStage'
    },
    permission: {
      EMPLOYEE_NAME: 'EmployeeName',
      EMPLOYEE_ID: 'EmployeeID',
      ENTRY_CODE: 'EntryCode',
      BASE_ROLE: 'BaseRole',
      SYSTEM_ROLE: 'SystemRole',
      DISPLAY_ROLE: 'DisplayRole',
      VIEW_SCOPE: 'ViewScope',
      EDIT_SCOPE: 'EditScope',
      APPROVAL_SCOPE: 'ApprovalScope',
      UI_PROFILE: 'UiProfile',
      TEAM_SCOPE: 'TeamScope',
      IS_DUAL_MODE: 'IsDualMode',
      CAN_VIEW_DASHBOARD: 'CanViewDashboard',
      CAN_EDIT_MASTER_DATA: 'CanEditMasterData',
      CAN_APPROVE_TO_MAIN_DATA: 'CanApproveToMainData'
    }
  },
  aliases: {
    // הנחה: בשלב מעבר החוזים, השדה Instructor משמש כגיבוי לשם מדריך כש-Employee ריק.
    instructorNameFallback: 'Instructor',
    // הנחה: בשלב מעבר החוזים, IssueStatus הוא גיבוי ישן לתיאור סוג חריגה.
    exceptionTypeFallback: 'IssueStatus'
  },
  // הנחה: עומס מדריך מחושב לפי מספר מפגשים עתידיים + מספר קורסים פעילים.
  loadThresholds: {
    dayMeetings: { medium: 3, high: 6 },
    instructorMeetings: { medium: 10, high: 18 },
    instructorCourses: { medium: 4, high: 8 }
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
  // הנחה: X (מפגש נוכחי) נקבע לפי ActualMeetings בפועל.
  const actualMeetings = Math.max(0, numberFrom(course?.[COURSE_FIELDS.ACTUAL_MEETINGS], course?.[COURSE_FIELDS.SOURCE_ACTUAL_MEETINGS]));
  return {
    plannedMeetings,
    actualMeetings,
    meetingNumber: Math.max(1, Math.min(actualMeetings, plannedMeetings || 1))
  };
}

export function getInstructorLoad(instructorCourses = [], options = {}) {
  const today = options.today instanceof Date ? options.today : new Date();
  const upcomingMeetings = (instructorCourses || []).reduce((sum, course) => {
    const dateCount = COURSE_FIELDS.DATE_FIELDS
      .map((fieldName) => course?.[fieldName])
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((dateValue) => !Number.isNaN(dateValue.getTime()) && dateValue >= new Date(today.getFullYear(), today.getMonth(), today.getDate()))
      .length;
    return sum + dateCount;
  }, 0);
  const activeCourses = (instructorCourses || []).length;
  const thresholds = TAASIYEDA_DATA_CONTRACTS.loadThresholds;
  if (upcomingMeetings >= thresholds.instructorMeetings.high || activeCourses >= thresholds.instructorCourses.high) {
    return { key: 'high', label: 'גבוה', status: 'declined', upcomingMeetings, activeCourses };
  }
  if (upcomingMeetings >= thresholds.instructorMeetings.medium || activeCourses >= thresholds.instructorCourses.medium) {
    return { key: 'medium', label: 'בינוני', status: 'pending-final', upcomingMeetings, activeCourses };
  }
  return { key: 'low', label: 'נמוך', status: 'approved', upcomingMeetings, activeCourses };
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
