const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./store");

const AUTH_FILE = path.join(DATA_DIR, "auth.json");
const SECRET_FILE = path.join(DATA_DIR, "secret.key");

const COOKIE_NAME = "wizard_session";
const REMEMBER_DAYS = Number(process.env.WIZARD_REMEMBER_DAYS || 30);
const REMEMBER_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;
// Re-issue the cookie when less than this much of its life remains (sliding session).
const RENEW_THRESHOLD_MS = REMEMBER_MS - 24 * 60 * 60 * 1000;

const loginAttempts = new Map(); // ip -> { count, firstAt }
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getSecret() {
  try {
    const existing = fs.readFileSync(SECRET_FILE);
    if (existing.length >= 32) return existing;
  } catch {}
  ensureDataDir();
  const secret = crypto.randomBytes(48);
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  return secret;
}

function readAuthRecord() {
  try {
    const parsed = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
    if (parsed?.username && parsed?.salt && parsed?.hash) return parsed;
  } catch {}
  return null;
}

function credentialsExist() {
  return readAuthRecord() !== null;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function createCredentials(username, password) {
  const name = String(username || "").trim();
  if (name.length < 3) throw new Error("Username must be at least 3 characters.");
  if (String(password || "").length < 8) throw new Error("Password must be at least 8 characters.");
  if (credentialsExist()) throw new Error("Login already configured.");

  const salt = crypto.randomBytes(16).toString("hex");
  const record = { username: name, salt, hash: hashPassword(password, salt), createdAt: new Date().toISOString() };
  ensureDataDir();
  const tmp = AUTH_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), "utf8");
  fs.renameSync(tmp, AUTH_FILE);
  return { username: record.username };
}

function verifyCredentials(username, password) {
  const record = readAuthRecord();
  if (!record) throw new Error("Login not configured yet.");
  const user = String(username || "").trim();
  const pass = String(password || "");
  const expected = Buffer.from(record.hash, "hex");
  const actual = Buffer.from(hashPassword(pass, record.salt), "hex");
  const ok = expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
    && crypto.timingSafeEqual(Buffer.from(record.username), Buffer.from(user));
  if (!ok) throw new Error("Wrong username or password.");
  return { username: record.username };
}

function sign(payload) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function issueToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + REMEMBER_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isFinite(data.exp) || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    cookies[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return cookies;
}

function useSecureCookies(req) {
  if (process.env.WIZARD_SECURE_COOKIE === "0") return false;
  if (process.env.WIZARD_SECURE_COOKIE === "1") return true;
  // Trust proxy headers when behind Hostinger's reverse proxy / SSL terminator.
  return req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
}

function setSessionCookie(req, res) {
  const token = issueToken();
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(REMEMBER_MS / 1000)}${useSecureCookies(req) ? "; Secure" : ""}`,
  );
}

function clearSessionCookie(req, res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${useSecureCookies(req) ? "; Secure" : ""}`,
  );
}

// Read-only session check with no side effects (no 401 write, no renewal).
// Token from the Authorization header (Electron renderer, cross-origin) or cookie (web).
function extractToken(req) {
  const header = String(req.headers.authorization || "");
  if (/^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, "").trim();
  return parseCookies(req)[COOKIE_NAME];
}

function verifyRequest(req) {
  return verifyToken(extractToken(req)) !== null;
}

// Returns true when the request carries a valid session. Re-issues the cookie
// while the user stays active so an active month never logs out.
function requireAuth(req, res) {
  const data = verifyToken(extractToken(req));
  if (!data) {
    res.status(401).json({ error: "Not signed in." });
    return false;
  }
  if (data.exp - Date.now() < RENEW_THRESHOLD_MS) setSessionCookie(req, res);
  return true;
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.firstAt > ATTEMPT_WINDOW_MS) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.firstAt > ATTEMPT_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
}

function clearFailedLogins(ip) {
  loginAttempts.delete(ip);
}

module.exports = {
  COOKIE_NAME,
  credentialsExist,
  createCredentials,
  verifyCredentials,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  verifyRequest,
  issueToken,
  isRateLimited,
  recordFailedLogin,
  clearFailedLogins,
};
