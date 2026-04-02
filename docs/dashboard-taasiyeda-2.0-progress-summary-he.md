# Dashboard Taasiyeda 2.0 – סיכום מצב מפורט (נכון ל־2026-04-02)

## 1) קבצים ששונו/נוצרו עד כה (לפי היסטוריית הפיתוח בענף הנוכחי)

### Backend (Google Apps Script)
- `/workspace/dev/Config.gs` — עודכנו קבועים ושמות שדות/מבנה לטובת התאמה ל־DATA_MASTER, SUMMARY וטעינת מדדים מדויקת. בנוסף בוצעו תיקוני מיפוי עמודות והרשאות.  
- `/workspace/dev/Logic.gs` — חיזוק לוגיקת Login מול PERMISSIONS, מיפוי פרופיל משתמש/תפקידים, טעינת Dashboard לפי סכמות מעודכנות, שיפורים בשיוך מדריך (EmployeeID/Employee), ותהליכי בקשות שינוי/אישורים.  
- `/workspace/dev/Utils.gs` — מנגנון קריאת טבלאות לפי מבנה שיט (Header/Display/Data), נרמול מזהים/שמות, append/update שורות, יצירת EDIT_REQUESTS אם חסר, ותמיכה במבני גיליונות שונים.  
- `/workspace/dev/Core.gs` — API Router ל־actions הראשיות (login/logout/dashboard/courses/requests/approvals/eden). כולל תמיכה בבניית payload פרמטרי POST.

### Frontend
- `/workspace/dev/frontend/app.js` — נבנה/עודכן ממשק SPA מלא: Login, Dashboard, Courses, My Requests, Approvals, Eden View, ניווט רספונסיבי, כרטיסי ניהול, Drill-down מדריכים, פילטרים, KPI actions, ופעולות עריכה/בקשת שינוי בצד UI.
- `/workspace/dev/frontend/styles.css` — עיצוב מחדש מקיף לפי שפת המותג Dashboard Taasiyeda, כרטיסים ניהוליים, טבלאות, מצב מובייל, היררכיית KPI ותצוגות מסך.
- `/workspace/dev/frontend/index.html` — עדכוני מעטפת Frontend וטעינת האפליקציה.
- `/workspace/dev/frontend/manifest.webmanifest` — עדכון מאפייני PWA.
- `/workspace/dev/frontend/state.js` — User/session state כולל שדות הרשאה מלאים (SystemRole/ViewScope/EditScope/ApprovalScope/TeamScope/IsDualMode וכו׳) והתמדה ב־sessionStorage.
- `/workspace/dev/frontend/api.js` — שכבת API מאוחדת מול Web App של Apps Script + עדכון URL לפרודקשן.
- `/workspace/dev/frontend/data-engine.js` **(קובץ חדש)** — מנוע נתונים מרכזי: Data Store, טעינת sheets, מיפויי PERMISSIONS/COURSES, סינון לפי הרשאות, פונקציות refresh/update/request.

## 2) מה בוצע בפועל

### מסכים שנבנו/שוכתבו
- מסך התחברות (Login) עם Session Persist בצד לקוח.
- Dashboard ארצי עם KPI, תצוגות יום/שבוע/חודש, טבלאות עזר ומשימות.
- מסך קורסים/פעילויות במבנה כרטיסים ניהוליים + פילטרים + פתיחת פרטי קורס.
- תצוגת מדריכים (Instructor View) עם Drill-down לפי מדריך.
- מסך “הבקשות שלי”.
- מסכי אישורים (Operational + Final) ומסך Eden View לחריגות/תור.

### קומפוננטים/בלוקים מרכזיים
- Navigation sidebar + mobile nav toggle/backdrop.
- KPI cards עם פעולות פילטור.
- Management cards לקורסים ומדריכים.
- Course details panel + status chips + progress mini bar.
- Filter bars למסכי קורסים/חריגות.
- Tables גנריות למסכי requests/approvals.

### Stores / Services / Data Functions
- `userState` (frontend/state.js): אחסון פרופיל והרשאות משתמש.
- `dataStore` (frontend/data-engine.js): שכבות cache לפי domain (courses/permissions/lists/requests…).
- `initDataEngine`, `loadPermissions`, `loadCourses`, `loadDataMaster`, `loadEditRequests`, `loadReviewItems`.
- `getPermissionForUser`, `getCoursesForUser`, `buildFilterOptions`, `refreshCourse`, `updateCourse`, `createEditRequest`.
- API service ב־frontend/api.js עם פעולות login/dashboard/courses/approvals וכו׳.

### מה כבר עובד
- התחברות והרמת פרופיל משתמש מ־PERMISSIONS.
- טעינת Dashboard KPIs ותצוגות ניהוליות.
- טעינת קורסים למשתמש, פילטור מתקדם ו־drill-down מדריכים.
- יצירה/ניהול workflow של בקשות שינוי ואישורים (בצד לוגיקה Backend קיימת תשתית משמעותית).

## 3) יישום לפי הדרישות המפורטות

### מנגנון טעינה חכם (Data Store / Lazy Loading / Partial Refresh)
- יושם Data Store מרכזי + `loadedAt` לכל ישות (courses/permissions/lists/requests…).
- קיימת Lazy Loading חלקית: חלק מהישויות נטענות לפי צורך (editRequests/reviewItems/dataMaster).
- קיים Refresh לקורסים (`refreshCourse`) אך בפועל מתבצע reload של כל רשימת הקורסים ואז איתור פריט — כלומר Partial Refresh “לוגי”, לא דיפרנציאלי מלא ברמת שורה.

### טעינת COURSES ו‑PERMISSIONS לפי מבנה 1/2/3 בשיטס
- ב־Backend וב־Data Engine יושם דילוג על שורת תצוגה (display row) בגיליונות בהם יש מבנה Header/Display/Data.
- `Utils.readTable` מגדיר מבנה קריאה לפי סוג sheet; וב־frontend `parseRowsToObjects` משתמש ב־rows.slice(2) ל־sheets הרלוונטיים.

### מודל הרשאות מלא לפי PERMISSIONS
- יושם מיפוי רחב של שדות PERMISSIONS: BaseRole/SystemRole/DisplayRole/ViewScope/EditScope/ApprovalScope/TeamScope/IsDualMode ויכולות Dashboard/Edit/Approve.
- נבנתה לוגיקה לבחירת הרשאת משתמש, וסינון תצוגת קורסים לפי scope/role.

### חיבור בין מסך הקורסים להרשאות המשתמש
- פעולות “עריכה ישירה” מול “בקשת שינוי” נקבעות לפי הרשאות (למשל IDAN_MAIN_ADMIN / MAIN_DATA_DIRECT_EDIT).
- סינון קורסים למשתמש נעשה לפי `getCoursesForUser` + `canViewCourse` בהתאם ל־scope/team/self.

### סנכרון דו-כיווני מול Google Sheets
- קיים כיוון קריאה מלא ממספר sheets.
- קיימת תשתית כתיבה ל־EDIT_REQUESTS ואישור סופי שמעדכן DATA_MASTER.
- עם זאת, חסרות נקודות API חשובות בצד Router עבור `getSheetRowsAction`, `updateCourseAction`, `createEditRequestAction`, למרות שה־Frontend קורא להן — ולכן הסנכרון הדו-כיווני עדיין לא שלם end-to-end.

## 4) תקלות/מגבלות שזוהו והפתרונות שיושמו

### תקלות שנפתרו
- חוסר התאמה במיפוי KPI/סכמות Dashboard → תוקן בהתאמת הקריאה ל־SUMMARY/DATA_MASTER.
- בעיות זיהוי headers/עמודות בשיטס → תוקן באמצעות נרמול ומנגנון resolveIndex עקבי.
- שגיאות שיוך מדריך לפי מזהים/שמות (EmployeeID/Employee) → תוקן בנרמול מזהים ושיוך משופר.
- חוסר אחידות עיצובית וחוויית UI → בוצע redesign מקיף למערכת + כרטיסים ניהוליים.
- URL של Apps Script עודכן פעמיים לגרסה פעילה עדכנית.

### מגבלות פתוחות
- חוסר wiring ב־Backend Router לפעולות שקיימות רק ב־Frontend (`getSheetRows`, `updateCourse`, `createEditRequest`) — יוצר פער תפקודי במסך הקורסים.
- Partial Refresh אינו דיפרנציאלי אמיתי.
- אין עדיין חבילת בדיקות אוטומטיות מקיפה (unit/integration/e2e) שמכסה את כל הזרימה.

## 5) מה נשאר לביצוע להשלמה מלאה

### השלמת מסך ניהול הקורסים
- לחבר end-to-end את פעולות עריכה/בקשת שינוי (כולל Router + Logic + ולידציה).
- להוסיף שמירה פר-שדה, optimistic UI, וטיפול מלא בשגיאות API.
- לשפר partial refresh לשורת קורס יחידה ללא טעינה מלאה.

### שאר המסכים
- שבוע/חודש: להעמיק drill-down, פילוח לפי רשות/בית ספר/מדריך עם פרפורמנס טוב.
- מדריכים: השלמת דשבורד עומסים, התראות, פעולות ניהול ייעודיות.
- חריגות: חיבור מלא לפעולות טיפול, הקצאה ומעקב SLA.
- בקשות שינוי: UX מלא לטיוטה/שליחה/היסטוריית שינויים/השוואת גרסאות.

### השלמות רוחביות
- השלמת Authorization מטריציוני לכל route/action (Backend + Frontend Guard).
- Telemetry/Logging ברור לתקלות פרודקשן.
- בדיקות אוטומטיות + בדיקות רגרסיה על סכמות שיטס.
- הקשחת Sync דו-כיווני מול Google Sheets (retry/idempotency/conflict handling).
