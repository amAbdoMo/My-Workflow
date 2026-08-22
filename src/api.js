// Central API access: same-origin on the web, remote base + bearer token in Electron.

const API_BASE_KEY = "wizard-api-base";
const TOKEN_KEY = "wizard-api-token";
// Capture native preload bridges before the web shim creates compatible names.
const NATIVE_ELECTRON = Boolean(window.wizardImap || window.wizardApp);
// Default remote API for the desktop app (overridable via localStorage).
export const DEFAULT_REMOTE_BASE = "https://workflow.abdom.me";

export function isElectron() {
  return NATIVE_ELECTRON;
}

export function getApiBase() {
  const override = localStorage.getItem(API_BASE_KEY);
  if (override) return override.replace(/\/+$/, "");
  return isElectron() ? DEFAULT_REMOTE_BASE : "";
}

export function setApiBase(base) {
  if (base) localStorage.setItem(API_BASE_KEY, String(base).replace(/\/+$/, ""));
  else localStorage.removeItem(API_BASE_KEY);
}

function getToken() {
  // Web uses the HttpOnly session cookie; Electron persists the bearer token.
  return isElectron() ? localStorage.getItem(TOKEN_KEY) : null;
}

// Exposed for EventSource, which cannot send an Authorization header.
export function getAuthQuery() {
  const token = getToken();
  return token ? `?token=${encodeURIComponent(token)}` : "";
}

export function storeToken(token) {
  if (isElectron() && token) localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

let unauthorizedHandler = null;
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

export async function apiFetch(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error("Cannot reach the server. Check your connection.");
  }

  let data = null;
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/session") && !path.startsWith("/api/login") && !path.startsWith("/api/setup")) {
      if (unauthorizedHandler) unauthorizedHandler();
    }
    throw new Error(data?.error || `Request failed (${res.status}).`);
  }
  return data;
}
