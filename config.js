// config.js
export const API_URL = "PUT_YOUR_APPS_SCRIPT_WEBAPP_URL_HERE";

// ימים שמוצגים בלוח (שבוע עבודה)
export const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];

// סלוטים עגולים בלבד (שעות עגולות)
export const TIMES = [
  "08:00-09:00",
  "09:00-10:00",
  "10:00-11:00",
  "11:00-12:00",
  "12:00-13:00",
  "13:00-14:00",
  "14:00-15:00",
  "15:00-16:00",
];

// חשבונות זום
export const ZOOMS = ["Zoom1", "Zoom2", "Zoom3"];

// קישורים קבועים לפי זום (תעדכן למה שיש לך)
export const ZOOM_LINKS = {
  Zoom1: "https://zoom.us/j/6023602336?omn=96962875568",
  Zoom2: "https://zoom.us/j/7601360450?omn=98989531483",
  Zoom3: "https://zoom.us/j/5274325600?omn=96368524491",
};

// הגנת זמן (אופציונלי): כמה שעות קדימה “נעולות” מהזמן הנוכחי המעוגל למעלה
export const PROTECTED_HOURS = 0; // 0 = כבוי. 2 = נועל 2 שעות קדימה

// קוד איפוס (כפתור "נקה לו״ז")
export const RESET_CODE = "1234";
