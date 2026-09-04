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
async function sendTestNotification(broadcast) {
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
  // Capture per-device delivery outcomes so the response can prove whether a
  // missed alert stopped at the server->Google hop or on the phone itself.
  const deliveries = await sendPush({
    title: "WorkflowY — task due",
    body: notification.text,
    tag: notification.id,
    notification,
  });
  try {
    broadcast?.("notification", notification);
  } catch {}
  return { ...notification, deliveries };
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

// Push options tuned for delivery while the phone is LOCKED:
// - high urgency: FCM/GCM deliver low-urgency pushes only during maintenance
//   windows, sometimes hours later or never on dozed devices.
// - TTL 12h: default TTL is days; a stale "task due" alert is worthless.
const PUSH_OPTIONS = { TTL: 43200, headers: { Urgency: "high" } };

async function sendPush(payload) {
  const push = getWebPush();
  if (!push) return [];
  const body = JSON.stringify(payload);
  // Per-subscription outcomes so the test pipeline can prove where a reminder
  // stopped: server -> FCM hop status for every registered device.
  const deliveries = await Promise.all(
    listSubs().map(async (sub) => {
      const short = sub.endpoint.slice(-10);
      // One quick retry covers transient radio/gateway hiccups (429/5xx),
      // which otherwise silently swallow the reminder on locked phones.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await push.sendNotification(sub, body, PUSH_OPTIONS);
          return { endpoint: short, ok: true, status: 201 };
        } catch (error) {
          const status = error?.statusCode;
          // 404/410: the subscription expired on this device — drop it.
          if (status === 404 || status === 410) {
            try {
              removeSub(sub.endpoint);
            } catch {}
            return { endpoint: short, ok: false, status: status || 0, expired: true };
          }
          const retryable = attempt === 1 && (status == null || status === 429 || status >= 500);
          if (!retryable) {
            console.error("[reminders] push failed:", error?.message || error);
            return { endpoint: short, ok: false, status: status || 0 };
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    })
  );
  return deliveries;
}

// ---------- due-item scan ----------

const REPEAT_STEPS = new Set(["30min", "daily", "weekly", "monthly"]);

function parseTodos() {
  const raw = store.getAll()[TODOS_KEY]?.value;
  let todos = [];
  try {
    todos = JSON.parse(typeof raw === "string" ? raw : "[]");
  } catch {}
  return Array.isArray(todos) ? todos : [];
}

// Server-side memory of each repeating todo's rule. A device that saves a
// stale copy of a task WITHOUT the repeat field must not silently turn a
// repeating reminder into a one-shot — the server remembers.
const REPEAT_RULES_FILE = path.join(DATA_DIR, "repeat-rules.json");

function readRepeatRules() {
  const rules = readJson(REPEAT_RULES_FILE, {});
  return rules && typeof rules === "object" && !Array.isArray(rules) ? rules : {};
}

function rememberRepeatRule(todo) {
  if (REPEAT_STEPS.has(todo?.repeat)) {
    return { todoId: String(todo.id), repeat: todo.repeat };
  }
  return null;
}

// Pushes a repeating deadline forward until it lands in the future.
function advanceRepeat(iso, repeat, now) {
  const next = new Date(iso);
  let guard = 0;
  while (next.getTime() <= now && guard < 10000) {
    if (repeat === "30min") next.setMinutes(next.getMinutes() + 30);
    else if (repeat === "daily") next.setDate(next.getDate() + 1);
    else if (repeat === "weekly") next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    guard += 1;
  }
  return next;
}

// Returns { fresh, rescheduled } — rescheduled is true when at least one
// repeating todo had its dueAt moved forward in the synced store.
function collectDue() {
  const now = Date.now();
  const todos = parseTodos();
  const sent = readJson(SENT_FILE, {});
  const recorded = listNotifications();
  const rules = readRepeatRules();
  let rulesChanged = false;
  const sentNext = {};
  const fresh = [];
  let todosChanged = false;

  for (const todo of todos) {
    if (!todo || todo.done || !todo.dueAt || !todo.text) continue;

    const todoId = String(todo.id);
    const hasRepeatField = Object.prototype.hasOwnProperty.call(todo, "repeat");
    const learned = rememberRepeatRule(todo);
    if (learned && rules[learned.todoId] !== learned.repeat) {
      rules[learned.todoId] = learned.repeat;
      rulesChanged = true;
    } else if (hasRepeatField && !learned && rules[todoId]) {
      // A present-but-empty repeat field is an intentional "No repeat" choice.
      delete rules[todoId];
      rulesChanged = true;
    }

    const dueMs = Date.parse(todo.dueAt);
    if (!Number.isFinite(dueMs) || dueMs > now) continue;

    // Only legacy/stale payloads that omit the field may inherit the remembered
    // rule. Current clients send repeat: "" when the user disables repeating.
    const repeat = REPEAT_STEPS.has(todo.repeat)
      ? todo.repeat
      : !hasRepeatField
        ? rules[todoId] || null
        : null;
    if (repeat) {
      todo.repeat = repeat; // heal the synced store too
      todosChanged = true;
    }
    // Re-arm when the due time was edited after a reminder already fired.
    // Repeating exception: a past-due match can also be a STALE CLIENT ECHO
    // (a device saved its old copy over the server's rolled-forward deadline).
    // Re-advance instead of going dormant so repeats self-heal.
    if (sent[todo.id]?.dueAt === todo.dueAt) {
      if (REPEAT_STEPS.has(todo.repeat) && dueMs <= now) {
        const healed = advanceRepeat(todo.dueAt, todo.repeat, now);
        if (healed.getTime() > dueMs) {
          todo.dueAt = healed.toISOString();
          todosChanged = true;
        }
      } else {
        sentNext[todo.id] = sent[todo.id];
      }
      continue;
    }
    // Hard guard against repeat alerts: if a notification for this exact
    // deadline was already recorded, never fire it again (protects against
    // sent-file hiccups spamming devices every scan).
    if (recorded.some((n) => n.todoId === todo.id && n.dueAt === todo.dueAt)) {
      sentNext[todo.id] = { dueAt: todo.dueAt, sentAt: sent[todo.id]?.sentAt || new Date().toISOString() };
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

    // Repeating task: roll the deadline forward in the synced store so it
    // fires again at its next occurrence instead of going stale.
    if (REPEAT_STEPS.has(todo.repeat)) {
      const next = advanceRepeat(todo.dueAt, todo.repeat, now);
      if (next.getTime() > dueMs) {
        todo.dueAt = next.toISOString();
        todosChanged = true;
      }
    }
  }

  if (todosChanged) {
    try {
      store.mergeEntries([{ key: TODOS_KEY, value: JSON.stringify(todos), updatedAt: Date.now() }]);
    } catch (error) {
      console.error("[reminders] failed to reschedule repeating todo:", error.message);
      todosChanged = false;
    }
  }
  if (rulesChanged) writeJson(REPEAT_RULES_FILE, rules);
  if (JSON.stringify(sent) !== JSON.stringify(sentNext)) writeJson(SENT_FILE, sentNext);
  return { fresh, rescheduled: todosChanged };
}

function startScheduler(broadcast) {
  let scanning = false;
  const scan = async () => {
    // Overlap guard: a slow push batch (retries sleep 1s) must never let two
    // scans run at once — the second would re-read the un-rolled store and
    // double-fire repeating reminders.
    if (scanning) return;
    scanning = true;
    try {
      await runScan(broadcast);
    } finally {
      scanning = false;
    }
  };
  setInterval(scan, 15_000).unref?.();
  setImmediate(scan);
}

async function runScan(broadcast) {
  let result = { fresh: [], rescheduled: false };
  try {
    result = collectDue();
  } catch (error) {
    console.error("[reminders] scan failed:", error.message);
    return;
  }
  // Await delivery so a push that is still mid-flight when the process gets
  // recycled still resolves instead of being cut off.
  for (const notification of result.fresh) {
    await sendPush({
      title: "WorkflowY — task due",
      body: notification.text,
      tag: notification.id,
      notification,
    });
    try {
      broadcast("notification", notification);
    } catch {}
  }
  // Nudge open devices to pull the rolled-forward repeating deadlines.
  if (result.rescheduled) {
    try {
      broadcast("data-changed", {});
    } catch {}
  }
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
  // Exposed for logic tests only — not used by the API surface.
  _collectDue: collectDue,
};
