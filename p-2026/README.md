# שלד ראשוני למערכת ניהול ארצית (Google Apps Script)

## מה כולל הפרויקט
שלד ראשוני עובד ל־Google Apps Script + Google Sheets עבור:
1. מסך התחברות
2. דשבורד בסיסי לקריאה בלבד
3. תשתית קוד מופרדת בין צד שרת לצד לקוח

## קבצים שנוצרו
- `appsscript.json`
- `Main.gs`
- `Config.gs`
- `AuthService.gs`
- `SheetService.gs`
- `DashboardService.gs`
- `Utils.gs`
- `Layout.html`
- `Login.html`
- `Dashboard.html`
- `Styles.html`
- `LoginScripts.html`
- `DashboardScripts.html`

## מה ממומש במשימה הראשונה
- טעינת מעטפת מערכת עם RTL מלא ותצוגה בעברית.
- כניסה למערכת מול גיליון `PERMISSIONS` בלבד.
- שמירת Session בסיסי ב־`UserProperties`.
- ניתוב בין `Login` ל־`Dashboard` על בסיס מצב התחברות.
- קריאת נתונים לקריאה בלבד מדפי Google Sheets הרלוונטיים.
- חישוב KPI בסיסיים לדשבורד:
  - מספר תוכניות פעילות
  - מספר קורסים פעילים
  - מספר מדריכים פעילים
  - מתוכנן מול בוצע
  - פער ביצוע
  - רשומות דורשות בדיקה
  - בקשות ממתינות לאישור (אם `EDIT_REQUESTS` קיים)
  - בסיס שעות עבודה למדריכים
- זיהוי דינמי של עמודות תאריך לפי כותרות.

## מה עדיין לא ממומש
- מסכי מערכת נוספים (MyCourses / EditForm / MyRequests / Approvals)
- עריכה או כתיבה ל־`DATA_MASTER`
- approve/decline
- ניהול הרשאות מתקדם
- דוחות יצוא מתקדמים

## איך פותחים את הפרויקט ב־Apps Script
1. פתח Google Sheets של המערכת.
2. היכנס ל־Extensions > Apps Script.
3. צור/החלף את קבצי הפרויקט לפי המבנה בתיקייה זו.
4. ודא שהקבצים הם באותם שמות בדיוק.
5. בצע Deploy מסוג Web App.

## מה צריך לחבר או לעדכן לפני הרצה
1. לוודא שגיליונות הבסיס קיימים:
   - `DATA_MASTER`
   - `COURSES`
   - `PERMISSIONS`
   - `REVIEW_REQUIRED`
   - `DASHBOARD_EXPORT`
2. לוודא שכותרות בגיליון `PERMISSIONS` כוללות שדה זיהוי משתמש ושדה קוד כניסה.
3. מומלץ להתאים/להרחיב את רשימות ה־aliases ב־`Config.gs` לפי הכותרות המדויקות בפועל.

## הנחות ושאלות פתוחות
- בפרויקט זה לא בוצעה גישה לקובץ גיליון ספציפי עם נתוני אמת מתוך הסביבה המקומית, לכן שימוש ב־aliases נעשה בצורה גמישה כדי להתאים לכותרות בפועל בזמן ריצה.
- אם כותרות קריטיות לא קיימות בפועל (`EmployeeID`, `PlannedMeetings`, `ActualMeetings`, `StartTime`, `EndTime` וכו'), הדשבורד לא ייפול אלא יציג רשימת שדות חסרים.
- `EDIT_REQUESTS` הוא אופציונלי: אם לא קיים, יוצג מסר מתאים ולא שגיאה.
