const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");
const auth = require("./auth");
const imap = require("./imap-service");
const reminders = require("./reminders");

// Hostinger's proxy expects port 3000 when it does not inject PORT.
const PORT = Number(process.env.PORT || 3000);
const APP_NAME_HEADER = "WorkflowY API";

const app = express();
app.disable("x-powered-by");
// Snippet libraries and full-store imports can be large.
app.use(express.json({ limit: "80mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "GET" && req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

// Cross-origin support for the Electron desktop app syncing with this API.
// Set WIZARD_ALLOWED_ORIGIN to a comma-separated origin list (or "*") to enable.
const ALLOWED_ORIGINS = String(process.env.WIZARD_ALLOWED_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.length && (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

// ---------- auth ----------

app.get("/api/session", (req, res) => {
  res.json({ authenticated: auth.verifyRequest(req), needsSetup: !auth.credentialsExist() });
});

app.post("/api/setup", (req, res) => {
  try {
    if (auth.credentialsExist()) return res.status(409).json({ error: "Login already configured." });
    const result = auth.createCredentials(req.body?.username, req.body?.password);
    auth.setSessionCookie(req, res);
    res.json({ ok: true, username: result.username, token: auth.issueToken() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/login", (req, res) => {
  const ip = clientIp(req);
  if (auth.isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  }
  try {
    const result = auth.verifyCredentials(req.body?.username, req.body?.password);
    auth.clearFailedLogins(ip);
    auth.setSessionCookie(req, res);
    res.json({ ok: true, username: result.username, token: auth.issueToken() });
  } catch (error) {
    auth.recordFailedLogin(ip);
    res.status(401).json({ error: error.message });
  }
});

app.post("/api/logout", (req, res) => {
  auth.clearSessionCookie(req, res);
  res.json({ ok: true });
});

// ---------- data sync (last-write-wins) ----------

app.get("/api/data", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  res.json(store.getAll());
});

app.put("/api/data", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  if (!entries.length) return res.status(400).json({ error: "entries[] required" });
  const results = store.mergeEntries(entries);
  // Nudge every other connected device to pull immediately (SSE).
  const accepted = Object.values(results).some((r) => r && r.accepted !== false);
  if (accepted) broadcastDataChanged();
  res.json({ results });
});

// ---------- live updates (SSE) ----------

const sseClients = new Set();

function broadcastDataChanged() {
  for (const res of sseClients) {
    try {
      res.write("event: data-changed\ndata: {}\n\n");
    } catch {}
  }
}

// EventSource cannot send an Authorization header, so the Electron desktop app
// passes its bearer token as a query parameter; the web app relies on the cookie.
app.get("/api/events", (req, res) => {
  const queryToken = typeof req.query.token === "string" ? req.query.token : "";
  const authorized = queryToken
    ? auth.verifyToken(queryToken) !== null
    : auth.verifyRequest(req);
  if (!authorized) return res.status(401).json({ error: "Not signed in." });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");
  sseClients.add(res);

  // Comment ping keeps proxies from idling the connection out.
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {}
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ---------- deadline reminders + web push ----------

app.get("/api/push/config", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  res.json({ publicKey: reminders.publicKey() });
});

app.post("/api/push/subscribe", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  try {
    reminders.addSub(req.body);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/push/unsubscribe", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  if (endpoint) reminders.removeSub(endpoint);
  res.json({ ok: true });
});

app.get("/api/notifications", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  res.json({ notifications: reminders.listNotifications() });
});

app.post("/api/notifications/read", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  reminders.markAllRead();
  res.json({ ok: true });
});

// Temporary: fires a test reminder through the real pipeline (record + push + SSE).
app.post("/api/notifications/test", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const notification = reminders.sendTestNotification((name, payload) => {
    for (const client of sseClients) {
      try {
        client.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
      } catch {}
    }
  });
  res.json({ ok: true, notification });
});

app.delete("/api/notifications/:id", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  reminders.deleteNotification(String(req.params.id));
  res.json({ ok: true });
});

app.delete("/api/notifications", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  reminders.clearNotifications();
  res.json({ ok: true });
});

reminders.startScheduler((name, payload) => {
  for (const client of sseClients) {
    try {
      client.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {}
  }
});

app.get("/api/data/export", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  const payload = { exportedAt: new Date().toISOString(), app: APP_NAME_HEADER, keys: store.getAll() };
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="wizard-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

app.post("/api/data/import", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  try {
    const mode = req.body?.mode === "replace" ? "replace" : "merge";
    const imported = store.importStore(req.body?.keys || req.body, mode);
    res.json({ ok: true, mode, keyCount: Object.keys(imported).length });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ---------- imap ----------

app.post("/api/imap/test", async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  try {
    res.json(await imap.testConnection(req.body));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/imap/start", async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  try {
    // Long-running; progress flows over /api/imap/progress (SSE).
    imap.runMigration(req.body).then(
      (result) => res.json(result),
      (error) => res.status(400).json({ error: error.message }),
    );
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/imap/pause", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  imap.pause();
  res.json({ ok: true });
});

app.post("/api/imap/resume", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  imap.resume();
  res.json({ ok: true });
});

app.post("/api/imap/cancel", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  imap.cancel();
  res.json({ ok: true });
});

app.post("/api/imap/export", async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  try {
    imap.exportBackup(req.body).then(
      (result) => res.json(result),
      (error) => res.status(400).json({ error: error.message }),
    );
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/imap/backups", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  res.json(imap.listBackups());
});

app.post("/api/imap/import", async (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  try {
    imap.importBackup(req.body).then(
      (result) => res.json(result),
      (error) => res.status(400).json({ error: error.message }),
    );
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/imap/progress", (req, res) => {
  if (!auth.requireAuth(req, res)) return;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");

  const send = (update) => {
    try {
      res.write(`data: ${JSON.stringify(update)}\n\n`);
    } catch {}
  };
  const unsubscribe = imap.subscribe(send);
  const keepAlive = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {}
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

// ---------- static app + SPA fallback ----------

const staticDir = process.env.WIZARD_STATIC_DIR
  // Web build first (react-scripts outputs to build/); app-build is the Electron portable copy.
  || ["build", "app-build"].map((dir) => path.join(__dirname, "..", dir)).find((dir) => fs.existsSync(path.join(dir, "index.html")))
  || path.join(__dirname, "..", "build");

app.use(express.static(staticDir, { maxAge: "1h", index: "index.html" }));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(staticDir, "index.html"));
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error("[server]", error);
  if (res.headersSent) return;
  res.status(error?.type === "entity.too.large" ? 413 : 500).json({ error: "Server error" });
});

app.listen(PORT, () => {
  console.log(`${APP_NAME_HEADER} listening on port ${PORT}`);
  console.log(`Serving static build from ${staticDir}`);
});
