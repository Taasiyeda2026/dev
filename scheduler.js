import { HE_DAYS, TIMESLOTS, ZOOM_ACCOUNTS, PROTECTED_HOURS } from "./config.js";

const DAY_TO_INDEX = {
  "ראשון": 0,
  "שני": 1,
  "שלישי": 2,
  "רביעי": 3,
  "חמישי": 4,
};

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getWeekDates(baseDate = new Date()) {
  const current = new Date(baseDate);
  const dayOfWeek = current.getDay(); // 0=Sun
  const sunday = new Date(current);
  sunday.setDate(current.getDate() - dayOfWeek);

  return HE_DAYS.map((_, index) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + index);
    return toISODate(d);
  });
}

export function dateByHebrewDay(weekDates, hebrewDay) {
  const index = DAY_TO_INDEX[hebrewDay];
  if (index === undefined) return null;
  return weekDates[index] || null;
}

export function isInstructorFree(schedule, { date, time, employee }) {
  return !schedule.some(
    (item) => item.date === date && item.time === time && item.employee === employee
  );
}

export function isZoomFree(schedule, { date, time, zoom }) {
  return !schedule.some((item) => item.date === date && item.time === time && item.zoom === zoom);
}

function eventsInCell(schedule, { date, time }) {
  return schedule.filter((e) => e.date === date && e.time === time);
}

export function pickZoomForSlot(schedule, { date, time, employee = null }) {
  const usedNow = eventsInCell(schedule, { date, time }).map((e) => e.zoom);
  const available = ZOOM_ACCOUNTS.filter((z) => !usedNow.includes(z));
  if (available.length === 0) return null;

  const idx = TIMESLOTS.indexOf(time);

  // עדיפות: המשכיות למדריך (אם שעה קודמת באותו תאריך)
  if (employee && idx > 0) {
    const prevTime = TIMESLOTS[idx - 1];
    const prev = schedule.find(
      (e) => e.date === date && e.time === prevTime && e.employee === employee
    );
    if (prev && available.includes(prev.zoom)) return prev.zoom;
  }

  return available[0];
}

// ---------- Protected window ----------
function nowRoundedUpToHourMinutes() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return Math.ceil(mins / 60) * 60;
}
function slotStartMinutes(slot) {
  const [start] = slot.split("-");
  const [h, m] = start.split(":").map(Number);
  return h * 60 + m;
}
export function isSlotLocked(slot) {
  if (!PROTECTED_HOURS || PROTECTED_HOURS <= 0) return false;
  const roundedUp = nowRoundedUpToHourMinutes();
  const windowEnd = roundedUp + PROTECTED_HOURS * 60;
  const startM = slotStartMinutes(slot);
  return startM >= roundedUp && startM < windowEnd;
}

// ---------- Potential rounding (הדרישה שלך) ----------
export function roundTimeRange(start, end) {
  // start -> למטה לשעה עגולה
  // end   -> למעלה לשעה עגולה
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  const s = `${String(sh).padStart(2, "0")}:00`;

  let eH = eh;
  if (em !== 0) eH = eh + 1;
  const e = `${String(eH).padStart(2, "0")}:00`;

  return { start: s, end: e, slot: `${s}-${e}` };
}
