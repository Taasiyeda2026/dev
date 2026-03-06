import { TIMESLOTS, ZOOM_ACCOUNTS, HE_DAYS, ZOOM_LINKS } from "./config.js";
import { getWeekDates, roundTimeRange, pickZoomForSlot, isSlotLocked } from "./scheduler.js";
import { apiLoadSchedule, apiLoadPotential, apiUpsertSchedule, apiDeleteSchedule, apiUpdatePotential } from "./api.js";

const els = {
  board: document.getElementById("board"),
  potentialPanel: document.getElementById("potentialPanel"),
  potentialList: document.getElementById("potentialList"),
  viewMode: document.getElementById("viewMode"),
  searchInput: document.getElementById("searchInput"),
  reloadBtn: document.getElementById("reloadBtn"),
  weekLabel: document.getElementById("weekLabel"),

  prevWeek: document.getElementById("prevWeek"),
  nextWeek: document.getElementById("nextWeek"),
  todayWeek: document.getElementById("todayWeek"),
  weekPicker: document.getElementById("weekPicker"),

  modalOverlay: document.getElementById("modalOverlay"),
  modalCloseBtn: document.getElementById("modalCloseBtn"),
  modalTitle: document.getElementById("modalTitle"),
  saveBtn: document.getElementById("saveBtn"),
  deleteBtn: document.getElementById("deleteBtn"),

  mDate: document.getElementById("mDate"),
  mStart: document.getElementById("mStart"),
  mEnd: document.getElementById("mEnd"),
  mAuthority: document.getElementById("mAuthority"),
  mSchool: document.getElementById("mSchool"),
  mProgram: document.getElementById("mProgram"),
  mEmployee: document.getElementById("mEmployee"),
  mZoom: document.getElementById("mZoom"),
  mNotes: document.getElementById("mNotes"),
};

const state = {
  viewMode: "schedule",
  search: "",
  baseDate: new Date(),
  weekDates: [],
  schedule: [],
  potential: [],
  editing: null,        // item from schedule
  creatingSlot: null,   // { date, slot } if clicked "+"
  creatingFromPotential: null, // potential row if opened from potential
};

function toISODate(d) {
  const dd = new Date(d);
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, "0");
  const day = String(dd.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function setWeekLabel() {
  const a = state.weekDates[0];
  const b = state.weekDates[state.weekDates.length - 1];
  els.weekLabel.textContent = `שבוע: ${a} ← ${b}`;
}

function setBaseDate(newBase) {
  state.baseDate = new Date(newBase);
  state.weekDates = getWeekDates(state.baseDate);
  els.weekPicker.value = toISODate(state.baseDate);
  setWeekLabel();
  renderBoard();
  renderPotential();
}

function normalizeStr(x) {
  return String(x || "").trim();
}

function matchesSearch(item) {
  const q = normalizeStr(state.search).toLowerCase();
  if (!q) return true;
  const blob = [
    item.authority, item.school, item.program, item.employee, item.zoom, item.notes, item.date, item.time
  ].map(x => normalizeStr(x).toLowerCase()).join(" | ");
  return blob.includes(q);
}

async function loadAll() {
  const [schedule, potential] = await Promise.all([apiLoadSchedule(), apiLoadPotential()]);
  state.schedule = Array.isArray(schedule) ? schedule : (schedule.data || []);
  state.potential = Array.isArray(potential) ? potential : (potential.data || []);
  renderBoard();
  renderPotential();
}

function renderBoard() {
  const head = `
    <table class="table">
      <thead>
        <tr>
          <th>שעה</th>
          ${HE_DAYS.map((d, i) => `<th>${d}<div style="color:#6b7280;font-weight:400">${state.weekDates[i] || ""}</div></th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${TIMESLOTS.map(slot => {
          return `
            <tr>
              <th>${slot}</th>
              ${HE_DAYS.map((_, i) => {
                const date = state.weekDates[i];
                const events = state.schedule
                  .filter(e => e.date === date && e.time === slot)
                  .filter(matchesSearch);

                const plusDisabled = isSlotLocked(slot) ? "style='opacity:.45;pointer-events:none'" : "";
                return `
                  <td>
                    <div class="cell">
                      <div class="plus" data-action="create" data-date="${date}" data-slot="${slot}" ${plusDisabled}>＋ שיבוץ</div>
                      ${events.map(ev => `
                        <div class="event" data-action="edit" data-id="${ev.id}">
                          <div class="title">${normalizeStr(ev.employee)}</div>
                          <div class="meta">${normalizeStr(ev.school)} · ${normalizeStr(ev.program)}</div>
                          <div class="meta">${normalizeStr(ev.zoom)}</div>
                        </div>
                      `).join("")}
                    </div>
                  </td>
                `;
              }).join("")}
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
  els.board.innerHTML = head;
}

function renderPotential() {
  const show = state.viewMode === "potential";
  els.potentialPanel.style.display = show ? "block" : "none";
  if (!show) return;

  const rows = state.potential.filter(matchesSearch);

  els.potentialList.innerHTML = rows.map(p => {
    const completed = String(p.completed).toUpperCase() === "TRUE";
    return `
      <div class="event" data-action="fromPotential" data-pid="${p.id}">
        <div class="title">${normalizeStr(p.employee)}</div>
        <div class="meta">${normalizeStr(p.date)} · ${normalizeStr(p.startTime)}–${normalizeStr(p.endTime)}</div>
        <div class="meta">${normalizeStr(p.school)} · ${normalizeStr(p.program)}</div>
        <div class="meta">סטטוס: ${normalizeStr(p.status)} · הושלם: ${completed ? "כן" : "לא"}</div>
      </div>
    `;
  }).join("");
}

// ---------- Modal ----------
function openModal({ title, item, creatingSlot, fromPotential }) {
  state.editing = item || null;
  state.creatingSlot = creatingSlot || null;
  state.creatingFromPotential = fromPotential || null;

  els.modalTitle.textContent = title;

  // options
  els.mStart.innerHTML = TIMESLOTS.map(x => `<option value="${x.split("-")[0]}">${x.split("-")[0]}</option>`).join("");
  els.mEnd.innerHTML = TIMESLOTS.map(x => `<option value="${x.split("-")[1]}">${x.split("-")[1]}</option>`).join("");
  els.mZoom.innerHTML = ZOOM_ACCOUNTS.map(z => `<option value="${z}">${z}</option>`).join("");

  // fill
  if (item) {
    els.mDate.value = item.date;
    const [s, e] = item.time.split("-");
    els.mStart.value = s;
    els.mEnd.value = e;
    els.mAuthority.value = item.authority || "";
    els.mSchool.value = item.school || "";
    els.mProgram.value = item.program || "";
    els.mEmployee.value = item.employee || "";
    els.mZoom.value = item.zoom || "";
    els.mNotes.value = item.notes || "";
    els.deleteBtn.style.display = "inline-block";
  } else {
    const date = creatingSlot?.date || fromPotential?.date || "";
    els.mDate.value = date;

    // אם זה מגיע מפוטנציאל — עיגול למטה/למעלה לפי הדרישה שלך
    if (fromPotential?.startTime && fromPotential?.endTime) {
      const r = roundTimeRange(fromPotential.startTime, fromPotential.endTime);
      els.mStart.value = r.start;
      els.mEnd.value = r.end;
    } else {
      const [slotStart, slotEnd] = (creatingSlot?.slot || "08:00-09:00").split("-");
      els.mStart.value = slotStart;
      els.mEnd.value = slotEnd;
    }

    els.mAuthority.value = fromPotential?.authority || "";
    els.mSchool.value = fromPotential?.school || "";
    els.mProgram.value = fromPotential?.program || "";
    els.mEmployee.value = fromPotential?.employee || "";
    els.mNotes.value = fromPotential?.notes || "";
    els.mZoom.value = pickZoomForSlot(state.schedule, {
      date,
      time: `${els.mStart.value}-${els.mEnd.value}`,
      employee: els.mEmployee.value || null
    }) || ZOOM_ACCOUNTS[0];

    els.deleteBtn.style.display = "none";
  }

  els.modalOverlay.style.display = "flex";
}

function closeModal() {
  els.modalOverlay.style.display = "none";
  state.editing = null;
  state.creatingSlot = null;
  state.creatingFromPotential = null;
}

async function saveModal() {
  const date = normalizeStr(els.mDate.value);
  const start = normalizeStr(els.mStart.value);
  const end = normalizeStr(els.mEnd.value);
  const time = `${start}-${end}`;

  const payload = {
    id: state.editing?.id || null,
    date,
    time,
    authority: normalizeStr(els.mAuthority.value),
    school: normalizeStr(els.mSchool.value),
    program: normalizeStr(els.mProgram.value),
    employee: normalizeStr(els.mEmployee.value),
    zoom: normalizeStr(els.mZoom.value),
    zoomLink: ZOOM_LINKS?.[normalizeStr(els.mZoom.value)] || "",
    notes: normalizeStr(els.mNotes.value),
    potentialId: state.creatingFromPotential?.id || state.editing?.potentialId || "",
  };

  await apiUpsertSchedule(payload);

  // אם בא מפוטנציאל — אפשר לסמן “הושלם” אוטומטית (אופציונלי)
  // אני לא מכריח, אבל אם תרצה שיסמן תמיד:
  // if (state.creatingFromPotential?.id) await apiUpdatePotential({ id: state.creatingFromPotential.id, completed: true });

  await loadAll();
  closeModal();
}

async function deleteModal() {
  if (!state.editing?.id) return;
  await apiDeleteSchedule({ id: state.editing.id });
  await loadAll();
  closeModal();
}

// ---------- Events ----------
els.board.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;

  const action = el.dataset.action;

  if (action === "create") {
    const date = el.dataset.date;
    const slot = el.dataset.slot;
    openModal({ title: "שיבוץ חדש", creatingSlot: { date, slot } });
  }

  if (action === "edit") {
    const id = el.dataset.id;
    const item = state.schedule.find(x => String(x.id) === String(id));
    if (item) openModal({ title: "עריכת שיבוץ", item });
  }
});

els.potentialList.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action='fromPotential']");
  if (!el) return;
  const pid = el.dataset.pid;
  const p = state.potential.find(x => String(x.id) === String(pid));
  if (!p) return;
  openModal({ title: "שיבוץ מתוך פוטנציאל", fromPotential: p });
});

els.modalCloseBtn.addEventListener("click", closeModal);
els.modalOverlay.addEventListener("click", (e) => { if (e.target === els.modalOverlay) closeModal(); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

els.saveBtn.addEventListener("click", saveModal);
els.deleteBtn.addEventListener("click", deleteModal);

els.viewMode.addEventListener("change", () => {
  state.viewMode = els.viewMode.value;
  renderBoard();
  renderPotential();
});

els.searchInput.addEventListener("input", () => {
  state.search = els.searchInput.value;
  renderBoard();
  renderPotential();
});

els.reloadBtn.addEventListener("click", loadAll);

// ניווט שבוע
els.prevWeek.addEventListener("click", () => setBaseDate(addDays(state.baseDate, -7)));
els.nextWeek.addEventListener("click", () => setBaseDate(addDays(state.baseDate, +7)));
els.todayWeek.addEventListener("click", () => setBaseDate(new Date()));
els.weekPicker.addEventListener("change", () => {
  const v = els.weekPicker.value; // YYYY-MM-DD
  if (v) setBaseDate(new Date(v));
});

// init
setBaseDate(new Date());
loadAll().catch(err => {
  console.error(err);
  alert("שגיאה בטעינה. בדוק API_URL והרשאות של ה-WebApp.");
});
