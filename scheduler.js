// scheduler.js
import { DAYS, TIMES, ZOOMS, PROTECTED_HOURS } from "./config.js";

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

  return DAYS.map((_, index) => {
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

export function isInstructorFree(schedule, { date, time, instructor }) {
  return !schedule.some(
    (item) => item.date === date && item.time === time && item.instructor === instructor
  );
}

export function isZoomFree(schedule, { date, time, zoom }) {
  return !schedule.some((item) => item.date === date && item.time === time && item.zoom === zoom);
}

// --- protected window (אופציונלי) ---
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

// --- zoom picking (continuity + avoid prev-slot zooms) ---
function eventsInCell(schedule, { date, time }) {
  return schedule.filter((e) => e.date === date && e.time === time);
}

export function pickZoomForSlot(schedule, { date, time, instructor = null }) {
  const usedNow = eventsInCell(schedule, { date, time }).map((e) => e.zoom);
  const available = ZOOMS.filter((z) => !usedNow.includes(z));
  if (available.length === 0) return null;

  const idx = TIMES.indexOf(time);

  // עדיפות 1: המשכיות למדריך
  if (instructor && idx > 0) {
    const prevTime = TIMES[idx - 1];
    const prev = schedule.find(
      (e) => e.date === date && e.time === prevTime && e.instructor === instructor
    );
    if (prev && available.includes(prev.zoom)) return prev.zoom;
  }

  // עדיפות 2: לא להשתמש בזום שהיה במשבצת הקודמת (כדי לפזר עומסים)
  let usedPrev = [];
  if (idx > 0) {
    const prevTime = TIMES[idx - 1];
    usedPrev = eventsInCell(schedule, { date, time: prevTime }).map((e) => e.zoom);
  }

  const preferred = available.find((z) => !usedPrev.includes(z));
  return preferred || available[0];
}

export function canAssign(schedule, candidate) {
  if (!candidate?.instructor || !candidate?.date || !candidate?.time) {
    return { ok: false, reason: "missing_fields" };
  }

  if (isSlotLocked(candidate.time)) {
    return { ok: false, reason: "slot_locked" };
  }

  if (!isInstructorFree(schedule, candidate)) {
    return { ok: false, reason: "instructor_busy" };
  }

  const desiredZoom = candidate.zoom || null;
  if (desiredZoom) {
    if (!isZoomFree(schedule, { ...candidate, zoom: desiredZoom })) {
      return { ok: false, reason: "zoom_busy" };
    }
    return { ok: true, zoom: desiredZoom };
  }

  const zoom = pickZoomForSlot(schedule, candidate);
  if (!zoom) return { ok: false, reason: "all_zooms_busy" };
  return { ok: true, zoom };
}

// --- rounding for potential ---
export function roundStartTime(time) {
  const [h, m] = time.split(":").map(Number);
  if (m === 0) return time;
  return `${String(h).padStart(2, "0")}:00`;
}

export function roundEndTime(time) {
  const [h, m] = time.split(":").map(Number);
  if (m === 0) return time;
  return `${String(h + 1).padStart(2, "0")}:00`;
}

export function roundTimeRange(start, end) {
  const s = roundStartTime(start);
  const e = roundEndTime(end);
  return { start: s, end: e, slot: `${s}-${e}` };
}
