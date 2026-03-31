var Utils = (function () {
  function normalize(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function isEmpty(value) {
    return normalize(value) === '';
  }

  function toKey(value) {
    return normalize(value).toLowerCase();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function safeMessage(defaultMessage) {
    return { success: false, message: defaultMessage || 'הפעולה לא הושלמה.' };
  }

  function pick(obj, keys) {
    var out = {};
    keys.forEach(function (k) {
      out[k] = obj[k];
    });
    return out;
  }

  function asObject(value, fallback) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : (fallback || {});
  }

  return {
    normalize: normalize,
    isEmpty: isEmpty,
    toKey: toKey,
    nowIso: nowIso,
    safeMessage: safeMessage,
    pick: pick,
    asObject: asObject
  };
})();
