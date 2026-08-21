const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wizardStorage", {
  readProjectNotes: () => ipcRenderer.invoke("wizard-project-notes:read"),
  writeProjectNotes: (notes) => ipcRenderer.invoke("wizard-project-notes:write", notes),
});

contextBridge.exposeInMainWorld("wizardApp", {
  backup: (data) => ipcRenderer.invoke("wizard-app:backup", data),
  restore: () => ipcRenderer.invoke("wizard-app:restore"),
});

contextBridge.exposeInMainWorld("wizardImap", {
  testConnection: (account) => ipcRenderer.invoke("wizard-imap:test", account),
  startMigration: (payload) => ipcRenderer.invoke("wizard-imap:start", payload),
  exportBackup: (payload) => ipcRenderer.invoke("wizard-imap:export-backup", payload),
  importBackup: (payload) => ipcRenderer.invoke("wizard-imap:import-backup", payload),
  pauseMigration: () => ipcRenderer.send("wizard-imap:pause"),
  resumeMigration: () => ipcRenderer.send("wizard-imap:resume"),
  cancelMigration: () => ipcRenderer.send("wizard-imap:cancel"),
  onProgress: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on("wizard-imap:progress", listener);
    return () => ipcRenderer.removeListener("wizard-imap:progress", listener);
  },
});
