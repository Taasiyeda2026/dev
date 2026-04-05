# AGENT_FIXES — תוכנית תיקונים מלאה
## Dashboard Taasiyeda — taasiyeda2026/dev

> מסמך זה מיועד לסוכן AI שיבצע את השינויים ישירות על הריפו.
> יש לבצע את השינויים **לפי הסדר המפורט**. כל תיקון עצמאי ומוגדר.
> **אין לשנות שום דבר מחוץ לקטעים המצוינים במדויק.**

---

## מבנה הריפו

```
dev/
  frontend/
    app.js
    api.js
    data-engine.js
    data-contracts.js
    styles.css
    index.html
    state.js
    sw.js
  backend/
    Core.gs
    Logic.gs
    Config.gs
    Utils.gs
    appsscript.json
```

---

## תיקון 1 — `data-contracts.js`: DATE_FIELDS מוגבל ל-15 במקום 30

**קובץ:** `frontend/data-contracts.js`

**הבעיה:** גיליון DATA_MASTER מכיל עמודות Date1–Date30, אבל הקוד מגדיר רק 15. קורסים עם יותר מ-15 מפגשים מאבדים את שאר התאריכים בכל חישוב.

**מצא את השורה הזו (בדיוק):**
```js
DATE_FIELDS: Array.from({ length: 15 }, (_, index) => `Date${index + 1}`)
```

**החלף ב:**
```js
DATE_FIELDS: Array.from({ length: 30 }, (_, index) => `Date${index + 1}`)
```

---

## תיקון 2 — `app.js`: COURSES_SCREEN_CONFIG.meetingFields.end

**קובץ:** `frontend/app.js`

**הבעיה:** `collectCourseDates` רץ עד Date15 בלבד.

**מצא את השורה הזו (בדיוק):**
```js
const COURSES_SCREEN_CONFIG = {
  progress: { successRatio: 0.9, warningRatio: 0.6 },
  meetingFields: { start: 1, end: 15, fallbackEndField: COURSE_FIELDS.END }
};
```

**החלף ב:**
```js
const COURSES_SCREEN_CONFIG = {
  progress: { successRatio: 0.9, warningRatio: 0.6 },
  meetingFields: { start: 1, end: 30, fallbackEndField: COURSE_FIELDS.END }
};
```

---

## תיקון 3 — `app.js`: לוגיקת `isMissingReport` ו-`hasException` שגויה

**קובץ:** `frontend/app.js`

**הבעיה:**
- `hasException` = `actual > planned` — כמעט בלתי אפשרי, גורם ל-83 "חריגות" מזויפות
- `isMissingReport` = `actual < planned` — מסמן כל קורס שעדיין לא הסתיים כ"חסר דיווח"
- הגדרה נכונה: **חריגה** = רשומה פתוחה ב-REVIEW_REQUIRED. **חסר דיווח** = מספר תאריכים שכבר עברו גדול מ-ActualMeetings, **ואין** דחייה מאושרת בהערות.

**מצא את הפונקציה הזו (בדיוק):**
```js
function isMissingReport(row) {
  const progress = getSessionProgress(row);
  const planned = progress.plannedMeetings;
  const actual = progress.actualMeetings;
  return planned > 0 && actual < planned;
}
```

**החלף ב:**
```js
function countPastDueMeetings(row) {
  const today = startOfDay(new Date());
  return COURSE_DATE_FIELDS.reduce((count, fieldName) => {
    const d = parseDateLike(getCourseField(row, fieldName));
    return (d && d < today) ? count + 1 : count;
  }, 0);
}

function isMissingReport(row) {
  const due = countPastDueMeetings(row);
  if (due === 0) return false;
  const actual = getSessionProgress(row).actualMeetings;
  const hasApprovedDelay = parseDelayInfo(getCourseField(row, COURSE_FIELDS.NOTES)).isPostponed;
  return actual < due && !hasApprovedDelay;
}
```

**מצא את הפונקציה הזו (בדיוק):**
```js
function hasException(row) {
  const progress = getSessionProgress(row);
  const planned = progress.plannedMeetings;
  const actual = progress.actualMeetings;
  return planned > 0 && actual > planned;
}
```

**החלף ב:**
```js
function hasException(row) {
  const courseId = String(getCourseField(row, COURSE_FIELDS.COURSE_ID) || '');
  if (!courseId) return false;
  const reviewItems = getStoreSnapshot().reviewItems || [];
  return reviewItems.some((r) => {
    const rId = String(
      getExceptionField(r, EXCEPTION_FIELDS.COURSE_ID) ||
      r.CourseID || r.SourceCourseID || ''
    );
    return rId === courseId && getExceptionTreatmentStatus(r) === 'open';
  });
}
```

---

## תיקון 4 — `app.js`: `Core.gs` — `doPost` לא מפרסר JSON body

**קובץ:** `backend/Core.gs`

**הבעיה:** `api.js` שולח URLSearchParams (לא JSON). `doPost` מנסה `JSON.parse` ראשון — נכשל בשקט — ורק אז נופל ל-`buildPayloadFromParams_`. סדר זה תקין מקרית, אבל פגיע: אם יגיע body ריק עם header שגוי — ה-payload יהיה ריק ופעולות כתיבה ייכשלו בלי הודעת שגיאה מובנת.

**מצא את הבלוק הזה (בדיוק):**
```js
function doPost(e) {
  var body = {};
  try {
    body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  } catch (err) {
    body = {};
  }

  var action = Utils.normalize(body.action || (e && e.parameter && e.parameter.action));
  var payload = Utils.asObject(body.payload, {});
  if (!Object.keys(payload).length) {
    payload = buildPayloadFromParams_(e && e.parameter ? e.parameter : {});
  }
  var result = routeAction_(action, payload);
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
```

**החלף ב:**
```js
function doPost(e) {
  var action = '';
  var payload = {};

  // נסה URLSearchParams קודם (זה מה שה-frontend שולח)
  var params = e && e.parameter ? e.parameter : {};
  action = Utils.normalize(params.action || '');
  payload = buildPayloadFromParams_(params);

  // אם לא נמצא action ב-params — נסה JSON body (גיבוי לשימוש עתידי)
  if (!action) {
    try {
      var body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
      action = Utils.normalize(body.action || '');
      payload = Utils.asObject(body.payload, {});
    } catch (err) {
      // לא JSON תקני — ממשיכים עם מה שיש
    }
  }

  var result = routeAction_(action, payload);
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
```

---

## תיקון 5 — `app.js`: קישור חריגה לקורס דרך `SourceRow` כגיבוי

**קובץ:** `frontend/app.js`

**הבעיה:** גיליון REVIEW_REQUIRED אינו מכיל עמודת `CourseID` — יש רק `SourceRow`. `buildExceptionsRows` מחפש לפי `CourseID` ולא מוצא כלום.

**מצא את הפונקציה הזו (בדיוק):**
```js
function buildExceptionsRows(reviewRows, courses, filters) {
  const clean = Object.fromEntries(Object.entries(filters || {}).map(([key, value]) => [key, String(value || '').trim().toLowerCase()]));
  return (reviewRows || []).map((row) => {
    const linkedCourse = (courses || []).find((course) => String(getCourseField(course, COURSE_FIELDS.COURSE_ID) || '') === String(getExceptionField(row, EXCEPTION_FIELDS.COURSE_ID) || '')) || {};
```

**החלף את שורת `linkedCourse` בלבד (שאר הפונקציה נשארת ללא שינוי):**
```js
function buildExceptionsRows(reviewRows, courses, filters) {
  const clean = Object.fromEntries(Object.entries(filters || {}).map(([key, value]) => [key, String(value || '').trim().toLowerCase()]));
  return (reviewRows || []).map((row) => {
    const reviewCourseId = String(getExceptionField(row, EXCEPTION_FIELDS.COURSE_ID) || '');
    const reviewSourceRow = String(row._rowNumber || row.SourceRow || '');
    const linkedCourse = (courses || []).find((course) => {
      if (reviewCourseId) return String(getCourseField(course, COURSE_FIELDS.COURSE_ID) || '') === reviewCourseId;
      if (reviewSourceRow) return String(course._rowNumber || '') === reviewSourceRow;
      return false;
    }) || {};
```

---

## תיקון 6 — `app.js`: `hasException` ב-`buildWeeklyBuckets` — אותה בעיה

**קובץ:** `frontend/app.js`

**הבעיה:** `buildWeeklyBuckets` בודק `hasReviewItem` לפי `EXCEPTION_FIELDS.COURSE_ID` שלא קיים ב-REVIEW_REQUIRED.

**מצא את השורה הזו (בדיוק) בתוך `buildWeeklyBuckets`:**
```js
const hasReviewItem = reviewItems.some((review) => String(getExceptionField(review, EXCEPTION_FIELDS.COURSE_ID) || '') === String(getCourseField(course, COURSE_FIELDS.COURSE_ID) || '') && !isResolvedException(review));
```

**החלף ב:**
```js
const courseId = String(getCourseField(course, COURSE_FIELDS.COURSE_ID) || '');
const hasReviewItem = reviewItems.some((review) => {
  const rId = String(getExceptionField(review, EXCEPTION_FIELDS.COURSE_ID) || review.CourseID || '');
  const rRow = String(review._rowNumber || review.SourceRow || '');
  const matches = rId ? rId === courseId : (rRow && rRow === String(course._rowNumber || ''));
  return matches && !isResolvedException(review);
});
```

---

## תיקון 7 — `data-engine.js`: mapPermissionRow — חסר שדה ActiveFlag

**קובץ:** `frontend/data-engine.js`

**הבעיה:** `PERMISSION_FIELDS` ב-`data-contracts.js` לא מגדיר `ACTIVE_FLAG`, ו-`mapPermissionRow` לא ממפה אותו. משתמש לא-פעיל (`ActiveFlag=NO`) עדיין יוכל להתחבר דרך הפרונטאנד אם הסשן כבר קיים.

**מצא בקובץ `data-contracts.js` את בלוק `permission:`:**
```js
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
      CAN_APPROVE_TO_MAIN_DATA: 'CanApproveToMainData',
      CAN_ACCESS_FINANCE: 'CanAccessFinance',
      CAN_EDIT_FINANCE: 'CanEditFinance',
      CAN_ACCESS_FINANCE_ARCHIVE: 'CanAccessFinanceArchive',
      CAN_EDIT_FINANCE_ARCHIVE: 'CanEditFinanceArchive'
    }
```

**החלף ב:**
```js
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
      ACTIVE_FLAG: 'ActiveFlag',
      CAN_VIEW_DASHBOARD: 'CanViewDashboard',
      CAN_EDIT_MASTER_DATA: 'CanEditMasterData',
      CAN_APPROVE_TO_MAIN_DATA: 'CanApproveToMainData',
      CAN_ACCESS_FINANCE: 'CanAccessFinance',
      CAN_EDIT_FINANCE: 'CanEditFinance',
      CAN_ACCESS_FINANCE_ARCHIVE: 'CanAccessFinanceArchive',
      CAN_EDIT_FINANCE_ARCHIVE: 'CanEditFinanceArchive'
    }
```

**מצא בקובץ `data-engine.js` בתוך `mapPermissionRow` את השורה:**
```js
    isDualMode: toBool(raw[PERMISSION_FIELDS.IS_DUAL_MODE]),
```

**הוסף אחריה (שורה חדשה):**
```js
    activeFlag: toBool(raw[PERMISSION_FIELDS.ACTIVE_FLAG]),
```

---

## תיקון 8 — `Config.gs`: FRONTEND_FIELDS.COURSES חסר Date16–Date30

**קובץ:** `backend/Config.gs`

**הבעיה:** `FRONTEND_FIELDS.COURSES` מגדיר את השדות שה-GAS מחזיר לפרונטאנד. אין צורך לרשום Date16–Date30 ידנית כי `getMyCoursesData` ב-Logic.gs כבר מוסיף אותם דינמית מהכותרות — אבל `getSheetRows` (ה-path הישיר) מחזיר את כל הכותרות ממילא. לכן אין שינוי נדרש ב-Config.gs עבור זה.

**אין שינוי נדרש בקובץ זה.**

---

## תיקון 9 — `app.js`: `parseDateLike` — serial numbers קטנים לא מטופלים

**קובץ:** `frontend/app.js`

**הבעיה:** `parseDateLike` בודק `value > 20000 && value < 60000` עבור Excel serial numbers. אבל שדות `MonthEnd` ו-`MonthStart` ב-DASHBOARD_EXPORT מגיעים כמספרים קטנים (2, 4) שמייצגים חודש, לא תאריך. הבעיה היא **ב-DASHBOARD_EXPORT עצמו** שכותב ערכי נוסחה שגויים.

**הפתרון הנכון הוא לא לקרוא MonthEnd/MonthStart מ-DASHBOARD_EXPORT אלא לחשב אותם בפרונטאנד מה-End date.**

**מצא בקובץ `app.js` את הפונקציה `withOperationalMetrics`:**
```js
function withOperationalMetrics(baseData, courses) {
```

**הוסף שורה ראשונה בתוך הפונקציה, לפני כל שימוש ב-`d.activeNowCount`:**
אין שינוי נדרש בפונקציה עצמה — הנתונים מגיעים ממנה נכון.

**הבעיה האמיתית:** `getDashboardData` ב-Logic.gs קורא מ-SUMMARY ומ-DASHBOARD_EXPORT. ה-SUMMARY sheet מכיל את הנתונים הנכונים. יש לוודא ש-`getDashboardData` מעדיף SUMMARY על DASHBOARD_EXPORT.

**מצא בקובץ `Logic.gs` בתוך `getDashboardData`:**
```js
      var activeNowCount: asNumber_(summaryMetrics.activeNowCount) || asNumber_(exportMetrics.activeNowCount),
```

**אין שינוי בקוד** — הלוגיקה `summaryMetrics || exportMetrics` כבר נכונה. הבעיה היא ש-SUMMARY ריק או לא מעודכן. יש לוודא ב-Google Sheets שגיליון SUMMARY מכיל שורות נתונים תקינות בפורמט `Metric | Value`.

**פעולה נדרשת ב-Sheets (לא בקוד):** לוודא שגיליון SUMMARY מעודכן ומכיל שורות כמו:
```
Data master rows | 114
Course rows      | 114
```

---

## תיקון 10 — `app.js`: `openCourseActionForm` — הוספת שדה ActualMeetings

**קובץ:** `frontend/app.js`

**הבעיה:** הפורם עורך רק StartTime, EndTime, Notes. מנהל שרוצה לעדכן מספר מפגשים בפועל (ActualMeetings) לא יכול.

**מצא בתוך `openCourseActionForm` את הבלוק:**
```js
        <label>שעת התחלה<input id="courseFormStartTime" value="${escAttr(formatTimeValue(course.StartTime))}" placeholder="hh:mm" /></label>
        <label>שעת סיום<input id="courseFormEndTime" value="${escAttr(formatTimeValue(course.EndTime))}" placeholder="hh:mm" /></label>
        <label>הערות<input id="courseFormNotes" value="${escAttr(course.Notes || '')}" /></label>
        <label>תקציר שינוי<input id="courseFormSummary" value="" placeholder="${mode === 'edit' ? 'עדכון שעות/הערות' : 'בקשת שינוי במסך קורסים'}" /></label>
```

**החלף ב:**
```js
        <label>שעת התחלה<input id="courseFormStartTime" value="${escAttr(formatTimeValue(course.StartTime))}" placeholder="hh:mm" /></label>
        <label>שעת סיום<input id="courseFormEndTime" value="${escAttr(formatTimeValue(course.EndTime))}" placeholder="hh:mm" /></label>
        <label>מפגשים בפועל<input id="courseFormActualMeetings" type="number" min="0" max="30" value="${escAttr(String(course.ActualMeetings || ''))}" placeholder="מספר מפגשים שבוצעו" /></label>
        <label>הערות<input id="courseFormNotes" value="${escAttr(course.Notes || '')}" /></label>
        <label>תקציר שינוי<input id="courseFormSummary" value="" placeholder="${mode === 'edit' ? 'עדכון שעות/הערות' : 'בקשת שינוי במסך קורסים'}" /></label>
```

**מצא בתוך אותה פונקציה את הבלוק:**
```js
      close({
        changes: {
          StartTime: root.querySelector('#courseFormStartTime')?.value.trim() || '',
          EndTime: root.querySelector('#courseFormEndTime')?.value.trim() || '',
          Notes: root.querySelector('#courseFormNotes')?.value.trim() || '',
          summary
        }
      });
```

**החלף ב:**
```js
      const actualMeetingsRaw = root.querySelector('#courseFormActualMeetings')?.value.trim() || '';
      const changes = {
        StartTime: root.querySelector('#courseFormStartTime')?.value.trim() || '',
        EndTime: root.querySelector('#courseFormEndTime')?.value.trim() || '',
        Notes: root.querySelector('#courseFormNotes')?.value.trim() || '',
        summary
      };
      if (actualMeetingsRaw !== '') changes.ActualMeetings = actualMeetingsRaw;
      close({ changes });
```

---

## תיקון 11 — `styles.css`: החלפה מלאה

**קובץ:** `frontend/styles.css`

**הוראה:** להחליף את כל תוכן הקובץ בתוכן הקובץ `styles.css` החדש שצורף לריפו (כבר נוצר בנפרד ע"י המפתח).

**אם הקובץ החדש לא קיים בריפו** — אין לבצע שינוי זה.

---

## סיכום שינויים לפי קובץ

| קובץ | תיקונים |
|------|---------|
| `frontend/data-contracts.js` | תיקון 1, תיקון 7 (הוספת ACTIVE_FLAG) |
| `frontend/app.js` | תיקון 2, 3, 5, 6, 10 |
| `frontend/data-engine.js` | תיקון 7 (mapPermissionRow) |
| `backend/Core.gs` | תיקון 4 |
| `backend/Config.gs` | אין שינוי |
| `backend/Logic.gs` | אין שינוי |
| `frontend/styles.css` | תיקון 11 (החלפה מלאה) |

---

## סדר ביצוע מומלץ

1. `data-contracts.js` — תיקון 1 + 7a (הגדרות בסיס)
2. `data-engine.js` — תיקון 7b (mapPermissionRow)
3. `app.js` — תיקון 2 (COURSES_SCREEN_CONFIG)
4. `app.js` — תיקון 3 (isMissingReport + hasException) — הכי קריטי
5. `app.js` — תיקון 5 + 6 (חריגות ו-REVIEW_REQUIRED)
6. `app.js` — תיקון 10 (פורם עריכה)
7. `backend/Core.gs` — תיקון 4 (doPost)
8. `frontend/styles.css` — תיקון 11

---

## אימות אחרי כל שינוי

אחרי תיקון 3: לפתוח דשבורד ולוודא שה-KPI "פעילויות עם חריגה" מציג מספר קטן (רק קורסים עם רשומה ב-REVIEW_REQUIRED), ו"פעילויות עם חוסר" מציג רק קורסים שתאריכי מפגשים עברו ו-ActualMeetings פחות ממה שעבר.

אחרי תיקון 5+6: לפתוח מסך חריגות ולוודא שהקורסים מקושרים נכון.

אחרי תיקון 4: לפתוח DevTools → Network, לבצע עריכת קורס ולוודא שה-POST מגיע עם payload תקני ומחזיר `success: true`.
