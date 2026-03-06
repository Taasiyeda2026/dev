import { DAYS, ZOOMS } from "./config.js";

const DAY_TO_INDEX = {
  "ראשון": 0,
  "שני": 1,
  "שלישי": 2,
  "רביעי": 3,
  "חמישי": 4,
};

export function getWeekDates(baseDate = new Date()) {
  const current = new Date(baseDate);
  const dayOfWeek = current.getDay();
  const offsetToSunday = dayOfWeek;
  const sunday = new Date(current);
  sunday.setDate(current.getDate() - offsetToSunday);

  return DAYS.map((_, index) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + index);
    return toISODate(d);
  });
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isInstructorFree(schedule, { date, slot, instructor }) {
  return !schedule.some(
    (item) => item.date === date && item.time === slot && item.instructor === instructor,
  );
}

export function isZoomFree(schedule, { date, slot, zoom }) {
  return !schedule.some((item) => item.date === date && item.time === slot && item.zoom === zoom);
}

export function pickZoom(schedule, { date, slot }) {
  return ZOOMS.find((zoom) => isZoomFree(schedule, { date, slot, zoom })) || null;
}

export function canAssign(schedule, candidate) {
  if (!candidate?.instructor || !candidate?.date || !candidate?.time) {
    return { ok: false, reason: "missing_fields" };
  }

  if (!isInstructorFree(schedule, candidate)) {
    return { ok: false, reason: "instructor_busy" };
  }

  const zoom = candidate.zoom || pickZoom(schedule, candidate);
  if (!zoom) {
    return { ok: false, reason: "all_zooms_busy" };
  }

  if (!isZoomFree(schedule, { ...candidate, zoom })) {
    return { ok: false, reason: "zoom_busy" };
  }

  return { ok: true, zoom };
}

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

  return {
    start: s,
    end: e,
    slot: `${s}-${e}`,
  };
}

export function dateByHebrewDay(weekDates, hebrewDay) {
  const index = DAY_TO_INDEX[hebrewDay];
  if (index === undefined) return null;
  return weekDates[index] || null;
}
