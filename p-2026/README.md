# p-2026

מערכת ניהול עברית מלאה (RTL) עם:
- Backend ב-Google Apps Script
- Frontend סטטי בתיקיית `frontend`
- מקור יחיד לבקשות עריכה: `EDIT_REQUESTS`

## מבנה Backend סופי
- `Core.gs`
- `Logic.gs`
- `Config.gs`
- `Utils.gs`

## מבנה Frontend
- `frontend/index.html`
- `frontend/styles.css`
- `frontend/app.js`
- `frontend/api.js`
- `frontend/state.js`

## הערות
- אין HtmlService פעיל.
- אין קבצי UI בתוך Apps Script.
- כל הקריאות והכתיבות ל-Sheets מתחילות מנתונים בשורה 3 (אחרי שורות כותרת 1–2).
