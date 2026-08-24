// Two-way last-write-wins sync of the app's localStorage keys with the server store.
// Local writes are intercepted, timestamped, and pushed (debounced); remote writes
// newer than our local record are pulled in on load, on focus, and on an interval.

import { apiFetch, getApiBase, getAuthQuery } from "./api";

const META_KEY = "wizard-sync-meta";

export const SYNCED_KEYS = [
  "wizard-schedules",
  "deadline-os",
  "wizard-schedules-clients",
  "wizard-schedules-project-notes",
  "wizard-schedules-project-form-draft",
  "wizard-schedules-todo-items",
  "wizard-schedule-snippets",
  "wizard-schedules-theme",
  "deadline-os-theme",
  "wizard-schedules-unpaid-currency",
  "wizard-schedules-money-visible",
  "wizard-schedules-usd-egp-rate",
];

const PUSH_DEBOUNCE_MS = 1500;
const PULL_INTERVAL_MS = 20_000;

let started = false;
let applyingRemote = false;
let pending = new Set();
let pushTimer = null;

// ---------- meta (per-key local timestamps) ----------

function readMeta() {
  try {
    const parsed = JSON.parse(localStorage.getItem(META_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function stampLocal(key) {
  const meta = readMeta();
  meta[key] = Date.now();
  writeMeta(meta);
}

// ---------- raw storage access (bypassing our own patches) ----------

const rawSet = Storage.prototype.setItem;
const rawRemove = Storage.prototype.removeItem;

function applyLocal(key, value) {
  applyingRemote = true;
  try {
    if (value === null || value === undefined) {
      if (localStorage.getItem(key) !== null) rawRemove.call(localStorage, key);
    } else {
      rawSet.call(localStorage, key, typeof value === "string" ? value : JSON.stringify(value));
    }
  } finally {
    applyingRemote = false;
  }
}

// ---------- outgoing ----------

function schedulePush() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushPending().catch(() => {});
  }, PUSH_DEBOUNCE_MS);
}

async function pushPending() {
  if (!pending.size || applyingRemote) return;
  const keys = [...pending];
  const meta = readMeta();
  const entries = keys.map((key) => ({
    key,
    value: localStorage.getItem(key),
    updatedAt: Number(meta[key]) || Date.now(),
  }));
  pending = new Set([...pending].filter((k) => !keys.includes(k)));

  let results = {};
  try {
    const res = await apiFetch("/api/data", { method: "PUT", body: { entries } });
    results = res?.results || {};
  } catch (error) {
    // Offline or rejected: keep the keys queued for the next flush.
    pending = new Set([...pending, ...keys]);
    return;
  }

  // Adopt server-winning values for keys we lost.
  let lost = false;
  for (const [key, result] of Object.entries(results)) {
    if (result?.accepted === false) {
      applyLocal(key, result.value);
      const m = readMeta();
      m[key] = Number(result.updatedAt) || Date.now();
      writeMeta(m);
      lost = true;
    }
  }
  if (lost) notifyRemoteChange();
}

// ---------- incoming ----------

async function pullRemote() {
  const remote = await apiFetch("/api/data");
  if (!remote || typeof remote !== "object") return;
  const meta = readMeta();
  let changed = false;

  for (const [key, entry] of Object.entries(remote)) {
    if (!SYNCED_KEYS.includes(key) || !entry || typeof entry !== "object") continue;
    if (pending.has(key)) continue; // local edit in flight wins until flushed
    const remoteTime = Number(entry.updatedAt) || 0;
    if (!remoteTime) continue;
    if (remoteTime > (Number(meta[key]) || 0)) {
      applyLocal(key, entry.value);
      meta[key] = remoteTime;
      changed = true;
    }
  }
  if (changed) {
    writeMeta(meta);
    notifyRemoteChange();
  }
}

function notifyRemoteChange() {
  // Same-page listeners can react to remote updates.
  window.dispatchEvent(new CustomEvent("wizard-remote-sync"));
}

// ---------- initial merge ----------

async function initialMerge() {
  let remote = {};
  try {
    remote = await apiFetch("/api/data");
    if (!remote || typeof remote !== "object") remote = {};
  } catch (error) {
    remote = {}; // offline first run: work locally, push later
  }

  const meta = readMeta();

  for (const key of SYNCED_KEYS) {
    const entry = remote[key];
    const hasLocal = localStorage.getItem(key) !== null;
    const localTime = Number(meta[key]) || 0;
    const remoteTime = entry ? Number(entry.updatedAt) || 0 : 0;

    if (entry && !hasLocal) {
      // Server has data this device lacks (e.g. phone after using the web app).
      applyLocal(key, entry.value);
      meta[key] = remoteTime;
    } else if (entry && localTime && remoteTime > localTime) {
      applyLocal(key, entry.value);
      meta[key] = remoteTime;
    }
    // Both exist with no local record yet: this device's data stays and pushes up
    // (first-time migration from a desktop install).
  }
  writeMeta(meta);

  // Push everything local the server does not know about yet.
  const entries = [];
  const now = Date.now();
  for (const key of SYNCED_KEYS) {
    const value = localStorage.getItem(key);
    if (value === null) continue;
    if (remote[key]) continue;
    entries.push({ key, value, updatedAt: Number(meta[key]) || now });
    meta[key] = Number(meta[key]) || now;
  }
  writeMeta(meta);
  if (entries.length) {
    await apiFetch("/api/data", { method: "PUT", body: { entries } }).catch(() => {});
  }
}

// ---------- lifecycle ----------

function installStoragePatch() {
  if (Storage.prototype.setItem === rawSet) {
    Storage.prototype.setItem = function (key, value) {
      rawSet.call(this, key, value);
      if (!applyingRemote && this === localStorage && SYNCED_KEYS.includes(String(key))) {
        stampLocal(String(key));
        pending.add(String(key));
        schedulePush();
      }
    };
    Storage.prototype.removeItem = function (key) {
      rawRemove.call(this, key);
      if (!applyingRemote && this === localStorage && SYNCED_KEYS.includes(String(key))) {
        stampLocal(String(key));
        pending.add(String(key));
        schedulePush();
      }
    };
  }
}

export function isSyncStarted() {
  return started;
}

// Must complete before <App /> renders so state initializers see merged data.
export async function initSync() {
  if (started) return;
  started = true;
  installStoragePatch();
  await initialMerge();

  setInterval(() => pullRemote().catch(() => {}), PULL_INTERVAL_MS);
  const pullOnFocus = () => {
    if (document.visibilityState === "visible") pullRemote().catch(() => {});
  };
  document.addEventListener("visibilitychange", pullOnFocus);
  window.addEventListener("focus", pullOnFocus);
  window.addEventListener("beforeunload", () => {
    if (pending.size) pushPending().catch(() => {});
  });
  openLiveChannel();
}

// ---------- live updates (SSE) ----------

// The server announces data changes; we pull immediately instead of waiting for
// the 20s interval. EventSource reconnects on its own when the stream drops.
function openLiveChannel() {
  if (typeof EventSource === "undefined") return;
  try {
    const source = new EventSource(`${getApiBase()}/api/events${getAuthQuery()}`);
    source.addEventListener("data-changed", () => {
      pullRemote().catch(() => {});
    });
    // Deadline reminders: the server fires this per fresh notification.
    source.addEventListener("notification", (event) => {
      let detail = null;
      try {
        detail = JSON.parse(event.data);
      } catch {}
      window.dispatchEvent(new CustomEvent("wizard-notification", { detail }));
    });
    source.onerror = () => {
      // Stream lost (network change, server restart): pull once on reopen.
      source.addEventListener("open", () => pullRemote().catch(() => {}), { once: true });
    };
  } catch {
    // Live channel unavailable: the interval + focus pulls still keep us fresh.
  }
}
