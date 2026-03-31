# p-2026

מערכת ניהול עברית מלאה (RTL) עם:
- Backend ב-Google Apps Script
- Frontend מוגש מ-Apps Script באותו Web App (same-origin)
- מקור יחיד לבקשות עריכה: `EDIT_REQUESTS`

## מבנה Backend סופי
- `Core.gs`
- `Logic.gs`
- `Config.gs`
- `Utils.gs`

## מבנה Frontend
- `index.html` (מסך מלא + CSS + JS, מוגש דרך `doGet`)
- `frontend/` (עותק פיתוח סטטי לצורכי תחזוקה בלבד)

## הערות
- נקודת הכניסה הפעילה היא ה-Web App של Apps Script בלבד.
- אין תלות runtime ב-GitHub Pages עבור פעולת המערכת.
- כל הקריאות והכתיבות ל-Sheets מתחילות מנתונים בשורה 3 (אחרי שורות כותרת 1–2).
