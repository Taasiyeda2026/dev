var Utils = (function () {
  function isEmpty(value) {
    return value === null || value === undefined || String(value).trim() === '';
  }

  function normalize(value) {
    return isEmpty(value) ? '' : String(value).trim();
  }

  function toNumber(value) {
    if (isEmpty(value)) return 0;
    var n = Number(String(value).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function parseTimeValue(value) {
    if (value instanceof Date) {
      return value.getHours() * 60 + value.getMinutes();
    }

    var text = normalize(value);
    if (!text) return null;

    var match = text.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return null;

    var h = Number(match[1]);
    var m = Number(match[2]);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;

    return h * 60 + m;
  }

  function durationHours(startTime, endTime) {
    var startMin = parseTimeValue(startTime);
    var endMin = parseTimeValue(endTime);
    if (startMin === null || endMin === null || endMin < startMin) return 0;
    return (endMin - startMin) / 60;
  }

  function formatNumber(value) {
    return toNumber(value).toLocaleString('he-IL');
  }

  function formatHours(value) {
    return toNumber(value).toFixed(2) + ' שעות';
  }

  function isTruthyActive(value) {
    var normalized = normalize(value).toLowerCase();
    return CONFIG.SETTINGS.ACTIVE_VALUE_CANDIDATES.indexOf(normalized) !== -1;
  }

  return {
    isEmpty: isEmpty,
    normalize: normalize,
    toNumber: toNumber,
    parseTimeValue: parseTimeValue,
    durationHours: durationHours,
    formatNumber: formatNumber,
    formatHours: formatHours,
    isTruthyActive: isTruthyActive
  };
})();
