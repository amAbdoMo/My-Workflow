const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, dialog } = require("electron");
const { ImapFlow } = require("imapflow");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const APP_NAME = "Wizard Schedule & Snippets";
const OPEN_SHORTCUT = "CommandOrControl+Shift+W";
const START_HIDDEN = process.argv.includes("--hidden");
const iconPath = path.join(__dirname, "public", "wizard-schedules-transparent.ico");
const appBuildIndex = path.join(__dirname, "app-build", "index.html");
const legacyBuildIndex = path.join(__dirname, "build", "index.html");

app.setName(APP_NAME);
app.setPath("userData", path.join(app.getPath("appData"), "Wizard Schedules"));
app.setAppUserModelId("com.wizardschedule.snippets.transparent");

let mainWindow = null;
let tray = null;
let isQuitting = false;
let isConfirmingClose = false;
let loadedRendererStamp = 0;
let imapMigrationRunning = false;
let imapPaused = false;
let imapResumeResolver = null;
let imapCancelled = false;

class ImapCancelledError extends Error {
  constructor() {
    super("Migration cancelled by user");
    this.name = "ImapCancelledError";
  }
}

async function checkPauseAndCancel() {
  if (imapCancelled) throw new ImapCancelledError();
  while (imapPaused) {
    await new Promise((resolve) => { imapResumeResolver = resolve; });
    if (imapCancelled) throw new ImapCancelledError();
  }
}

function checkCancel() {
  if (imapCancelled) throw new ImapCancelledError();
}

function normalizeImapAccount(account) {
  const port = Number(account?.port || 993);

  return {
    host: String(account?.host || "").trim(),
    port: Number.isFinite(port) && port > 0 ? port : 993,
    secure: account?.secure !== false,
    user: String(account?.user || "").trim(),
    pass: String(account?.pass || ""),
    rejectUnauthorized: account?.rejectUnauthorized !== false,
  };
}

async function ensureConnected(client) {
  if (!client.usable || !client.socket || client.socket.destroyed) {
    await client.logout().catch(() => {});
    await client.connect();
  }
}

function createImapClient(account) {
  const normalized = normalizeImapAccount(account);
  if (!normalized.host || !normalized.user || !normalized.pass) {
    throw new Error("Missing IMAP host, email, or password.");
  }

  const client = new ImapFlow({
    host: normalized.host,
    port: normalized.port,
    secure: normalized.secure,
    auth: {
      user: normalized.user,
      pass: normalized.pass,
    },
    tls: {
      rejectUnauthorized: normalized.rejectUnauthorized !== false,
    },
    logger: false,
  });

  client.on("error", () => {});

  return client;
}

function sanitizeImapError(error) {
  if (error?.name === "AggregateError" && Array.isArray(error.errors)) {
    const messages = error.errors.map((e) => sanitizeImapError(e));
    return messages.join("; ");
  }
  const parts = [];
  if (error?.message) parts.push(error.message);
  if (error?.response) parts.push(`server: ${error.response}`);
  if (error?.responseCode) parts.push(`code: ${error.responseCode}`);
  if (!parts.length) parts.push(String(error || "Unknown IMAP error"));
  return parts.join(" | ")
    .replace(/password=[^\s,;]+/gi, "password=hidden")
    .replace(/pass=[^\s,;]+/gi, "pass=hidden");
}

function sanitizeFolderName(name) {
  return String(name).replace(/[<>:"/\\|?*]/g, "_").trim() || "unnamed";
}

function sendImapProgress(event, payload) {
  if (!event?.sender || event.sender.isDestroyed()) return;
  event.sender.send("wizard-imap:progress", { at: new Date().toISOString(), ...payload });
}

async function listImapFolders(client) {
  const folders = await client.list();
  const paths = new Set(["INBOX"]);

  folders.forEach((folder) => {
    if (folder?.path) paths.add(folder.path);
  });

  return [...paths];
}

async function ensureTargetFolder(client, folder) {
  if (folder.toUpperCase() === "INBOX") return;

  try {
    await client.mailboxCreate(folder);
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    if (!message.includes("exist")) throw error;
  }
}

async function getMessageIds(client, folder) {
  const ids = new Set();
  const lock = await client.getMailboxLock(folder);

  try {
    if (!client.mailbox || !client.mailbox.exists) return ids;

    for await (const message of client.fetch("1:*", { envelope: true })) {
      const messageId = String(message?.envelope?.messageId || "").trim().toLowerCase();
      if (messageId) ids.add(messageId);
    }
  } finally {
    lock.release();
  }

  return ids;
}

async function copyImapFolder(source, target, folder, event, dateFrom, dateTo) {
  await ensureTargetFolder(target, folder);

  const targetMessageIds = await getMessageIds(target, folder);
  const lock = await source.getMailboxLock(folder);
  let copied = 0;
  let skipped = 0;
  let failed = 0;
  let total = 0;

  try {
    if (!source.mailbox) {
      sendImapProgress(event, { type: "folder", level: "warning", message: `Skipping ${folder}: mailbox could not be opened`, folder, total: 0 });
      return { folder, total, copied, skipped, failed };
    }
    total = source.mailbox.exists || 0;

    const fetchQuery = (() => {
      if (!dateFrom && !dateTo) return "1:*";
      const parse = (str) => {
        if (!str || !str.trim()) return null;
        const s = str.trim();
        const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dm) return new Date(parseInt(dm[3], 10), parseInt(dm[2], 10) - 1, parseInt(dm[1], 10));
        const ym = s.match(/^(\d{4})$/);
        if (ym) return new Date(parseInt(ym[1], 10), 0, 1);
        return null;
      };
      const from = parse(dateFrom);
      const to = parse(dateTo);
      const query = {};
      if (from) query.since = from;
      if (to) {
        if (/^\d{4}$/.test(String(dateTo).trim())) {
          query.before = new Date(to.getFullYear() + 1, 0, 1);
        } else {
          const next = new Date(to);
          next.setDate(next.getDate() + 1);
          query.before = next;
        }
      }
      return query;
    })();

    if (typeof fetchQuery === "object") {
      const matched = await source.search(fetchQuery);
      total = matched.length;
    }

    sendImapProgress(event, { type: "folder", level: "info", message: `Scanning ${folder} (${total} messages${dateFrom ? ` from ${dateFrom}` : ""}${dateTo ? ` to ${dateTo}` : ""})`, folder, total });

    if (!total) return { folder, total, copied, skipped, failed };

    const heartbeat = setInterval(() => {
      if (imapPaused) return;
      sendImapProgress(event, {
        type: "folder-progress",
        level: "info",
        message: `Still processing ${folder}: ${copied}/${total} copied, ${skipped}/${total} skipped, ${failed}/${total} failed`,
        folder,
        total,
        copied,
        skipped,
        failed,
        summary: { folders: 1, total, copied, skipped, failed },
      });
    }, 10000);

    try {
      for await (const message of source.fetch(fetchQuery, { envelope: true, flags: true, internalDate: true, source: true })) {
        checkCancel();
        await checkPauseAndCancel();
        const messageId = String(message?.envelope?.messageId || "").trim().toLowerCase();
        if (messageId && targetMessageIds.has(messageId)) {
          skipped += 1;
        } else {
          try {
            await ensureConnected(target);
            const flags = message.flags ? [...message.flags] : [];
            await target.append(folder, message.source, flags, message.internalDate);
            copied += 1;
            if (messageId) targetMessageIds.add(messageId);
          } catch (error) {
            failed += 1;
            sendImapProgress(event, {
              type: "message-error",
              level: "error",
              message: `Could not copy one message in ${folder}: ${sanitizeImapError(error)}`,
              folder,
            });
          }
        }

        if ((copied + skipped + failed) % 25 === 0 || copied + skipped + failed === total) {
          sendImapProgress(event, {
            type: "folder-progress",
            level: "info",
            message: `${folder}: ${copied}/${total} copied, ${skipped}/${total} skipped, ${failed}/${total} failed`,
            folder,
            total,
            copied,
            skipped,
            failed,
            summary: { folders: 1, total, copied, skipped, failed },
          });
        }
      }
    } finally {
      clearInterval(heartbeat);
    }
  } finally {
    lock.release();
  }

  return { folder, total, copied, skipped, failed };
}

async function runImapMigration(event, payload) {
  if (imapMigrationRunning) throw new Error("A migration or backup is already running.");

  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
  if (!pairs.length) throw new Error("No source/target account pairs configured.");

  const dateFrom = payload?.dateFrom;
  const dateTo = payload?.dateTo;

  imapMigrationRunning = true;
  imapCancelled = false;
  imapPaused = false;
  imapResumeResolver = null;

  let totalCopied = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalFolders = 0;

  try {
    for (let i = 0; i < pairs.length; i++) {
      await checkPauseAndCancel();
      const pair = pairs[i];
      const source = createImapClient(pair.source);
      const target = createImapClient(pair.target);
      const label = pair.source?.user || `account #${i + 1}`;

      sendImapProgress(event, { type: "start", level: "info", message: `Migrating ${label}.` });

      try {
        await source.connect();
        await target.connect();
        sendImapProgress(event, { type: "connected", level: "success", message: `Connected source and target for ${label}.` });

        const folders = await listImapFolders(source);
        sendImapProgress(event, { type: "folders", level: "info", message: `Found ${folders.length} folders in source ${label}.`, folders });
        totalFolders += folders.length;

        for (const folder of folders) {
          await checkPauseAndCancel();
          const result = await copyImapFolder(source, target, folder, event, dateFrom, dateTo);
          totalCopied += result.copied;
          totalSkipped += result.skipped;
          totalFailed += result.failed;

          sendImapProgress(event, {
            type: "folder-complete",
            level: result.copied > 0 ? "success" : "info",
            message: `${folder}: ${result.copied}/${result.total} copied, ${result.skipped}/${result.total} skipped, ${result.failed}/${result.total} failed`,
            folder,
            summary: { folders: totalFolders, total: totalCopied + totalSkipped + totalFailed, copied: totalCopied, skipped: totalSkipped, failed: totalFailed },
          });
        }
      } finally {
        await source.logout().catch(() => {});
        await target.logout().catch(() => {});
      }
    }

    sendImapProgress(event, {
      type: "complete",
      level: "success",
      message: `Migration complete. ${totalCopied} copied, ${totalSkipped} skipped, ${totalFailed} failed.`,
      summary: { folders: totalFolders, total: totalCopied + totalSkipped + totalFailed, copied: totalCopied, skipped: totalSkipped, failed: totalFailed },
    });
    return { ok: true, summary: { folders: totalFolders, total: totalCopied + totalSkipped + totalFailed, copied: totalCopied, skipped: totalSkipped, failed: totalFailed } };
  } catch (error) {
    if (error instanceof ImapCancelledError) {
      sendImapProgress(event, { type: "cancelled", level: "warning", message: "Migration cancelled." });
      return { ok: false };
    }
    const message = sanitizeImapError(error);
    sendImapProgress(event, { type: "fatal", level: "error", message });
    throw new Error(message);
  } finally {
    imapMigrationRunning = false;
    imapCancelled = false;
    imapPaused = false;
    imapResumeResolver = null;
  }
}

async function exportImapBackup(event, payload) {
  if (imapMigrationRunning) throw new Error("A migration or backup is already running.");

  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
  if (!pairs.length) throw new Error("No source accounts configured.");

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
    title: "Select backup folder",
  });
  if (canceled || !filePaths?.length) throw new Error("Export cancelled.");
  const backupRoot = filePaths[0];

  imapMigrationRunning = true;
  imapCancelled = false;
  imapPaused = false;
  imapResumeResolver = null;
  let totalExported = 0;

  try {
    for (let i = 0; i < pairs.length; i++) {
      await checkPauseAndCancel();
      const pair = pairs[i];
      const source = createImapClient(pair.source);
      const label = pair.source?.user || `account #${i + 1}`;

      sendImapProgress(event, { type: "start", level: "info", message: `Backing up ${label}.` });

      try {
        await source.connect();
        sendImapProgress(event, { type: "source-connected", level: "success", message: `Connected to ${label}.` });

        const folders = await listImapFolders(source);
        sendImapProgress(event, { type: "folders", level: "info", message: `Found ${folders.length} folders in ${label}.`, folders });

        const accountDir = (() => {
          const baseName = path.basename(backupRoot);
          const sanitizedLabel = sanitizeFolderName(label);
          return sanitizeFolderName(baseName) === sanitizedLabel
            ? backupRoot
            : path.join(backupRoot, sanitizedLabel);
        })();

        for (const folder of folders) {
          await checkPauseAndCancel();
          const folderDir = path.join(accountDir, sanitizeFolderName(folder));
          fs.mkdirSync(folderDir, { recursive: true });

          const lock = await source.getMailboxLock(folder);

          let folderCount = 0;

          try {
            if (!source.mailbox || !source.mailbox.exists) {
              sendImapProgress(event, { type: "folder", level: "warning", message: `Skipping ${folder}: empty`, folder });
              continue;
            }

            const existingFiles = fs.readdirSync(folderDir).filter((f) => f.endsWith(".eml"));
            const existing = existingFiles.length;

            sendImapProgress(event, { type: "folder", level: "info", message: `Downloading ${folder} (${source.mailbox.exists} messages${existing ? `, ${existing} already backed up` : ""})`, folder });

            let totalCount = 0;
            for await (const message of source.fetch("1:*", { uid: true })) {
              checkCancel();
              totalCount++;
            }

            if (totalCount <= existing) {
              sendImapProgress(event, { type: "folder-complete", level: "info", message: `${folder}: all ${existing} messages already backed up`, folder, summary: { folders: folders.length, total: totalExported, copied: totalExported, skipped: 0, failed: 0 } });
              continue;
            }

            const newCount = totalCount - existing;
            sendImapProgress(event, { type: "folder", level: "info", message: `${folder}: ${newCount} new messages to download`, folder });

            let downloaded = 0;
            for await (const message of source.fetch(`${existing + 1}:*`, { source: true })) {
              checkCancel();
              downloaded++;
              const fileNum = existing + downloaded;
              fs.writeFileSync(path.join(folderDir, `${fileNum}.eml`), message.source);
              totalExported++;

              if (downloaded % 25 === 0 || downloaded === newCount) {
                sendImapProgress(event, { type: "folder-progress", level: "info", message: `${folder}: ${downloaded}/${newCount} exported (${totalExported} total)`, folder, count: downloaded, total: newCount, summary: { folders: folders.length, total: totalExported, copied: totalExported, skipped: 0, failed: 0 } });
              }
            }

            sendImapProgress(event, { type: "folder-complete", level: "success", message: `${folder}: ${downloaded}/${newCount} exported`, folder, summary: { folders: folders.length, total: totalExported, copied: totalExported, skipped: 0, failed: 0 } });
          } finally {
            lock.release();
          }
        }
      } finally {
        await source.logout().catch(() => {});
      }
    }

    sendImapProgress(event, { type: "complete", level: "success", message: `Backup saved to ${backupRoot}. ${totalExported} messages exported.`, summary: { folders: 0, total: totalExported, copied: totalExported, skipped: 0, failed: 0 } });
    return { ok: true, path: backupRoot, total: totalExported };
  } catch (error) {
    if (error instanceof ImapCancelledError) {
      sendImapProgress(event, { type: "cancelled", level: "warning", message: "Backup cancelled." });
      return { ok: false };
    }
    const message = sanitizeImapError(error);
    sendImapProgress(event, { type: "fatal", level: "error", message });
    throw new Error(message);
  } finally {
    imapMigrationRunning = false;
    imapCancelled = false;
    imapPaused = false;
    imapResumeResolver = null;
  }
}

async function importImapBackup(event, payload) {
  if (imapMigrationRunning) throw new Error("A migration or restore is already running.");

  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
  if (!pairs.length) throw new Error("No target accounts configured.");

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select backup folder to restore",
  });
  if (canceled || !filePaths?.length) throw new Error("Import cancelled.");
  const backupRoot = filePaths[0];

  const accountDirs = fs.readdirSync(backupRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  if (!accountDirs.length) throw new Error("No account folders found in the backup directory.");

  imapMigrationRunning = true;
  imapCancelled = false;
  imapPaused = false;
  imapResumeResolver = null;
  let totalImported = 0;

  try {
    for (let i = 0; i < Math.min(pairs.length, accountDirs.length); i++) {
      await checkPauseAndCancel();
      const pair = pairs[i];
      const accountName = accountDirs[i];
      const target = createImapClient(pair.target);
      const label = pair.target?.user || `account #${i + 1}`;

      sendImapProgress(event, { type: "start", level: "info", message: `Restoring to ${label} from "${accountName}".` });

      try {
        await target.connect();
        sendImapProgress(event, { type: "target-connected", level: "success", message: `Connected to ${label}.` });

        const accountDir = path.join(backupRoot, accountName);
        const folderDirs = fs.readdirSync(accountDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);

        for (const folderName of folderDirs) {
          await checkPauseAndCancel();
          const folderDir = path.join(accountDir, folderName);
          const emlFiles = fs.readdirSync(folderDir).filter((f) => f.endsWith(".eml")).sort((a, b) => {
            const na = parseInt(a, 10);
            const nb = parseInt(b, 10);
            return (Number.isFinite(na) ? na : a).localeCompare(Number.isFinite(nb) ? nb : b);
          });

          if (!emlFiles.length) continue;

          await ensureTargetFolder(target, folderName);

          sendImapProgress(event, { type: "folder", level: "info", message: `Restoring ${folderName} (${emlFiles.length} messages)`, folder: folderName });

          let folderImported = 0;

          for (const emlFile of emlFiles) {
            await checkPauseAndCancel();
            try {
              const source = fs.readFileSync(path.join(folderDir, emlFile));
              await ensureConnected(target);
              await target.append(folderName, source);
              totalImported++;
              folderImported++;
            } catch (error) {
              sendImapProgress(event, { type: "message-error", level: "error", message: `Failed to import ${emlFile} in ${folderName}: ${sanitizeImapError(error)}`, folder: folderName });
            }

            if (folderImported % 25 === 0 || folderImported === emlFiles.length) {
              sendImapProgress(event, { type: "folder-progress", level: "info", message: `${folderName}: ${folderImported}/${emlFiles.length} imported`, folder: folderName, count: folderImported, total: emlFiles.length, summary: { folders: 0, total: totalImported, copied: totalImported, skipped: 0, failed: 0 } });
            }
          }

          sendImapProgress(event, { type: "folder-complete", level: "success", message: `${folderName}: ${emlFiles.length} restored`, folder: folderName, summary: { folders: 0, total: totalImported, copied: totalImported, skipped: 0, failed: 0 } });
        }
      } finally {
        await target.logout().catch(() => {});
      }
    }

    sendImapProgress(event, { type: "complete", level: "success", message: `Restore complete. ${totalImported} messages imported.`, summary: { folders: 0, total: totalImported, copied: totalImported, skipped: 0, failed: 0 } });
    return { ok: true, total: totalImported };
  } catch (error) {
    if (error instanceof ImapCancelledError) {
      sendImapProgress(event, { type: "cancelled", level: "warning", message: "Import cancelled." });
      return { ok: false };
    }
    const message = sanitizeImapError(error);
    sendImapProgress(event, { type: "fatal", level: "error", message });
    throw new Error(message);
  } finally {
    imapMigrationRunning = false;
    imapCancelled = false;
    imapPaused = false;
    imapResumeResolver = null;
  }
}

async function testImapConnection(account) {
  const client = createImapClient(account);

  try {
    await client.connect();
    const folders = await listImapFolders(client);
    return { ok: true, folders: folders.length };
  } catch (error) {
    throw new Error(sanitizeImapError(error));
  } finally {
    await client.logout().catch(() => {});
  }
}

function normalizeProjectNotesStore(notesStore) {
  if (!notesStore || typeof notesStore !== "object" || Array.isArray(notesStore)) return {};

  return Object.fromEntries(
    Object.entries(notesStore)
      .map(([projectId, notes]) => [
        String(projectId),
        Array.isArray(notes)
          ? notes
              .map((note, index) => ({
                id: String(note?.id || `note-${index}`),
                text: String(note?.text || "").trim(),
                done: Boolean(note?.done),
              }))
              .filter((note) => note.text)
          : [],
      ])
      .filter(([, notes]) => notes.length > 0),
  );
}

function projectNotesFilePath() {
  return path.join(app.getPath("userData"), "project-notes.json");
}

function readProjectNotesFile() {
  try {
    return normalizeProjectNotesStore(JSON.parse(fs.readFileSync(projectNotesFilePath(), "utf8")));
  } catch {
    return {};
  }
}

function writeProjectNotesFile(notesStore) {
  const normalized = normalizeProjectNotesStore(notesStore);
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(projectNotesFilePath(), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function getAppUrl() {
  return (
    process.env.ELECTRON_START_URL ||
    (fs.existsSync(appBuildIndex)
      ? pathToFileURL(appBuildIndex).toString()
      : fs.existsSync(legacyBuildIndex)
        ? pathToFileURL(legacyBuildIndex).toString()
        : "http://localhost:3000")
  );
}

function getRendererStamp() {
  const indexPath = fs.existsSync(appBuildIndex) ? appBuildIndex : fs.existsSync(legacyBuildIndex) ? legacyBuildIndex : "";
  if (!indexPath) return 0;

  try {
    return fs.statSync(indexPath).mtimeMs;
  } catch {
    return 0;
  }
}

function reloadRendererIfChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const currentStamp = getRendererStamp();
  if (currentStamp && loadedRendererStamp && currentStamp !== loadedRendererStamp) {
    loadedRendererStamp = currentStamp;
    mainWindow.loadURL(getAppUrl());
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  reloadRendererIfChanged();

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

async function getUnsavedChanges() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { hasChanges: false, labels: [] };
  }

  try {
    const summary = await mainWindow.webContents.executeJavaScript(
      "window.__wizardUnsavedChanges || { hasChanges: false, labels: [] }",
      true,
    );
    return {
      hasChanges: Boolean(summary?.hasChanges),
      labels: Array.isArray(summary?.labels) ? summary.labels.filter(Boolean) : [],
    };
  } catch {
    return { hasChanges: false, labels: [] };
  }
}

async function getCloseDecision() {
  if (!mainWindow || mainWindow.isDestroyed()) return "save";

  try {
    const decision = await mainWindow.webContents.executeJavaScript(
      'window.__wizardRequestClose ? window.__wizardRequestClose(window.__wizardUnsavedChanges) : "save"',
      true,
    );
    return decision === "close" ? "close" : "save";
  } catch {
    return "save";
  }
}

async function flushRendererStorage() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  try {
    await mainWindow.webContents.executeJavaScript("window.__wizardFlushStorage ? window.__wizardFlushStorage() : null", true);
  } catch {
    // The file-backed storage is best-effort on shutdown.
  }
}

async function requestClose({ quit = false } = {}) {
  if (isConfirmingClose) return;
  isConfirmingClose = true;

  const unsaved = await getUnsavedChanges();
  if (unsaved.hasChanges) {
    showMainWindow();
    const decision = await getCloseDecision();

    isConfirmingClose = false;
    if (decision !== "close") {
      showMainWindow();
      return;
    }
  } else {
    isConfirmingClose = false;
  }

  await flushRendererStorage();

  if (quit) {
    isQuitting = true;
    app.quit();
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

function createTray() {
  if (tray) return;

  tray = new Tray(iconPath);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open",
        click: showMainWindow,
      },
      {
        label: "Reload",
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            loadedRendererStamp = getRendererStamp();
            mainWindow.reload();
            showMainWindow();
          }
        },
      },
      {
        type: "separator",
      },
      {
        label: "Quit",
        click: () => requestClose({ quit: true }),
      },
    ]),
  );
  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#1b1d20",
      symbolColor: "#f6f8fb",
      height: 34,
    },
    title: APP_NAME,
    icon: iconPath,
    backgroundColor: "#080a0f",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting && process.platform !== "darwin") {
      event.preventDefault();
      requestClose();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.maximize();
  loadedRendererStamp = getRendererStamp();
  mainWindow.once("ready-to-show", () => {
    if (!START_HIDDEN) {
      showMainWindow();
    }
  });
  mainWindow.loadURL(getAppUrl());
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  ipcMain.handle("wizard-project-notes:read", () => readProjectNotesFile());
  ipcMain.handle("wizard-project-notes:write", (_event, notesStore) => writeProjectNotesFile(notesStore));
  ipcMain.handle("wizard-imap:test", async (_event, account) => testImapConnection(account));

  ipcMain.handle("wizard-app:backup", async (_event, serializedData) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `wizard-schedule-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON Backup", extensions: ["json"] }],
      title: "Save app backup",
    });
    if (canceled || !filePath) throw new Error("Backup cancelled.");
    fs.writeFileSync(filePath, serializedData, "utf8");
    return { ok: true, path: filePath };
  });

  ipcMain.handle("wizard-app:restore", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "JSON Backup", extensions: ["json"] }],
      title: "Select backup file to restore",
    });
    if (canceled || !filePaths?.length) throw new Error("Restore cancelled.");
    const data = fs.readFileSync(filePaths[0], "utf8");
    return { ok: true, data, path: filePaths[0] };
  });

  ipcMain.handle("wizard-imap:start", async (event, payload) => runImapMigration(event, payload));

  ipcMain.handle("wizard-imap:export-backup", async (event, payload) => exportImapBackup(event, payload));
  ipcMain.handle("wizard-imap:import-backup", async (event, payload) => importImapBackup(event, payload));

  ipcMain.on("wizard-imap:pause", () => {
    imapPaused = true;
    sendImapProgress({ sender: mainWindow?.webContents }, { type: "paused", level: "warning", message: "Migration paused." });
  });

  ipcMain.on("wizard-imap:resume", () => {
    imapPaused = false;
    if (imapResumeResolver) {
      imapResumeResolver();
      imapResumeResolver = null;
    }
    sendImapProgress({ sender: mainWindow?.webContents }, { type: "resumed", level: "info", message: "Migration resumed." });
  });

  ipcMain.on("wizard-imap:cancel", () => {
    imapCancelled = true;
    imapPaused = false;
    if (imapResumeResolver) {
      imapResumeResolver();
      imapResumeResolver = null;
    }
    sendImapProgress({ sender: mainWindow?.webContents }, { type: "cancel-received", level: "warning", message: "Cancel requested." });
  });
  app.on("second-instance", showMainWindow);

  app.whenReady().then(() => {
    createTray();
    createWindow();

    const registered = globalShortcut.register(OPEN_SHORTCUT, showMainWindow);
    if (!registered) {
      console.warn(`Could not register ${OPEN_SHORTCUT}. It may already be used by another app.`);
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform === "darwin") return;
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    showMainWindow();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

