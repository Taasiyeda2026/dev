import { DAYS, TIMES, RESET_CODE } from "./config.js";
import { addEvent, clearSchedule, deleteEvent, loadPotential, loadSchedule, updatePotential } from "./api.js";
import { canAssign, dateByHebrewDay, getWeekDates, roundTimeRange } from "./scheduler.js";

const state = {
  weekDates: getWeekDates(),
  schedule: [],
  potential: [],
  selectedCell: null,
  pendingPotential: null,
  filters: {
    instructor: "",
    zoom: "",
  },
};

const el = {
  board: document.getElementById("board"),
  weekLabel: document.getElementById("weekLabel"),
  potentialList: document.getElementById("potentialList"),
  assignModal: document.getElementById("assignModal"),
  assignForm: document.getElementById("assignForm"),
  potentialSaveBtn: document.getElementById("potentialSave"),
  searchInstructor: document.getElementById("searchInstructor"),
  filterZoom: document.getElementById("filterZoom"),
  resetBtn: document.getElementById("resetSchedule"),
  reloadBtn: document.getElementById("reloadData"),
};

export async function init() {
  bindToolbar();
  renderBoard();
  await loadInitialData();
}

async function loadInitialData() {
  try {
    const [scheduleData, potentialData] = await Promise.all([loadSchedule(), loadPotential()]);
    state.schedule = Array.isArray(scheduleData) ? scheduleData : scheduleData.data || [];
    state.potential = Array.isArray(potentialData) ? potentialData : potentialData.data || [];
  } catch (error) {
    console.warn("Could not load API data", error);
    state.schedule = [];
    state.potential = [];
  }
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

  el.reloadBtn.addEventListener("click", async () => {
    await loadInitialData();
  });

  el.resetBtn.addEventListener("click", async () => {
    const code = window.prompt("הכנס קוד איפוס");
    if (code !== RESET_CODE) {
      window.alert("קוד שגוי");
      return;
    }
    await clearSchedule();
    state.schedule = [];
    renderEvents();
  });

  el.assignForm.addEventListener("submit", saveAssignment);
  el.potentialSaveBtn.addEventListener("click", savePotentialUpdates);
  document.getElementById("closeModal").addEventListener("click", closeAssignModal);
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
      btn.addEventListener("click", () => openAssignModal(date, slot));
      cell.append(btn);
      el.board.append(cell);
    });
  });

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

export function renderEvents() {
  document.querySelectorAll(".event").forEach((n) => n.remove());

  const filtered = state.schedule.filter((item) => {
    const byInstructor =
      !state.filters.instructor || item.instructor?.toLowerCase().includes(state.filters.instructor);
    const byZoom = !state.filters.zoom || item.zoom === state.filters.zoom;
    return byInstructor && byZoom;
  });

  filtered.forEach((event) => upsertEventInCell(event));
}

function upsertEventInCell(event) {
  const selector = `.cell[data-date="${event.date}"][data-slot="${event.time}"]`;
  const cell = el.board.querySelector(selector);
  if (!cell) return;

  const card = document.createElement("div");
  card.className = "event";
  card.textContent = `${event.instructor} | ${event.zoom} | ${event.school || ""}`;
  card.title = `${event.course || ""}`;
  card.addEventListener("click", async () => {
    if (!window.confirm("למחוק שיבוץ זה?")) return;
    await deleteEvent(event);
    state.schedule = state.schedule.filter((item) => item !== event);
    card.remove();
  });
  cell.append(card);
}

export function openAssignModal(date, slot, potentialRow = null) {
  state.selectedCell = { date, slot };
  state.pendingPotential = potentialRow;
  el.assignForm.date.value = date;
  el.assignForm.slot.value = slot;
  el.assignForm.instructor.value = potentialRow?.instructor || "";
  el.assignForm.school.value = potentialRow?.school || "";
  el.assignForm.course.value = potentialRow?.course || "";
  el.assignModal.showModal();
}

function closeAssignModal() {
  el.assignModal.close();
}

export async function saveAssignment(e) {
  e.preventDefault();

  const form = new FormData(el.assignForm);
  const payload = {
    date: form.get("date"),
    time: form.get("slot"),
    instructor: form.get("instructor")?.trim(),
    school: form.get("school")?.trim(),
    course: form.get("course")?.trim(),
    potentialId: state.pendingPotential?.id || "",
  };

  const check = canAssign(state.schedule, payload);
  if (!check.ok) {
    window.alert(`לא ניתן לשבץ: ${check.reason}`);
    return;
  }

  const eventData = { ...payload, zoom: check.zoom };
  await addEvent(eventData);

  state.schedule.push(eventData);
  upsertEventInCell(eventData);

  if (state.pendingPotential) {
    await updatePotential({
      id: state.pendingPotential.id,
      status: "assigned",
      completed: true,
      startTime: state.pendingPotential.rounded.start,
      endTime: state.pendingPotential.rounded.end,
      date: payload.date,
    });
    markPotentialAsAssigned(state.pendingPotential.id);
    state.pendingPotential = null;
  }

  closeAssignModal();
}

export function renderPotential() {
  el.potentialList.innerHTML = "";

  state.potential.forEach((row) => {
    const item = document.createElement("div");
    item.className = "potential-item";
    const date = dateByHebrewDay(state.weekDates, row.day) || row.date || "";
    const rounded = roundTimeRange(row.startTime, row.endTime);

    item.innerHTML = `
      <div>
        <strong>${row.instructor || "ללא מדריך"}</strong>
        <div>${row.school || ""} | ${row.course || ""}</div>
        <div>${row.day || ""} (${date}) | ${rounded.slot}</div>
      </div>
      <button type="button">שבץ</button>
    `;

    const actionBtn = item.querySelector("button");
    actionBtn.disabled = row.completed === true || row.status === "assigned";
    actionBtn.addEventListener("click", () => {
      openAssignModal(date, rounded.slot, { ...row, rounded });
    });

    el.potentialList.append(item);
  });
}

function markPotentialAsAssigned(id) {
  state.potential = state.potential.map((row) =>
    row.id === id ? { ...row, status: "assigned", completed: true } : row,
  );
  renderPotential();
}

async function savePotentialUpdates() {
  const assigned = state.potential.filter((row) => row.status === "assigned" || row.completed === true);
  await updatePotential({ action: "bulk", rows: assigned });
  window.alert("נשמר בהצלחה");
}
