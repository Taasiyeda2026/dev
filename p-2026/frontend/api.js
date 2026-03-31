const BASE_URL = '';

async function postJson(endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error('request_failed');
  return res.json();
}

export const api = {
  login: (payload) => postJson('/login', payload),
  getDashboard: () => postJson('/getDashboard', {}),
  getMyCourses: (filters) => postJson('/getMyCourses', filters),
  submitEditRequest: (payload) => postJson('/submitEditRequest', payload),
  getMyRequests: () => postJson('/getMyRequests', {}),
  getApprovals: () => postJson('/getApprovals', {}),
  approveRequest: (payload) => postJson('/approveRequest', payload),
  rejectRequest: (payload) => postJson('/rejectRequest', payload)
};
