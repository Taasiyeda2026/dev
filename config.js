// ===============================
// Zoom Scheduler Configuration
// ===============================

// כתובת ה-WebApp של Google Apps Script
export const API_URL = "https://script.google.com/macros/s/AKfycbwP0huvvA5gXhSU-dtYwRimZPzqdOjTPWysgVWa0axZxsJaEwFye_MJdedLUTc9zSRx/exec";


// ימים שמוצגים בלוח (ראשון עד חמישי)
export const HE_DAYS = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי"
];


// סלוטים עגולים בלבד (שעות פעילות)
export const TIMESLOTS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00"
];


// חשבונות זום זמינים במערכת
export const ZOOM_ACCOUNTS = [
  {
    key: "Z1",
    name: "Zoom 1",
    joinUrl: "https://zoom.us/j/6023602336?omn=96962875568"
  },
  {
    key: "Z2",
    name: "Zoom 2",
    joinUrl: "https://zoom.us/j/7601360450?omn=98989531483"
  },
  {
    key: "Z3",
    name: "Zoom 3",
    joinUrl: "https://zoom.us/j/5274325600?omn=96368524491"
  }
];


// כמה דקות לפני תחילת שיעור השיבוץ ננעל
export const LOCK_MINUTES_BEFORE_START = 5;


// הגדרת אזור זמן
export const TIMEZONE = "Asia/Jerusalem";
