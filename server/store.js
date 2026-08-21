const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./data-dir");
const STORE_FILE = path.join(DATA_DIR, "store.json");

let cache = null;
let flushTimer = null;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    cache = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    cache = {};
  }
  return cache;
}

function flushNow() {
  if (!cache) return;
  ensureDataDir();
  const tmp = STORE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf8");
  fs.renameSync(tmp, STORE_FILE);
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      flushNow();
    } catch (error) {
      console.error("[store] flush failed:", error.message);
    }
  }, 300);
  if (flushTimer.unref) flushTimer.unref();
}

// Last-write-wins merge. Returns the final state for every submitted key so the
// client can adopt the winning values.
function mergeEntries(entries) {
  const store = load();
  const result = {};

  for (const entry of entries) {
    const key = String(entry?.key || "");
    if (!key) continue;

    const incomingUpdatedAt = Number(entry?.updatedAt) || 0;
    const existing = store[key];
    const existingUpdatedAt = Number(existing?.updatedAt) || 0;

    if (!existing || incomingUpdatedAt >= existingUpdatedAt) {
      store[key] = {
        value: entry?.value === undefined ? null : entry.value,
        // Server receive time is the authoritative tiebreaker so device clock
        // skew cannot make an older write win forever.
        updatedAt: Math.max(incomingUpdatedAt, Date.now()),
        clientUpdatedAt: incomingUpdatedAt,
      };
      result[key] = { accepted: true, ...store[key] };
      scheduleFlush();
    } else {
      result[key] = { accepted: false, value: existing.value, updatedAt: existing.updatedAt };
    }
  }

  return result;
}

function getAll() {
  return load();
}

// Full-store import used by initial migration. "replace" overwrites everything,
// "merge" applies last-write-wins per key.
function importStore(payload, mode) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Import payload must be an object keyed by storage key.");
  }

  const normalized = {};
  for (const [key, raw] of Object.entries(payload)) {
    if (!key) continue;
    if (raw && typeof raw === "object" && !Array.isArray(raw) && "value" in raw) {
      normalized[key] = {
        value: raw.value === undefined ? null : raw.value,
        updatedAt: Number(raw.updatedAt) || Date.now(),
      };
    } else {
      normalized[key] = { value: raw === undefined ? null : raw, updatedAt: Date.now() };
    }
  }

  if (mode === "replace") {
    cache = normalized;
  } else {
    const store = load();
    for (const [key, entry] of Object.entries(normalized)) {
      const existing = store[key];
      if (!existing || entry.updatedAt >= (Number(existing.updatedAt) || 0)) {
        store[key] = entry;
      }
    }
  }

  flushNow();
  return load();
}

module.exports = { DATA_DIR, getAll, mergeEntries, importStore, flushNow, load };
