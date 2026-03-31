var FormService = (function () {
  function submitEditRequest(profile, payload) {
    return RequestsService.submitEditRequest(profile, payload);
  }

  return {
    submitEditRequest: submitEditRequest
  };
})();
