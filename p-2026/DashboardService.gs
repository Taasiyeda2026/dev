var DashboardService = (function () {
  var SHEET_READ_OPTIONS = { headerRow: 1, dataStartRow: 3 };

  function getDashboardData(userProfile) {
    try {
      if (!userProfile) {
        return { success: false, message: 'אין התחברות פעילה. יש להתחבר מחדש.' };
      }

      var dataMaster = SheetService.getRecords(CONFIG.SHEETS.DATA_MASTER, true, SHEET_READ_OPTIONS);
      var headers = dataMaster.headers;
      var idx = SheetService.resolveFieldIndexes(headers, CONFIG.FIELD_ALIASES);

      var dateColumnIndexes = findDateColumnIndexes(headers);
      var summary = buildSummary(dataMaster.rows, idx, dateColumnIndexes);

      var reviewMeta = getReviewRequiredMeta();
      var pendingEdits = SheetService.hasSheet(CONFIG.SHEETS.EDIT_REQUESTS)
        ? SheetService.countDataRows(CONFIG.SHEETS.EDIT_REQUESTS, SHEET_READ_OPTIONS)
        : null;

      var kpis = [
        { key: 'activePrograms', label: 'תוכניות פעילות', value: summary.activePrograms },
        { key: 'activeCourses', label: 'קורסים פעילים', value: summary.activeCourses },
        { key: 'activeInstructors', label: 'מדריכים פעילים', value: summary.activeInstructors },
        { key: 'plannedVsActual', label: 'מתוכנן מול בוצע', value: summary.totalPlanned + ' / ' + summary.totalActual },
        { key: 'executionGap', label: 'פער ביצוע', value: summary.executionGap },
        { key: 'reviewRequired', label: 'פריטים ממתינים לבדיקה', value: reviewMeta.count },
        {
          key: 'pendingRequests',
          label: 'בקשות ממתינות לאישור',
          value: pendingEdits === null ? 'לא קיים גיליון EDIT_REQUESTS' : pendingEdits
        },
        { key: 'instructorsHoursBase', label: 'סה״כ שעות מדריכים', value: summary.totalHoursBase.toFixed(2) }
      ];

      return {
        success: true,
        dashboard: {
          generatedAt: new Date().toISOString(),
          userProfile: userProfile,
          kpis: kpis,
          summary: {
            activePrograms: summary.activePrograms,
            activeCourses: summary.activeCourses,
            activeInstructors: summary.activeInstructors,
            totalPlanned: summary.totalPlanned,
            totalActual: summary.totalActual,
            executionGap: summary.executionGap,
            reviewRequired: reviewMeta.count,
            pendingRequests: pendingEdits,
            totalHoursBase: summary.totalHoursBase,
            dynamicDateColumnsFound: dateColumnIndexes.length
          },
          assumptions: summary.assumptions.concat(reviewMeta.assumptions),
          missingFields: summary.missingFields
        }
      };
    } catch (err) {
      return { success: false, message: 'שגיאה בטעינת נתוני הדשבורד: ' + err.message };
    }
  }

  function getReviewRequiredMeta() {
    if (!SheetService.hasSheet(CONFIG.SHEETS.REVIEW_REQUIRED)) {
      return {
        count: 0,
        assumptions: ['הגיליון REVIEW_REQUIRED לא נמצא, ולכן הוגדרו 0 פריטים לבדיקה.']
      };
    }

    return {
      count: SheetService.countDataRows(CONFIG.SHEETS.REVIEW_REQUIRED, SHEET_READ_OPTIONS),
      assumptions: []
    };
  }

  function buildSummary(rows, idx, dateColumnIndexes) {
    var programs = {};
    var courses = {};
    var instructors = {};

    var totalPlanned = 0;
    var totalActual = 0;
    var totalHoursBase = 0;
    var missingFields = [];
    var assumptions = [];

    trackMissing(idx, 'Program', missingFields);
    trackMissing(idx, 'CourseID', missingFields);
    trackMissing(idx, 'EmployeeID', missingFields);
    trackMissing(idx, 'PlannedMeetings', missingFields);
    trackMissing(idx, 'ActualMeetings', missingFields);
    trackMissing(idx, 'StartTime', missingFields);
    trackMissing(idx, 'EndTime', missingFields);

    if (dateColumnIndexes.length === 0) {
      assumptions.push('לא זוהו עמודות תאריך באופן דינמי בכותרות DATA_MASTER.');
    }

    rows.forEach(function (row) {
      var program = valueAt(row, idx.Program);
      var courseId = valueAt(row, idx.CourseID);
      var employeeId = valueAt(row, idx.EmployeeID);
      var statusValue = valueAt(row, idx.Status);
      var activeValue = valueAt(row, idx.Active);

      var isRowActive = isActiveRow(statusValue, activeValue);

      if (isRowActive && program) programs[program] = true;
      if (isRowActive && courseId) courses[courseId] = true;
      if (isRowActive && employeeId) instructors[employeeId] = true;

      totalPlanned += Utils.toNumber(valueAt(row, idx.PlannedMeetings));
      totalActual += Utils.toNumber(valueAt(row, idx.ActualMeetings));

      var rowHours = Utils.durationHours(valueAt(row, idx.StartTime), valueAt(row, idx.EndTime));
      if (dateColumnIndexes.length > 0) {
        rowHours *= countNonEmptyDateCells(row, dateColumnIndexes);
      }
      totalHoursBase += rowHours;
    });

    return {
      activePrograms: Object.keys(programs).length,
      activeCourses: Object.keys(courses).length,
      activeInstructors: Object.keys(instructors).length,
      totalPlanned: totalPlanned,
      totalActual: totalActual,
      executionGap: totalPlanned - totalActual,
      totalHoursBase: totalHoursBase,
      missingFields: missingFields,
      assumptions: assumptions
    };
  }

  function valueAt(row, idx) {
    return idx > -1 ? row[idx] : '';
  }

  function isActiveRow(statusValue, activeValue) {
    var statusText = Utils.normalize(statusValue).toLowerCase();
    if (Utils.isTruthyActive(activeValue)) return true;
    if (!statusText) return true;
    return ['פעיל', 'active', 'in progress', 'פתוח'].indexOf(statusText) !== -1;
  }

  function findDateColumnIndexes(headers) {
    var datePattern = /(date|תאריך|\d{1,2}[\/\.-]\d{1,2}|day)/i;
    var indexes = [];
    headers.forEach(function (header, idx) {
      if (datePattern.test(Utils.normalize(header))) {
        indexes.push(idx);
      }
    });
    return indexes;
  }

  function countNonEmptyDateCells(row, dateColumnIndexes) {
    var count = 0;
    dateColumnIndexes.forEach(function (idx) {
      if (!Utils.isEmpty(row[idx])) count += 1;
    });
    return count || 1;
  }

  function trackMissing(idx, key, bag) {
    if (idx[key] === -1) bag.push(key);
  }

  return {
    getDashboardData: getDashboardData
  };
})();
