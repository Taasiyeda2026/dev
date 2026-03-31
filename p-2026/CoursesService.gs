var CoursesService = (function () {
  var SHEET_READ_OPTIONS = { headerRow: 1, dataStartRow: 3 };

  function getMyCoursesData(userProfile, filters) {
    try {
      if (!userProfile) {
        return { success: false, message: 'אין התחברות פעילה. יש להתחבר מחדש.' };
      }

      var table = getDataMasterWithRowNumbers();
      var headers = table.headers;
      var idx = SheetService.resolveFieldIndexes(headers, CONFIG.FIELD_ALIASES);
      var dynamicIdx = resolveDynamicIndexes(headers);

      var roleMeta = resolveRoleMeta(userProfile);
      var permissionFiltered = filterRowsByPermission(table.items, headers, idx, dynamicIdx, userProfile, roleMeta);
      var queryFiltered = applyQueryFilters(permissionFiltered.items, headers, idx, filters || {}, permissionFiltered.assumptions);
      var viewColumns = buildViewColumns(headers, idx, dynamicIdx);

      return {
        success: true,
        data: {
          generatedAt: new Date().toISOString(),
          roleMeta: roleMeta,
          filtering: permissionFiltered.filtering,
          assumptions: queryFiltered.assumptions,
          columns: viewColumns,
          programs: collectUniqueValues(permissionFiltered.items, idx.Program),
          statuses: collectUniqueValues(permissionFiltered.items, idx.Status),
          rows: projectRows(queryFiltered.items, viewColumns, roleMeta)
        }
      };
    } catch (err) {
      return { success: false, message: 'שגיאה בטעינת הקורסים: ' + err.message };
    }
  }

  function getDataMasterWithRowNumbers() {
    var sheet = SheetService.getSheetByName(CONFIG.SHEETS.DATA_MASTER, true);
    var headers = SheetService.getHeaders(sheet, SHEET_READ_OPTIONS.headerRow);
    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();
    var items = [];

    if (lastColumn === 0 || lastRow < SHEET_READ_OPTIONS.dataStartRow) {
      return { headers: headers, items: items };
    }

    var numRows = lastRow - SHEET_READ_OPTIONS.dataStartRow + 1;
    var rows = sheet.getRange(SHEET_READ_OPTIONS.dataStartRow, 1, numRows, lastColumn).getValues();
    rows.forEach(function (row, i) {
      var hasValue = row.some(function (cell) { return !Utils.isEmpty(cell); });
      if (!hasValue) return;
      items.push({
        rowNumber: SHEET_READ_OPTIONS.dataStartRow + i,
        values: row
      });
    });

    return { headers: headers, items: items };
  }

  function resolveDynamicIndexes(headers) {
    return {
      InstructorID: SheetService.findHeaderIndex(headers, ['InstructorID', 'InstructorId', 'מזהה מדריך', 'InstructorEmployeeID']),
      InstructorName: SheetService.findHeaderIndex(headers, ['InstructorName', 'שם מדריך', 'שם מרצה']),
      OwnerID: SheetService.findHeaderIndex(headers, ['OwnerID', 'OwnerId', 'מזהה בעלים', 'RecordOwnerID', 'AssignedEmployeeID']),
      OwnerName: SheetService.findHeaderIndex(headers, ['OwnerName', 'שם בעלים', 'RecordOwnerName', 'AssignedTo'])
    };
  }

  function resolveRoleMeta(profile) {
    var roleText = [profile.SystemRole, profile.BaseRole].map(function (v) {
      return Utils.normalize(v).toLowerCase();
    }).join(' ');

    var isMasterAdmin = /(master|מאסטר)/.test(roleText) && /(admin|אדמין)/.test(roleText);
    var isAdmin = isMasterAdmin || /(admin|אדמין)/.test(roleText);
    var isManager = /(manager|ניהול|הנהלה)/.test(roleText);

    return {
      isMasterAdmin: isMasterAdmin,
      isAdmin: isAdmin,
      isManager: isManager,
      mode: isMasterAdmin ? 'MASTER_ADMIN' : (isAdmin ? 'ADMIN' : (isManager ? 'MANAGER' : 'END_USER'))
    };
  }

  function filterRowsByPermission(items, headers, idx, dynamicIdx, profile, roleMeta) {
    var assumptions = [];
    var filtering = { mode: roleMeta.mode, fieldUsed: 'ללא סינון' };

    if (roleMeta.isMasterAdmin || roleMeta.isAdmin) {
      return { items: items, assumptions: assumptions, filtering: filtering };
    }

    if (roleMeta.isManager) {
      var scope = Utils.normalize(profile.AccessScope);
      if (!scope) {
        assumptions.push('AccessScope חסר ולכן למשתמש הנהלה הוחזרו 0 רשומות לשמירה על אבטחה.');
        filtering.fieldUsed = 'AccessScope חסר';
        return { items: [], assumptions: assumptions, filtering: filtering };
      }
      if (scope.toLowerCase() === 'all') {
        filtering.fieldUsed = 'AccessScope=ALL (ללא צמצום)';
        return { items: items, assumptions: assumptions, filtering: filtering };
      }

      if (idx.Program === -1) {
        assumptions.push('לא נמצאה עמודת Program ולכן למשתמש הנהלה הוחזרו 0 רשומות לשמירה על אבטחה.');
        filtering.fieldUsed = 'AccessScope ללא Program';
        return { items: [], assumptions: assumptions, filtering: filtering };
      }

      var allowed = scope.split(',').map(function (s) {
        return Utils.normalize(s).toLowerCase();
      }).filter(function (s) { return !!s; });

      filtering.fieldUsed = 'Program לפי AccessScope';
      return {
        items: items.filter(function (item) {
          var row = item.values;
          var programValue = Utils.normalize(row[idx.Program]).toLowerCase();
          return allowed.indexOf(programValue) !== -1;
        }),
        assumptions: assumptions,
        filtering: filtering
      };
    }

    var ownership = chooseOwnershipField(idx, dynamicIdx);
    filtering.fieldUsed = ownership.label;

    if (ownership.index === -1) {
      assumptions.push('לא נמצאה עמודת שיוך חד-משמעית ולכן הוחזרו 0 רשומות למשתמש קצה.');
      return { items: [], assumptions: assumptions, filtering: filtering };
    }

    var userValue = ownership.byId ? Utils.normalize(profile.EmployeeID).toLowerCase() : Utils.normalize(profile.EmployeeName).toLowerCase();
    if (!userValue) {
      assumptions.push('לא נמצא מזהה משתמש מתאים ב-session ולכן הוחזרו 0 רשומות.');
      return { items: [], assumptions: assumptions, filtering: filtering };
    }

    return {
      items: items.filter(function (item) {
        var row = item.values;
        return Utils.normalize(row[ownership.index]).toLowerCase() === userValue;
      }),
      assumptions: assumptions,
      filtering: filtering
    };
  }

  function chooseOwnershipField(idx, dynamicIdx) {
    var candidates = [
      { index: idx.EmployeeID, label: 'EmployeeID', byId: true },
      { index: dynamicIdx.InstructorID, label: 'InstructorID', byId: true },
      { index: dynamicIdx.OwnerID, label: 'OwnerID', byId: true },
      { index: idx.EmployeeName, label: 'EmployeeName', byId: false },
      { index: dynamicIdx.InstructorName, label: 'InstructorName', byId: false },
      { index: dynamicIdx.OwnerName, label: 'OwnerName', byId: false }
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i].index > -1) return candidates[i];
    }

    return { index: -1, label: 'לא נמצא', byId: true };
  }

  function applyQueryFilters(items, headers, idx, filters, assumptions) {
    var filtered = items.slice();
    var query = Utils.normalize(filters.query).toLowerCase();
    var program = Utils.normalize(filters.program).toLowerCase();
    var status = Utils.normalize(filters.status).toLowerCase();

    if (program) {
      if (idx.Program === -1) {
        assumptions.push('התקבל סינון תוכנית אך לא נמצאה עמודת Program.');
      } else {
        filtered = filtered.filter(function (item) {
          var row = item.values;
          return Utils.normalize(row[idx.Program]).toLowerCase() === program;
        });
      }
    }

    if (status) {
      if (idx.Status === -1) {
        assumptions.push('התקבל סינון סטטוס אך לא נמצאה עמודת Status.');
      } else {
        filtered = filtered.filter(function (item) {
          var row = item.values;
          return Utils.normalize(row[idx.Status]).toLowerCase() === status;
        });
      }
    }

    if (query) {
      filtered = filtered.filter(function (item) {
        var row = item.values;
        return headers.some(function (_header, columnIndex) {
          return Utils.normalize(row[columnIndex]).toLowerCase().indexOf(query) !== -1;
        });
      });
    }

    return {
      items: filtered,
      assumptions: assumptions
    };
  }

  function collectUniqueValues(items, index) {
    if (index === -1) return [];
    var bag = {};
    items.forEach(function (item) {
      var row = item.values;
      var value = Utils.normalize(row[index]);
      if (value) bag[value] = true;
    });
    return Object.keys(bag).sort();
  }

  function buildViewColumns(headers, idx, dynamicIdx) {
    var preferred = [
      idx.Program,
      idx.CourseID,
      idx.EmployeeName,
      idx.EmployeeID,
      idx.Status,
      idx.PlannedMeetings,
      idx.ActualMeetings,
      idx.StartTime,
      idx.EndTime,
      dynamicIdx.InstructorName,
      dynamicIdx.OwnerName
    ];

    var used = {};
    var cols = [];
    preferred.forEach(function (columnIndex) {
      if (columnIndex > -1 && !used[columnIndex]) {
        used[columnIndex] = true;
        cols.push({ index: columnIndex, key: headers[columnIndex] || ('column_' + columnIndex), label: headers[columnIndex] || ('עמודה ' + (columnIndex + 1)) });
      }
    });

    if (!cols.length) {
      headers.forEach(function (header, i) {
        cols.push({ index: i, key: header || ('column_' + i), label: header || ('עמודה ' + (i + 1)) });
      });
    }

    return cols;
  }

  function projectRows(items, columns, roleMeta) {
    return items.map(function (item) {
      var row = item.values;
      var obj = {};
      columns.forEach(function (col) {
        obj[col.key] = row[col.index];
      });
      obj._sourceRowNumber = item.rowNumber;
      obj._canRequestEdit = !!roleMeta;
      return obj;
    });
  }

  return {
    getMyCoursesData: getMyCoursesData
  };
})();
