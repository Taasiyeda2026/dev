# Taasiyeda – Full Corrective Bundle (expanded)

מטרת המסמך: לרכז במקום אחד תיקונים רחבים יותר מה־patch הקודם, כדי לכסות את הבעיות שנשארו בפועל במערכת, ולא רק שיפורי UI נקודתיים.

המסמך בנוי לפי קבצים, עם בלוקים להחלפה/הוספה, והערות בדיקה בסוף.

---

## 1) `frontend/app.js`

### 1.1 Helper להצגת סטטוס כספים בעברית

הוסף ליד helpers של תצוגה:

```js
function getFinanceStatusLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'closed' ? 'סגור' : 'פתוח';
}
```

בכל מקום במסך כספים / ייצוא / כרטיסים שבו מוצג `FinanceStatus` או `finance_status`, להציג:

```js
getFinanceStatusLabel(row?.FinanceStatus || row?.finance_status)
```

ולא את הערך הגולמי `open / closed`.

---

### 1.2 תיקון חיפוש כך שלא יישארו שורות פירוט פתוחות בלי שורת האב

החלף את `applyInPlaceSearchFilter(...)` בגרסה הזאת:

```js
function applyInPlaceSearchFilter(route = currentRoute, rawTerm = '') {
  if (route !== currentRoute) return;
  const term = String(rawTerm || '').trim().toLowerCase();
  const main = document.getElementById('main');
  if (!main) return;

  const tableBodies = main.querySelectorAll('tbody');
  tableBodies.forEach((tbody) => {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach((row) => {
      const isDetails = row.classList.contains('contact-details-row');
      if (isDetails) return;
      const next = row.nextElementSibling;
      const linkedDetails = next && next.classList.contains('contact-details-row') ? next : null;
      if (!term) {
        row.style.display = '';
        if (linkedDetails) linkedDetails.style.display = '';
        return;
      }
      const text = String(row.textContent || '').toLowerCase();
      const visible = text.includes(term);
      row.style.display = visible ? '' : 'none';
      if (linkedDetails) linkedDetails.style.display = visible ? '' : 'none';
    });
  });

  const cards = main.querySelectorAll('.management-card, .mini-card, .control-board-card');
  cards.forEach((el) => {
    if (!term) {
      el.style.display = '';
      return;
    }
    const text = String(el.textContent || '').toLowerCase();
    el.style.display = text.includes(term) ? '' : 'none';
  });
}
```

מטרה:
- שהקלדה לא תבצע `renderScreen()` מלא
- שלא יאבד focus
- שלא יישארו שורות accordion פתוחות בלי parent row

---

### 1.3 יישור KPI של מנהלים לאותה לוגיקה של הדשבורד

בפונקציה `withOperationalMetrics(...)`, החלף את השורה:

```js
const managerActiveCourses = managerCourses.filter((row) => getScheduleDates(row).some((d) => isDateInRange(d, currentMonthStart, currentMonthEnd)));
```

בזה:

```js
const managerActiveCourses = managerCourses.filter((row) => isActiveInMonthByStatusAndDates(row, currentMonthStart, currentMonthEnd));
```

מטרה:
- למנוע מצב שבו KPI ראשי אומר מספר אחד, ו־manager cards אומרים מספר אחר
- לשמור על `status + dates` כמקור אחיד

---

### 1.4 תצוגת "מסתיימים החודש" גם כשערך 0

כרגע יש כלל `show_only_nonzero_kpis = yes`, אבל הוא עלול להעלים KPI חשוב ולגרום לבלבול.

במקום:

```js
const topKpis = runtimeRules.showOnlyNonZeroKpis
  ? allTopKpis.filter((item) => Number(item.value || 0) !== 0)
  : allTopKpis;
```

השתמש בגרסה הזאת:

```js
const topKpis = runtimeRules.showOnlyNonZeroKpis
  ? allTopKpis.filter((item) => {
      if (item.filter === 'ending_this_month') return true;
      return Number(item.value || 0) !== 0;
    })
  : allTopKpis;
```

מטרה:
- "מסתיימים החודש" יישאר גלוי גם כאשר הערך 0
- המשתמש לא יחשוב שה־KPI נמחק

---

### 1.5 פתיחת קורס גם מטבלת פעילויות באופן גלוי

אם יש bind נפרד למסך activities / courses table, ודא שכל `[data-open-course]` משתמש באותה פונקציה משותפת:

```js
document.querySelectorAll('[data-open-course]').forEach((button) => {
  button.addEventListener('click', async () => {
    await openCourseFromPlanner(button.dataset.openCourse);
  });
});
```

וודא שאין מסלול אחר שעושה רק `setRoute('courses')` בלי:
- בחירת קורס
- `loadCourseMeetings(...)`
- toast / תגובה גלויה

---

### 1.6 כפתור עריכה/בקשה עקבי בפרטי קורס

בכל מקום שבו יש כפתור פעולה לקורס, להשתמש בתווית לפי mode אמיתי:

```js
${canEditMasterCourses() ? 'עריכה' : 'שלח בקשת שינוי'}
```

ובתוך `openCourseActionForm(course, mode)` לשמור על:

```js
const isDirectEdit = mode === 'edit';
const formTitle = isDirectEdit ? 'עריכה ישירה' : 'בקשת שינוי';
const formSubmitLabel = isDirectEdit ? 'שמירה ישירה' : 'שליחה לעדן';
```

---

### 1.7 העתקת אימייל – משוב קטן למשתמש

ב־bind של כפתור העתקה במסך אנשי קשר, להוסיף toast אחרי copy:

```js
async function copyEmailToClipboard(email) {
  const value = String(email || '').trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    showToast('הדוא״ל הועתק', 'success', 1600);
  } catch (_) {
    showToast('לא ניתן היה להעתיק דוא״ל', 'error', 2200);
  }
}
```

ולחבר את `data-copy-email` לפונקציה הזאת.

---

## 2) `frontend/data-engine.js`

### 2.1 טיפול קשיח יותר ב־`end_date` שמגיע מנוסחה

הפונקציה `parseDateLike(...)` כבר תומכת בהרבה פורמטים, אבל יש להוסיף תמיכה גם למחרוזות עם זמן ו־UTC בסגנון Sheets, אם לא נקלטות בכל המקרים.

החלף את סוף הפונקציה בגרסה הזאת:

```js
function parseDateLike(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === 'number' && value > 20000 && value < 60000) {
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + (value * 24 * 60 * 60 * 1000));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const raw = String(value).trim();

  if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial > 20000 && serial < 60000) {
      const excelEpoch = new Date(1899, 11, 30);
      const d = new Date(excelEpoch.getTime() + (serial * 24 * 60 * 60 * 1000));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const isoDateTime = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z)?$/);
  if (isoDateTime) {
    const d = new Date(
      Number(isoDateTime[1]),
      Number(isoDateTime[2]) - 1,
      Number(isoDateTime[3]),
      Number(isoDateTime[4]),
      Number(isoDateTime[5]),
      Number(isoDateTime[6] || '0')
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dmy) {
    const y = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const d = new Date(y, Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const direct = new Date(raw);
  return Number.isNaN(direct.getTime()) ? null : direct;
}
```

מטרה:
- ש־`end_date` לא ייעלם בגלל פורמט של נוסחת Sheets
- ש־finance / ending this month / course details יישענו על אותה קריאה

---

### 2.2 ספירת מפגשים שבוצעו – תאריכי עבר בלבד

להשאיר ולוודא שהלוגיקה הזאת נשמרת:

```js
DatesListedCount: (COURSE_FIELDS.DATE_FIELDS || []).reduce((count, field) => {
  const parsed = parseDateLike(financeMeetingDateRaw(row, field));
  return (parsed && parsed.getTime() <= todayTs) ? count + 1 : count;
}, 0)
```

מטרה:
- לא לספור תאריכי עתיד כבוצעו
- גם במסך כספים וגם בייצוא

---

### 2.3 זיהוי גפ"ן קשיח יותר

להשאיר helper כזה:

```js
function isGefenFunding(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/["׳״'\s-]/g, '');
  return normalized === 'גפן' || normalized === 'gefen';
}
```

ולהשתמש בו ב־:
- `Payer`
- `FinanceGroupKey`
- `FinanceGroupType`

---

## 3) `frontend/data-contracts.js`

### 3.1 שדות סטטוס מומלצים

להשאיר את ההפרדה הזאת ברורה:

- `status` = סטטוס פעילות
- `finance_status` = סטטוס כספי

ערכים מומלצים:

- בפעילות: `פעיל` / `הסתיים`
- בכספים: `open` / `closed`

אם יש מקום בקוד שמציג את `finance_status` ישירות, להציג אותו דרך helper עברי מה־UI, ולא לשנות את ערך המקור.

---

## 4) `frontend/styles.css`

### 4.1 חיזוק תצוגת פעילויות ואנשי קשר

ודא שקיימים הכללים האלה:

```css
.activities-table-wrap {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.activities-table-wrap tbody tr + tr td {
  border-top: 1px solid #dbe2f1;
}

.contacts-table-shell {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  padding: 6px;
}

.contacts-table-shell thead th {
  background: var(--surface-2);
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.contacts-table-shell tbody td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
  vertical-align: middle;
  font-size: 13px;
}
```

---

## 5) בדיקות חובה אחרי יישום

### 5.1 אדמין
- להיכנס כאדמין
- לפתוח קורס
- לוודא שרואים `עריכה ישירה` ו־`שמירה ישירה`
- לוודא שלא רואים `שליחה לעדן`

### 5.2 KPI
- לבדוק `סך קורסים`
- לבדוק `סך סדנאות`
- לבדוק `סך סיורים`
- לבדוק `פעילים החודש`
- לבדוק `מסתיימים החודש`
- לבדוק `חריגים`
- לוודא שמספרי המנהלים תואמים ללוגיקה הראשית

### 5.3 אנשי קשר
- הכותרות בעברית בלבד
- השדות המורחבים בעברית בלבד
- העתקת אימייל מציגה toast

### 5.4 חיפוש
- להקליד במהירות
- לוודא שאין קפיצת focus
- לוודא ששורות פירוט לא נשארות גלויות בלי parent row

### 5.5 כספים
- לבדוק תצוגת `פתוח / סגור`
- לבדוק grouping גפ"ן לפי בית ספר
- לבדוק grouping לא גפ"ן לפי funding
- לוודא שמפגשים שבוצעו = תאריכי עבר בלבד

### 5.6 end_date
- לבדוק רשומה שבה `end_date` מחושב מנוסחה
- לוודא שהוא מופיע:
  - בדשבורד
  - במסתיימים החודש
  - בכספים
  - בפרטי קורס

---

## 6) סדר יישום מומלץ

1. `frontend/app.js`
2. `frontend/data-engine.js`
3. `frontend/styles.css`
4. בדיקות מסך חיות
5. push
6. PR

