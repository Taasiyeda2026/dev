const FINANCE_SETUP = {
  sheets: {
    settings: 'הגדרות',
    incomes: 'גיול',
    expenses: 'הוצאות',
    lists: 'רשימות',
    normalizedExpenses: 'הוצאותמסודר',
    cashflow: 'תזרים',
    summary: 'סיכום',
    weeks: 'שבועות'
  }
};

function setupFinanceWorkbook() {
  const ss = SpreadsheetApp.getActive();

  const settings = ensureSheet_(ss, FINANCE_SETUP.sheets.settings);
  const incomes = ensureSheet_(ss, FINANCE_SETUP.sheets.incomes);
  const expenses = ensureSheet_(ss, FINANCE_SETUP.sheets.expenses);
  ensureSheet_(ss, FINANCE_SETUP.sheets.lists);
  const normalizedExpenses = ensureSheet_(ss, FINANCE_SETUP.sheets.normalizedExpenses);
  const cashflow = ensureSheet_(ss, FINANCE_SETUP.sheets.cashflow);
  const summary = ensureSheet_(ss, FINANCE_SETUP.sheets.summary);
  const weeks = ensureSheet_(ss, FINANCE_SETUP.sheets.weeks);

  setupSettings_(settings);
  setupIncomes_(incomes);
  setupExpenses_(expenses);
  setupNormalizedExpenses_(normalizedExpenses);
  setupCashflow_(cashflow);
  setupSummary_(summary);
  setupWeeks_(weeks);

  SpreadsheetApp.flush();
}

function refreshFinanceCalculatedSheets() {
  const ss = SpreadsheetApp.getActive();
  const normalizedExpenses = ensureSheet_(ss, FINANCE_SETUP.sheets.normalizedExpenses);
  const cashflow = ensureSheet_(ss, FINANCE_SETUP.sheets.cashflow);
  const summary = ensureSheet_(ss, FINANCE_SETUP.sheets.summary);
  const weeks = ensureSheet_(ss, FINANCE_SETUP.sheets.weeks);

  setupNormalizedExpenses_(normalizedExpenses);
  setupCashflow_(cashflow);
  setupSummary_(summary);
  setupWeeks_(weeks);

  SpreadsheetApp.flush();
}

function ensureSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function writeHeaders_(sheet, headers) {
  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  range.setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function ensureSetting_(sheet, rowIndex, key, defaultValue) {
  if (!sheet.getRange(rowIndex, 1).getDisplayValue()) {
    sheet.getRange(rowIndex, 1).setValue(key);
  }
  if (!sheet.getRange(rowIndex, 2).getDisplayValue()) {
    sheet.getRange(rowIndex, 2).setValue(defaultValue);
  }
}

function setupSettings_(sheet) {
  writeHeaders_(sheet, ['פרמטר', 'ערך']);
  const now = new Date();
  const year = now.getFullYear();

  ensureSetting_(sheet, 2, 'שנת עבודה', year);
  ensureSetting_(sheet, 3, 'יתרת פתיחה', 0);
  ensureSetting_(sheet, 4, 'חודש התחלה', 1);
  ensureSetting_(sheet, 5, 'חודש סיום', 12);
  ensureSetting_(sheet, 6, 'שם ארגון', 'הארגון שלי');
  ensureSetting_(sheet, 7, 'תאריך איפוס יתרה', '');
  ensureSetting_(sheet, 8, 'יתרת פתיחה ידנית', '');
}

function setupIncomes_(sheet) {
  writeHeaders_(sheet, ['חשבון', 'פירוט', 'סכום', 'צפי תשלום', 'הערות', 'מימון', 'תאריך תקין']);

  sheet.getRange('G2').setFormula(
    '=ARRAYFORMULA(IF(D2:D="","",IF(ISNUMBER(D2:D),TO_DATE(D2:D),IFERROR(DATE(IF(LEN(REGEXEXTRACT(TO_TEXT(D2:D),"(\\d{2,4})$"))=2,2000+VALUE(REGEXEXTRACT(TO_TEXT(D2:D),"(\\d{2})$")),VALUE(REGEXEXTRACT(TO_TEXT(D2:D),"(\\d{4})$"))),VALUE(REGEXEXTRACT(TO_TEXT(D2:D),"[./](\\d{1,2})[./]")),VALUE(REGEXEXTRACT(TO_TEXT(D2:D),"^(\\d{1,2})"))),))))'
  );
  sheet.getRange('G2:G').setNumberFormat('dd/mm/yyyy');
}

function setupExpenses_(sheet) {
  writeHeaders_(sheet, ['תאריך', 'קבוצה', 'פירוט', 'סכום', 'הערות']);
}

function setupNormalizedExpenses_(sheet) {
  writeHeaders_(sheet, ['תאריך', 'חודש', 'קבוצה', 'פירוט', 'סכום', 'הערות']);
  sheet.getRange('A2').setFormula(
    '=ARRAYFORMULA(IFERROR(QUERY({הוצאות!A2:A,MONTH(הוצאות!A2:A),הוצאות!B2:B,הוצאות!C2:C,הוצאות!D2:D,הוצאות!E2:E},"select Col1,Col2,Col3,Col4,Col5,Col6 where Col1 is not null",0),))'
  );
  sheet.getRange('A2:A').setNumberFormat('dd/mm/yyyy');
}

function setupCashflow_(sheet) {
  writeHeaders_(sheet, ['תאריך', 'פירוט הכנסות', 'סכום הכנסות', 'פירוט הוצאות', 'סכום הוצאות', 'יתרת בנק']);

  sheet.getRange('A2').setFormula(
    '=ARRAYFORMULA(IFERROR(SORT(UNIQUE({FILTER(גיול!G2:G,גיול!G2:G<>"");FILTER(הוצאותמסודר!A2:A,הוצאותמסודר!A2:A<>"")}),1,TRUE),))'
  );

  sheet.getRange('B2').setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",MAP(A2:A,LAMBDA(d,IFERROR(TEXTJOIN(" | ",TRUE,FILTER(גיול!B2:B&" ("&גיול!F2:F&")",גיול!G2:G=d)),"")))))'
  );

  sheet.getRange('C2').setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",IFERROR(VLOOKUP(A2:A,QUERY({גיול!G2:G,גיול!C2:C},"select Col1, sum(Col2) where Col1 is not null group by Col1 label sum(Col2) \'\'",0),2,FALSE),0)))'
  );

  sheet.getRange('D2').setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",MAP(A2:A,LAMBDA(d,IFERROR(TEXTJOIN(" | ",TRUE,FILTER(הוצאותמסודר!D2:D,הוצאותמסודר!A2:A=d)),"")))))'
  );

  sheet.getRange('E2').setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",IFERROR(VLOOKUP(A2:A,QUERY({הוצאותמסודר!A2:A,הוצאותמסודר!E2:E},"select Col1, sum(Col2) where Col1 is not null group by Col1 label sum(Col2) \'\'",0),2,FALSE),0)))'
  );

  fillCashflowBalanceFormula_(sheet, 2000);
  sheet.getRange('A2:A').setNumberFormat('dd/mm/yyyy');
}

function fillCashflowBalanceFormula_(sheet, maxRows) {
  const formulaRows = [];
  for (var row = 2; row <= maxRows; row++) {
    if (row === 2) {
      formulaRows.push([
        '=IF(A2="","",IF(AND(הגדרות!B7<>"",A2=DATEVALUE(הגדרות!B7)),N(הגדרות!B8)+C2-E2,N(הגדרות!B3)+C2-E2))'
      ]);
    } else {
      formulaRows.push([
        '=IF(A' + row + '="","",IF(AND(הגדרות!B7<>"",A' + row + '=DATEVALUE(הגדרות!B7)),N(הגדרות!B8)+C' + row + '-E' + row + ',F' + (row - 1) + '+C' + row + '-E' + row + '))'
      ]);
    }
  }
  sheet.getRange(2, 6, formulaRows.length, 1).setFormulas(formulaRows);
}

function setupSummary_(sheet) {
  writeHeaders_(sheet, ['חודש', 'סך הכנסות', 'סך הוצאות', 'נטו חודשי', 'יתרת סגירה סוף חודש', 'אזור הכנסות לפי מימון', 'אזור הוצאות לפי קבוצת תזרים']);

  sheet.getRange('A2').setFormula(
    '=ARRAYFORMULA(IFERROR(QUERY({MONTH(תזרים!A2:A),תזרים!C2:C,תזרים!E2:E,תזרים!F2:F},"select Col1, sum(Col2), sum(Col3), sum(Col2)-sum(Col3), max(Col4) where Col1 is not null group by Col1 label Col1 \'\', sum(Col2) \'\', sum(Col3) \'\', sum(Col2)-sum(Col3) \'\', max(Col4) \'\'",0),))'
  );

  sheet.getRange('F2').setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",MAP(A2:A,LAMBDA(m,IFERROR(TEXTJOIN(" | ",TRUE,MAP(UNIQUE(FILTER(גיול!F2:F,גיול!F2:F<>"",MONTH(גיול!G2:G)=m)),LAMBDA(f,f&": "&SUM(FILTER(גיול!C2:C,גיול!F2:F=f,MONTH(גיול!G2:G)=m))))),"")))))'
  );

  sheet.getRange('G2').setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",MAP(A2:A,LAMBDA(m,IFERROR(TEXTJOIN(" | ",TRUE,MAP(UNIQUE(FILTER(הוצאותמסודר!C2:C,הוצאותמסודר!C2:C<>"",MONTH(הוצאותמסודר!A2:A)=m)),LAMBDA(g,g&": "&SUM(FILTER(הוצאותמסודר!E2:E,הוצאותמסודר!C2:C=g,MONTH(הוצאותמסודר!A2:A)=m))))),"")))))'
  );
}

function setupWeeks_(sheet) {
  writeHeaders_(sheet, ['חודש', 'שבוע', 'מתאריך', 'עד תאריך', 'טווח', 'סך הכנסות', 'סך הוצאות', 'פירוט הכנסות', 'פירוט הוצאות']);
  refreshWeeksTable_(sheet);
}

function refreshWeeksTable_(weeksSheet) {
  const cashflowSheet = ensureSheet_(SpreadsheetApp.getActive(), FINANCE_SETUP.sheets.cashflow);
  if (weeksSheet.getLastRow() > 1) {
    weeksSheet.getRange(2, 1, weeksSheet.getLastRow() - 1, 9).clearContent();
  }

  const rows = cashflowSheet.getDataRange().getValues().slice(1).filter(function(r) { return r[0]; });
  const grouped = {};

  rows.forEach(function(r) {
    const dateObj = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (isNaN(dateObj)) return;

    const month = dateObj.getMonth() + 1;
    const week = Math.floor((dateObj.getDate() - 1) / 7) + 1;
    const key = month + '-' + week;

    if (!grouped[key]) {
      grouped[key] = {
        month: month,
        week: week,
        fromDate: dateObj,
        toDate: dateObj,
        income: 0,
        expense: 0,
        incomeDetails: [],
        expenseDetails: []
      };
    }

    grouped[key].fromDate = grouped[key].fromDate < dateObj ? grouped[key].fromDate : dateObj;
    grouped[key].toDate = grouped[key].toDate > dateObj ? grouped[key].toDate : dateObj;
    grouped[key].income += Number(r[2] || 0);
    grouped[key].expense += Number(r[4] || 0);
    if (r[1]) grouped[key].incomeDetails.push(r[1]);
    if (r[3]) grouped[key].expenseDetails.push(r[3]);
  });

  const output = Object.keys(grouped)
    .map(function(key) { return grouped[key]; })
    .sort(function(a, b) { return a.month - b.month || a.week - b.week; })
    .map(function(item) {
      return [
        item.month,
        item.week,
        item.fromDate,
        item.toDate,
        Utilities.formatDate(item.fromDate, Session.getScriptTimeZone(), 'dd/MM') + ' - ' +
          Utilities.formatDate(item.toDate, Session.getScriptTimeZone(), 'dd/MM'),
        item.income,
        item.expense,
        item.incomeDetails.join(' | '),
        item.expenseDetails.join(' | ')
      ];
    });

  if (output.length) {
    weeksSheet.getRange(2, 1, output.length, 9).setValues(output);
    weeksSheet.getRange(2, 3, output.length, 2).setNumberFormat('dd/mm/yyyy');
  }
}
