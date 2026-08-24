// Deadline reminders: watches the synced to-do store for items whose due time
// has arrived, records a notification per due item, fires Web Push to every
// subscribed device (phones via the PWA service worker), and hands fresh
// notifications to the caller so they can be broadcast over SSE to any open
// app instance (web + Electron desktop toast).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");
const { DATA_DIR } = require("./data-dir");

const TODOS_KEY = "wizard-schedules-todo-items";
const NOTIFICATIONS_FILE = path.join(DATA_DIR, "notifications.json");
const SENT_FILE = path.join(DATA_DIR, "reminders-sent.json");
const SUBS_FILE = path.join(DATA_DIR, "push-subscriptions.json");
const VAPID_FILE = path.join(DATA_DIR, "vapid.json");
const MAX_NOTIFICATIONS = 200;

// web-push is loaded lazily so the server still boots if the dependency is
// missing; only actual push delivery degrades.
let webpush = null;
let webpushTried = false;

function getWebPush() {
  if (webpushTried) return webpush;
  webpushTried = true;
  try {
    webpush = require("web-push");
    if (webpush) webpush.setVapidDetails("mailto:workflowy@abdom.me", getVapidKeys().publicKey, getVapidKeys().privateKey);
  } catch (error) {
    console.error("[reminders] web-push unavailable:", error.message);
  }
  return webpush;
}

function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed === null || typeof parsed !== "object" ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

// ---------- VAPID keys ----------

function getVapidKeys() {
  const existing = readJson(VAPID_FILE, null);
  if (existing?.publicKey && existing?.privateKey) return existing;
  const generated = require("web-push").generateVAPIDKeys();
  writeJson(VAPID_FILE, generated);
  return generated;
}

function publicKey() {
  try {
    return getVapidKeys().publicKey;
  } catch {
    return null;
  }
}

// ---------- notifications (server-side, shared by every device) ----------

function listNotifications() {
  const list = readJson(NOTIFICATIONS_FILE, []);
  return Array.isArray(list) ? list : [];
}

function saveNotifications(list) {
  writeJson(NOTIFICATIONS_FILE, list.slice(0, MAX_NOTIFICATIONS));
}

function addNotification(notification) {
  const list = listNotifications();
  list.unshift(notification);
  saveNotifications(list);
  return notification;
}

function markAllRead() {
  const list = listNotifications().map((n) => ({ ...n, read: true }));
  saveNotifications(list);
  return list;
}

function deleteNotification(id) {
  saveNotifications(listNotifications().filter((n) => n.id !== id));
}

function clearNotifications() {
  saveNotifications([]);
}

// Temporary helper for trying the reminder pipeline end to end: records a
// test notification, pushes it to subscribed devices, and returns it so the
// caller can broadcast it over SSE.
function sendTestNotification(broadcast) {
  const notification = {
    id: `ntf-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    todoId: "",
    text: "Test reminder — this is how a due-task alert looks.",
    category: "General",
    dueAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
    read: false,
    test: true,
  };
  addNotification(notification);
  sendPush({
    title: "WorkflowY — task due",
    body: notification.text,
    tag: notification.id,
    notification,
  });
  try {
    broadcast?.("notification", notification);
  } catch {}
  return notification;
}

// ---------- push subscriptions ----------

function listSubs() {
  const subs = readJson(SUBS_FILE, []);
  return Array.isArray(subs) ? subs : [];
}

function addSub(sub) {
  const endpoint = String(sub?.endpoint || "");
  if (!endpoint) throw new Error("Subscription endpoint required.");
  const subs = listSubs().filter((s) => s.endpoint !== endpoint);
  subs.push(sub);
  writeJson(SUBS_FILE, subs);
}

function removeSub(endpoint) {
  writeJson(SUBS_FILE, listSubs().filter((s) => s.endpoint !== endpoint));
}

function sendPush(payload) {
  const push = getWebPush();
  if (!push) return;
  const body = JSON.stringify(payload);
  for (const sub of listSubs()) {
    push
      .sendNotification(sub, body, { TTL: 3600 })
      .catch((error) => {
        // 404/410: the subscription expired on this device — drop it.
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          try {
            removeSub(sub.endpoint);
          } catch {}
        } else {
          console.error("[reminders] push failed:", error.message);
        }
      });
  }
}

// ---------- due-item scan ----------

function parseTodos() {
  const raw = store.getAll()[TODOS_KEY]?.value;
  let todos = [];
  try {
    todos = JSON.parse(typeof raw === "string" ? raw : "[]");
  } catch {}
  return Array.isArray(todos) ? todos : [];
}

// Returns the notifications created during this scan (possibly empty).
function collectDue() {
  const now = Date.now();
  const todos = parseTodos();
  const sent = readJson(SENT_FILE, {});
  const sentNext = {};
  const fresh = [];

  for (const todo of todos) {
    if (!todo || todo.done || !todo.dueAt || !todo.text) continue;
    const dueMs = Date.parse(todo.dueAt);
    if (!Number.isFinite(dueMs) || dueMs > now) continue;
    // Re-arm when the due time was edited after a reminder already fired.
    if (sent[todo.id]?.dueAt === todo.dueAt) {
      sentNext[todo.id] = sent[todo.id];
      continue;
    }
    const notification = {
      id: `ntf-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      todoId: String(todo.id),
      text: String(todo.text),
      category: String(todo.category || "General"),
      dueAt: todo.dueAt,
      sentAt: new Date().toISOString(),
      read: false,
    };
    sentNext[todo.id] = { dueAt: todo.dueAt, sentAt: notification.sentAt };
    addNotification(notification);
    fresh.push(notification);
  }

  if (JSON.stringify(sent) !== JSON.stringify(sentNext)) writeJson(SENT_FILE, sentNext);
  return fresh;
}

function startScheduler(broadcast) {
  const scan = () => {
    let fresh = [];
    try {
      fresh = collectDue();
    } catch (error) {
      console.error("[reminders] scan failed:", error.message);
      return;
    }
    for (const notification of fresh) {
      sendPush({
        title: "WorkflowY — task due",
        body: notification.text,
        tag: notification.id,
        notification,
      });
      try {
        broadcast("notification", notification);
      } catch {}
    }
  };
  setInterval(scan, 15_000).unref?.();
  setImmediate(scan);
}

module.exports = {
  publicKey,
  listNotifications,
  markAllRead,
  deleteNotification,
  clearNotifications,
  sendTestNotification,
  addSub,
  removeSub,
  startScheduler,
};
