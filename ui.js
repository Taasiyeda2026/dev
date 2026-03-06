import { TIMESLOTS, ZOOM_ACCOUNTS, HE_DAYS } from './config.js';
import { getWeekDates, dateByHebrewDay, roundTimeRange } from './scheduler.js';
import { apiLoadSchedule, apiLoadPotential, apiUpsertSchedule, apiDeleteSchedule } from './api.js';

const els = {
  board: document.getElementById('board'),
  potentialPanel: document.getElementById('potentialPanel'),
  potentialList: document.getElementById('potentialList'),
  viewMode: document.getElementById('viewMode'),
  searchInput: document.getElementById('searchInput'),
  reloadBtn: document.getElementById('reloadBtn'),
  weekLabel: document.getElementById('weekLabel'),

  // חדש: ניווט שבוע
  prevWeek: document.getElementById('prevWeek'),
  nextWeek: document.getElementById('nextWeek'),
  todayWeek: document.getElementById('todayWeek'),
  weekPicker: document.getElementById('weekPicker'),

  modalOverlay: document.getElementById('modalOverlay'),
  modalCloseBtn: document.getElementById('modalCloseBtn'),
  modalTitle: document.getElementById('modalTitle'),
  saveBtn: document.getElementById('saveBtn'),
  deleteBtn: document.getElementById('deleteBtn'),

  mDate: document.getElementById('mDate'),
  mStart: document.getElementById('mStart'),
  mEnd: document.getElementById('mEnd'),
  mAuthority: document.getElementById('mAuthority'),
  mSchool: document.getElementById('mSchool'),
  mProgram: document.getElementById('mProgram'),
  mEmployee: document.getElementById('mEmployee'),
  mZoom: document.getElementById('mZoom'),
  mNotes: document.getElementById('mNotes'),
};

const state = {
  viewMode: 'schedule',
  search: '',
  baseDate: new Date(),
  weekDates: [],
  schedule: [],
  potential: [],
  editing: null,
  creatingSlot: null, // { dayName, time } when click "+"
};

function toISODate(d) {
  const dd = new Date(d);
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, '0');
  const day = String(dd.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function normalizeDateStr(dateStr) {
  // dateStr already "YYYY-MM-DD" in this system.
  return String(dateStr || '').trim();
}

function isInCurrentWeek(dateStr) {
  const d = normalizeDateStr(dateStr);
  return state.weekDates.includes(d);
}

function setBaseDate(newBase) {
  state.baseDate = new Date(newBase);
  state.weekDates = getWeekDates(state.baseDate);

  // UI sync
  els.weekPicker.value = toISODate(state.baseDate);

  renderBoard();
  renderScheduleEvents();
  renderPotential();
}

function setWeekLabel() {
  const a = state.weekDates[0];
  const b = state.weekDates[state.weekDates.length - 1];
  els.weekLabel.textContent = `שבוע: ${a} ← ${b}`;
}

function populateSelectOptions(sel, items) {
  sel.innerHTML = items.map(x => `<option value="${x}">${x}</option>`).join('');
}

function openModal({ title, item, creatingSlot }) {
  state.editing = item || null;
  state.creatingSlot = creatingSlot || null;

  els.modalTitle.textContent = title;
  els.modalOverlay.style.display = 'block';

  // fill selects
  populateSelectOptions(els.mStart, TIMESLOTS);
  populateSelectOptions(els.mEnd, TIMESLOTS);
  populateSelectOptions(els.mZoom, ['', ...ZOOM_ACCOUNTS]);

  if (item) {
    els.mDate.value = item.date || '';
    els.mStart.value = item.startTime || TIMESLOTS[0];
    els.mEnd.value = item.endTime || TIMESLOTS[1] || TIMESLOTS[0];
    els.mAuthority.value = item.authority || '';
    els.mSchool.value = item.school || '';
    els.mProgram.value = item.program || '';
    els.mEmployee.value = item.employee || '';
    els.mZoom.value = item.zoom || '';
    els.mNotes.value = item.notes || '';
    els.deleteBtn.style.display = 'inline-block';
    return;
  }

  // creating from "+" click
  const { dayName, time } = creatingSlot;
  const date = dateByHebrewDay(state.weekDates, dayName);
  els.mDate.value = date;
  els.mStart.value = time;
  els.mEnd.value = TIMESLOTS[Math.min(TIMESLOTS.indexOf(time) + 1, TIMESLOTS.length - 1)];

  els.mAuthority.value = '';
  els.mSchool.value = '';
  els.mProgram.value = '';
  els.mEmployee.value = '';
  els.mZoom.value = '';
  els.mNotes.value = '';
  els.deleteBtn.style.display = 'none';
}

function closeModal() {
  els.modalOverlay.style.display = 'none';
  state.editing = null;
  state.creatingSlot = null;
}

function matchesSearch(item) {
  if (!state.search) return true;
  const hay = [
    item.authority, item.school, item.program, item.employee,
    item.zoom, item.notes, item.date, item.startTime, item.endTime
  ].join(' ').toLowerCase();
  return hay.includes(state.search.toLowerCase());
}

function renderBoard() {
  setWeekLabel();

  // grid: first row headers + time rows
  const cols = 1 + HE_DAYS.length;
  els.board.style.gridTemplateColumns = `120px repeat(${HE_DAYS.length}, minmax(150px, 1fr))`;

  const headCells = [
    `<div class="cell head"></div>`,
    ...HE_DAYS.map((d, i) => `<div class="cell head">${d}<div class="sub">${state.weekDates[i]}</div></div>`)
  ];

  const rows = [];
  for (const t of TIMESLOTS) {
    rows.push(`<div class="cell time">${t}</div>`);
    for (const dayName of HE_DAYS) {
      const date = dateByHebrewDay(state.weekDates, dayName);
      const id = `cell-${dayName}-${t}`;
      rows.push(`
        <div class="cell" id="${id}">
          <button class="add-btn" data-day="${dayName}" data-time="${t}" title="הוספה">+</button>
          <div class="events"></div>
        </div>
      `);
    }
  }

  els.board.innerHTML = [...headCells, ...rows].join('');

  // bind add buttons
  els.board.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dayName = btn.getAttribute('data-day');
      const time = btn.getAttribute('data-time');
      openModal({ title: 'שיבוץ חדש', item: null, creatingSlot: { dayName, time } });
    });
  });
}

function renderScheduleEvents() {
  // clear all events containers
  els.board.querySelectorAll('.events').forEach(x => x.innerHTML = '');

  // IMPORTANT: show only items in current week + match search
  const rows = state.schedule
    .filter(x => isInCurrentWeek(x.date))
    .filter(matchesSearch);

  for (const item of rows) {
    const dayName = HE_DAYS.find(d => dateByHebrewDay(state.weekDates, d) === item.date);
    if (!dayName) continue;

    const cellId = `cell-${dayName}-${item.startTime}`;
    const cell = document.getElementById(cellId);
    if (!cell) continue;

    const box = document.createElement('div');
    box.className = 'event';
    box.innerHTML = `
      <div><b>${item.school || ''}</b></div>
      <div>${item.program || ''}</div>
      <div>${item.employee || ''}</div>
      <div>${item.startTime || ''}–${item.endTime || ''} ${item.zoom ? ' | ' + item.zoom : ''}</div>
    `;
    box.addEventListener('click', () => openModal({ title: 'עריכת שיבוץ', item, creatingSlot: null }));

    cell.querySelector('.events').appendChild(box);
  }
}

function renderPotential() {
  if (state.viewMode !== 'potential') return;

  // פוטנציאל: גם פה מסננים לפי שבוע, כי אחרת אתה רואה הכל ולא מבין מה קורה
  const list = state.potential
    .filter(x => isInCurrentWeek(x.date))
    .filter(matchesSearch);

  els.potentialList.innerHTML = list.map(p => {
    // עיגול שעות: בפוטנציאל יכול להגיע 13:15–14:45 וכו'
    const rounded = roundTimeRange(p.startTime, p.endTime);

    return `
      <div class="potential-item">
        <div class="pot-top">
          <b>${p.school || ''}</b>
          <span class="muted">${p.authority || ''}</span>
        </div>
        <div>${p.program || ''} | ${p.employee || ''}</div>
        <div class="muted">${p.date || ''} | ${p.startTime || ''}–${p.endTime || ''}</div>
        <div class="pot-actions">
          <button class="pot-add"
            data-date="${p.date || ''}"
            data-start="${rounded.start}"
            data-end="${rounded.end}"
            data-authority="${(p.authority || '').replaceAll('"', '&quot;')}"
            data-school="${(p.school || '').replaceAll('"', '&quot;')}"
            data-program="${(p.program || '').replaceAll('"', '&quot;')}"
            data-employee="${(p.employee || '').replaceAll('"', '&quot;')}"
          >שבץ</button>
        </div>
      </div>
    `;
  }).join('');

  els.potentialList.querySelectorAll('.pot-add').forEach(btn => {
    btn.addEventListener('click', () => {
      // יצירה מתוך פוטנציאל: משתמשים בעיגול שעשינו למעלה
      openModal({
        title: 'שיבוץ מתוך פוטנציאל',
        item: null,
        creatingSlot: {
          // לא צריך dayName כאן; אנחנו כבר יודעים date ישירות
          dayName: null,
          time: btn.getAttribute('data-start')
        }
      });

      // דוחפים ערכים לתוך השדות
      els.mDate.value = btn.getAttribute('data-date') || '';
      els.mStart.value = btn.getAttribute('data-start') || TIMESLOTS[0];
      els.mEnd.value = btn.getAttribute('data-end') || TIMESLOTS[1];

      els.mAuthority.value = btn.getAttribute('data-authority') || '';
      els.mSchool.value = btn.getAttribute('data-school') || '';
      els.mProgram.value = btn.getAttribute('data-program') || '';
      els.mEmployee.value = btn.getAttribute('data-employee') || '';
    });
  });
}

async function reloadAll() {
  const [schedule, potential] = await Promise.all([
    apiLoadSchedule(),
    apiLoadPotential(),
  ]);

  state.schedule = schedule || [];
  state.potential = potential || [];

  renderBoard();
  renderScheduleEvents();

  if (state.viewMode === 'potential') {
    els.potentialPanel.style.display = 'block';
    renderPotential();
  } else {
    els.potentialPanel.style.display = 'none';
  }
}

async function onSave() {
  const payload = {
    id: state.editing?.id || null,
    date: els.mDate.value,
    startTime: els.mStart.value,
    endTime: els.mEnd.value,
    authority: els.mAuthority.value.trim(),
    school: els.mSchool.value.trim(),
    program: els.mProgram.value.trim(),
    employee: els.mEmployee.value.trim(),
    zoom: els.mZoom.value,
    notes: els.mNotes.value.trim(),
  };

  await apiUpsertSchedule(payload);
  closeModal();
  await reloadAll();
}

async function onDelete() {
  if (!state.editing?.id) return;
  await apiDeleteSchedule(state.editing.id);
  closeModal();
  await reloadAll();
}

function bindUI() {
  els.viewMode.addEventListener('change', () => {
    state.viewMode = els.viewMode.value;
    if (state.viewMode === 'potential') {
      els.potentialPanel.style.display = 'block';
      renderPotential();
    } else {
      els.potentialPanel.style.display = 'none';
    }
  });

  els.searchInput.addEventListener('input', () => {
    state.search = els.searchInput.value || '';
    renderScheduleEvents();
    renderPotential();
  });

  els.reloadBtn.addEventListener('click', reloadAll);

  els.modalCloseBtn.addEventListener('click', closeModal);
  els.modalOverlay.addEventListener('click', (e) => {
    if (e.target === els.modalOverlay) closeModal();
  });

  els.saveBtn.addEventListener('click', onSave);
  els.deleteBtn.addEventListener('click', onDelete);

  // חדש: ניווט שבוע
  els.prevWeek.addEventListener('click', () => setBaseDate(addDays(state.baseDate, -7)));
  els.nextWeek.addEventListener('click', () => setBaseDate(addDays(state.baseDate, +7)));
  els.todayWeek.addEventListener('click', () => setBaseDate(new Date()));
  els.weekPicker.addEventListener('change', () => {
    if (!els.weekPicker.value) return;
    setBaseDate(new Date(els.weekPicker.value));
  });
}

(function init() {
  bindUI();
  setBaseDate(new Date()); // sets weekDates, renders
  reloadAll();
})();
