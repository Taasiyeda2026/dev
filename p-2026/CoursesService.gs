var CoursesService = (function () {
  function getMyCourses(profile, filters) {
    try {
      if (!profile) return Utils.safeMessage('אין גישה.');
      var table = SheetService.readTable(CONFIG.SHEETS.COURSES, true);
      var headers = table.headers;
      var idxUser = SheetService.resolveIndex(headers, CONFIG.FIELDS.USER_ID.concat(CONFIG.FIELDS.DISPLAY_NAME));
      var idxProgram = SheetService.resolveIndex(headers, CONFIG.FIELDS.PROGRAM);
      var idxStatus = SheetService.resolveIndex(headers, CONFIG.FIELDS.STATUS);
      var idxCourse = SheetService.resolveIndex(headers, CONFIG.FIELDS.COURSE_ID);

      var myRows = table.rows.filter(function (row) {
        if (idxUser === -1) return true;
        return Utils.toKey(row[idxUser]) === Utils.toKey(profile.userId) || AuthService.canAccessApprovals(profile);
      });

      var f = Utils.asObject(filters, {});
      if (!Utils.isEmpty(f.program) && idxProgram > -1) {
        myRows = myRows.filter(function (r) { return Utils.toKey(r[idxProgram]) === Utils.toKey(f.program); });
      }
      if (!Utils.isEmpty(f.status) && idxStatus > -1) {
        myRows = myRows.filter(function (r) { return Utils.toKey(r[idxStatus]) === Utils.toKey(f.status); });
      }
      if (!Utils.isEmpty(f.search)) {
        var q = Utils.toKey(f.search);
        myRows = myRows.filter(function (r) {
          return r.some(function (cell) { return Utils.toKey(cell).indexOf(q) > -1; });
        });
      }

      var columns = operationalColumns(headers);
      var items = myRows.map(function (row) {
        var out = {};
        columns.forEach(function (c) { out[c] = row[headers.indexOf(c)]; });
        if (idxCourse > -1) out.CourseID = Utils.normalize(row[idxCourse]);
        return out;
      });

      return { success: true, data: { items: items, columns: columns } };
    } catch (err) {
      return Utils.safeMessage('לא ניתן לטעון קורסים.');
    }
  }

  function operationalColumns(headers) {
    return headers.filter(function (h) {
      var key = Utils.toKey(h);
      if (!key) return false;
      return !/(password|code|scope|permission|session|token)/.test(key);
    });
  }

  return {
    getMyCourses: getMyCourses
  };
})();
