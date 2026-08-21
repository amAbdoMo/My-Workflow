const fs = require("fs");
const path = require("path");
const { ImapFlow } = require("imapflow");
const { DATA_DIR } = require("./store");

// Ported from electron.js so the IMAP migration/backup/restore features work
// identically on web, mobile PWA, and desktop. Progress is delivered through a
// subscriber set instead of Electron IPC events (SSE endpoint consumes it).

const BACKUPS_DIR = path.join(process.env.WIZARD_IMAP_BACKUP_DIR || path.join(DATA_DIR, "imap-backups"));

let migrationRunning = false;
let migrationPaused = false;
let resumeResolver = null;
let cancelled = false;
let progressSeq = 0;
const subscribers = new Set();

class ImapCancelledError extends Error {
  constructor() {
    super("Migration cancelled by user");
    this.name = "ImapCancelledError";
  }
}

async function checkPauseAndCancel() {
  if (cancelled) throw new ImapCancelledError();
  while (migrationPaused) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { resumeResolver = resolve; });
    if (cancelled) throw new ImapCancelledError();
  }
}

function checkCancel() {
  if (cancelled) throw new ImapCancelledError();
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
    auth: { user: normalized.user, pass: normalized.pass },
    tls: { rejectUnauthorized: normalized.rejectUnauthorized !== false },
    logger: false,
  });

  client.on("error", () => {});
  return client;
}

function sanitizeImapError(error) {
  if (error?.name === "AggregateError" && Array.isArray(error.errors)) {
    return error.errors.map((e) => sanitizeImapError(e)).join("; ");
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

function sendProgress(payload) {
  const update = { at: new Date().toISOString(), seq: ++progressSeq, ...payload };
  for (const send of subscribers) {
    try {
      send(update);
    } catch {}
  }
}

function subscribe(send) {
  subscribers.add(send);
  return () => subscribers.delete(send);
}

function resetRunState() {
  cancelled = false;
  migrationPaused = false;
  resumeResolver = null;
}

function finalizeRunState() {
  migrationRunning = false;
  cancelled = false;
  migrationPaused = false;
  resumeResolver = null;
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

function buildDateQuery(dateFrom, dateTo) {
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
}

async function copyImapFolder(source, target, folder, dateFrom, dateTo) {
  await ensureTargetFolder(target, folder);

  const targetMessageIds = await getMessageIds(target, folder);
  const lock = await source.getMailboxLock(folder);
  let copied = 0;
  let skipped = 0;
  let failed = 0;
  let total = 0;

  try {
    if (!source.mailbox) {
      sendProgress({ type: "folder", level: "warning", message: `Skipping ${folder}: mailbox could not be opened`, folder, total: 0 });
      return { folder, total, copied, skipped, failed };
    }
    total = source.mailbox.exists || 0;

    const fetchQuery = buildDateQuery(dateFrom, dateTo);
    if (typeof fetchQuery === "object") {
      const matched = await source.search(fetchQuery);
      total = matched.length;
    }

    sendProgress({ type: "folder", level: "info", message: `Scanning ${folder} (${total} messages${dateFrom ? ` from ${dateFrom}` : ""}${dateTo ? ` to ${dateTo}` : ""})`, folder, total });
    if (!total) return { folder, total, copied, skipped, failed };

    const heartbeat = setInterval(() => {
      if (migrationPaused) return;
      sendProgress({
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
            sendProgress({ type: "message-error", level: "error", message: `Could not copy one message in ${folder}: ${sanitizeImapError(error)}`, folder });
          }
        }

        if ((copied + skipped + failed) % 25 === 0 || copied + skipped + failed === total) {
          sendProgress({
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

function assertIdle() {
  if (migrationRunning) throw new Error("A migration or backup is already running.");
}

async function runMigration(payload) {
  assertIdle();
  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
  if (!pairs.length) throw new Error("No source/target account pairs configured.");
  const dateFrom = payload?.dateFrom;
  const dateTo = payload?.dateTo;

  migrationRunning = true;
  resetRunState();

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

      sendProgress({ type: "start", level: "info", message: `Migrating ${label}.` });

      try {
        await source.connect();
        await target.connect();
        sendProgress({ type: "connected", level: "success", message: `Connected source and target for ${label}.` });

        const folders = await listImapFolders(source);
        sendProgress({ type: "folders", level: "info", message: `Found ${folders.length} folders in source ${label}.`, folders });
        totalFolders += folders.length;

        for (const folder of folders) {
          await checkPauseAndCancel();
          const result = await copyImapFolder(source, target, folder, dateFrom, dateTo);
          totalCopied += result.copied;
          totalSkipped += result.skipped;
          totalFailed += result.failed;

          sendProgress({
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

    sendProgress({
      type: "complete",
      level: "success",
      message: `Migration complete. ${totalCopied} copied, ${totalSkipped} skipped, ${totalFailed} failed.`,
      summary: { folders: totalFolders, total: totalCopied + totalSkipped + totalFailed, copied: totalCopied, skipped: totalSkipped, failed: totalFailed },
    });
    return { ok: true, summary: { folders: totalFolders, total: totalCopied + totalSkipped + totalFailed, copied: totalCopied, skipped: totalSkipped, failed: totalFailed } };
  } catch (error) {
    if (error instanceof ImapCancelledError) {
      sendProgress({ type: "cancelled", level: "warning", message: "Migration cancelled." });
      return { ok: false };
    }
    const message = sanitizeImapError(error);
    sendProgress({ type: "fatal", level: "error", message });
    throw new Error(message);
  } finally {
    finalizeRunState();
  }
}

// Export messages into a server-side backup set (replaces the desktop folder picker).
async function exportBackup(payload) {
  assertIdle();
  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
  if (!pairs.length) throw new Error("No source accounts configured.");

  const backupId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupRoot = path.join(BACKUPS_DIR, backupId);
  fs.mkdirSync(backupRoot, { recursive: true });

  migrationRunning = true;
  resetRunState();
  let totalExported = 0;

  try {
    for (let i = 0; i < pairs.length; i++) {
      await checkPauseAndCancel();
      const pair = pairs[i];
      const source = createImapClient(pair.source);
      const label = pair.source?.user || `account #${i + 1}`;

      sendProgress({ type: "start", level: "info", message: `Backing up ${label}.` });

      try {
        await source.connect();
        sendProgress({ type: "source-connected", level: "success", message: `Connected to ${label}.` });

        const folders = await listImapFolders(source);
        sendProgress({ type: "folders", level: "info", message: `Found ${folders.length} folders in ${label}.`, folders });

        const accountDir = path.join(backupRoot, sanitizeFolderName(label));

        for (const folder of folders) {
          await checkPauseAndCancel();
          const folderDir = path.join(accountDir, sanitizeFolderName(folder));
          fs.mkdirSync(folderDir, { recursive: true });

          const lock = await source.getMailboxLock(folder);
          let folderCount = 0;

          try {
            if (!source.mailbox || !source.mailbox.exists) {
              sendProgress({ type: "folder", level: "warning", message: `Skipping ${folder}: empty`, folder });
              continue;
            }

            const existingFiles = fs.readdirSync(folderDir).filter((f) => f.endsWith(".eml"));
            const existing = existingFiles.length;

            sendProgress({ type: "folder", level: "info", message: `Downloading ${folder} (${source.mailbox.exists} messages${existing ? `, ${existing} already backed up` : ""})`, folder });

            let totalCount = 0;
            for await (const message of source.fetch("1:*", { uid: true })) {
              checkCancel();
              totalCount++;
            }

            if (totalCount <= existing) {
              sendProgress({ type: "folder-complete", level: "info", message: `${folder}: all ${existing} messages already backed up`, folder, summary: { folders: folders.length, total: totalExported, copied: totalExported, skipped: 0, failed: 0 } });
              continue;
            }

            const newCount = totalCount - existing;
            sendProgress({ type: "folder", level: "info", message: `${folder}: ${newCount} new messages to download`, folder });

            let downloaded = 0;
            for await (const message of source.fetch(`${existing + 1}:*`, { source: true })) {
              checkCancel();
              downloaded++;
              const fileNum = existing + downloaded;
              fs.writeFileSync(path.join(folderDir, `${fileNum}.eml`), message.source);
              totalExported++;
              folderCount++;

              if (downloaded % 25 === 0 || downloaded === newCount) {
                sendProgress({ type: "folder-progress", level: "info", message: `${folder}: ${downloaded}/${newCount} exported (${totalExported} total)`, folder, count: downloaded, total: newCount, summary: { folders: folders.length, total: totalExported, copied: totalExported, skipped: 0, failed: 0 } });
              }
            }

            sendProgress({ type: "folder-complete", level: "success", message: `${folder}: ${downloaded}/${newCount} exported (${folderCount} stored)`, folder, summary: { folders: folders.length, total: totalExported, copied: totalExported, skipped: 0, failed: 0 } });
          } finally {
            lock.release();
          }
        }
      } finally {
        await source.logout().catch(() => {});
      }
    }

    fs.writeFileSync(path.join(backupRoot, "manifest.json"), JSON.stringify({ id: backupId, createdAt: new Date().toISOString(), accounts: pairs.map((p) => p.source?.user).filter(Boolean), total: totalExported }, null, 2), "utf8");

    sendProgress({ type: "complete", level: "success", message: `Backup "${backupId}" saved on the server. ${totalExported} messages exported.`, summary: { folders: 0, total: totalExported, copied: totalExported, skipped: 0, failed: 0 } });
    return { ok: true, id: backupId, total: totalExported };
  } catch (error) {
    if (error instanceof ImapCancelledError) {
      sendProgress({ type: "cancelled", level: "warning", message: "Backup cancelled." });
      return { ok: false };
    }
    const message = sanitizeImapError(error);
    sendProgress({ type: "fatal", level: "error", message });
    throw new Error(message);
  } finally {
    finalizeRunState();
  }
}

function listBackups() {
  try {
    return fs.readdirSync(BACKUPS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        try {
          const manifest = JSON.parse(fs.readFileSync(path.join(BACKUPS_DIR, d.name, "manifest.json"), "utf8"));
          return { id: manifest.id || d.name, createdAt: manifest.createdAt || null, total: manifest.total ?? null, accounts: manifest.accounts || [] };
        } catch {
          return { id: d.name, createdAt: null, total: null, accounts: [] };
        }
      })
      .sort((a, b) => String(b.id).localeCompare(String(a.id)));
  } catch {
    return [];
  }
}

async function importBackup(payload) {
  assertIdle();
  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
  if (!pairs.length) throw new Error("No target accounts configured.");

  const backupId = String(payload?.backupId || "");
  const backupRoot = path.join(BACKUPS_DIR, sanitizeFolderName(backupId));
  if (!backupId || !fs.existsSync(backupRoot)) throw new Error(`Backup "${backupId}" was not found on the server.`);

  const accountDirs = fs.readdirSync(backupRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  if (!accountDirs.length) throw new Error("No account folders found in the backup set.");

  migrationRunning = true;
  resetRunState();
  let totalImported = 0;

  try {
    for (let i = 0; i < Math.min(pairs.length, accountDirs.length); i++) {
      await checkPauseAndCancel();
      const pair = pairs[i];
      const accountName = accountDirs[i];
      const target = createImapClient(pair.target);
      const label = pair.target?.user || `account #${i + 1}`;

      sendProgress({ type: "start", level: "info", message: `Restoring to ${label} from "${accountName}".` });

      try {
        await target.connect();
        sendProgress({ type: "target-connected", level: "success", message: `Connected to ${label}.` });

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
          sendProgress({ type: "folder", level: "info", message: `Restoring ${folderName} (${emlFiles.length} messages)`, folder: folderName });

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
              sendProgress({ type: "message-error", level: "error", message: `Failed to import ${emlFile} in ${folderName}: ${sanitizeImapError(error)}`, folder: folderName });
            }

            if (folderImported % 25 === 0 || folderImported === emlFiles.length) {
              sendProgress({ type: "folder-progress", level: "info", message: `${folderName}: ${folderImported}/${emlFiles.length} imported`, folder: folderName, count: folderImported, total: emlFiles.length, summary: { folders: 0, total: totalImported, copied: totalImported, skipped: 0, failed: 0 } });
            }
          }

          sendProgress({ type: "folder-complete", level: "success", message: `${folderName}: ${emlFiles.length} restored`, folder: folderName, summary: { folders: 0, total: totalImported, copied: totalImported, skipped: 0, failed: 0 } });
        }
      } finally {
        await target.logout().catch(() => {});
      }
    }

    sendProgress({ type: "complete", level: "success", message: `Restore complete. ${totalImported} messages imported.`, summary: { folders: 0, total: totalImported, copied: totalImported, skipped: 0, failed: 0 } });
    return { ok: true, total: totalImported };
  } catch (error) {
    if (error instanceof ImapCancelledError) {
      sendProgress({ type: "cancelled", level: "warning", message: "Restore cancelled." });
      return { ok: false };
    }
    const message = sanitizeImapError(error);
    sendProgress({ type: "fatal", level: "error", message });
    throw new Error(message);
  } finally {
    finalizeRunState();
  }
}

async function testConnection(account) {
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

module.exports = {
  testConnection,
  runMigration,
  exportBackup,
  importBackup,
  listBackups,
  pause: () => { migrationPaused = true; },
  resume: () => {
    migrationPaused = false;
    if (resumeResolver) {
      const resolve = resumeResolver;
      resumeResolver = null;
      resolve();
    }
  },
  cancel: () => { cancelled = true; },
  subscribe,
};
