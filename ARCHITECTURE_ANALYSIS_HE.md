# ניתוח ארכיטקטורה וחיבור בין עמודים

## 1) מיפוי המערכת

### נקודת כניסה
- יש נקודת כניסה אחת: `index.html`.
- הקובץ כולל בתוכו גם HTML, גם CSS וגם JavaScript (inline script).

### חלוקת תצוגות (Pages/Views)
- **עמוד שיבוץ (לו"ז)**: `#scheduleView` עם גריד שעות/ימים ולחצן `+` לכל משבצת.
- **עמוד פוטנציאל**: `#potentialView` עם טאבים לתאריכים וטבלת פוטנציאל.
- מעבר בין העמודים נעשה ללא ניווט לקובץ HTML נוסף, באמצעות החלפת class `active`.

### קבצי JS שמנהלים לוגיקה
- אין קבצי JS נפרדים; כל הלוגיקה נמצאת ב־`<script>` בתוך `index.html`.
- פונקציות מרכזיות:
  - טעינת שיבוצים: `loadSchedule()`
  - יצירה/מחיקה שיבוץ: `addItem()`, `deleteItemByEvent()`
  - טעינת פוטנציאל: `loadPotentialData()`
  - עדכון פוטנציאל: `saveData()` (ולפניו queue מקומי דרך `pendingPotentialUpdates`)
  - ניווט בין תצוגות: `loadPage()`, `openPotentialView()`, `openScheduleView()`

### חיבור ל-Google Sheets / API
- מקור API יחיד: `API_URL` (Google Apps Script Web App).
- קריאות API קיימות:
  - `GET API_URL` → שיבוצים.
  - `POST {action:"add"}` → הוספת שיבוץ.
  - `POST {action:"delete"}` → מחיקת שיבוץ.
  - `POST {action:"clear"}` → איפוס שיבוצים.
  - `GET API_URL?action=potential` → טעינת פוטנציאל.
  - `POST {action:"updatepotential"}` → עדכון שורת פוטנציאל (זמנים/הערות/בוצע).

### איך הנתונים נשמרים ומתעדכנים
- **שיבוצים**: נשמרים בשרת מיד (add/delete/clear), ואז הלקוח מעדכן `schedule` מתשובת השרת.
- **פוטנציאל**:
  - שינוי מקומי בטופס (checkbox/notes/time) מעדכן אובייקט ב־`potentialData` ומסמן מזהה בתוך `pendingPotentialUpdates`.
  - שליחה לשרת מתבצעת ב־`saveData()` (למשל בלחיצה על שמור או במעבר בין תצוגות).

### תרשים זרימה פשוט

1. **שיבוץ**
   - עמוד שיבוץ → `saveAssignment()` → `addItem()` → Google Apps Script (`action=add`) → עדכון `schedule` + `render()`.

2. **מחיקת שיבוץ**
   - עמוד שיבוץ → click על כרטיס → `deleteItemByEvent()` → Google Apps Script (`action=delete`) → עדכון `schedule` + `render()`.

3. **פוטנציאל**
   - עמוד פוטנציאל → `loadPotentialData()` → Google Apps Script (`action=potential`) → `potentialData` → `renderPotential()`.

4. **עדכון פוטנציאל**
   - עמוד פוטנציאל → שינוי שדה → `updateNotes` / `toggleCompleted` / `updatePotentialTime` → `pendingPotentialUpdates`
   - ואז `saveData()` → Google Apps Script (`action=updatepotential`) → ניקוי queue.

---

## 2) הסבר עמוד הפוטנציאל

### מאיפה מגיעים הנתונים
- הנתונים מגיעים מ־`GET API_URL?action=potential`.
- התוצאה ממופה לפורמט אחיד בעזרת `mapPotentialRow()` (כולל נרמול תאריך ושעה ו-completed).

### איך הטבלה נבנית
- `renderPotential()`:
  - מסנן לפי תאריך נבחר (`filterByDate`).
  - בונה `tbody` דינמי עם שדות:
    - טקסט: authority/school/program/employee
    - `input type="time"` עבור start/end
    - `input text` עבור notes
    - `checkbox` עבור completed
  - מציג הודעת empty state אם אין שורות.

### איך מתבצעים עדכונים
- שינוי `notes`, `completed`, `startTime`, `endTime`:
  - מעדכן את הרשומה ב־`potentialData`
  - מוסיף `id` ל־`pendingPotentialUpdates`
- עדכון בפועל לשרת מתבצע ב־`saveData()` בלולאה על כל ה־IDs שסומנו.
- כלומר המנגנון הוא **batch-ish deferred save** ולא autosave מיידי לכל הקלדה.

---

## 3) הסבר עמוד השיבוץ

### איך נטענים הקורסים
- בעמוד השיבוץ יש מקור קבוע מקומי: `INSTRUCTOR_ASSIGNMENTS`.
- בבחירת מדריך במודל:
  - `populateInstructorDetails()` טוען בתי ספר וקורסים רלוונטיים מתוך המפה.
  - בחירת בית ספר מסננת את רשימת הקורסים.

### איך מתבצע שיבוץ Zoom
- פתיחת מודל דרך `+` במשבצת (`openModal(day,time)`).
- בעת שמירה (`saveAssignment()`):
  1. ולידציות (יום/שעה, מדריך נבחר, זמינות מדריך, חלון זמן מוגן).
  2. בחירת Zoom אוטומטית דרך `pickZoomForSlot()` לפי חוקים:
     - מניעת תפיסת Zoom זהה באותה משבצת.
     - העדפה לרצף של אותו מדריך.
     - בדיקת חפיפות דרך `slotsOverlap()`.
  3. שליחה לשרת ב־`addItem()` עם day/time/instructor/zoom/zoomLink/school/course.
  4. `repairSequences()` מנסה ליישר רצפים בין שעות סמוכות.
  5. רינדור מחדש.

### איפה נשמר השיבוץ
- נשמר ב־Google Sheets דרך Google Apps Script (`action:add/delete/clear`).
- הלקוח מחזיק עותק זיכרון `schedule` לצורך תצוגה וחישובים, אבל ה־source of truth הוא השרת.

---

## 4) נקודות חיבור בין פוטנציאל לשיבוץ

## זרימה רצויה
`פוטנציאל -> מעבר נתונים -> שיבוץ`

### דרך 1: חיבור דרך Google Sheets (מומלץ ל-Production)
- להוסיף שדות קישור (למשל `potentialId`, `status`) בנתוני השיבוץ.
- בעת יצירת שיבוץ מעמוד פוטנציאל:
  1. יוצרים שיבוץ (`action:add`)
  2. מעדכנים את שורת הפוטנציאל (`action:updatepotential`) עם `completed=true` ו/או `assignedScheduleId`.
- יתרון: עקביות בין משתמשים, מקור אמת יחיד, מניעת כפילויות בצד שרת.

### דרך 2: חיבור דרך `localStorage` (מהיר ליישום, חלש רב-משתמשים)
- בלחיצה על "שבץ" בפוטנציאל שומרים payload תחת key קבוע (למשל `pendingAssignment`).
- במעבר לעמוד השיבוץ קוראים payload, פותחים מודל עם נתונים prefilled.
- לאחר שמירה מוצלחת מוחקים מה־localStorage.
- יתרון: פשוט ומהיר.
- חסרון: לא מסתנכרן בין תחנות/משתמשים, סיכון לנתונים ישנים.

### דרך 3: חיבור דרך API/fetch ייעודי
- ליצור endpoint חדש ב־Apps Script, למשל:
  - `action=createAssignmentFromPotential`
  - קולט `potentialId` ומבצע בשרת טרנזקציה לוגית:
    1. שליפת שורת פוטנציאל
    2. יצירת שיבוץ
    3. סימון הפוטנציאל כמשובץ
- יתרון: אטומיות עסקית, פחות לוגיקה בצד לקוח, מניעת race conditions.

---

## 5) המלצה על הדרך הטובה ביותר

### המלצה
- **הדרך הטובה ביותר: API/Google Sheets בצד שרת עם מזהה קישור קבוע**.
- פרקטית זה שילוב של דרך 1 + דרך 3:
  - מודל נתונים משותף בגיליון (או בשני גיליונות עם foreign key)
  - endpoint אחד שמבצע "שיבוץ מפוטנציאל" כפעולה אחת.

### למה זו הדרך הנכונה
1. **העברה אוטומטית של נתונים** – אין תלות בפעולות ידניות בין עמודים.
2. **ללא כפילויות** – השרת יכול לבדוק אם `potentialId` כבר שויך.
3. **עדכון מיידי** – השרת מחזיר state מעודכן, והלקוח מרנדר מיד.
4. **עמידות רב-משתמשים** – מקור אמת אחד, ללא תלות ב-localStorage מקומי.

### עקרונות יישום ארכיטקטוניים
- להגדיר מזהים ברורים:
  - `potential.id` קיים
  - `schedule.id` קיים/מוחזר
  - `schedule.potentialId` חדש
- להגדיר סטטוסים לפוטנציאל: `new`, `assigned`, `cancelled`.
- לוגיקת מניעת כפילויות רק בשרת (לא רק בלקוח).
- הלקוח מציג אינדיקציה: "שובץ" ומפנה לשיבוץ הקיים במקום ליצור חדש.

