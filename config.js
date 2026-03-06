// ===============================
// Zoom Scheduler Configuration
// ===============================

// כתובת ה-WebApp של Google Apps Script
export const API_URL = "https://script.google.com/macros/s/AKfycbwP0huvvA5gXhSU-dtYwRimZPzqdOjTPWysgVWa0axZxsJaEwFye_MJdedLUTc9zSRx/exec";


// ימים שמוצגים בלוח
export const HE_DAYS = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי"
];


// סלוטים עגולים בלבד
export const TIMESLOTS = [
  "08:00-09:00",
  "09:00-10:00",
  "10:00-11:00",
  "11:00-12:00",
  "12:00-13:00",
  "13:00-14:00",
  "14:00-15:00",
  "15:00-16:00"
];


// חשבונות זום
export const ZOOM_ACCOUNTS = [
  "Zoom1",
  "Zoom2",
  "Zoom3"
];


// קישורי זום קבועים
export const ZOOM_LINKS = {
  Zoom1: "https://zoom.us/j/6023602336?omn=96962875568",
  Zoom2: "https://zoom.us/j/7601360450?omn=98989531483",
  Zoom3: "https://zoom.us/j/5274325600?omn=96368524491"
};


// זמן מוגן לפני שיעור (בשעות)
export const PROTECTED_HOURS = 0;


// אזור זמן
export const TIMEZONE = "Asia/Jerusalem";
