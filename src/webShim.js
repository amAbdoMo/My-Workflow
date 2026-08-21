// Web/PWA stand-ins for the Electron preload bridges so App.js runs unmodified.
// In Electron the real bridges already exist and every installer below no-ops.

import { apiFetch, isElectron } from "./api";

const NOTES_KEY = "wizard-schedules-project-notes";

function installStorageShim() {
  if (window.wizardStorage) return;
  window.wizardStorage = {
    readProjectNotes: async () => {
      try {
        return JSON.parse(localStorage.getItem(NOTES_KEY) || "{}");
      } catch {
        return {};
      }
    },
    writeProjectNotes: async (notesStore) => {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notesStore || {}));
      return notesStore || {};
    },
  };
}

function installAppShim() {
  if (window.wizardApp) return;
  window.wizardApp = {
    // Download the serialized backup instead of writing to a desktop path.
    backup: async (data) => {
      const name = `wizard-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { ok: true, path: name };
    },
    // Pick a backup file instead of opening a native dialog.
    restore: () =>
      new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = async () => {
          const file = input.files && input.files[0];
          if (!file) {
            resolve({ ok: false });
            return;
          }
          try {
            resolve({ ok: true, data: await file.text(), path: file.name });
          } catch (error) {
            resolve({ ok: false, error: error?.message });
          }
        };
        input.addEventListener("cancel", () => resolve({ ok: false }));
        input.click();
      }),
  };
}

function installImapShim() {
  if (window.wizardImap) return;
  let progressSource = null;
  const progressListeners = new Set();

  function emit(update) {
    for (const listener of progressListeners) {
      try {
        listener(update);
      } catch {}
    }
  }

  function ensureProgressStream() {
    if (progressSource) return;
    progressSource = true; // stream opens async; block duplicates immediately
    connectProgressStream();
  }

  async function connectProgressStream() {
    try {
      const { getApiBase } = await import("./api");
      const source = new EventSource(`${getApiBase()}/api/imap/progress`, { withCredentials: true });
      source.onmessage = (event) => {
        try {
          emit(JSON.parse(event.data));
        } catch {}
      };
      source.onerror = () => {
        // EventSource retries on its own; nothing to do.
      };
      progressSource = source;
    } catch {
      progressSource = null;
    }
  }

  window.wizardImap = {
    testConnection: (account) => apiFetch("/api/imap/test", { method: "POST", body: account }),
    startMigration: (payload) => {
      ensureProgressStream();
      return apiFetch("/api/imap/start", { method: "POST", body: payload });
    },
    exportBackup: (payload) => {
      ensureProgressStream();
      return apiFetch("/api/imap/export", { method: "POST", body: payload });
    },
    importBackup: (payload) => {
      ensureProgressStream();
      return apiFetch("/api/imap/import", { method: "POST", body: payload });
    },
    pauseMigration: () => apiFetch("/api/imap/pause", { method: "POST" }).catch(() => {}),
    resumeMigration: () => apiFetch("/api/imap/resume", { method: "POST" }).catch(() => {}),
    cancelMigration: () => apiFetch("/api/imap/cancel", { method: "POST" }).catch(() => {}),
    onProgress: (callback) => {
      progressListeners.add(callback);
      return () => progressListeners.delete(callback);
    },
  };
}

export function installWebShim() {
  if (isElectron()) return;
  document.documentElement.setAttribute("data-web", "1");
  installStorageShim();
  installAppShim();
  installImapShim();
}
