const SHEETS = {
  settings: 'הגדרות',
  incomes: 'גיול',
  expenses: 'הוצאות',
  lists: 'רשימות',
  normalizedExpenses: 'הוצאותמסודר',
  cashflow: 'תזרים',
  summary: 'סיכום',
  weeks: 'שבועות'
};

function doGet() {
  return HtmlService
    .createTemplateFromFile('index')
    .evaluate()
    .setTitle('דשבורד פיננסי')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getDashboardData() {
  const settings = readSettings_();
  const summary = readSummarySheet_();
  const cashflowDays = readCashflowSheet_();
  const weekly = readWeeksSheet_();
  const status = readStatusGroups_();
  const expenses = readExpensesSheet_();
  const incomes = readIncomesSheet_();

  return {
    summary,
    cashflowDays,
    weekly,
    statusExpenseGroupsByMonth: status.expense,
    statusIncomeGroupsByMonth: status.income,
    incomes,
    expenses,
    metadata: {
      organizationName: settings.organizationName,
      workYear: settings.workYear,
      startMonth: settings.startMonth,
      endMonth: settings.endMonth,
      openingBalance: settings.openingBalance,
      balanceResetDate: settings.balanceResetDate,
      manualOpeningBalance: settings.manualOpeningBalance,
      sourceOfTruth: 'google-sheets-calculated-tabs',
      generatedAt: new Date().toISOString()
    }
  };
}

function readSettings_() {
  const sheet = getSheetOrThrow_(SHEETS.settings);
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getDisplayValues();
  const map = {};

  values.forEach(function(row) {
    if (row[0]) map[String(row[0]).trim()] = row[1];
  });

  return {
    workYear: Number(map['שנת עבודה']) || new Date().getFullYear(),
    openingBalance: toNumber_(map['יתרת פתיחה']),
    startMonth: Number(map['חודש התחלה']) || 1,
    endMonth: Number(map['חודש סיום']) || 12,
    organizationName: map['שם ארגון'] || '',
    balanceResetDate: map['תאריך איפוס יתרה'] || '',
    manualOpeningBalance: toNumber_(map['יתרת פתיחה ידנית'])
  };
}

function readSummarySheet_() {
  const rows = readSheetObjects_(SHEETS.summary);
  return rows.map(function(r) {
    return {
      month: Number(r['חודש']) || null,
      monthLabel: r['חודש'] || '',
      income: toNumber_(r['סך הכנסות']),
      expense: toNumber_(r['סך הוצאות']),
      net: toNumber_(r['נטו חודשי']),
      closingBalance: toNumber_(r['יתרת סגירה סוף חודש'])
    };
  }).filter(function(r) { return r.month !== null; });
}

function readCashflowSheet_() {
  const rows = readSheetObjects_(SHEETS.cashflow);
  return rows.map(function(r, idx) {
    return {
      id: 'flow-' + (idx + 1),
      date: r['תאריך'] || '',
      month: monthFromDateLabel_(r['תאריך']),
      incomeDetail: r['פירוט הכנסות'] || '',
      incomeAmount: toNumber_(r['סכום הכנסות']),
      expenseDetail: r['פירוט הוצאות'] || '',
      expenseAmount: toNumber_(r['סכום הוצאות']),
      bankBalance: toNumber_(r['יתרת בנק'])
    };
  }).filter(function(r) { return r.date; });
}

function readWeeksSheet_() {
  const rows = readSheetObjects_(SHEETS.weeks);
  return rows.map(function(r, idx) {
    return {
      id: 'week-' + (idx + 1),
      month: Number(r['חודש']) || null,
      week: Number(r['שבוע']) || null,
      fromDate: r['מתאריך'] || '',
      toDate: r['עד תאריך'] || '',
      range: r['טווח'] || '',
      income: toNumber_(r['סך הכנסות']),
      expense: toNumber_(r['סך הוצאות']),
      incomeDetails: splitDetails_(r['פירוט הכנסות']),
      expenseDetails: splitDetails_(r['פירוט הוצאות'])
    };
  }).filter(function(r) { return r.month !== null; });
}

function readStatusGroups_() {
  const ss = SpreadsheetApp.getActive();
  const summarySheet = ss.getSheetByName(SHEETS.summary);
  if (!summarySheet || summarySheet.getLastRow() < 2) {
    return { income: {}, expense: {} };
  }

  const data = summarySheet.getDataRange().getDisplayValues();
  const headers = data[0];
  const rows = data.slice(1);

  const incomeCol = headers.indexOf('אזור הכנסות לפי מימון');
  const expenseCol = headers.indexOf('אזור הוצאות לפי קבוצת תזרים');
  const monthCol = headers.indexOf('חודש');

  const income = {};
  const expense = {};

  rows.forEach(function(row) {
    const month = Number(row[monthCol]);
    if (!month) return;

    income[month] = parseStatusPairs_(row[incomeCol]);
    expense[month] = parseStatusPairs_(row[expenseCol]);
  });

  return { income: income, expense: expense };
}

function readExpensesSheet_() {
  const rows = readSheetObjects_(SHEETS.normalizedExpenses);
  return rows.map(function(r, idx) {
    return {
      id: 'exp-' + (idx + 1),
      date: r['תאריך'] || '',
      month: Number(r['חודש']) || null,
      group: r['קבוצה'] || '',
      detail: r['פירוט'] || '',
      amount: toNumber_(r['סכום']),
      notes: r['הערות'] || ''
    };
  }).filter(function(r) { return r.date; });
}

function readIncomesSheet_() {
  const rows = readSheetObjects_(SHEETS.incomes);
  return rows.map(function(r, idx) {
    return {
      id: 'inc-' + (idx + 1),
      account: r['חשבון'] || '',
      detail: r['פירוט'] || '',
      amount: toNumber_(r['סכום']),
      dueDate: r['תאריך תקין'] || r['צפי תשלום'] || '',
      notes: r['הערות'] || '',
      fund: r['מימון'] || '',
      month: monthFromDateLabel_(r['תאריך תקין'] || r['צפי תשלום'])
    };
  }).filter(function(r) { return r.amount !== 0 || r.detail || r.account; });
}

function getSheetOrThrow_(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name);
  return sheet;
}

function readSheetObjects_(sheetName) {
  const sheet = getSheetOrThrow_(sheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  const headers = values[0].map(function(h) { return String(h).trim(); });

  return values.slice(1).map(function(row) {
    const out = {};
    headers.forEach(function(header, index) {
      out[header] = row[index];
    });
    return out;
  });
}

function toNumber_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = String(value).replace(/[^\d\-.]/g, '');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function monthFromDateLabel_(value) {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (match) return Number(match[2]);
  const dateObj = new Date(value);
  if (dateObj instanceof Date && !isNaN(dateObj)) return dateObj.getMonth() + 1;
  return null;
}

function splitDetails_(value) {
  return String(value || '')
    .split(' | ')
    .map(function(item) { return item.trim(); })
    .filter(Boolean);
}

function parseStatusPairs_(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  return text.split(' | ').map(function(part) {
    const bits = part.split(':');
    return {
      name: (bits[0] || '').trim(),
      amount: toNumber_(bits.slice(1).join(':'))
    };
  }).filter(function(r) { return r.name; });
}
