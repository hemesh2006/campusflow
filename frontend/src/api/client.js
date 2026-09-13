// Centralized API client — every network call in the app should go
// through here so we get one place that attaches the JWT, one place
// that shapes errors, and one place that knows the backend base URL.

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const TOKEN_KEY = "campusflow.token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Thrown for any non-2xx response. Carries the HTTP status so callers
// (or a global handler) can branch on 401 / 403 / 404 / 422 etc.
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// Called whenever a request comes back 401 — lets AuthContext clear
// the session without every page having to know about it.
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, { method = "GET", body, params, auth = true } = {}) {
  let url = `${API_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Network error — is the backend running?", 0, null);
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    const message =
      (data && (data.detail || data.message)) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(typeof message === "string" ? message : JSON.stringify(message), res.status, data);
  }

  return data;
}

export const api = {
  get: (path, params) => request(path, { method: "GET", params }),
  post: (path, body) => request(path, { method: "POST", body }),
  patch: (path, body, params) => request(path, { method: "PATCH", body, params }),
  put: (path, body) => request(path, { method: "PUT", body }),
  del: (path, params) => request(path, { method: "DELETE", params }),
};
