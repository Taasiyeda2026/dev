var ApprovalService = (function () {
  function canAccessApprovals(profile) {
    return AuthService.canAccessApprovals(profile);
  }

  function getApprovalsData(profile) {
    return RequestsService.getApprovals(profile);
  }

  function approveRequest(profile, payload) {
    return RequestsService.approveRequest(profile, payload);
  }

  function rejectRequest(profile, payload) {
    return RequestsService.rejectRequest(profile, payload);
  }

  return {
    canAccessApprovals: canAccessApprovals,
    getApprovalsData: getApprovalsData,
    approveRequest: approveRequest,
    rejectRequest: rejectRequest
  };
})();
