import { API_URL } from "./config.js";

async function request(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function loadSchedule() {
  return request(API_URL);
}

export async function addEvent(eventData) {
  return request(`${API_URL}?action=add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(eventData),
  });
}

export async function deleteEvent(eventData) {
  return request(`${API_URL}?action=delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(eventData),
  });
}

export async function clearSchedule() {
  return request(`${API_URL}?action=clear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

export async function loadPotential() {
  return request(`${API_URL}?action=potential`);
}

export async function updatePotential(payload) {
  return request(`${API_URL}?action=updatepotential`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
