// ui.js
import { DAYS, TIMES, ZOOMS, ZOOM_LINKS, RESET_CODE } from "./config.js";
import { addEvent, clearSchedule, deleteEvent, loadPotential, loadSchedule, updatePotential } from "./api.js";
import { canAssign, dateByHebrewDay, getWeekDates, isSlotLocked, roundTimeRange } from "./scheduler.js";

const state = {
  weekDates: getWeekDates(),
  schedule: [],
  potential: [],
  pendingPotentialUpdates: new Set(), // ids
  pendingPotential: null, // row when assigning from potential
  filters: { instructor: "", zoom: "" },
};

const el = {
  board: document.getElementById("board"),
  weekLabel: document.getElementById("weekLabel"),
  potentialList: document.getElementById("potentialList"),

  searchInstructor: document.getElementById("searchInstructor"),
  filterZoom: document.getElementById("filterZoom"),
  reloadBtn: document.getElementById("reloadData"),
  resetBtn: document.getElementById("resetSchedule"),
  potentialSaveBtn: document.getElementById("potentialSave"),

  assignModal: document.getElementById("assignModal"),
  assignForm: document.getElementById("assignForm"),
  roundingHint: document.getElementById("roundingHint"),

  assignSlot: document.getElementById("assignSlot"),
  assignZoom: document.getElementById("assignZoom"),
  assignInstructor: document.getElementById("assignInstructor"),
  assignSchool: document.getElementById("assignSchool"),
  assignCourse: document.getElementById("assignCourse"),
  assignDate: document.getElementById("assignDate"),

  closeModalBtn: document.getElementById("closeModal"),
};

function normListResponse(data) {
  return Array.isArray(data) ? data : (data?.data || []);
}

function uniqueStrings(list) {
  return Array.from(new Set(list.map((x) => (x || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "he"));
}

function setWeekLabel() {
  const first = state.weekDates[0];
  const last = state.weekDates[state.weekDates.length - 1];
  el.weekLabel.textContent = `${first} → ${last}`;
}

function addHeaderCell(html, cls) {
  const div = document.createElement("div");
  div.className = `cell ${cls}`;
  div.innerHTML = html;
  el.board.append(div);
}

export async function init() {
  bindToolbar();
  renderBoard();
  await loadInitialData();
}

async function loadInitialData() {
  try {
    const [scheduleData, potentialData] = await Promise.all([loadSchedule(), loadPotential()]);
    state.schedule = normListResponse(scheduleData);
    state.potential = normListResponse(potentialData);
  } catch (e) {
    console.warn("Load failed", e);
    state.schedule = [];
    state.potential = [];
  }
  setWeekLabel();
  renderEvents();
  renderPotential();
}

function bindToolbar() {
  el.searchInstructor.addEventListener("input", (e) => {
    state.filters.instructor = e.target.value.trim().toLowerCase();
    renderEvents();
  });

  el.filterZoom.addEventListener("change", (e) => {
    state.filters.zoom = e.target.value;
    renderEvents();
  });

  el.reloadBtn.addEventListener("click", loadInitialData);

  el.resetBtn.addEventListener("click", async () => {
    const code = window.prompt("הכנס קוד איפוס");
    if (code !== RESET_CODE) return window.alert("קוד שגוי");
    await clearSchedule();
    state.schedule = [];
    renderEvents();
  });

  el.potentialSaveBtn.addEventListener("click", savePotentialUpdates);

  el.assignForm.addEventListener("submit", saveAssignment);
  el.closeModalBtn.addEventListener("click", closeAssignModal);
}

export function renderBoard() {
  el.board.innerHTML = "";
  el.board.style.gridTemplateColumns = `160px repeat(${DAYS.length}, minmax(160px, 1fr))`;

  addHeaderCell("שעה", "head");
  DAYS.forEach((day, index) => addHeaderCell(`${day}<br><small>${state.weekDates[index]}</small>`, "head"));

  TIMES.forEach((slot) => {
    addHeaderCell(slot, "time");
    DAYS.forEach((_, dayIndex) => {
      const date = state.weekDates[dayIndex];
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.date = date;
      cell.dataset.slot = slot;

      const btn = document.createElement("button");
      btn.className = "add-btn";
      btn.textContent = "+";
      btn.type = "button";
      btn.disabled = isSlotLocked(slot);
      btn.title = btn.disabled ? "משבצת נעולה" : "שיבוץ";

      btn.addEventListener("click", () => openAssignModal(date, slot, null));
      cell.append(btn);

      el.board.append(cell);
    });
  });
}

export function renderEvents() {
  document.querySelectorAll(".event").forEach((n) => n.remove());

  const filtered = state.schedule.filter((item) => {
    const byInstructor =
      !state.filters.instructor || (item.instructor || "").toLowerCase().includes(state.filters.instructor);
    const byZoom = !state.filters.zoom || item.zoom === state.filters.zoom;
    return byInstructor && byZoom;
  });

  filtered.forEach((event) => appendEventCard(event));
}

function appendEventCard(event) {
  const selector = `.cell[data-date="${event.date}"][data-slot="${event.time}"]`;
  const cell = el.board.querySelector(selector);
  if (!cell) return;

  const card = document.createElement("div");
  card.className = "event";

  const zoomLink = ZOOM_LINKS[event.zoom] || "";
  card.innerHTML = `
    <div style="font-weight:800">${event.instructor} | ${event.zoom}</div>
    <small>${event.school || ""}</small>
    ${zoomLink ? `<div style="margin-top:6px"><a href="${zoomLink}" target="_blank" rel="noopener">קישור לזום</a></div>` : ""}
  `;

  card.title = event.course || "";

  card.addEventListener("click", async () => {
    if (isSlotLocked(event.time)) return window.alert("משבצת נעולה – לא מוחקים.");
    if (!window.confirm("למחוק שיבוץ זה?")) return;

    await deleteEvent(event);
    state.schedule = state.schedule.filter((x) => x !== event);
    card.remove();
  });

  cell.append(card);
}

// --- MODAL (lists + rounding) ---
function fillSlotOptions(selectedSlot) {
  el.assignSlot.innerHTML = "";
  TIMES.forEach((slot) => {
    const opt = document.createElement("option");
    opt.value = slot;
    opt.textContent = slot;
    if (slot === selectedSlot) opt.selected = true;
    el.assignSlot.append(opt);
  });
}

function fillInstructorOptions(selectedValue = "") {
  // מקור לרשימה: כל המדריכים שמופיעים בלו"ז ובפוטנציאל
  const fromSchedule = state.schedule.map((x) => x.instructor);
  const fromPotential = state.potential.map((x) => x.instructor || x.employee);
  const all = uniqueStrings([...fromSchedule, ...fromPotential]);

  el.assignInstructor.innerHTML = `<option value="">בחר מדריך</option>`;
  all.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === selectedValue) opt.selected = true;
    el.assignInstructor.append(opt);
  });
}

export function openAssignModal(date, slot, potentialRow = null) {
  state.pendingPotential = potentialRow;

  // slot base
  let modalSlot = slot;

  // אם מגיעים מפוטנציאל - תמיד לעגל למטה/למעלה ולהציג הסבר
  if (potentialRow?.startTime && potentialRow?.endTime) {
    const rounded = roundTimeRange(potentialRow.startTime, potentialRow.endTime);
    modalSlot = rounded.slot;

    el.roundingHint.style.display = "block";
    el.roundingHint.textContent =
      `שעות הפוטנציאל אינן עגולות: ${potentialRow.startTime}-${potentialRow.endTime} → ` +
      `בחלון השיבוץ יעוגל אוטומטית ל-${rounded.slot} (למטה בתחילה, למעלה בסוף).`;
  } else {
    el.roundingHint.style.display = "none";
    el.roundingHint.textContent = "";
  }

  el.assignDate.value = date;
  fillSlotOptions(modalSlot);
  fillInstructorOptions(potentialRow?.instructor || potentialRow?.employee || "");

  el.assignZoom.value = ""; // אוטומטי
  el.assignSchool.value = potentialRow?.school || "";
  el.assignCourse.value = potentialRow?.course || potentialRow?.program || "";

  el.assignModal.showModal();
}

function closeAssignModal() {
  state.pendingPotential = null;
  el.assignModal.close();
}

async function saveAssignment(e) {
  e.preventDefault();

  const payload = {
    date: el.assignDate.value,
    time: el.assignSlot.value,
    zoom: (el.assignZoom.value || "").trim(), // optional
    instructor: (el.assignInstructor.value || "").trim(),
    school: (el.assignSchool.value || "").trim(),
    course: (el.assignCourse.value || "").trim(),
    potentialId: state.pendingPotential?.id || "",
  };

  const check = canAssign(state.schedule, payload);
  if (!check.ok) {
    const map = {
      missing_fields: "חסרים שדות חובה",
      slot_locked: "המשבצת נעולה (זמן מוגן)",
      instructor_busy: "המדריך תפוס בשעה הזו",
      zoom_busy: "ה-Zoom שבחרת תפוס בשעה הזו",
      all_zooms_busy: "כל ה-Zoom תפוסים בשעה הזו",
    };
    return window.alert(`לא ניתן לשבץ: ${map[check.reason] || check.reason}`);
  }

  const eventData = { ...payload, zoom: check.zoom };
  await addEvent(eventData);

  // עדכון לוקאלי + רנדר
  state.schedule.push(eventData);
  renderEvents();

  // אם בא מפוטנציאל: לסמן assigned + completed + לשמור start/end מעוגלים
  if (state.pendingPotential) {
    const rounded = roundTimeRange(state.pendingPotential.startTime, state.pendingPotential.endTime);

    await updatePotential({
      id: state.pendingPotential.id,
      status: "assigned",
      completed: true,
      startTime: rounded.start,
      endTime: rounded.end,
      date: payload.date,
      notes: state.pendingPotential.notes || "",
    });

    state.potential = state.potential.map((row) =>
      row.id === state.pendingPotential.id
        ? { ...row, status: "assigned", completed: true, startTime: rounded.start, endTime: rounded.end, date: payload.date }
        : row
    );
    renderPotential();
  }

  closeAssignModal();
}

// --- POTENTIAL VIEW (editable + save) ---
function badgeFor(row) {
  if (row.status === "assigned") return `<span class="badge assigned">שובץ</span>`;
  if (row.completed === true) return `<span class="badge ok">בוצע</span>`;
  return `<span class="badge">פתוח</span>`;
}

export function renderPotential() {
  el.potentialList.innerHTML = "";

  state.potential.forEach((row) => {
    const date = dateByHebrewDay(state.weekDates, row.day) || row.date || "";
    const instructor = row.instructor || row.employee || "";
    const startTime = row.startTime || "";
    const endTime = row.endTime || "";
    const notes = row.notes || "";

    const container = document.createElement("div");
    container.className = "potential-item";
    container.dataset.id = row.id;

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div>
          <div style="font-weight:900">${instructor || "ללא מדריך"}</div>
          <div style="color:#6b7280">${row.school || ""} | ${row.course || row.program || ""}</div>
          <div style="color:#6b7280">${row.day || ""} ${date ? `(${date})` : ""}</div>
        </div>
        ${badgeFor(row)}
      </div>

      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label style="display:flex;gap:6px;align-items:center">
          התחלה:
          <input type="time" class="p-start" value="${startTime}">
        </label>
        <label style="display:flex;gap:6px;align-items:center">
          סיום:
          <input type="time" class="p-end" value="${endTime}">
        </label>
        <label style="display:flex;gap:6px;align-items:center">
          בוצע:
          <input type="checkbox" class="p-done" ${row.completed === true ? "checked" : ""}>
        </label>
      </div>

      <input class="p-notes" placeholder="הערות..." value="${escapeHtml(notes)}" />

      <div class="potential-actions">
        <button type="button" class="primary p-assign">שבץ</button>
        <span class="hint">בשיבוץ מפוטנציאל: השעות יעוגלו אוטומטית במודל.</span>
      </div>
    `;

    // bind
    const startEl = container.querySelector(".p-start");
    const endEl = container.querySelector(".p-end");
    const doneEl = container.querySelector(".p-done");
    const notesEl = container.querySelector(".p-notes");
    const assignBtn = container.querySelector(".p-assign");

    startEl.addEventListener("change", () => markPotentialDirty(row.id, { startTime: startEl.value }));
    endEl.addEventListener("change", () => markPotentialDirty(row.id, { endTime: endEl.value }));
    doneEl.addEventListener("change", () => markPotentialDirty(row.id, { completed: doneEl.checked }));
    notesEl.addEventListener("change", () => markPotentialDirty(row.id, { notes: notesEl.value }));

    assignBtn.disabled = row.status === "assigned";
    assignBtn.addEventListener("click", () => {
      const current = state.potential.find((x) => x.id === row.id) || row;
      openAssignModal(date, TIMES[0], current);
    });

    el.potentialList.append(container);
  });
}

function markPotentialDirty(id, patch) {
  state.potential = state.potential.map((row) => (row.id === id ? { ...row, ...patch } : row));
  state.pendingPotentialUpdates.add(id);
}

async function savePotentialUpdates() {
  const ids = Array.from(state.pendingPotentialUpdates);
  if (ids.length === 0) return window.alert("אין שינויים לשמירה");

  // שמירה שורה-שורה (כי השרת שלך כרגע בנוי updatepotential “רגיל”)
  for (const id of ids) {
    const row = state.potential.find((x) => x.id === id);
    if (!row) continue;

    await updatePotential({
      id: row.id,
      startTime: row.startTime || "",
      endTime: row.endTime || "",
      notes: row.notes || "",
      status: row.status || "",
      completed: row.completed === true,
      date: row.date || "",
    });
  }

  state.pendingPotentialUpdates.clear();
  window.alert("נשמר בהצלחה");
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
