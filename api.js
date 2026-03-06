import { API_URL } from "./config.js";

async function request(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

export async function apiLoadSchedule() {
  return request(API_URL);
}

export async function apiUpsertSchedule(payload) {
  return request(`${API_URL}?action=upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function apiDeleteSchedule(payload) {
  return request(`${API_URL}?action=delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function apiLoadPotential() {
  return request(`${API_URL}?action=potential`);
}

export async function apiUpdatePotential(payload) {
  return request(`${API_URL}?action=updatepotential`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
