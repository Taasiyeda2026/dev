var DashboardService = (function () {
  function getDashboard(profile) {
    try {
      if (!profile) return Utils.safeMessage('אין גישה.');

      var dataMaster = SheetService.readTable(CONFIG.SHEETS.DATA_MASTER, false);
      var reviewRequired = SheetService.readTable(CONFIG.SHEETS.REVIEW_REQUIRED, false);
      var editRequests = SheetService.readTable(CONFIG.SHEETS.EDIT_REQUESTS, false);
      var exportSheet = SheetService.readTable(CONFIG.SHEETS.DASHBOARD_EXPORT, false);

      var pendingCount = countByStatus(editRequests, 'pending');
      return {
        success: true,
        data: {
          totalDataMaster: dataMaster.rows.length,
          reviewRequiredCount: reviewRequired.rows.length,
          pendingRequests: pendingCount,
          exportRows: exportSheet.rows.length
        }
      };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון דשבורד.');
    }
  }

  function countByStatus(table, statusText) {
    if (!table || !table.headers || !table.rows) return 0;
    var idx = SheetService.resolveIndex(table.headers, CONFIG.FIELDS.APPROVAL_STATUS.concat(CONFIG.FIELDS.STATUS));
    if (idx === -1) return 0;
    var target = Utils.toKey(statusText);
    return table.rows.filter(function (row) { return Utils.toKey(row[idx]) === target; }).length;
  }

  return {
    getDashboard: getDashboard
  };
})();
