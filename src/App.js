import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import seedSnippets from "./seedSnippets.json";
import generalSnippets from "./generalSnippets.json";
import { createZip, snippetFileName } from "./zipTools";
import { apiFetch, isElectron } from "./api";

const APP_NAME = "WorkflowY";
const TOPBAR_MENU_ID = "workflowy-settings-menu";
// Brand rendering with the accented Y.
function BrandName() {
  return <>Workflow<span className="name-accent">Y</span></>;
}
const STORAGE_KEY = "wizard-schedules";
const LEGACY_STORAGE_KEY = "deadline-os";
const CLIENTS_KEY = "wizard-schedules-clients";
const PROJECT_NOTES_KEY = "wizard-schedules-project-notes";
const PROJECT_FORM_DRAFT_KEY = "wizard-schedules-project-form-draft";
const TODO_ITEMS_KEY = "wizard-schedules-todo-items";
const SNIPPETS_KEY = "wizard-schedule-snippets";
const SNIPPET_SEED_KEY = "wizard-schedule-snippets-seeded";
const GENERAL_SNIPPET_SEED_KEY = "wizard-schedule-general-snippets-seeded";
const GENERAL_SNIPPET_CATEGORY_RESTORE_KEY = "wizard-schedule-general-snippets-categories-restored-v1";
const SNIPPET_ENCODING_REPAIR_KEY = "wizard-schedule-snippets-encoding-repaired";
const SNIPPET_CONTENT_REPAIR_KEY = "wizard-schedule-snippets-content-repaired-v2";
const THEME_KEY = "wizard-schedules-theme";
const LEGACY_THEME_KEY = "deadline-os-theme";
const NOTIF_PROMPT_DISMISSED_KEY = "wizard-schedules-notif-prompt-dismissed";
const UNPAID_CURRENCY_KEY = "wizard-schedules-unpaid-currency";
const MONEY_VISIBILITY_KEY = "wizard-schedules-money-visible";
const USD_EGP_RATE_KEY = "wizard-schedules-usd-egp-rate";
const FALLBACK_USD_EGP_RATE = 50;
const CURRENCIES = {
  USD: { code: "USD", label: "USD", symbol: "$" },
  EGP: { code: "EGP", label: "EGP", symbol: "E£" },
};
const EMPTY_FORM_FIELDS = { name: "", url: "", clientId: "", price: "", currency: "USD", paid: false, start: "", deadlineDays: "", deadline: "" };
const EMPTY_SNIPPET = { title: "", category: "WooCommerce", content: "" };
const EMPTY_IMAP_SHARED = { host: "", port: "993", secure: true, rejectUnauthorized: true };
const EMPTY_IMAP_ACCOUNT = { user: "", pass: "" };
const PROVIDERS = [
  { name: "Gmail", host: "imap.gmail.com", port: "993", secure: true },
  { name: "Outlook / Hotmail", host: "outlook.office365.com", port: "993", secure: true },
  { name: "Yahoo Mail", host: "imap.mail.yahoo.com", port: "993", secure: true },
  { name: "iCloud", host: "imap.mail.me.com", port: "993", secure: true },
  { name: "AOL", host: "imap.aol.com", port: "993", secure: true },
  { name: "GMX", host: "imap.gmx.com", port: "993", secure: true },
  { name: "Mail.com", host: "imap.mail.com", port: "993", secure: true },
  { name: "Zoho Mail", host: "imap.zoho.com", port: "993", secure: true },
  { name: "Yandex Mail", host: "imap.yandex.com", port: "993", secure: true },
  { name: "Fastmail", host: "imap.fastmail.com", port: "993", secure: true },
  { name: "Proton Mail (Bridge)", host: "127.0.0.1", port: "1143", secure: false },
  { name: "Hostinger", host: "imap.hostinger.com", port: "993", secure: true },
  { name: "Bluehost (cPanel)", host: "mail.yourdomain.com", port: "993", secure: true },
  { name: "Bluehost Pro (Titan)", host: "imap.titan.email", port: "993", secure: true },
  { name: "Titan", host: "imap.titan.email", port: "993", secure: true },
  { name: "cPanel / WHM", host: "mail.yourdomain.com", port: "993", secure: true },
  { name: "GoDaddy", host: "imap.secureserver.net", port: "993", secure: true },
  { name: "SiteGround", host: "mail.yourdomain.com", port: "993", secure: true },
  { name: "DreamHost", host: "mail.yourdomain.com", port: "993", secure: true },
  { name: "Namecheap Private Email", host: "imap.privateemail.com", port: "993", secure: true },
  { name: "IONOS", host: "imap.ionos.com", port: "993", secure: true },
  { name: "Rackspace", host: "imap.emailsrvr.com", port: "993", secure: true },
];

const DNS_RECORDS = {
  "imap.gmail.com": {
    mx: [{ priority: 1, value: "ASPMX.L.GOOGLE.com" }, { priority: 5, value: "ALT1.ASPMX.L.GOOGLE.com" }, { priority: 5, value: "ALT2.ASPMX.L.GOOGLE.com" }, { priority: 10, value: "ALT3.ASPMX.L.GOOGLE.com" }, { priority: 10, value: "ALT4.ASPMX.L.GOOGLE.com" }],
    spf: "v=spf1 include:_spf.google.com ~all",
    dkim: "google._domainkey",
    dmarc: "v=DMARC1; p=quarantine; pct=100; rua=mailto:d@rua.googlemail.com",
  },
  "outlook.office365.com": {
    mx: [{ priority: 0, value: "yourdomain-com.mail.protection.outlook.com" }],
    spf: "v=spf1 include:spf.protection.outlook.com ~all",
    dkim: "selector1-_domainkey\nselector2-_domainkey",
    dmarc: "v=DMARC1; p=none; pct=100",
  },
  "imap.mail.yahoo.com": {
    mx: [{ priority: 1, value: "mta5.am0.yahoodns.net" }, { priority: 1, value: "mta6.am0.yahoodns.net" }, { priority: 1, value: "mta7.am0.yahoodns.net" }],
    spf: "v=spf1 include:spf.mail.yahoo.com ~all",
    dkim: "yahoo._domainkey",
    dmarc: "v=DMARC1; p=reject; pct=100; rua=mailto:d@rua.yahoo.com",
  },
  "imap.mail.me.com": {
    mx: [{ priority: 10, value: "mx01.mail.icloud.com" }, { priority: 10, value: "mx02.mail.icloud.com" }],
    spf: "v=spf1 include:icloud.com ~all",
    dkim: "sig1._domainkey\nsig2._domainkey",
    dmarc: "v=DMARC1; p=quarantine; pct=100",
  },
  "imap.aol.com": {
    mx: [{ priority: 10, value: "mailin-01.mx.aol.com" }, { priority: 10, value: "mailin-02.mx.aol.com" }, { priority: 10, value: "mailin-03.mx.aol.com" }, { priority: 10, value: "mailin-04.mx.aol.com" }],
    spf: "v=spf1 include:spf.mail.aol.com ~all",
    dkim: "aol._domainkey",
    dmarc: "v=DMARC1; p=reject; pct=100",
  },
  "imap.gmx.com": {
    mx: [{ priority: 10, value: "mx01.emig.gmx.net" }, { priority: 10, value: "mx02.emig.gmx.net" }, { priority: 10, value: "mx03.emig.gmx.net" }],
    spf: "v=spf1 include:_spf.gmx.com ~all",
    dkim: "gmx._domainkey",
    dmarc: "v=DMARC1; p=none; pct=100",
  },
  "imap.mail.com": {
    mx: [{ priority: 10, value: "mx01.mail.com" }, { priority: 10, value: "mx02.mail.com" }],
    spf: "v=spf1 include:_spf.mail.com ~all",
    dkim: "mailcom._domainkey",
    dmarc: "v=DMARC1; p=none; pct=100",
  },
  "imap.zoho.com": {
    mx: [{ priority: 10, value: "mx.zoho.com" }, { priority: 20, value: "mx2.zoho.com" }, { priority: 50, value: "mx3.zoho.com" }],
    spf: "v=spf1 include:zoho.com ~all",
    dkim: "zoho._domainkey",
    dmarc: "v=DMARC1; p=none; pct=100",
  },
  "imap.yandex.com": {
    mx: [{ priority: 10, value: "mx.yandex.com" }],
    spf: "v=spf1 include:_spf.yandex.com ~all",
    dkim: "mail._domainkey",
    dmarc: "v=DMARC1; p=none; pct=100",
  },
  "imap.fastmail.com": {
    mx: [{ priority: 10, value: "in1-smtp.messagingengine.com" }, { priority: 20, value: "in2-smtp.messagingengine.com" }],
    spf: "v=spf1 include:spf.messagingengine.com ~all",
    dkim: "dkim._domainkey.fastmail.com\ndkim2._domainkey.fastmail.com",
    dmarc: "v=DMARC1; p=reject; pct=100",
  },
  "imap.ionos.com": {
    mx: [{ priority: 10, value: "mx00.ionos.com" }, { priority: 10, value: "mx01.ionos.com" }],
    spf: "v=spf1 include:spf.ionos.com ~all",
    dkim: "ionos._domainkey",
    dmarc: "v=DMARC1; p=none; pct=100",
  },
  "imap.privateemail.com": {
    mx: [{ priority: 10, value: "mx01.nameshield.net" }, { priority: 20, value: "mx02.nameshield.net" }],
    spf: "v=spf1 include:spf.privateemail.com ~all",
    dkim: "privateemail._domainkey",
    dmarc: "v=DMARC1; p=none; pct=100",
  },
  "imap.emailsrvr.com": {
    mx: [{ priority: 10, value: "mx1.emailsrvr.com" }, { priority: 20, value: "mx2.emailsrvr.com" }],
    spf: "v=spf1 include:spf.emailsrvr.com ~all",
    dkim: "emailsrvr._domainkey",
    dmarc: "v=DMARC1; p=none; pct=100",
  },
  "imap.hostinger.com": {
    mx: [{ priority: 1, value: "mx1.hostinger.com" }, { priority: 5, value: "mx2.hostinger.com" }],
    spf: "v=spf1 include:_spf.hostinger.com ~all",
    dkim: "hostinger._domainkey",
    dmarc: "v=DMARC1; p=none; pct=100",
  },
  "127.0.0.1": {
    mx: [{ priority: 10, value: "mail.yourdomain.com" }],
    spf: "v=spf1 mx ~all",
    dkim: "proton._domainkey",
    dmarc: "v=DMARC1; p=none; pct=100",
  },
};

const ALL_SEED_SNIPPETS = [...seedSnippets, ...generalSnippets];

function createBlankNote() {
  return { id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: "", done: false };
}

function createTodoItem(text, category, dueAt = "") {
  return { id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, category, done: false, createdAt: new Date().toISOString(), dueAt: dueAt || "" };
}

function toLocalInputValue(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function formatDueLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return `Today ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

// Fires a native OS notification: a Windows toast in Electron, a browser
// notification on the web. Silent no-op without permission.
function showSystemNotification(notification) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const note = new Notification("WorkflowY — task due", {
      body: notification.text,
      tag: notification.id,
      icon: `${process.env.PUBLIC_URL || "."}/workflowy-icon-192.png`,
      badge: `${process.env.PUBLIC_URL || "."}/workflowy-notif-192.png`,
    });
    note.onclick = () => window.focus();
  } catch {}
}

function createEmptyForm() {
  return { ...EMPTY_FORM_FIELDS, notes: [createBlankNote()] };
}

function normalizeSeedLookup(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.[^.]+$/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .trim();
}

function collapseWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getTextDirection(value) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(String(value || "")) ? "rtl" : "ltr";
}

function normalizeNotes(notes) {
  const source = Array.isArray(notes)
    ? notes
    : String(notes || "")
        .split(/\r?\n/)
        .filter((line) => line.trim());

  return source.map((note, index) => {
    if (typeof note === "string") {
      return { id: `note-${index}`, text: note, done: false };
    }

    return {
      id: note?.id || `note-${index}`,
      text: String(note?.text || ""),
      done: Boolean(note?.done),
    };
  });
}

function getFormNotes(notes) {
  const normalized = normalizeNotes(notes);
  return normalized.length > 0 ? normalized : [createBlankNote()];
}

function getSavedNotes(notes) {
  return normalizeNotes(notes)
    .map((note) => ({ ...note, text: note.text.trim() }))
    .filter((note) => note.text);
}

function normalizeTodoItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((todo, index) => ({
      id: todo?.id || `todo-${index}`,
      text: String(todo?.text || ""),
      category: String(todo?.category || "General"),
      done: Boolean(todo?.done),
      createdAt: todo?.createdAt || "",
      dueAt: String(todo?.dueAt || ""),
    }))
    .filter((todo) => todo.text.trim());
}

function hasProjectFormDraft(form, editId) {
  return (
    Boolean(editId) ||
    Boolean(form.name.trim()) ||
    Boolean(form.url.trim()) ||
    Boolean(form.clientId) ||
    Boolean(form.price.trim()) ||
    normalizeCurrency(form.currency, form.price) !== EMPTY_FORM_FIELDS.currency ||
    form.paid ||
    Boolean(form.start.trim()) ||
    Boolean(form.deadlineDays.trim()) ||
    Boolean(form.deadline.trim()) ||
    getSavedNotes(form.notes).length > 0
  );
}

function loadProjectFormDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(PROJECT_FORM_DRAFT_KEY) || "null");
    if (!draft?.form) return null;

    return {
      editId: draft.editId || null,
      form: {
        ...EMPTY_FORM_FIELDS,
        ...draft.form,
        currency: normalizeCurrency(draft.form.currency, draft.form.price),
        notes: getFormNotes(draft.form.notes),
      },
    };
  } catch {
    return null;
  }
}

function saveProjectFormDraft(form, editId) {
  localStorage.setItem(PROJECT_FORM_DRAFT_KEY, JSON.stringify({ form, editId }));
}

function clearProjectFormDraft() {
  localStorage.removeItem(PROJECT_FORM_DRAFT_KEY);
}

function loadProjectNotesStore(sites = []) {
  let storedNotes = {};

  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECT_NOTES_KEY) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) storedNotes = parsed;
  } catch {
    storedNotes = {};
  }

  const mergedNotes = { ...storedNotes };
  sites.forEach((site) => {
    const key = String(site.id);
    const siteNotes = getSavedNotes(site.notes);
    if (siteNotes.length > 0 && getSavedNotes(mergedNotes[key]).length === 0) {
      mergedNotes[key] = siteNotes;
    }
  });

  return mergedNotes;
}

function mergeProjectNotesStores(...stores) {
  return stores.reduce((merged, store) => {
    if (!store || typeof store !== "object" || Array.isArray(store)) return merged;

    Object.entries(store).forEach(([projectId, notes]) => {
      const savedNotes = getSavedNotes(notes);
      if (savedNotes.length > 0) merged[String(projectId)] = savedNotes;
    });

    return merged;
  }, {});
}

function saveProjectNotesStore(notesStore) {
  localStorage.setItem(PROJECT_NOTES_KEY, JSON.stringify(notesStore));
  window.wizardStorage?.writeProjectNotes?.(notesStore).catch(() => {});
}

function buildSeedMaps() {
  const byId = new Map();
  const byTitle = new Map();

  ALL_SEED_SNIPPETS.forEach((snippet) => {
    byId.set(snippet.id, snippet);
    byTitle.set(`${normalizeSeedLookup(snippet.category)}::${normalizeSeedLookup(snippet.title)}`, snippet);
    byTitle.set(`${normalizeSeedLookup(snippet.category)}::${normalizeSeedLookup(snippet.filename)}`, snippet);
  });

  return { byId, byTitle };
}

function findMatchingSeedSnippet(snippet, seedMaps) {
  if (seedMaps.byId.has(snippet.id)) return seedMaps.byId.get(snippet.id);

  const category = normalizeSeedLookup(snippet.category);
  const title = normalizeSeedLookup(snippet.title);
  const filename = normalizeSeedLookup(snippet.filename);

  return seedMaps.byTitle.get(`${category}::${title}`) || seedMaps.byTitle.get(`${category}::${filename}`) || null;
}

function shouldRefreshSeedSnippet(snippet, seed) {
  if (!seed) return false;

  const content = String(snippet.content || "");
  const seedContent = String(seed.content || "");
  const contentLines = content.split(/\r?\n/).length;
  const seedLines = seedContent.split(/\r?\n/).length;
  const hasBrokenEncoding = content.includes("�");
  const isMuchFlatterThanSeed = seedLines > 3 && contentLines <= 2;
  const hasFlattenedSeedContent = isMuchFlatterThanSeed && collapseWhitespace(content) === collapseWhitespace(seedContent);

  return hasBrokenEncoding || hasFlattenedSeedContent || (isMuchFlatterThanSeed && normalizeSeedLookup(snippet.title) === normalizeSeedLookup(seed.title));
}

function parseDate(ddmmyyyy) {
  const normalized = normalizeDateInput(ddmmyyyy);
  if (!normalized) return null;
  const [dd, mm, yyyy] = normalized.split("/").map(Number);
  if (!dd || !mm || !yyyy) return null;
  return new Date(yyyy, mm - 1, dd);
}

function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function getToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getDaysLeft(deadlineStr) {
  const deadline = parseDate(deadlineStr);
  if (!deadline) return 0;
  deadline.setHours(0, 0, 0, 0);
  return Math.ceil((deadline - getToday()) / (1000 * 60 * 60 * 24));
}

function isValidDate(str) {
  const normalized = normalizeDateInput(str);
  if (!normalized || normalized.length !== 10) return false;
  const [dd, mm, yyyy] = normalized.split("/").map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  return (
    date instanceof Date &&
    !Number.isNaN(date.getTime()) &&
    date.getDate() === dd &&
    date.getMonth() === mm - 1 &&
    date.getFullYear() === yyyy
  );
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  return raw;
}

function getProgress(startDate, deadline) {
  const start = parseDate(startDate)?.getTime();
  const end = parseDate(deadline)?.getTime();
  if (!start || !end || end <= start) return 0;
  return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
}

function parsePrice(value) {
  const numeric = String(value || "").replace(/[^0-9.-]/g, "");
  const amount = Number.parseFloat(numeric);
  return Number.isFinite(amount) ? amount : 0;
}

function detectPriceCurrency(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.includes("E£") || normalized.includes("EGP")) return "EGP";
  if (normalized.includes("$") || normalized.includes("USD")) return "USD";
  return null;
}

function normalizeCurrency(currency, price = "") {
  if (currency === "USD" || currency === "EGP") return currency;
  return detectPriceCurrency(price) || "USD";
}

function formatMoney(value, currency = "USD") {
  const safeCurrency = normalizeCurrency(currency);
  const formattedValue = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);

  return `${CURRENCIES[safeCurrency].symbol}${formattedValue}`;
}

function maskMoney(currency = "USD") {
  return `${CURRENCIES[normalizeCurrency(currency)].symbol}******`;
}

function convertMoney(value, fromCurrency, toCurrency, usdEgpRate) {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  const rate = Number.isFinite(usdEgpRate) && usdEgpRate > 0 ? usdEgpRate : FALLBACK_USD_EGP_RATE;

  if (from === to) return value;
  if (from === "USD" && to === "EGP") return value * rate;
  if (from === "EGP" && to === "USD") return value / rate;
  return value;
}

function getInitialTheme() {
  const saved = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  // Dark is the app's default look on every device unless the user picked light.
  return "dark";
}

function StatusBadge({ daysLeft }) {
  if (daysLeft < 0) return <span className="status-badge status-overdue"><span className="badge-text">Overdue</span></span>;
  if (daysLeft === 0) return <span className="status-badge status-today"><span className="badge-text">Today</span></span>;
  if (daysLeft <= 4) return <span className="status-badge status-warning"><span className="badge-text">{daysLeft}d left</span></span>;
  return <span className="status-badge status-ok"><span className="badge-text">{daysLeft}d left</span></span>;
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label="Toggle color theme"
      aria-pressed={theme === "light"}
      onClick={onToggle}
    >
      <span className="theme-toggle-track">
        <span className="theme-toggle-thumb" />
      </span>
      <span>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}

function EditorChrome({ title, children }) {
  return (
    <div className="editor-chrome">
      <div className="editor-titlebar">
        <span className="editor-dot editor-dot-red" />
        <span className="editor-dot editor-dot-yellow" />
        <span className="editor-dot-green" />
        <strong>{title}</strong>
      </div>
      {children}
    </div>
  );
}

function CodePreview({ title, content }) {
  return (
    <EditorChrome title={title}>
      <pre className="code-preview" role="region" aria-label={`${title} code preview`}>
        <code dir="auto">{String(content || " ")}</code>
      </pre>
    </EditorChrome>
  );
}

const PTR_THRESHOLD = 76;
const PTR_START_SLOP = 8;
const PTR_MAX_PULL = 132;
// Under-threshold release keeps the medallion visible for this long while it
// travels back above the viewport and the logo counter-rotates to upright.
// Must match the .ptr-returning transition duration in App.css exactly.
const PTR_RETURN_MS = 320;
const PTR_BLOCKED_TARGETS = [
  "input", "textarea", "select", "button", "a", "label", "[contenteditable]", "[role='slider']",
  ".modal", ".client-select-menu", ".snippet-list", ".email-log-list", ".code-preview", ".editor-input-wrap",
].join(", ");

function usePullToRefresh(scrollRef) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [returning, setReturning] = useState(false);
  const refreshingRef = useRef(false);
  const reloadTimerRef = useRef(null);
  const returnTimerRef = useRef(null);

  const clearReturnTimer = () => {
    if (returnTimerRef.current) {
      window.clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
  };

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return undefined;
    if (document.documentElement.getAttribute("data-web") !== "1") return undefined;
    if (!window.matchMedia("(pointer: coarse)").matches) return undefined;

    let startX = 0;
    let startY = 0;
    let candidate = false;
    let active = false;
    let distance = 0;

    const isBlockedTarget = (target) =>
      target instanceof Element && Boolean(target.closest(PTR_BLOCKED_TARGETS));

    const resetGesture = () => {
      candidate = false;
      active = false;
      distance = 0;
    };

    const beginReturn = () => {
      clearReturnTimer();
      setReturning(true);
      returnTimerRef.current = window.setTimeout(() => {
        returnTimerRef.current = null;
        setReturning(false);
        setPull(0);
      }, PTR_RETURN_MS);
    };

    const onTouchStart = (event) => {
      if (returnTimerRef.current) {
        // A new gesture during the return: drop the medallion gracefully and
        // re-arm the gesture instead of letting the stale timer fire mid-drag.
        clearReturnTimer();
        setReturning(false);
        setPull(0);
      }
      if (refreshingRef.current || event.touches.length !== 1) {
        candidate = false;
        return;
      }
      const touch = event.touches[0];
      startY = touch.clientY;
      startX = touch.clientX;
      distance = 0;
      active = false;
      candidate = scroller.scrollTop <= 0 && !isBlockedTarget(touch.target);
    };

    const onTouchMove = (event) => {
      if (!candidate || refreshingRef.current) return;
      if (event.touches.length !== 1) {
        resetGesture();
        beginReturn();
        return;
      }

      const touch = event.touches[0];
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;
      if (!active) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          candidate = false;
          return;
        }
        if (dy <= PTR_START_SLOP) return;
        if (scroller.scrollTop > 0) {
          candidate = false;
          return;
        }
        active = true;
      }

      event.preventDefault();
      const resistedDistance = dy <= PTR_THRESHOLD
        ? Math.max(0, dy)
        : PTR_THRESHOLD + (dy - PTR_THRESHOLD) * 0.35;
      distance = Math.min(resistedDistance, PTR_MAX_PULL);
      setPull(distance);
    };

    const finishGesture = (allowRefresh) => {
      if (!candidate) return;
      const shouldRefresh = allowRefresh && active && distance >= PTR_THRESHOLD;
      resetGesture();
      if (!shouldRefresh) {
        // RETURNING phase: keep the medallion fully visible while it travels
        // back above the viewport; hide only after the return completes.
        beginReturn();
        return;
      }

      refreshingRef.current = true;
      // Reset the dragged pull so the refreshing beat rocks around upright
      // instead of a residual dragged angle.
      setPull(0);
      setRefreshing(true);
      reloadTimerRef.current = window.setTimeout(() => window.location.reload(), 600);
    };

    const onTouchEnd = () => finishGesture(true);
    const onTouchCancel = () => finishGesture(false);

    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd, { passive: true });
    scroller.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchCancel);
      clearReturnTimer();
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    };
  }, [scrollRef]);

  return { pull, refreshing, returning };
}

// Fixed-position logo medallion that follows the pull. Parked above the
// viewport when idle, so it can never shift layout; springs back on release.
function PtrIndicator({ pull, refreshing, returning }) {
  const armed = !refreshing && !returning && pull >= PTR_THRESHOLD;
  const progress = refreshing ? 1 : Math.min(pull / PTR_THRESHOLD, 1);
  // Browser-safe concrete values: CSS calc() multiplication inside rotate()/scale()
  // is not reliably supported, so rotation/scale are computed here per drag frame.
  // Rotation follows raw pull distance, so it keeps turning through the resisted
  // over-threshold range instead of freezing once progress caps at 1.
  // While RETURNING the rotation is forced to 0deg so the img transition visibly
  // counter-rotates from the dragged angle back to upright over PTR_RETURN_MS.
  const rotation = `${(returning ? 0 : pull * 2).toFixed(2)}deg`;
  const scale = (0.65 + progress * 0.35).toFixed(3);
  const classes = ["ptr-indicator"];
  if (!refreshing && !returning && pull > 0) classes.push("ptr-active");
  if (armed) classes.push("ptr-ready");
  if (refreshing) classes.push("ptr-refreshing");
  if (returning) classes.push("ptr-returning");
  const status = refreshing
    ? "Refreshing…"
    : returning
    ? ""
    : armed
    ? "Release to refresh"
    : pull > 0
    ? "Pull down to refresh"
    : "";
  return (
    <>
      <div
        className={classes.join(" ")}
        style={{
          "--ptr-pull": `${pull.toFixed(2)}px`,
          "--ptr-rotation": rotation,
          "--ptr-scale": scale,
        }}
        aria-hidden="true"
      >
        <img src={`${process.env.PUBLIC_URL}/wizard-schedules-logo.png`} alt="" />
      </div>
      {status ? (
        <div className="ptr-visually-hidden" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
    </>
  );
}

export default function App() {
  const initialProjectDraftRef = useRef();
  if (initialProjectDraftRef.current === undefined) {
    initialProjectDraftRef.current = loadProjectFormDraft();
  }
  const initialProjectDraft = initialProjectDraftRef.current;
  const [activeTab, setActiveTab] = useState("schedule");
  const [sites, setSites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  });
  const sitesRef = useRef(sites);
  const [projectNotes, setProjectNotes] = useState(() => loadProjectNotesStore(sites));
  const projectNotesRef = useRef(projectNotes);
  const [todoItems, setTodoItems] = useState(() => {
    try {
      return normalizeTodoItems(JSON.parse(localStorage.getItem(TODO_ITEMS_KEY) || "[]"));
    } catch {
      return [];
    }
  });
  const [todoDraft, setTodoDraft] = useState("");
  const [todoCategory, setTodoCategory] = useState("General");
  const [todoNewCategory, setTodoNewCategory] = useState("");
  const [todoCategoryMenuOpen, setTodoCategoryMenuOpen] = useState(false);
  const [todoFilter, setTodoFilter] = useState("all");
  const [todoFilterMenuOpen, setTodoFilterMenuOpen] = useState(false);
  const [todoEditId, setTodoEditId] = useState(null);
  const [todoEditText, setTodoEditText] = useState("");
  const [draggingTodoId, setDraggingTodoId] = useState(null);
  const [todoDueId, setTodoDueId] = useState(null);
  const [todoDueText, setTodoDueText] = useState("");
  const [todoDueDraft, setTodoDueDraft] = useState("");
  const [newTodoDueAt, setNewTodoDueAt] = useState("");
  const [dueViewMonth, setDueViewMonth] = useState(() => new Date());
  const [dueTimeMenu, setDueTimeMenu] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "denied"));
  const [notifPromptDismissed, setNotifPromptDismissed] = useState(() => {
    try {
      return localStorage.getItem(NOTIF_PROMPT_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [clients, setClients] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CLIENTS_KEY)) || [];
    } catch {
      return [];
    }
  });
  const [snippets, setSnippets] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SNIPPETS_KEY) || "null");
      if (Array.isArray(saved)) return saved;
    } catch {
      // Fall through to the seeded snippets.
    }
    return ALL_SEED_SNIPPETS;
  });
  const [form, setForm] = useState(() => initialProjectDraft?.form || createEmptyForm());
  const formRef = useRef(form);
  const [snippetForm, setSnippetForm] = useState(EMPTY_SNIPPET);
  const [showForm, setShowForm] = useState(() => Boolean(initialProjectDraft));
  const showFormRef = useRef(showForm);
  const [showClients, setShowClients] = useState(false);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [clientFilterMenuOpen, setClientFilterMenuOpen] = useState(false);
  const [snippetFilterMenuOpen, setSnippetFilterMenuOpen] = useState(false);
  const [snippetCategoryMenuOpen, setSnippetCategoryMenuOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [snippetSearch, setSnippetSearch] = useState("");
  const [snippetCategory, setSnippetCategory] = useState("All");
  const [editId, setEditId] = useState(() => initialProjectDraft?.editId || null);
  const editIdRef = useRef(editId);
  const [snippetEditId, setSnippetEditId] = useState(null);
  const [selectedSnippetId, setSelectedSnippetId] = useState(null);
  const [copyState, setCopyState] = useState("");
  const [theme, setTheme] = useState(getInitialTheme);
  const [draggingNoteId, setDraggingNoteId] = useState(null);
  const [unpaidCurrency, setUnpaidCurrency] = useState(() => normalizeCurrency(localStorage.getItem(UNPAID_CURRENCY_KEY)));
  const [moneyVisible, setMoneyVisible] = useState(() => localStorage.getItem(MONEY_VISIBILITY_KEY) !== "hidden");
  const [usdEgpRate, setUsdEgpRate] = useState(() => {
    const savedRate = Number(localStorage.getItem(USD_EGP_RATE_KEY));
    return Number.isFinite(savedRate) && savedRate > 0 ? savedRate : FALLBACK_USD_EGP_RATE;
  });
  const [currencyRateStatus, setCurrencyRateStatus] = useState("Loading live rate");
  const [closePrompt, setClosePrompt] = useState(null);
  const [topbarMenuOpen, setTopbarMenuOpen] = useState(false);
  const [imapSourceShared, setImapSourceShared] = useState({ ...EMPTY_IMAP_SHARED });
  const [imapSourceAccounts, setImapSourceAccounts] = useState([{ ...EMPTY_IMAP_ACCOUNT }]);
  const [imapTargetShared, setImapTargetShared] = useState({ ...EMPTY_IMAP_SHARED });
  const [imapTargetAccounts, setImapTargetAccounts] = useState([{ ...EMPTY_IMAP_ACCOUNT }]);
  const [imapLogs, setImapLogs] = useState([]);
  const [imapTesting, setImapTesting] = useState("");
  const [imapMigrating, setImapMigrating] = useState(false);
  const [imapPaused, setImapPaused] = useState(false);
  const [imapSummary, setImapSummary] = useState(null);
  const [imapProviderOpen, setImapProviderOpen] = useState("");
  const [imapProviderSearch, setImapProviderSearch] = useState("");
  const [imapShowDns, setImapShowDns] = useState(false);
  const [dnsCopiedKey, setDnsCopiedKey] = useState("");
  const [imapDateFrom, setImapDateFrom] = useState("");
  const [imapDateTo, setImapDateTo] = useState("");
  const [backupMessage, setBackupMessage] = useState(null);
  const closePromptResolverRef = useRef(null);
  const snippetEditorGutterRef = useRef(null);
  const topbarActionsRef = useRef(null);
  const topbarMenuButtonRef = useRef(null);
  const appScrollRef = useRef(null);
  const ptr = usePullToRefresh(appScrollRef);

  sitesRef.current = sites;
  projectNotesRef.current = projectNotes;
  formRef.current = form;
  showFormRef.current = showForm;
  editIdRef.current = editId;

  useEffect(() => {
    localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    localStorage.setItem(TODO_ITEMS_KEY, JSON.stringify(normalizeTodoItems(todoItems)));
  }, [todoItems]);

  // ----- deadline notifications (server is the source of truth) -----
  useEffect(() => {
    let cancelled = false;
    async function loadNotifications() {
      try {
        const data = await apiFetch("/api/notifications");
        if (!cancelled && Array.isArray(data?.notifications)) setNotifications(data.notifications);
      } catch {}
    }
    loadNotifications();
    const interval = setInterval(loadNotifications, 60_000);
    const onNotification = (event) => {
      const notification = event?.detail;
      if (!notification?.id) return;
      setNotifications((current) => (current.some((item) => item.id === notification.id) ? current : [notification, ...current]));
      showSystemNotification(notification);
    };
    window.addEventListener("wizard-notification", onNotification);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("wizard-notification", onNotification);
    };
  }, []);

  // Web Push subscription so phones get reminders with the PWA closed.
  // The desktop app has no service worker (file://) — its toast comes from the
  // SSE event above instead. Permission is never requested silently: the user
  // enables it through the banner or the notifications panel.
  async function subscribeToPush() {
    if (isElectron() || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const config = await apiFetch("/api/push/config");
        if (!config?.publicKey) return;
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: config.publicKey,
        });
      }
      if (subscription) {
        await apiFetch("/api/push/subscribe", { method: "POST", body: subscription.toJSON() });
      }
    } catch {}
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    try {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission === "granted") await subscribeToPush();
    } catch {}
  }

  useEffect(() => {
    let cancelled = false;
    function run() {
      if (!cancelled) subscribeToPush();
    }
    run();
    window.addEventListener("focus", run);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showForm) return;

    if (hasProjectFormDraft(form, editId)) {
      saveProjectFormDraft(form, editId);
    } else {
      clearProjectFormDraft();
    }
  }, [editId, form, showForm]);

  useEffect(() => {
    const mergedNotes = loadProjectNotesStore(sitesRef.current);
    if (JSON.stringify(mergedNotes) === JSON.stringify(projectNotesRef.current)) return;

    projectNotesRef.current = mergedNotes;
    setProjectNotes(mergedNotes);
    if (Object.keys(mergedNotes).length > 0) saveProjectNotesStore(mergedNotes);
  }, []);

  useEffect(() => {
    let cancelled = false;

    window.wizardStorage?.readProjectNotes?.()
      .then((fileNotes) => {
        if (cancelled) return;

        const mergedNotes = mergeProjectNotesStores(loadProjectNotesStore(sitesRef.current), fileNotes);
        if (JSON.stringify(mergedNotes) === JSON.stringify(projectNotesRef.current)) return;

        projectNotesRef.current = mergedNotes;
        setProjectNotes(mergedNotes);
        saveProjectNotesStore(mergedNotes);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.__wizardFlushStorage = () => window.wizardStorage?.writeProjectNotes?.(projectNotesRef.current);
    return () => {
      window.__wizardFlushStorage = undefined;
    };
  }, []);

  useEffect(() => {
    const seeded = localStorage.getItem(SNIPPET_SEED_KEY);
    if (!seeded) {
      setSnippets((current) => {
        const currentIds = new Set(current.map((snippet) => snippet.id));
        const missing = seedSnippets.filter((snippet) => !currentIds.has(snippet.id));
        return [...current, ...missing];
      });
      localStorage.setItem(SNIPPET_SEED_KEY, "1");
    }
  }, []);

  useEffect(() => {
    const seeded = localStorage.getItem(GENERAL_SNIPPET_SEED_KEY);
    if (!seeded) {
      setSnippets((current) => {
        const currentIds = new Set(current.map((snippet) => snippet.id));
        const missing = generalSnippets.filter((snippet) => !currentIds.has(snippet.id));
        return [...current, ...missing];
      });
      localStorage.setItem(GENERAL_SNIPPET_SEED_KEY, "1");
    }
  }, []);

  useEffect(() => {
    const restored = localStorage.getItem(GENERAL_SNIPPET_CATEGORY_RESTORE_KEY);
    if (!restored) {
      setSnippets((current) => {
        const generalSnippetIds = new Set(generalSnippets.map((snippet) => snippet.id));
        let changed = false;
        const restoredSnippets = current.map((snippet) => {
          if (!generalSnippetIds.has(snippet.id) || snippet.category === "General") return snippet;
          changed = true;
          return { ...snippet, category: "General" };
        });

        return changed ? restoredSnippets : current;
      });
      localStorage.setItem(GENERAL_SNIPPET_CATEGORY_RESTORE_KEY, "1");
    }
  }, []);

  useEffect(() => {
    const repaired = localStorage.getItem(SNIPPET_ENCODING_REPAIR_KEY);
    if (!repaired) {
      setSnippets((current) => {
        const seedMaps = buildSeedMaps();
        let changed = false;
        const repairedSnippets = current.map((snippet) => {
          const seed = findMatchingSeedSnippet(snippet, seedMaps);
          if (!seed || !String(snippet.content || "").includes("�")) return snippet;
          changed = true;
          return {
            ...snippet,
            title: seed.title,
            category: seed.category,
            filename: seed.filename,
            content: seed.content,
            updatedAt: new Date().toISOString(),
          };
        });

        return changed ? repairedSnippets : current;
      });
      localStorage.setItem(SNIPPET_ENCODING_REPAIR_KEY, "1");
    }
  }, []);

  useEffect(() => {
    const repaired = localStorage.getItem(SNIPPET_CONTENT_REPAIR_KEY);
    if (!repaired) {
      setSnippets((current) => {
        const seedMaps = buildSeedMaps();
        let changed = false;
        const repairedSnippets = current.map((snippet) => {
          const seed = findMatchingSeedSnippet(snippet, seedMaps);
          if (!shouldRefreshSeedSnippet(snippet, seed)) return snippet;
          changed = true;
          return {
            ...snippet,
            title: seed.title,
            category: seed.category,
            filename: seed.filename,
            content: seed.content,
            updatedAt: new Date().toISOString(),
          };
        });

        return changed ? repairedSnippets : current;
      });
      localStorage.setItem(SNIPPET_CONTENT_REPAIR_KEY, "1");
    }
  }, []);

  useEffect(() => {
    setSnippets((current) => {
      const seedMaps = buildSeedMaps();
      let changed = false;
      const repairedSnippets = current.map((snippet) => {
        const seed = findMatchingSeedSnippet(snippet, seedMaps);
        if (!shouldRefreshSeedSnippet(snippet, seed)) return snippet;
        changed = true;
        return {
          ...snippet,
          title: seed.title,
          category: seed.category,
          filename: seed.filename,
          content: seed.content,
          updatedAt: new Date().toISOString(),
        };
      });

      return changed ? repairedSnippets : current;
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(SNIPPETS_KEY, JSON.stringify(snippets));
  }, [snippets]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Close the mobile topbar menu when clicking outside the whole actions area or pressing Escape.
  useEffect(() => {
    if (!topbarMenuOpen) return undefined;

    const close = (event) => {
      if (topbarActionsRef.current && !topbarActionsRef.current.contains(event.target)) {
        setTopbarMenuOpen(false);
      }
    };
    const closeWithEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setTopbarMenuOpen(false);
      topbarMenuButtonRef.current?.focus();
    };

    document.addEventListener("click", close);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [topbarMenuOpen]);

  // Follow theme changes that arrive from another synced device.
  useEffect(() => {
    const onRemoteSync = () => {
      const saved = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_THEME_KEY);
      if (saved === "light" || saved === "dark") {
        setTheme((current) => (current === saved ? current : saved));
      }
    };
    window.addEventListener("wizard-remote-sync", onRemoteSync);
    return () => window.removeEventListener("wizard-remote-sync", onRemoteSync);
  }, []);

  // Adopt data changes that arrive from another synced device (live sync).
  // pullRemote only applies keys without in-flight local edits, so this can
  // never clobber something the user is typing right now.
  useEffect(() => {
    const readJson = (key, fallback) => {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null || raw === "") return fallback;
        const parsed = JSON.parse(raw);
        return parsed === null || parsed === undefined ? fallback : parsed;
      } catch {
        return fallback;
      }
    };
    const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const onRemoteSync = () => {
      const storedSites = readJson(STORAGE_KEY, null);
      if (Array.isArray(storedSites)) setSites((cur) => (sameJson(cur, storedSites) ? cur : storedSites));

      const storedNotes = readJson(PROJECT_NOTES_KEY, null);
      if (storedNotes && typeof storedNotes === "object" && !Array.isArray(storedNotes)) {
        setProjectNotes((cur) => (sameJson(cur, storedNotes) ? cur : storedNotes));
      }

      const storedTodos = readJson(TODO_ITEMS_KEY, null);
      if (Array.isArray(storedTodos)) {
        const normalized = normalizeTodoItems(storedTodos);
        setTodoItems((cur) => (sameJson(cur, normalized) ? cur : normalized));
      }

      const storedClients = readJson(CLIENTS_KEY, null);
      if (Array.isArray(storedClients)) setClients((cur) => (sameJson(cur, storedClients) ? cur : storedClients));

      const storedSnippets = readJson(SNIPPETS_KEY, null);
      if (Array.isArray(storedSnippets)) setSnippets((cur) => (sameJson(cur, storedSnippets) ? cur : storedSnippets));

      setUnpaidCurrency((cur) => {
        const stored = normalizeCurrency(localStorage.getItem(UNPAID_CURRENCY_KEY));
        return cur === stored ? cur : stored;
      });
      setMoneyVisible((cur) => {
        const stored = localStorage.getItem(MONEY_VISIBILITY_KEY) !== "hidden";
        return cur === stored ? cur : stored;
      });
      setUsdEgpRate((cur) => {
        const savedRate = Number(localStorage.getItem(USD_EGP_RATE_KEY));
        const stored = Number.isFinite(savedRate) && savedRate > 0 ? savedRate : FALLBACK_USD_EGP_RATE;
        return cur === stored ? cur : stored;
      });
    };
    window.addEventListener("wizard-remote-sync", onRemoteSync);
    return () => window.removeEventListener("wizard-remote-sync", onRemoteSync);
  }, []);

  useEffect(() => {
    localStorage.setItem(UNPAID_CURRENCY_KEY, unpaidCurrency);
  }, [unpaidCurrency]);

  useEffect(() => {
    localStorage.setItem(MONEY_VISIBILITY_KEY, moneyVisible ? "visible" : "hidden");
  }, [moneyVisible]);

  useEffect(() => {
    let cancelled = false;

    fetch("https://open.er-api.com/v6/latest/USD")
      .then((response) => {
        if (!response.ok) throw new Error("Currency rate request failed");
        return response.json();
      })
      .then((data) => {
        const nextRate = Number(data?.rates?.EGP);
        if (!Number.isFinite(nextRate) || nextRate <= 0) throw new Error("Currency rate missing");
        if (cancelled) return;
        setUsdEgpRate(nextRate);
        setCurrencyRateStatus("Live rate");
        localStorage.setItem(USD_EGP_RATE_KEY, String(nextRate));
      })
      .catch(() => {
        if (!cancelled) setCurrencyRateStatus("Saved rate");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const unsavedChangesSummary = useMemo(() => {
    const labels = [];
    const hasProjectDraft = showForm && hasProjectFormDraft(form, editId);
    const hasSnippetDraft =
      Boolean(snippetEditId) ||
      Boolean(snippetForm.title.trim()) ||
      Boolean(snippetForm.content.trim()) ||
      (Boolean(snippetForm.category.trim()) && snippetForm.category !== EMPTY_SNIPPET.category);
    const hasClientDraft = showClients && Boolean(clientName.trim());

    if (hasProjectDraft) labels.push(editId ? "Edited project" : "New project");
    if (hasSnippetDraft) labels.push(snippetEditId ? "Edited code snippet" : "New code snippet");
    if (hasClientDraft) labels.push("New client");

    return { hasChanges: labels.length > 0, labels };
  }, [clientName, editId, form, showClients, showForm, snippetEditId, snippetForm]);

  useEffect(() => {
    window.__wizardUnsavedChanges = unsavedChangesSummary;
    return () => {
      window.__wizardUnsavedChanges = { hasChanges: false, labels: [] };
    };
  }, [unsavedChangesSummary]);

  useEffect(() => {
    window.__wizardRequestClose = (summary = window.__wizardUnsavedChanges) => {
      const labels = Array.isArray(summary?.labels) ? summary.labels.filter(Boolean) : [];
      if (!summary?.hasChanges || labels.length === 0) return Promise.resolve("close");

      return new Promise((resolve) => {
        if (closePromptResolverRef.current) closePromptResolverRef.current("cancel");
        closePromptResolverRef.current = resolve;
        setClosePrompt({ labels });
      });
    };

    return () => {
      window.__wizardRequestClose = undefined;
      if (closePromptResolverRef.current) {
        closePromptResolverRef.current("cancel");
        closePromptResolverRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!closePrompt) return undefined;

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      if (closePromptResolverRef.current) closePromptResolverRef.current("cancel");
      closePromptResolverRef.current = null;
      setClosePrompt(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closePrompt]);

  const enrichedSites = useMemo(
    () =>
      sites
        .map((site) => ({
          ...site,
          clientName: clients.find((client) => String(client.id) === String(site.clientId))?.name || "",
          currency: normalizeCurrency(site.currency, site.price),
          priceValue: parsePrice(site.price),
          daysLeft: getDaysLeft(site.deadline),
          progress: getProgress(site.start, site.deadline),
          notesList: getSavedNotes(projectNotes[String(site.id)] || site.notes),
        }))
        .sort((a, b) => a.daysLeft - b.daysLeft),
    [sites, clients, projectNotes]
  );

  const scheduleSearchQuery = search.toLowerCase().trim();
  const searchMatchedSites = enrichedSites.filter((site) => {
    if (!scheduleSearchQuery) return true;
    return `${site.name} ${site.url} ${site.clientName} ${site.price || ""} ${site.paid ? "paid" : "unpaid"} ${site.notesList
      .map((note) => note.text)
      .join(" ")}`
      .toLowerCase()
      .includes(scheduleSearchQuery);
  });
  const noClientResultCount = searchMatchedSites.filter((site) => !site.clientId).length;
  const clientResultCounts = clients.reduce((counts, client) => {
    counts[String(client.id)] = searchMatchedSites.filter((site) => String(site.clientId) === String(client.id)).length;
    return counts;
  }, {});

  const filtered = searchMatchedSites.filter((site) => {
    const matchesClient =
      clientFilter === "all" ||
      (clientFilter === "__none__" ? !site.clientId : String(site.clientId) === String(clientFilter));
    return matchesClient;
  });

  const urgent = enrichedSites.filter((site) => site.daysLeft >= 0 && site.daysLeft <= 4);
  const overdue = enrichedSites.filter((site) => site.daysLeft < 0);
  const unpaidProjects = enrichedSites.filter((site) => !site.paid && site.priceValue > 0);
  const unpaidTotal = unpaidProjects.reduce((sum, site) => sum + convertMoney(site.priceValue, site.currency, unpaidCurrency, usdEgpRate), 0);
  const nextProject = enrichedSites.find((site) => site.daysLeft >= 0);
  const selectedClient = clients.find((client) => String(client.id) === String(form.clientId));
  const selectedClientFilterLabel =
    clientFilter === "all"
      ? "All clients"
      : clientFilter === "__none__"
        ? "No client"
        : clients.find((client) => String(client.id) === String(clientFilter))?.name || "All clients";
  const averageDays =
    enrichedSites.length > 0
      ? Math.round(enrichedSites.reduce((sum, site) => sum + Math.max(site.daysLeft, 0), 0) / enrichedSites.length)
      : 0;
  const snippetCategories = useMemo(
    () => ["All", ...Array.from(new Set(snippets.map((snippet) => snippet.category || "Uncategorized"))).sort()],
    [snippets]
  );
  const snippetEditorCategories = snippetCategories.filter((category) => category !== "All");
  const selectedEditorCategory = snippetEditorCategories.includes(snippetForm.category) ? snippetForm.category : "__new__";
  const filteredSnippets = useMemo(() => {
    const query = snippetSearch.toLowerCase().trim();
    return snippets
      .filter((snippet) => snippetCategory === "All" || (snippet.category || "Uncategorized") === snippetCategory)
      .filter((snippet) => {
        if (!query) return true;
        return `${snippet.title} ${snippet.category} ${snippet.content}`.toLowerCase().includes(query);
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [snippetCategory, snippetSearch, snippets]);
  const selectedSnippet = snippets.find((snippet) => snippet.id === selectedSnippetId) || null;
  const formNotes = getFormNotes(form.notes);
  const todoCategories = ["General", ...Array.from(new Set(todoItems.map((todo) => todo.category || "General"))).filter((category) => category !== "General").sort()];
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;
  const activeTodoCategory = todoCategory === "__new__" ? todoNewCategory.trim() : todoCategory;
  const filteredTodoItems = todoFilter === "all" ? todoItems : todoItems.filter((todo) => (todo.category || "General") === todoFilter);
  const completedTodoCount = filteredTodoItems.filter((todo) => todo.done).length;
  const openTodoCount = filteredTodoItems.length - completedTodoCount;
  const todoCompletionPercent = filteredTodoItems.length > 0 ? Math.round((completedTodoCount / filteredTodoItems.length) * 100) : 0;
  const totalCompletedTodoCount = todoItems.filter((todo) => todo.done).length;
  const todoFilterLabel = todoFilter === "all" ? "All categories" : todoFilter;
  const todoCategoryCounts = todoItems.reduce((counts, todo) => {
    const category = todo.category || "General";
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});

  function resetForm() {
    clearProjectFormDraft();
    const nextForm = createEmptyForm();
    formRef.current = nextForm;
    editIdRef.current = null;
    setForm(nextForm);
    setEditId(null);
    setClientMenuOpen(false);
  }

  function openCreateForm() {
    resetForm();
    showFormRef.current = true;
    setShowForm(true);
  }

  function handleAddClient() {
    const name = clientName.trim();
    if (!name) return;
    setClients((current) => [...current, { id: Date.now(), name }]);
    setClientName("");
  }

  function handleDeleteClient(clientId) {
    setClients((current) => current.filter((client) => client.id !== clientId));
    commitSites((current) => current.map((site) => (String(site.clientId) === String(clientId) ? { ...site, clientId: "" } : site)));
    setForm((current) => (String(current.clientId) === String(clientId) ? { ...current, clientId: "" } : current));
    setClientFilter((current) => (String(current) === String(clientId) ? "all" : current));
  }

  function handleAddTodo() {
    const text = todoDraft.trim();
    const category = activeTodoCategory || "General";
    if (!text) return;
    setTodoItems((current) => [...current, createTodoItem(text, category, newTodoDueAt)]);
    setTodoDraft("");
    setNewTodoDueAt("");
    if (todoCategory === "__new__") {
      setTodoCategory(category);
      setTodoNewCategory("");
    }
    setTodoFilter("all");
  }

  function startEditingTodo(todo) {
    setTodoEditId(todo.id);
    setTodoEditText(todo.text);
  }

  function saveEditingTodo() {
    if (!todoEditId) return;
    const text = todoEditText.trim();
    if (!text) {
      handleDeleteTodo(todoEditId);
    } else {
      handleTodoChange(todoEditId, { text });
    }
    setTodoEditId(null);
    setTodoEditText("");
  }

  function handleTodoChange(todoId, updates) {
    setTodoItems((current) => current.map((todo) => (todo.id === todoId ? { ...todo, ...updates } : todo)));
  }

  function handleDeleteTodo(todoId) {
    setTodoItems((current) => current.filter((todo) => todo.id !== todoId));
    if (todoEditId === todoId) {
      setTodoEditId(null);
      setTodoEditText("");
    }
  }

  function openTodoDue(todo) {
    const initial = todo.dueAt ? new Date(todo.dueAt) : new Date();
    setTodoDueId(todo.id);
    setTodoDueText(todo.text);
    setTodoDueDraft(toLocalInputValue(initial));
    setDueViewMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    setDueTimeMenu(null);
  }

  // Sentinel id used while picking a reminder for the item being typed.
  const NEW_TODO_DUE_ID = "__new__";

  function openNewTodoDue() {
    const initial = newTodoDueAt ? new Date(newTodoDueAt) : new Date();
    setTodoDueId(NEW_TODO_DUE_ID);
    setTodoDueText(todoDraft.trim() || "New to-do item");
    setTodoDueDraft(toLocalInputValue(initial));
    setDueViewMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    setDueTimeMenu(null);
  }

  function closeTodoDue() {
    setTodoDueId(null);
    setTodoDueText("");
    setTodoDueDraft("");
    setDueTimeMenu(null);
  }

  function saveTodoDue() {
    if (!todoDueId || !todoDueDraft) return;
    const due = new Date(todoDueDraft);
    if (Number.isNaN(due.getTime())) return;
    if (todoDueId === NEW_TODO_DUE_ID) {
      setNewTodoDueAt(due.toISOString());
    } else {
      handleTodoChange(todoDueId, { dueAt: due.toISOString() });
    }
    // Natural moment to ask for notification permission (first deadline only).
    if (!isElectron() && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    closeTodoDue();
  }

  function removeTodoDue() {
    if (todoDueId === NEW_TODO_DUE_ID) {
      setNewTodoDueAt("");
    } else if (todoDueId) {
      handleTodoChange(todoDueId, { dueAt: "" });
    }
    closeTodoDue();
  }

  function applyDuePreset(kind) {
    const date = new Date();
    if (kind === "hour") {
      date.setHours(date.getHours() + 1, 0, 0, 0);
    } else if (kind === "tonight") {
      date.setHours(21, 0, 0, 0);
      if (date <= new Date()) date.setDate(date.getDate() + 1);
    } else {
      date.setDate(date.getDate() + 1);
      date.setHours(9, 0, 0, 0);
    }
    setTodoDueDraft(toLocalInputValue(date));
    setDueViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setDueTimeMenu(null);
  }

  // ----- custom due-date picker -----

  const dueSelected = todoDueDraft && !Number.isNaN(new Date(todoDueDraft).getTime()) ? new Date(todoDueDraft) : null;
  const dueViewYear = dueViewMonth.getFullYear();
  const dueViewMonthIndex = dueViewMonth.getMonth();
  const dueCells = (() => {
    const firstWeekday = new Date(dueViewYear, dueViewMonthIndex, 1).getDay();
    const daysInMonth = new Date(dueViewYear, dueViewMonthIndex + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
    return cells;
  })();
  const dueHour12 = dueSelected ? (dueSelected.getHours() % 12 || 12) : 12;
  const dueAmPm = dueSelected && dueSelected.getHours() >= 12 ? "PM" : "AM";
  const dueMinuteOptions = (() => {
    const options = [];
    for (let minute = 0; minute < 60; minute += 5) options.push(minute);
    const current = dueSelected ? dueSelected.getMinutes() : 0;
    if (!options.includes(current)) {
      options.push(current);
      options.sort((a, b) => a - b);
    }
    return options;
  })();

  function setDueParts(parts) {
    const base = dueSelected || new Date();
    const next = new Date(
      parts.year ?? base.getFullYear(),
      parts.month ?? base.getMonth(),
      parts.day ?? base.getDate(),
      parts.hour ?? base.getHours(),
      parts.minute ?? base.getMinutes(),
      0,
      0,
    );
    setTodoDueDraft(toLocalInputValue(next));
  }

  function shiftDueViewMonth(delta) {
    setDueViewMonth(new Date(dueViewYear, dueViewMonthIndex + delta, 1));
    setDueTimeMenu(null);
  }

  function selectDueDay(day) {
    setDueParts({ year: dueViewYear, month: dueViewMonthIndex, day });
    setDueTimeMenu(null);
  }

  function selectDueHour(hour12) {
    setDueParts({ hour: (hour12 % 12) + (dueAmPm === "PM" ? 12 : 0) });
    setDueTimeMenu(null);
  }

  function selectDueMinute(minute) {
    setDueParts({ minute });
    setDueTimeMenu(null);
  }

  function selectDueAmPm(ampm) {
    setDueParts({ hour: (dueHour12 % 12) + (ampm === "PM" ? 12 : 0) });
    setDueTimeMenu(null);
  }

  async function markAllNotificationsRead() {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    await apiFetch("/api/notifications/read", { method: "POST" }).catch(() => {});
  }

  async function deleteNotificationById(id) {
    setNotifications((current) => current.filter((item) => item.id !== id));
    await apiFetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }

  async function clearAllNotifications() {
    setNotifications([]);
    await apiFetch("/api/notifications", { method: "DELETE" }).catch(() => {});
  }

  // Temporary helper for trying the reminder pipeline end to end: asks the
  // server to record a test notification, then shows it locally right away.
  async function sendTestNotification() {
    if (!isElectron() && typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {}
    }
    try {
      const data = await apiFetch("/api/notifications/test", { method: "POST" });
      const notification = data?.notification;
      if (!notification?.id) return;
      setNotifications((current) => (current.some((item) => item.id === notification.id) ? current : [notification, ...current]));
      showSystemNotification(notification);
    } catch {}
  }

  function reorderTodoItem(todoId, targetTodoId) {
    if (!todoId || !targetTodoId || todoId === targetTodoId) return;

    setTodoItems((current) => {
      const sourceIndex = current.findIndex((todo) => todo.id === todoId);
      const targetIndex = current.findIndex((todo) => todo.id === targetTodoId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;

      const nextTodos = [...current];
      const [movedTodo] = nextTodos.splice(sourceIndex, 1);
      nextTodos.splice(targetIndex, 0, movedTodo);
      return nextTodos;
    });
  }

  function handleTodoDragStart(event, todoId) {
    setDraggingTodoId(todoId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", todoId);

    const dragPreview = document.createElement("span");
    dragPreview.style.position = "fixed";
    dragPreview.style.top = "-1000px";
    dragPreview.style.left = "-1000px";
    dragPreview.style.width = "1px";
    dragPreview.style.height = "1px";
    dragPreview.style.opacity = "0";
    dragPreview.style.pointerEvents = "none";
    document.body.appendChild(dragPreview);
    event.dataTransfer.setDragImage(dragPreview, 0, 0);
    window.setTimeout(() => document.body.removeChild(dragPreview), 0);
  }

  function handleTodoDragOver(event, targetTodoId) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (draggingTodoId && draggingTodoId !== targetTodoId) reorderTodoItem(draggingTodoId, targetTodoId);
  }

  function handleTodoDrop(event) {
    event.preventDefault();
    setDraggingTodoId(null);
  }

  function handleDeleteTodoCategory() {
    if (todoFilter === "all" || todoFilter === "General") {
      // No specific category selected: clear the checked items instead so the
      // trash always has a working action.
      setTodoItems((current) => current.filter((todo) => !todo.done));
      return;
    }

    const deletedCategory = todoFilter;
    setTodoItems((current) => current.filter((todo) => (todo.category || "General") !== deletedCategory));
    if (todoCategory === deletedCategory) setTodoCategory("General");
    setTodoFilter("all");
  }

  function handlePriceChange(value) {
    const detectedCurrency = detectPriceCurrency(value);
    setForm((current) => ({ ...current, price: value, ...(detectedCurrency ? { currency: detectedCurrency } : {}) }));
  }

  function handleDaysChange(days, nextStart = form.start) {
    const normalizedStart = normalizeDateInput(nextStart);
    const numDays = parseInt(days, 10);
    if (normalizedStart && isValidDate(normalizedStart) && !Number.isNaN(numDays) && numDays > 0) {
      const deadlineDate = parseDate(normalizedStart);
      deadlineDate.setDate(deadlineDate.getDate() + numDays);
      setForm((current) => ({
        ...current,
        start: normalizedStart,
        deadlineDays: days,
        deadline: formatDate(deadlineDate),
      }));
      return;
    }

    setForm((current) => ({ ...current, start: normalizedStart, deadlineDays: days, deadline: "" }));
  }

  function commitSites(nextSitesOrUpdater) {
    const nextSites = typeof nextSitesOrUpdater === "function" ? nextSitesOrUpdater(sitesRef.current) : nextSitesOrUpdater;
    sitesRef.current = nextSites;
    setSites(nextSites);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSites));
  }

  function commitProjectNotes(nextNotesOrUpdater) {
    const nextNotes = typeof nextNotesOrUpdater === "function" ? nextNotesOrUpdater(projectNotesRef.current) : nextNotesOrUpdater;
    projectNotesRef.current = nextNotes;
    setProjectNotes(nextNotes);
    saveProjectNotesStore(nextNotes);
  }

  function storeProjectNotes(projectId, notes) {
    const savedNotes = getSavedNotes(notes);
    const key = String(projectId);

    commitProjectNotes((current) => {
      const next = { ...current };
      if (savedNotes.length > 0) {
        next[key] = savedNotes;
      } else {
        delete next[key];
      }
      return next;
    });

    return savedNotes;
  }

  function persistEditedProjectNotes(notes) {
    const currentEditId = editIdRef.current;
    if (!currentEditId) return;

    const savedNotes = storeProjectNotes(currentEditId, notes);
    commitSites((current) => current.map((site) => (site.id === currentEditId ? { ...site, notes: savedNotes } : site)));
  }

  function updateProjectNotes(nextNotes) {
    const currentForm = formRef.current;
    const nextForm = { ...currentForm, notes: nextNotes };
    formRef.current = nextForm;
    setForm(nextForm);
    if (showFormRef.current && hasProjectFormDraft(nextForm, editIdRef.current)) saveProjectFormDraft(nextForm, editIdRef.current);
    persistEditedProjectNotes(nextNotes);
  }

  function handleAddNote() {
    updateProjectNotes([...getFormNotes(formRef.current.notes), createBlankNote()]);
  }

  function handleNoteChange(noteId, updates) {
    updateProjectNotes(getFormNotes(formRef.current.notes).map((note) => (note.id === noteId ? { ...note, ...updates } : note)));
  }

  function handleDeleteNote(noteId) {
    const nextNotes = getFormNotes(formRef.current.notes).filter((note) => note.id !== noteId);
    updateProjectNotes(nextNotes.length > 0 ? nextNotes : [createBlankNote()]);
  }

  function reorderProjectNote(noteId, targetIndex) {
    const notes = getFormNotes(formRef.current.notes);
    const sourceIndex = notes.findIndex((note) => note.id === noteId);
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= notes.length || sourceIndex === targetIndex) return;

    const nextNotes = [...notes];
    const [movedNote] = nextNotes.splice(sourceIndex, 1);
    nextNotes.splice(targetIndex, 0, movedNote);
    updateProjectNotes(nextNotes);
  }

  function handleNoteDragStart(event, noteId) {
    setDraggingNoteId(noteId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", noteId);
  }

  function handleNoteDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleNoteDrop(event, targetNoteId) {
    event.preventDefault();
    const sourceNoteId = draggingNoteId || event.dataTransfer.getData("text/plain");
    const targetIndex = getFormNotes(formRef.current.notes).findIndex((note) => note.id === targetNoteId);
    reorderProjectNote(sourceNoteId, targetIndex);
    setDraggingNoteId(null);
  }

  function handleNoteMoveKeyDown(event, noteId) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

    event.preventDefault();
    const notes = getFormNotes(formRef.current.notes);
    const sourceIndex = notes.findIndex((note) => note.id === noteId);
    reorderProjectNote(noteId, sourceIndex + (event.key === "ArrowUp" ? -1 : 1));
  }

  function getProjectPayload() {
    const currentForm = formRef.current;
    if (!currentForm.name.trim() || !isValidDate(currentForm.start) || !isValidDate(currentForm.deadline)) return null;

    return {
      ...currentForm,
      name: currentForm.name.trim(),
      url: currentForm.url.trim(),
      clientId: currentForm.clientId,
      price: currentForm.price.trim(),
      currency: normalizeCurrency(currentForm.currency, currentForm.price),
      paid: Boolean(currentForm.paid),
      notes: getSavedNotes(currentForm.notes),
    };
  }

  function saveProjectForm() {
    const payload = getProjectPayload();
    if (!payload) return false;

    const currentEditId = editIdRef.current;
    const projectId = currentEditId || Date.now();
    const savedNotes = storeProjectNotes(projectId, payload.notes);
    const savedPayload = { ...payload, notes: savedNotes };
    const newSite = currentEditId ? null : { ...savedPayload, id: projectId };
    commitSites((current) => (currentEditId ? current.map((site) => (site.id === currentEditId ? { ...site, ...savedPayload } : site)) : [...current, newSite]));
    clearProjectFormDraft();
    resetForm();
    setShowForm(false);
    return true;
  }

  function saveSnippetForm() {
    const title = snippetForm.title.trim();
    if (!title || !snippetForm.content.trim()) return false;

    const now = new Date().toISOString();
    const payload = {
      title,
      category: snippetForm.category.trim() || "Uncategorized",
      content: snippetForm.content,
      updatedAt: now,
    };
    const id = snippetEditId || `snippet-${Date.now()}`;
    const nextSnippets = snippetEditId
      ? snippets.map((snippet) => (snippet.id === snippetEditId ? { ...snippet, ...payload } : snippet))
      : [...snippets, { ...payload, id, createdAt: now }];

    setSnippets(nextSnippets);
    localStorage.setItem(SNIPPETS_KEY, JSON.stringify(nextSnippets));
    setSelectedSnippetId(id);
    resetSnippetForm();
    return true;
  }

  function saveClientDraft() {
    const name = clientName.trim();
    if (!name) return true;

    const nextClients = [...clients, { id: Date.now(), name }];
    setClients(nextClients);
    localStorage.setItem(CLIENTS_KEY, JSON.stringify(nextClients));
    setClientName("");
    return true;
  }

  function savePendingChangesBeforeClose() {
    const errors = [];
    const hasProjectDraft = showForm && hasProjectFormDraft(form, editId);
    const hasSnippetDraft =
      Boolean(snippetEditId) ||
      Boolean(snippetForm.title.trim()) ||
      Boolean(snippetForm.content.trim()) ||
      (Boolean(snippetForm.category.trim()) && snippetForm.category !== EMPTY_SNIPPET.category);

    if (hasProjectDraft && !saveProjectForm()) errors.push("Project needs a name, valid start date, and valid deadline before it can be saved.");
    if (hasSnippetDraft && !saveSnippetForm()) errors.push("Code snippet needs a title and content before it can be saved.");
    if (showClients) saveClientDraft();

    if (errors.length > 0) {
      setClosePrompt((current) => (current ? { ...current, error: errors.join(" ") } : current));
      return false;
    }

    return true;
  }

  function handleSaveAndClose() {
    if (savePendingChangesBeforeClose()) resolveClosePrompt("close");
  }

  function resolveClosePrompt(action) {
    if (closePromptResolverRef.current) closePromptResolverRef.current(action);
    closePromptResolverRef.current = null;
    setClosePrompt(null);
  }

  function handleSavedNoteDoneChange(siteId, noteId, done) {
    const site = sitesRef.current.find((item) => item.id === siteId);
    const savedNotes = getSavedNotes(projectNotesRef.current[String(siteId)] || site?.notes).map((note) =>
      note.id === noteId ? { ...note, done } : note
    );

    storeProjectNotes(siteId, savedNotes);
    commitSites((current) => current.map((item) => (item.id === siteId ? { ...item, notes: savedNotes } : item)));
  }

  function handleDeleteSite(siteId) {
    commitSites((current) => current.filter((item) => item.id !== siteId));
    commitProjectNotes((current) => {
      const next = { ...current };
      delete next[String(siteId)];
      return next;
    });
  }

  function handleSave() {
    saveProjectForm();
  }

  function handleEdit(site) {
    const nextForm = {
      name: site.name,
      url: site.url || "",
      clientId: site.clientId || "",
      price: site.price || "",
      currency: normalizeCurrency(site.currency, site.price),
      paid: Boolean(site.paid),
      start: site.start,
      deadlineDays: site.deadlineDays || "",
      deadline: site.deadline,
      notes: getFormNotes(projectNotesRef.current[String(site.id)] || site.notes),
    };

    formRef.current = nextForm;
    editIdRef.current = site.id;
    showFormRef.current = true;
    setForm(nextForm);
    setEditId(site.id);
    setShowForm(true);
  }

  function closeForm() {
    showFormRef.current = false;
    setShowForm(false);
    setClientMenuOpen(false);
    resetForm();
  }

  function resetSnippetForm() {
    setSnippetForm(EMPTY_SNIPPET);
    setSnippetEditId(null);
    setSnippetCategoryMenuOpen(false);
  }

  function handleEditSnippet(snippet) {
    setSnippetForm({
      title: snippet.title || "",
      category: snippet.category || "WooCommerce",
      content: snippet.content || "",
    });
    setSnippetEditId(snippet.id);
    setSelectedSnippetId(snippet.id);
    setSnippetCategoryMenuOpen(false);
  }

  function handleSaveSnippet() {
    const title = snippetForm.title.trim();
    if (!title || !snippetForm.content.trim()) return;
    const now = new Date().toISOString();
    const payload = {
      title,
      category: snippetForm.category.trim() || "Uncategorized",
      content: snippetForm.content,
      updatedAt: now,
    };

    if (snippetEditId) {
      setSnippets((current) => current.map((snippet) => (snippet.id === snippetEditId ? { ...snippet, ...payload } : snippet)));
      setSelectedSnippetId(snippetEditId);
    } else {
      const id = `snippet-${Date.now()}`;
      const nextSnippet = { ...payload, id, createdAt: now };
      setSnippets((current) => [...current, nextSnippet]);
      setSelectedSnippetId(id);
    }

    resetSnippetForm();
  }

  function handleSnippetEditorScroll(event) {
    if (snippetEditorGutterRef.current) {
      snippetEditorGutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  function handleDeleteSnippet(snippetId) {
    setSnippets((current) => current.filter((snippet) => snippet.id !== snippetId));
    if (selectedSnippetId === snippetId) {
      const next = snippets.find((snippet) => snippet.id !== snippetId);
      setSelectedSnippetId(next?.id || null);
    }
    if (snippetEditId === snippetId) resetSnippetForm();
  }

  async function handleCopySnippet(snippet) {
    if (!snippet) return;
    try {
      let clipboardOk = false;
      try { clipboardOk = navigator.clipboard?.writeText != null; } catch {}
      if (clipboardOk) {
        await navigator.clipboard.writeText(snippet.content || "");
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = snippet.content || "";
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyState(`Copied ${snippet.title}`);
    } catch {
      setCopyState("Copy failed");
    }
    window.setTimeout(() => setCopyState(""), 1800);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportSnippets(scope) {
    const source = scope === "selected" && selectedSnippet ? [selectedSnippet] : snippets;
    const files = source.map((snippet) => ({
      name: snippetFileName(snippet),
      content: snippet.content || "",
    }));
    const blob = createZip(files);
    downloadBlob(blob, scope === "selected" ? `${selectedSnippet.title}.zip` : "wizard-schedule-snippets.zip");
  }

  function updateImapShared(side, field, value) {
    const setter = side === "source" ? setImapSourceShared : setImapTargetShared;
    setter((current) => ({ ...current, [field]: value }));
  }

  function updateImapAccount(side, index, field, value) {
    const setter = side === "source" ? setImapSourceAccounts : setImapTargetAccounts;
    setter((current) => current.map((acc, i) => (i === index ? { ...acc, [field]: value } : acc)));
  }

  function addImapAccountPair() {
    setImapSourceAccounts((current) => [...current, { ...EMPTY_IMAP_ACCOUNT }]);
    setImapTargetAccounts((current) => [...current, { ...EMPTY_IMAP_ACCOUNT }]);
  }

  function removeImapAccountPair(index) {
    setImapSourceAccounts((current) => current.filter((_, i) => i !== index));
    setImapTargetAccounts((current) => current.filter((_, i) => i !== index));
  }

  function addImapLog(update) {
    setImapLogs((current) => [{ at: new Date().toISOString(), level: "info", ...update }, ...current].slice(0, 240));
  }

  async function handleTestImap(side, index) {
    const shared = side === "source" ? imapSourceShared : imapTargetShared;
    const accounts = side === "source" ? imapSourceAccounts : imapTargetAccounts;
    const account = { ...shared, ...accounts[index] };

    if (!window.wizardImap?.testConnection) {
      addImapLog({ level: "error", message: "Email migration is only available in the desktop app." });
      return;
    }

    const testKey = `${side}-${index}`;
    setImapTesting(testKey);
    addImapLog({ level: "info", message: `Testing ${side} account #${index + 1}.` });

    try {
      const result = await window.wizardImap.testConnection(account);
      addImapLog({ level: "success", message: `Connection OK. ${result.folders} folders visible.` });
    } catch (error) {
      addImapLog({ level: "error", message: error?.message || "Connection failed." });
    } finally {
      setImapTesting("");
    }
  }

  async function handleStartImapMigration() {
    if (!window.wizardImap?.startMigration) {
      addImapLog({ level: "error", message: "Email migration is only available in the desktop app." });
      return;
    }

    const pairs = imapSourceAccounts.map((acc, i) => ({
      source: { ...imapSourceShared, ...acc },
      target: { ...imapTargetShared, ...(imapTargetAccounts[i] || { ...EMPTY_IMAP_ACCOUNT }) },
    }));

    setImapMigrating(true);
    setImapPaused(false);
    setImapSummary(null);
    setImapLogs([]);

    const stopListening = window.wizardImap.onProgress((update) => {
      addImapLog(update);
      if (update.summary) setImapSummary(update.summary);
      if (update.type === "paused") setImapPaused(true);
      if (update.type === "resumed" || update.type === "cancelled") setImapPaused(false);
    });

    try {
      const result = await window.wizardImap.startMigration({ pairs, dateFrom: imapDateFrom, dateTo: imapDateTo });
      if (result?.ok) {
        addImapLog({ level: "success", message: "Migration completed. Check the destination mailbox before changing MX records." });
      }
      if (result?.summary) setImapSummary(result.summary);
    } catch (error) {
      addImapLog({ level: "error", message: error?.message || "Migration failed." });
    } finally {
      stopListening?.();
      setImapMigrating(false);
      setImapPaused(false);
    }
  }

  function handlePauseImapMigration() {
    window.wizardImap?.pauseMigration();
  }

  function handleResumeImapMigration() {
    window.wizardImap?.resumeMigration();
  }

  function handleCancelImapMigration() {
    window.wizardImap?.cancelMigration();
  }

  async function handleExportBackup() {
    if (!window.wizardImap?.exportBackup) {
      addImapLog({ level: "error", message: "Email backup is only available in the desktop app." });
      return;
    }
    const pairs = imapSourceAccounts.map((acc) => ({ source: { ...imapSourceShared, ...acc } }));
    if (!pairs.length) {
      addImapLog({ level: "error", message: "No source accounts configured." });
      return;
    }
    setImapMigrating(true);
    setImapPaused(false);
    setImapSummary(null);
    setImapLogs([]);
    const stopListening = window.wizardImap.onProgress((update) => {
      addImapLog(update);
      if (update.summary) setImapSummary(update.summary);
      if (update.type === "paused") setImapPaused(true);
      if (update.type === "resumed" || update.type === "cancelled") setImapPaused(false);
    });
    try {
      const result = await window.wizardImap.exportBackup({ pairs, dateFrom: imapDateFrom, dateTo: imapDateTo });
      if (result?.ok) addImapLog({ level: "success", message: `Backup saved. ${result.total} messages exported.` });
    } catch (error) {
      addImapLog({ level: "error", message: error?.message || "Backup failed." });
    } finally {
      stopListening?.();
      setImapMigrating(false);
      setImapPaused(false);
    }
  }

  async function handleImportBackup() {
    if (!window.wizardImap?.importBackup) {
      addImapLog({ level: "error", message: "Email restore is only available in the desktop app." });
      return;
    }
    const pairs = imapTargetAccounts.map((acc) => ({ target: { ...imapTargetShared, ...acc } }));
    if (!pairs.length) {
      addImapLog({ level: "error", message: "No target accounts configured." });
      return;
    }
    setImapMigrating(true);
    setImapPaused(false);
    setImapSummary(null);
    setImapLogs([]);
    const stopListening = window.wizardImap.onProgress((update) => {
      addImapLog(update);
      if (update.summary) setImapSummary(update.summary);
      if (update.type === "paused") setImapPaused(true);
      if (update.type === "resumed" || update.type === "cancelled") setImapPaused(false);
    });
    try {
      const result = await window.wizardImap.importBackup({ pairs, dateFrom: imapDateFrom, dateTo: imapDateTo });
      if (result?.ok) addImapLog({ level: "success", message: `Restore complete. ${result.total} messages imported.` });
    } catch (error) {
      addImapLog({ level: "error", message: error?.message || "Restore failed." });
    } finally {
      stopListening?.();
      setImapMigrating(false);
      setImapPaused(false);
    }
  }

  function describeBackup(data) {
    const parts = [];
    try { const v = JSON.parse(data[STORAGE_KEY] || "[]"); if (v.length) parts.push(`${v.length} project${v.length > 1 ? "s" : ""}`); } catch {}
    try { const v = JSON.parse(data[CLIENTS_KEY] || "[]"); if (v.length) parts.push(`${v.length} client${v.length > 1 ? "s" : ""}`); } catch {}
    try { const v = JSON.parse(data[TODO_ITEMS_KEY] || "[]"); if (v.length) parts.push(`${v.length} to-do item${v.length > 1 ? "s" : ""}`); } catch {}
    try { const v = JSON.parse(data[SNIPPETS_KEY] || "[]"); if (v.length) parts.push(`${v.length} snippet${v.length > 1 ? "s" : ""}`); } catch {}
    try { const v = JSON.parse(data[PROJECT_NOTES_KEY] || "{}"); const c = Object.keys(v).length; if (c) parts.push(`${c} project note${c > 1 ? "s" : ""}`); } catch {}
    return parts.length ? parts.join(", ") : "empty backup";
  }

  async function handleBackup() {
    if (!window.wizardApp?.backup) {
      setBackupMessage({ type: "error", title: "Desktop only", message: "Backup is only available in the desktop app." });
      return;
    }

    const keysToBackup = [
      STORAGE_KEY, LEGACY_STORAGE_KEY, CLIENTS_KEY, PROJECT_NOTES_KEY, TODO_ITEMS_KEY,
      SNIPPETS_KEY, THEME_KEY, LEGACY_THEME_KEY, UNPAID_CURRENCY_KEY,
      MONEY_VISIBILITY_KEY, USD_EGP_RATE_KEY, PROJECT_FORM_DRAFT_KEY,
    ];

    const backupData = {};
    for (const key of keysToBackup) {
      const value = localStorage.getItem(key);
      if (value !== null) backupData[key] = value;
    }

    try {
      const result = await window.wizardApp.backup(JSON.stringify(backupData, null, 2));
      if (result?.ok) setBackupMessage({ type: "success", title: "Backup saved", message: `${describeBackup(backupData)} backed up.`, path: result.path });
    } catch (error) {
      if (error?.message !== "Backup cancelled.") {
        setBackupMessage({ type: "error", title: "Backup failed", message: error?.message || "Unknown error" });
      }
    }
  }

  async function handleRestore() {
    if (!window.wizardApp?.restore) {
      setBackupMessage({ type: "error", title: "Desktop only", message: "Restore is only available in the desktop app." });
      return;
    }

    try {
      const result = await window.wizardApp.restore();
      if (!result?.ok || !result.data) return;

      const backupData = JSON.parse(result.data);
      for (const [key, value] of Object.entries(backupData)) {
        localStorage.setItem(key, value);
      }

      setBackupMessage({ type: "success", title: "Restore complete", message: `${describeBackup(backupData)} restored.`, path: result.path, reload: true });
    } catch (error) {
      if (error?.message !== "Restore cancelled.") {
        setBackupMessage({ type: "error", title: "Restore failed", message: error?.message || "Unknown error" });
      }
    }
  }

  return (
    <main className={`app app-${theme}`}>
      <PtrIndicator pull={ptr.pull} refreshing={ptr.refreshing} returning={ptr.returning} />
      <div className="ambient-stars" aria-hidden="true">
        <span className="ambient-star ambient-star-1" />
        <span className="ambient-star ambient-star-2" />
        <span className="ambient-star ambient-star-3" />
        <span className="ambient-star ambient-star-4" />
        <span className="ambient-star ambient-star-5" />
        <span className="ambient-star ambient-star-6" />
        <span className="ambient-star ambient-star-7" />
        <span className="ambient-star ambient-star-8" />
        <span className="ambient-star ambient-star-9" />
        <span className="ambient-star ambient-star-10" />
        <span className="ambient-star ambient-star-11" />
        <span className="ambient-star ambient-star-12" />
        <span className="ambient-star ambient-star-13" />
        <span className="ambient-star ambient-star-14" />
      </div>

      <div className="window-titlebar" aria-hidden="true">
        <img src="./wizard-schedules-transparent.ico" alt="" />
        <span>{APP_NAME}</span>
      </div>

      <div className="app-scroll" ref={appScrollRef}>
      <header className="topbar">
        <div className="brand-lockup">
          <img src={`${process.env.PUBLIC_URL}/wizard-schedules-logo.png`} alt="" />
          <div>
            <p className="eyebrow">Project command center</p>
            <h1><BrandName /></h1>
          </div>
        </div>

        <div className="topbar-actions" ref={topbarActionsRef}>
          <button
            className="topbar-menu-button"
            ref={topbarMenuButtonRef}
            type="button"
            aria-label="Open menu"
            aria-expanded={topbarMenuOpen}
            aria-controls={TOPBAR_MENU_ID}
            aria-haspopup="true"
            onClick={(event) => {
              // Keep this click from reaching the outside-click closer below.
              event.stopPropagation();
              setTopbarMenuOpen((open) => !open);
            }}
          >
            <svg className="topbar-menu-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </svg>
          </button>
          <div id={TOPBAR_MENU_ID} className={`topbar-menu${topbarMenuOpen ? " topbar-menu-open" : ""}`} onClick={(event) => event.stopPropagation()}>
            <button className="icon-action topbar-settings-action" type="button" aria-label="Settings" title="Settings" onClick={() => { setTopbarMenuOpen(false); setActiveTab((current) => (current === "settings" ? "schedule" : "settings")); }}>
              <svg className="topbar-settings-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span className="topbar-settings-label">Settings</span>
            </button>
            <div className="topbar-theme-row">
              <ThemeToggle theme={theme} onToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))} />
            </div>
            <button className="secondary-action" type="button" onClick={() => { setTopbarMenuOpen(false); setShowClients(true); }}>
              Clients
            </button>
          </div>
          <button className="icon-action topbar-bell-action" type="button" aria-label={`Notifications${unreadNotificationCount ? ` (${unreadNotificationCount} unread)` : ""}`} title="Notifications" onClick={() => setNotificationsOpen(true)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            {unreadNotificationCount > 0 && <span className="bell-badge">{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</span>}
          </button>
          <button className="primary-action" type="button" onClick={openCreateForm}>
            Add Project
          </button>
        </div>
      </header>

      {!isElectron() && notifPermission === "default" && !notifPromptDismissed && (
        <div className="notif-enable-banner" role="status">
          <span>Turn on notifications to get reminder alerts on this device.</span>
          <button className="primary-action" type="button" onClick={enableNotifications}>
            Enable
          </button>
          <button
            className="icon-action"
            type="button"
            aria-label="Dismiss notification prompt"
            title="Dismiss"
            onClick={() => {
              setNotifPromptDismissed(true);
              try {
                localStorage.setItem(NOTIF_PROMPT_DISMISSED_KEY, "1");
              } catch {}
            }}
          >
            X
          </button>
        </div>
      )}

      <nav className="app-tabs" aria-label="Main sections">
        <button className={activeTab === "schedule" ? "tab-button tab-button-active" : "tab-button"} type="button" onClick={() => setActiveTab("schedule")}>
          Schedule
        </button>
        <button className={activeTab === "snippets" ? "tab-button tab-button-active" : "tab-button"} type="button" onClick={() => setActiveTab("snippets")}>
          Snippets
        </button>
        <button className={activeTab === "email" ? "tab-button tab-button-active" : "tab-button"} type="button" onClick={() => setActiveTab("email")}>
          Email Migration
        </button>
        <button className={activeTab === "todos" ? "tab-button tab-button-active" : "tab-button"} type="button" onClick={() => setActiveTab("todos")}>
          To-Do
        </button>
      </nav>

      {activeTab === "schedule" ? (
      <>
      <section className="bento-grid" aria-label="Project overview">
        <article className="bento-card bento-card-large overview-card">
          <div>
            <p className="card-kicker">Next deadline</p>
            <h2>{nextProject ? nextProject.name : "No active deadlines"}</h2>
            <p className="muted">
              {nextProject
                ? `${nextProject.daysLeft === 0 ? "Due today" : `${nextProject.daysLeft} days remaining`} - ${nextProject.deadline}`
                : "Add a project to start tracking delivery dates."}
            </p>
          </div>
          <div
            className="overview-meter"
            aria-hidden="true"
            style={{ "--meter": `${nextProject ? nextProject.progress * 3.6 : 0}deg` }}
          >
            <span>{nextProject ? Math.round(nextProject.progress) : 0}%</span>
          </div>
        </article>

        <article className="bento-card bento-card-large unpaid-card">
          <div className="unpaid-card-head">
            <div>
              <p className="card-kicker">Unpaid projects</p>
              <h2>{moneyVisible ? formatMoney(unpaidTotal, unpaidCurrency) : maskMoney(unpaidCurrency)}</h2>
              <small>{currencyRateStatus}: 1 USD = {formatMoney(usdEgpRate, "EGP")}</small>
            </div>
            <div className="unpaid-card-tools">
              <div className="currency-toggle" role="group" aria-label="Unpaid total currency">
                {Object.values(CURRENCIES).map((currency) => (
                  <button
                    className={unpaidCurrency === currency.code ? "currency-toggle-button currency-toggle-active" : "currency-toggle-button"}
                    type="button"
                    key={currency.code}
                    onClick={() => setUnpaidCurrency(currency.code)}
                  >
                    <span className="currency-toggle-label">{currency.label}</span>
                  </button>
                ))}
              </div>
              <button
                className="money-visibility-toggle"
                type="button"
                aria-label={moneyVisible ? "Hide unpaid project amounts" : "Show unpaid project amounts"}
                aria-pressed={!moneyVisible}
                onClick={() => setMoneyVisible((visible) => !visible)}
              >
                <svg className="eye-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                  <circle cx="12" cy="12" r="2.6" />
                  {!moneyVisible ? <path className="eye-slash" d="M4.5 4.5 19.5 19.5" /> : null}
                </svg>
              </button>
              <span>{unpaidProjects.length} open</span>
            </div>
          </div>

          <div className="unpaid-list">
            {unpaidProjects.length === 0 ? (
              <p className="muted">No unpaid project prices yet.</p>
            ) : (
              unpaidProjects.map((site) => (
                <div className="unpaid-row" key={site.id}>
                  <span>
                    <strong>{site.name}</strong>
                    {site.clientName ? <small>{site.clientName}</small> : null}
                  </span>
                  <b>{moneyVisible ? formatMoney(convertMoney(site.priceValue, site.currency, unpaidCurrency, usdEgpRate), unpaidCurrency) : maskMoney(unpaidCurrency)}</b>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="bento-card metric-card">
          <p className="card-kicker">Projects</p>
          <strong>{sites.length}</strong>
          <span>Total tracked</span>
        </article>

        <article className="bento-card metric-card">
          <p className="card-kicker">Urgent</p>
          <strong>{urgent.length}</strong>
          <span>Due within 4 days</span>
        </article>

        <article className="bento-card metric-card">
          <p className="card-kicker">Overdue</p>
          <strong>{overdue.length}</strong>
          <span>Needs attention</span>
        </article>

        <article className="bento-card metric-card">
          <p className="card-kicker">Average</p>
          <strong>{averageDays}</strong>
          <span>Days remaining</span>
            </article>
          </section>

      <section className="toolbar" aria-label="Project filters">
        <input
          className="search-input"
          placeholder="Search projects or URLs"
          value={search}
          onFocus={() => setClientFilterMenuOpen(false)}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div
          className="client-select schedule-client-filter"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setClientFilterMenuOpen(false);
          }}
        >
          <button
            className="client-select-button"
            type="button"
            aria-haspopup="listbox"
            aria-expanded={clientFilterMenuOpen}
            onClick={() => setClientFilterMenuOpen((open) => !open)}
          >
            <span>{selectedClientFilterLabel}</span>
            <b aria-hidden="true">v</b>
          </button>

          {clientFilterMenuOpen && (
            <div className="client-select-menu" role="listbox">
              <button
                className={clientFilter === "all" ? "client-option client-option-active" : "client-option"}
                type="button"
                role="option"
                aria-selected={clientFilter === "all"}
                onClick={() => {
                  setClientFilter("all");
                  setClientFilterMenuOpen(false);
                }}
              >
                <span>All clients</span>
                <b className="client-option-count">{searchMatchedSites.length}</b>
              </button>
              <button
                className={clientFilter === "__none__" ? "client-option client-option-active" : "client-option"}
                type="button"
                role="option"
                aria-selected={clientFilter === "__none__"}
                onClick={() => {
                  setClientFilter("__none__");
                  setClientFilterMenuOpen(false);
                }}
              >
                <span>No client</span>
                <b className="client-option-count">{noClientResultCount}</b>
              </button>
              {clients.map((client) => (
                <button
                  className={String(clientFilter) === String(client.id) ? "client-option client-option-active" : "client-option"}
                  type="button"
                  role="option"
                  aria-selected={String(clientFilter) === String(client.id)}
                  key={client.id}
                  onClick={() => {
                    setClientFilter(String(client.id));
                    setClientFilterMenuOpen(false);
                  }}
                >
                  <span>{client.name}</span>
                  <b className="client-option-count">{clientResultCounts[String(client.id)] || 0}</b>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="project-count">
          {filtered.length} project{filtered.length === 1 ? "" : "s"}
        </span>
      </section>

      <section className="project-grid" aria-label="Projects">
        {filtered.length === 0 ? (
          <article className="empty-state">
            <h2>No projects found</h2>
            <p>{sites.length === 0 ? "Create your first website deadline." : "Try a different search."}</p>
            <button className="primary-action" type="button" onClick={openCreateForm}>
              Add Project
            </button>
          </article>
        ) : (
          filtered.map((site) => (
            <article className={`project-card ${site.daysLeft <= 4 ? "project-card-hot" : ""}`} key={site.id}>
              <div className="project-card-top">
                <div>
                  <h2>{site.name}</h2>
                  <div className="project-identity-row">
                    {site.clientName ? <div className="project-client"><span className="badge-text">{site.clientName}</span></div> : null}
                    {site.url ? (
                      <a href={site.url} target="_blank" rel="noreferrer">
                        {site.url}
                      </a>
                    ) : (
                      <span className="muted">No URL added</span>
                    )}
                  </div>
                </div>
                <StatusBadge daysLeft={site.daysLeft} />
              </div>

              {(site.price || site.paid !== undefined) && (
                <div className="project-meta-row">
                  {site.price ? (
                    <span className="project-price"><span className="badge-text">{moneyVisible ? formatMoney(site.priceValue, site.currency) : maskMoney(site.currency)}</span></span>
                  ) : (
                    <span className="project-price project-price-empty"><span className="badge-text">No price</span></span>
                  )}
                  <span className={`payment-badge ${site.paid ? "payment-paid" : "payment-unpaid"}`}>
                    <span className="badge-text">{site.paid ? "Paid" : "Unpaid"}</span>
                  </span>
                </div>
              )}

              <div className="progress-track" aria-label={`${Math.round(site.progress)} percent complete`}>
                <span style={{ width: `${site.progress}%` }} />
              </div>

              <dl className="date-list">
                <div>
                  <dt>Start</dt>
                  <dd>{site.start}</dd>
                </div>
                <div>
                  <dt>Deadline</dt>
                  <dd>{site.deadline}</dd>
                </div>
              </dl>

              {site.notesList.length > 0 ? (
                <div className="project-notes">
                  <span>Notes</span>
                  <ol className="project-note-list">
                    {site.notesList.map((note, index) => (
                      <li className={note.done ? "project-note-done" : ""} key={note.id}>
                        <input
                          type="checkbox"
                          checked={note.done}
                          aria-label={`Mark note ${index + 1} ${note.done ? "not done" : "done"}`}
                          onChange={(event) => handleSavedNoteDoneChange(site.id, note.id, event.target.checked)}
                        />
                        <b>{index + 1}</b>
                        <p dir={getTextDirection(note.text)}>{note.text}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              <div className="project-actions">
                <button type="button" onClick={() => handleEdit(site)}>
                  Edit
                </button>
                <button className="danger-action" type="button" onClick={() => handleDeleteSite(site.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </section>
      </>
      ) : activeTab === "snippets" ? (
        <section className="snippets-view" aria-label="Code snippets">
          <section className="snippets-overview">
            <article className="bento-card snippets-hero">
              <div className="snippets-hero-copy">
                <p className="card-kicker">Snippet library</p>
                <h2>{snippets.length} saved code snippets</h2>
                <p className="muted">Search, filter, copy, edit, and export your WordPress code library.</p>
              </div>
              <div className="snippet-stats" aria-label="Snippet statistics">
                <div>
                  <span>Categories</span>
                  <strong>{Math.max(snippetCategories.length - 1, 0)}</strong>
                  <small>Groups</small>
                </div>
                <div>
                  <span>Visible</span>
                  <strong>{filteredSnippets.length}</strong>
                  <small>After filters</small>
                </div>
              </div>
            </article>
          </section>

          <section className="snippet-toolbar">
            <input
              className="search-input"
              placeholder="Search titles, categories, or code"
              value={snippetSearch}
              onChange={(event) => setSnippetSearch(event.target.value)}
            />
            <div className="category-filter">
              {snippetCategories.map((category) => (
                <button
                  className={snippetCategory === category ? "category-pill category-pill-active" : "category-pill"}
                  type="button"
                  key={category}
                  onClick={() => setSnippetCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="client-select snippet-category-filter-mobile" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSnippetFilterMenuOpen(false); }}>
              <button
                className="client-select-button"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={snippetFilterMenuOpen}
                onClick={() => setSnippetFilterMenuOpen((open) => !open)}
              >
                <span>{snippetCategory === "All" ? "All categories" : snippetCategory}</span>
                <b aria-hidden="true">v</b>
              </button>
              {snippetFilterMenuOpen && (
                <div className="client-select-menu" role="listbox">
                  {snippetCategories.map((category) => (
                    <button
                      className={snippetCategory === category ? "client-option client-option-active" : "client-option"}
                      type="button"
                      role="option"
                      aria-selected={snippetCategory === category}
                      key={category}
                      onClick={() => {
                        setSnippetCategory(category);
                        setSnippetFilterMenuOpen(false);
                      }}
                    >
                      <span>{category === "All" ? "All categories" : category}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="snippet-export-actions">
              <button className="secondary-action" type="button" onClick={() => handleExportSnippets("selected")} disabled={!selectedSnippet}>
                Export Selected
              </button>
              <button className="secondary-action" type="button" onClick={() => handleExportSnippets("all")} disabled={snippets.length === 0}>
                Export All
              </button>
            </div>
          </section>

          {copyState && <div className="snippet-toast">{copyState}</div>}

          <section className="snippet-workspace">
            <aside className="snippet-list">
              {filteredSnippets.length === 0 ? (
                <div className="empty-inline">No snippets found.</div>
              ) : (
                filteredSnippets.map((snippet) => (
                  <button
                    className={selectedSnippet?.id === snippet.id ? "snippet-list-item snippet-list-item-active" : "snippet-list-item"}
                    type="button"
                    key={snippet.id}
                    onClick={() => setSelectedSnippetId(snippet.id)}
                  >
                    <strong>{snippet.title}</strong>
                    <span>{snippet.category || "Uncategorized"}</span>
                  </button>
                ))
              )}
            </aside>

            <article className="snippet-detail">
              {selectedSnippet ? (
                <>
                  <div className="snippet-detail-head">
                    <div>
                      <p className="card-kicker">{selectedSnippet.category || "Uncategorized"}</p>
                      <h2>{selectedSnippet.title}</h2>
                    </div>
                    <div className="snippet-actions">
                      <button className="primary-action" type="button" onClick={() => handleCopySnippet(selectedSnippet)}>
                        Copy
                      </button>
                      <button type="button" onClick={() => handleEditSnippet(selectedSnippet)}>
                        Edit
                      </button>
                      <button className="danger-action" type="button" onClick={() => handleDeleteSnippet(selectedSnippet.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <CodePreview title={selectedSnippet.title} content={selectedSnippet.content} />
                </>
              ) : (
                <div className="empty-inline">Choose a snippet to preview.</div>
              )}
            </article>
          </section>

          <section className="snippet-editor-row">
            <article className="snippet-editor" onClick={() => setSnippetCategoryMenuOpen(false)}>
              <p className="card-kicker">{snippetEditId ? "Update current code" : "Add new code"}</p>
              <div className="snippet-editor-fields">
                <label>
                  Title
                  <input
                    value={snippetForm.title}
                    placeholder="Snippet title"
                    onChange={(event) => setSnippetForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>
                <label>
                  Category
                  <div className="category-editor">
                    <div className="client-select category-editor-select" onClick={(event) => event.stopPropagation()}>
                      <button
                        className="client-select-button"
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={snippetCategoryMenuOpen}
                        onClick={() => setSnippetCategoryMenuOpen((open) => !open)}
                      >
                        <span>
                          {selectedEditorCategory === "__new__" ? snippetForm.category.trim() || "+ Add new category" : snippetForm.category}
                        </span>
                        <b aria-hidden="true">v</b>
                      </button>

                      {snippetCategoryMenuOpen && (
                        <div className="client-select-menu" role="listbox">
                          {snippetEditorCategories.map((category) => (
                            <button
                              className={snippetForm.category === category ? "client-option client-option-active" : "client-option"}
                              type="button"
                              role="option"
                              aria-selected={snippetForm.category === category}
                              key={category}
                              onClick={() => {
                                setSnippetForm((current) => ({ ...current, category }));
                                setSnippetCategoryMenuOpen(false);
                              }}
                            >
                              <span>{category}</span>
                            </button>
                          ))}
                          <button
                            className={selectedEditorCategory === "__new__" ? "client-option client-option-active" : "client-option"}
                            type="button"
                            role="option"
                            aria-selected={selectedEditorCategory === "__new__"}
                            onClick={() => {
                              setSnippetForm((current) => ({ ...current, category: "" }));
                              setSnippetCategoryMenuOpen(false);
                            }}
                          >
                            <span>+ Add new category</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </label>
                {selectedEditorCategory === "__new__" && (
                  <label>
                    New category
                    <input
                      value={snippetForm.category}
                      placeholder="New category name"
                      onChange={(event) => setSnippetForm((current) => ({ ...current, category: event.target.value }))}
                    />
                  </label>
                )}
                <div className="modal-actions snippet-editor-actions">
                  <button type="button" onClick={resetSnippetForm}>
                    Clear
                  </button>
                  <button className="primary-action" type="button" onClick={handleSaveSnippet}>
                    {snippetEditId ? "Update Code" : "Add Code"}
                  </button>
                </div>
              </div>
              <label>
                Code
                <EditorChrome title={snippetForm.title || "Untitled snippet"}>
                  <div className="editor-input-wrap">
                    <div className="editor-gutter" ref={snippetEditorGutterRef} aria-hidden="true">
                      {String(snippetForm.content || "\n").split(/\r?\n/).map((_, index) => (
                        <span key={index}>{index + 1}</span>
                      ))}
                    </div>
                    <textarea
                      value={snippetForm.content}
                      placeholder="Paste your PHP, CSS, JS, or notes here..."
                      spellCheck={false}
                      onScroll={handleSnippetEditorScroll}
                      onChange={(event) => setSnippetForm((current) => ({ ...current, content: event.target.value }))}
                    />
                  </div>
                </EditorChrome>
              </label>
            </article>
          </section>
        </section>
      ) : activeTab === "todos" ? (
        <section className="todo-view" aria-label="To-do list">
          <section className="todo-hero-grid">
            <article className="bento-card todo-hero-card">
              <div>
                <p className="card-kicker">Daily checklist</p>
                <h2>{openTodoCount === 0 ? "No open tasks" : `${openTodoCount} open task${openTodoCount === 1 ? "" : "s"}`}</h2>
                <p className="muted">Add quick work items, check them off when finished, and keep completed items visible until you clear them.</p>
              </div>
              <div
                className="overview-meter todo-progress-meter"
                aria-label={`${todoCompletionPercent} percent of visible to-do items complete`}
                style={{ "--meter": `${todoCompletionPercent * 3.6}deg` }}
              >
                <span>{todoCompletionPercent}%</span>
              </div>
            </article>
            <article className="bento-card todo-stats-card">
              <div>
                <span>Open</span>
                <strong>{openTodoCount}</strong>
              </div>
              <div>
                <span>Done</span>
                <strong>{completedTodoCount}</strong>
              </div>
            </article>
          </section>

          <section className="todo-entry-card">
            <form
              className={`todo-entry${todoCategory === "__new__" ? " todo-entry-new-category" : ""}`}
              onSubmit={(event) => {
                event.preventDefault();
                handleAddTodo();
              }}
            >
              <div className="todo-entry-row todo-entry-main-row">
                <input
                  className="search-input todo-input"
                  dir={getTextDirection(todoDraft)}
                  value={todoDraft}
                  placeholder="Add a to-do item..."
                  onChange={(event) => setTodoDraft(event.target.value)}
                />
                <button
                  className={["icon-action", "todo-new-due-action", newTodoDueAt ? "todo-due-active" : ""].filter(Boolean).join(" ")}
                  type="button"
                  aria-label="Set a reminder for the new to-do item"
                  title={newTodoDueAt ? `Reminder set for ${formatDueLabel(newTodoDueAt)} — edit` : "Set due date & time for the new item"}
                  onClick={openNewTodoDue}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </button>
                <button className="primary-action" type="submit">
                  Add Item
                </button>
              </div>
              <div className="todo-entry-row todo-entry-secondary-row">
              <div className="client-select todo-category-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setTodoCategoryMenuOpen(false); }}>
                <button
                  className="client-select-button"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={todoCategoryMenuOpen}
                  onClick={() => setTodoCategoryMenuOpen((open) => !open)}
                >
                  <span>{todoCategory === "__new__" ? todoNewCategory.trim() || "+ New category" : todoCategory}</span>
                  <b aria-hidden="true">v</b>
                </button>

                {todoCategoryMenuOpen && (
                  <div className="client-select-menu" role="listbox">
                    {todoCategories.map((category) => (
                      <button
                        className={todoCategory === category ? "client-option client-option-active" : "client-option"}
                        type="button"
                        role="option"
                        aria-selected={todoCategory === category}
                        key={category}
                        onClick={() => {
                          setTodoCategory(category);
                          setTodoCategoryMenuOpen(false);
                        }}
                      >
                        <span>{category}</span>
                      </button>
                    ))}
                    <button
                      className={todoCategory === "__new__" ? "client-option client-option-active" : "client-option"}
                      type="button"
                      role="option"
                      aria-selected={todoCategory === "__new__"}
                      onClick={() => {
                        setTodoCategory("__new__");
                        setTodoCategoryMenuOpen(false);
                      }}
                    >
                      <span>+ New category</span>
                    </button>
                  </div>
                )}
              </div>
              {todoCategory === "__new__" ? (
                <input
                  className="search-input todo-new-category-input"
                  dir={getTextDirection(todoNewCategory)}
                  value={todoNewCategory}
                  placeholder="Category name"
                  onChange={(event) => setTodoNewCategory(event.target.value)}
                />
              ) : null}
              <span className="todo-entry-spacer" aria-hidden="true" />
              <div className="todo-filter-inline" aria-label="To-do category filter">
                <div className="client-select todo-filter-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setTodoFilterMenuOpen(false); }}>
                  <button
                    className="client-select-button"
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={todoFilterMenuOpen}
                    onClick={() => setTodoFilterMenuOpen((open) => !open)}
                  >
                    <span>{todoFilterLabel}</span>
                    <b aria-hidden="true">v</b>
                  </button>

                  {todoFilterMenuOpen && (
                    <div className="client-select-menu" role="listbox">
                      <button
                        className={todoFilter === "all" ? "client-option client-option-active" : "client-option"}
                        type="button"
                        role="option"
                        aria-selected={todoFilter === "all"}
                        onClick={() => {
                          setTodoFilter("all");
                          setTodoFilterMenuOpen(false);
                        }}
                      >
                        <span>All categories</span>
                        <b className="client-option-count">{todoItems.length}</b>
                      </button>
                      {todoCategories.map((category) => (
                        <button
                          className={todoFilter === category ? "client-option client-option-active" : "client-option"}
                          type="button"
                          role="option"
                          aria-selected={todoFilter === category}
                          key={category}
                          onClick={() => {
                            setTodoFilter(category);
                            setTodoFilterMenuOpen(false);
                          }}
                        >
                          <span>{category}</span>
                          <b className="client-option-count">{todoCategoryCounts[category] || 0}</b>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="icon-action danger-action todo-delete-category-action"
                  type="button"
                  aria-label={todoFilter === "all" || todoFilter === "General" ? "Delete all checked items" : "Delete selected category and its items"}
                  onClick={handleDeleteTodoCategory}
                  disabled={todoFilter === "all" || todoFilter === "General" ? totalCompletedTodoCount === 0 : false}
                  title={todoFilter === "all" || todoFilter === "General" ? "Delete all checked items" : "Delete this category and its items"}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v5" />
                    <path d="M14 11v5" />
                  </svg>
                </button>
                <span className="project-count">
                  {filteredTodoItems.length} item{filteredTodoItems.length === 1 ? "" : "s"}
                </span>
              </div>
              </div>
            </form>
          </section>

          <section className="todo-list-card" aria-label="To-do items">
            {filteredTodoItems.length === 0 ? (
              <article className="empty-state todo-empty-state">
                <h2>{todoItems.length === 0 ? "No to-do items yet" : "No items in this category"}</h2>
                <p>{todoItems.length === 0 ? "Add the next thing you need to finish." : "Choose another category or add a new item."}</p>
              </article>
            ) : (
              <div className="todo-list">
                {filteredTodoItems.map((todo, index) => (
                  <article
                    className={[
                      todo.done ? "todo-row todo-row-done" : "todo-row",
                      draggingTodoId === todo.id ? "todo-row-dragging" : "",
                    ].filter(Boolean).join(" ")}
                    key={todo.id}
                    draggable={filteredTodoItems.length > 1}
                    onDragStart={(event) => handleTodoDragStart(event, todo.id)}
                    onDragEnd={() => setDraggingTodoId(null)}
                    onDragOver={(event) => handleTodoDragOver(event, todo.id)}
                    onDrop={handleTodoDrop}
                  >
                    <input
                      className="todo-check"
                      type="checkbox"
                      checked={todo.done}
                      aria-label={`Mark to-do item ${index + 1} ${todo.done ? "not done" : "done"}`}
                      onChange={(event) => handleTodoChange(todo.id, { done: event.target.checked })}
                    />
                    <span className="todo-number">{index + 1}</span>
                    {todoEditId === todo.id ? (
                      <input
                        className="todo-text-input"
                        dir={getTextDirection(todoEditText)}
                        value={todoEditText}
                        aria-label={`Edit to-do item ${index + 1}`}
                        autoFocus
                        onChange={(event) => setTodoEditText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveEditingTodo();
                        }}
                      />
                    ) : (
                      <p className="todo-text-display" dir={getTextDirection(todo.text)}>{todo.text}</p>
                    )}
                    <span className="todo-category-badge">{todo.category || "General"}</span>
                    <button
                      className={[
                        "icon-action",
                        "todo-due-action",
                        todo.dueAt ? "todo-due-active" : "",
                        todo.dueAt && !todo.done && Date.parse(todo.dueAt) < Date.now() ? "todo-due-overdue" : "",
                      ].filter(Boolean).join(" ")}
                      type="button"
                      aria-label={`Set due date for to-do item ${index + 1}`}
                      title={todo.dueAt ? `Due ${formatDueLabel(todo.dueAt)} — edit` : "Set due date & time"}
                      onClick={() => openTodoDue(todo)}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </button>
                    {todoEditId === todo.id ? (
                      <button className="icon-action todo-save-action" type="button" aria-label={`Save to-do item ${index + 1}`} onClick={saveEditingTodo}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </button>
                    ) : (
                      <button className="icon-action todo-edit-action" type="button" aria-label={`Edit to-do item ${index + 1}`} onClick={() => startEditingTodo(todo)}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    )}
                    <button className="icon-action danger-action todo-delete-action" type="button" aria-label={`Delete to-do item ${index + 1}`} onClick={() => handleDeleteTodo(todo.id)}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v5" />
                        <path d="M14 11v5" />
                      </svg>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      ) : activeTab === "settings" ? (
        <section className="email-migration-view" aria-label="Settings">
          <section className="email-hero-grid">
            <article className="bento-card email-hero-card">
              <p className="card-kicker">Settings</p>
              <h2>App data</h2>
              <p className="muted">Create or restore a full backup of your projects, snippets, clients, and preferences.</p>
              <div className="email-hero-actions">
                <button className="primary-action" type="button" onClick={handleBackup}>
                  Backup App Data
                </button>
                <button className="secondary-action" type="button" onClick={handleRestore}>
                  Restore App Data
                </button>
              </div>
            </article>
            <article className="bento-card email-safety-card">
              <p className="card-kicker">About backups</p>
              <ul>
                <li>Backup saves all projects, snippets, clients, notes, theme, and preferences to a single <strong>.json</strong> file.</li>
                <li>Restore reads a backup file and overwrites all current data, then reloads the app.</li>
                <li>Backup files are plain JSON — you can inspect them in any text editor.</li>
              </ul>
            </article>
          </section>
        </section>
      ) : (
        <section className="email-migration-view" aria-label="Email migration">
          <section className="email-hero-grid">
            <article className="bento-card email-hero-card">
              <p className="card-kicker">Local IMAP transfer</p>
              <h2>Copy mailboxes between hosting providers</h2>
              <p className="muted">Runs on this computer through Electron. Passwords are only sent to the local migration process and are not saved.</p>
              <div className="email-date-filters">
                <label>
                  <span>From</span>
                  <input type="text" inputMode="numeric" placeholder="Enter the date" value={imapDateFrom} onChange={(e) => setImapDateFrom(e.target.value)} />
                </label>
                <label>
                  <span>To</span>
                  <input type="text" inputMode="numeric" placeholder="Enter the date" value={imapDateTo} onChange={(e) => setImapDateTo(e.target.value)} />
                </label>
              </div>
              <div className="email-hero-actions">
                {!imapMigrating ? (
                  <>
                    <button className="primary-action" type="button" onClick={handleStartImapMigration} disabled={imapTesting}>
                      Start Migration
                    </button>
                    <button className="secondary-action" type="button" onClick={handleExportBackup} disabled={imapTesting}>
                      Backup to .eml
                    </button>
                    <button className="secondary-action" type="button" onClick={handleImportBackup} disabled={imapTesting}>
                      Restore from .eml
                    </button>
                  </>
                ) : (
                  <>
                    {imapPaused ? (
                      <button className="primary-action" type="button" onClick={handleResumeImapMigration}>
                        Resume
                      </button>
                    ) : (
                      <button className="secondary-action" type="button" onClick={handlePauseImapMigration}>
                        Pause
                      </button>
                    )}
                    <button className="secondary-action" type="button" onClick={handleCancelImapMigration}>
                      Cancel
                    </button>
                  </>
                )}
                <button className="secondary-action" type="button" onClick={() => setImapLogs([])} disabled={imapLogs.length === 0}>
                  Clear Logs
                </button>
              </div>
            </article>

            <article className="bento-card email-safety-card">
              <p className="card-kicker">Safety notes</p>
              <ul>
                <li>Use SSL/TLS IMAP whenever possible.</li>
                <li>Create the destination mailbox before migrating.</li>
                <li>Run this before changing MX records, then test mail delivery.</li>
                <li>Duplicate prevention uses Message-ID headers when available.</li>
                <li><strong>Backup to .eml</strong> downloads all emails as .eml files you can archive or manually upload.</li>
                <li><strong>Restore from .eml</strong> imports saved .eml files into the destination mailbox.</li>
              </ul>
            </article>
          </section>

          <section className="email-account-grid">
            {[
              ["source", "Old provider", imapSourceShared, imapSourceAccounts, setImapSourceAccounts],
              ["target", "New provider", imapTargetShared, imapTargetAccounts, setImapTargetAccounts],
            ].map(([side, title, shared, accounts, setAccounts]) => (
              <article className="email-account-card" key={side}>
                <div className="email-account-head">
                  <div>
                    <p className="card-kicker">{side === "source" ? "Source" : "Destination"}</p>
                    <h2>{title}</h2>
                  </div>
                </div>

                <div className="email-fields email-fields-shared">
                  <label className="email-provider-label">
                    Mail provider
                    <div className="client-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setImapProviderOpen(""); }}>
                      <button className="client-select-button" type="button" aria-haspopup="listbox" aria-expanded={imapProviderOpen === side} onClick={() => { setImapProviderOpen((current) => (current === side ? "" : side)); setImapProviderSearch(""); }}>
                        <span>{PROVIDERS.find((p) => p.host === shared.host)?.name || "Select a provider"}</span>
                        <b aria-hidden="true">v</b>
                      </button>
                      {imapProviderOpen === side && (
                        <div className="client-select-menu" role="listbox">
                          <div className="client-search-wrapper">
                            <input className="client-search-input" type="text" placeholder="Search providers…" value={imapProviderSearch} onChange={(e) => setImapProviderSearch(e.target.value)} autoFocus />
                          </div>
                          {PROVIDERS.filter((p) => p.name.toLowerCase().includes(imapProviderSearch.toLowerCase())).map((provider) => (
                            <button className={shared.host === provider.host ? "client-option client-option-active" : "client-option"} type="button" role="option" aria-selected={shared.host === provider.host} key={provider.name} onClick={() => { updateImapShared(side, "host", provider.host); updateImapShared(side, "port", provider.port); updateImapShared(side, "secure", provider.secure); setImapProviderOpen(""); }}>
                              <span>{provider.name}</span>
                              <b className="client-option-count">{provider.host}</b>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                  <label>
                    IMAP host
                    <input value={shared.host} placeholder="imap.example.com" onChange={(event) => updateImapShared(side, "host", event.target.value)} />
                  </label>
                  <label>
                    Port
                    <input value={shared.port} inputMode="numeric" placeholder="993" onChange={(event) => updateImapShared(side, "port", event.target.value)} />
                  </label>
                  <label className="email-checkbox-row">
                    <span className={`email-toggle${shared.secure ? " email-toggle-on" : ""}`} role="switch" aria-checked={shared.secure} tabIndex={0} onClick={() => updateImapShared(side, "secure", !shared.secure)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); updateImapShared(side, "secure", !shared.secure); }}}>
                      <span className="email-toggle-track"><span className="email-toggle-thumb" /></span>
                    </span>
                    Use SSL/TLS
                  </label>
                  <label className="email-checkbox-row">
                    <span className={`email-toggle${!shared.rejectUnauthorized ? " email-toggle-on" : ""}`} role="switch" aria-checked={!shared.rejectUnauthorized} tabIndex={0} onClick={() => updateImapShared(side, "rejectUnauthorized", !shared.rejectUnauthorized)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); updateImapShared(side, "rejectUnauthorized", !shared.rejectUnauthorized); }}}>
                      <span className="email-toggle-track"><span className="email-toggle-thumb" /></span>
                    </span>
                    Allow self-signed certificates
                </label>
              </div>

                <div className="email-account-list">
                  <p className="email-account-list-title">Accounts</p>
                  {accounts.map((acc, index) => (
                    <div className="email-account-row" key={index}>
                      <span className="email-account-number">{index + 1}</span>
                      <div className="email-account-fields">
                        <input value={acc.user} placeholder="Email / username" onChange={(e) => { updateImapAccount(side, index, "user", e.target.value); }} />
                        <input value={acc.pass} type="password" placeholder="Password" onChange={(e) => updateImapAccount(side, index, "pass", e.target.value)} />
                      </div>
                      <button className="secondary-action" type="button" onClick={() => handleTestImap(side, index)} disabled={imapMigrating || Boolean(imapTesting)}>
                        {imapTesting === `${side}-${index}` ? "..." : "Test"}
                      </button>
                      {side === "source" && accounts.length > 1 && (
                        <button className="icon-action" type="button" onClick={() => removeImapAccountPair(index)} disabled={imapMigrating} title="Remove">
                          X
                        </button>
                      )}
                    </div>
                  ))}
                  {side === "source" && !imapMigrating && (
                    <button className="email-add-account" type="button" onClick={addImapAccountPair}>
                      + Add account
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>

          <section className="email-progress-grid">
            <article className="email-summary-card">
              <p className="card-kicker">Migration summary</p>
              <div className="email-summary-stats">
                <div>
                  <span>Folders</span>
                  <strong>{imapSummary?.folders || 0}</strong>
                </div>
                <div>
                  <span>Messages</span>
                  <strong>{imapSummary?.total || 0}</strong>
                </div>
                <div>
                  <span>Copied</span>
                  <strong>{imapSummary?.copied || 0}</strong>
                </div>
                <div>
                  <span>Skipped</span>
                  <strong>{imapSummary?.skipped || 0}</strong>
                </div>
                <div>
                  <span>Failed</span>
                  <strong>{imapSummary?.failed || 0}</strong>
                </div>
              </div>
            </article>

            <article className="email-log-card">
              <div className="email-log-head">
                <div>
                  <p className="card-kicker">Live log</p>
                  <h2>{imapMigrating ? "Migration running" : "Ready"}</h2>
                </div>
                <span>{imapLogs.length} events</span>
              </div>
              <div className="email-log-list" role="log" aria-live="polite">
                {imapLogs.length === 0 ? (
                  <p className="muted">Test both mailboxes, then start the migration.</p>
                ) : (
                  imapLogs.map((entry, index) => (
                    <div className={`email-log-row email-log-${entry.level || "info"}`} key={`${entry.at}-${index}`}>
                      <span>{new Date(entry.at).toLocaleTimeString()}</span>
                      <p>{entry.message}</p>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>

          <section className="email-dns-section">
            <article className="email-summary-card">
              <div className="email-dns-header">
                <p className="card-kicker">DNS Records</p>
                <label className="email-checkbox-row email-dns-toggle-row">
                  <span className={`email-toggle${imapShowDns ? " email-toggle-on" : ""}`} role="switch" aria-checked={imapShowDns} tabIndex={0} onClick={() => setImapShowDns((c) => !c)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setImapShowDns((c) => !c); }}}>
                    <span className="email-toggle-track"><span className="email-toggle-thumb" /></span>
                  </span>
                  Show DNS records
                </label>
              </div>
              {imapShowDns && (
                <div className="email-dns-stacked">
                  {[["Source", imapSourceShared], ["Target", imapTargetShared]].map(([label, shared]) => {
                    if (!shared.host || !DNS_RECORDS[shared.host]) return null;
                    const records = DNS_RECORDS[shared.host];
                    const provider = PROVIDERS.find((p) => p.host === shared.host);
                    const rows = [];
                    if (records.mx) {
                      records.mx.forEach((m) => rows.push({ name: "@", type: "MX", value: `${m.priority} ${m.value}` }));
                    }
                    if (records.spf) {
                      rows.push({ name: "@", type: "TXT", value: records.spf });
                    }
                    if (records.dkim) {
                      records.dkim.split("\n").forEach((v) => rows.push({ name: v.trim(), type: "CNAME", value: "(get target from provider)", placeholder: true }));
                    }
                    if (records.dmarc) {
                      rows.push({ name: "_dmarc", type: "TXT", value: records.dmarc });
                    }
                    const hasDkim = Boolean(records.dkim);
                    return (
                      <div className="email-dns-provider" key={label}>
                        <h3 className="email-dns-provider-title">{label}: {provider?.name || shared.host}</h3>
                        <div className="email-dns-records">
                          <div className="email-dns-head">
                            <span className="email-dns-head-name">Name / Host</span>
                            <span className="email-dns-head-type">Type</span>
                            <span className="email-dns-head-value">Value</span>
                            <span />
                          </div>
                          {rows.map((row, i) => (
                            <div className="email-dns-row" key={i}>
                              <code className="email-dns-cell-name">{row.name}</code>
                              <span className="email-dns-cell-type">{row.type}</span>
                              <code className="email-dns-cell-value">{row.value}</code>
                              {row.placeholder ? (
                                <span className="email-dns-copy-disabled">—</span>
                              ) : (
                                <button className="email-dns-copy" type="button" title="Copy" onClick={() => { const key = `dns-${i}`; const text = row.value; const el = document.createElement("textarea"); el.value = text; el.style.position = "fixed"; el.style.opacity = "0"; document.body.appendChild(el); el.select(); try { document.execCommand("copy"); } catch {} document.body.removeChild(el); setDnsCopiedKey(key); window.setTimeout(() => setDnsCopiedKey(""), 1800); }}>{dnsCopiedKey === `dns-${i}` ? <b>Copied!</b> : <b>Copy</b>}</button>
                              )}
                            </div>
                          ))}
                        </div>
                        {hasDkim && (
                          <p className="email-dns-note">DKIM: Add a CNAME record using the selector above as the name. To get the target value: {(() => { switch (shared.host) { case "imap.gmail.com": return "open Google Workspace admin → Apps → Gmail → Authenticate email → Generate new record → copy the CNAME target shown."; case "outlook.office365.com": return "open Microsoft 365 admin → Exchange → Mail flow → DKIM → select domain → Enable → copy the CNAME target shown."; case "imap.mail.yahoo.com": return "log in to Yahoo Small Business → Email → DKIM → Generate DKIM key → copy the CNAME target."; case "imap.mail.me.com": return "log in to iCloud Mail → Account Settings → Custom Domain → DKIM → copy the CNAME target shown."; case "imap.zoho.com": return "open Zoho Mail admin → Mail → DKIM → Add DKIM → copy the CNAME target shown."; case "imap.fastmail.com": return "open Fastmail Settings → Advanced → DKIM Signing → copy the CNAME target shown."; case "imap.ionos.com": return "open IONOS Email → Settings → Security → DKIM → Activate → copy the CNAME target."; case "imap.privateemail.com": return "open Namecheap Private Email → Settings → DKIM → Enable → copy the CNAME target shown."; case "imap.emailsrvr.com": return "open Rackspace Email Admin → Domains → select domain → DKIM Settings → copy the CNAME target."; case "imap.hostinger.com": return "open Hostinger hPanel → Email → Email Settings → DKIM → Enable → copy the CNAME target."; case "imap.gmx.com": return "open GMX Settings → Email Security → DKIM → copy the CNAME target shown."; case "imap.mail.com": return "open Mail.com Settings → Email → Security → DKIM → copy the CNAME target shown."; case "imap.yandex.com": return "open Yandex Mail → Domains → DKIM → copy the CNAME target shown."; case "127.0.0.1": return "open Proton Mail Bridge → Account → DKIM → copy the DNS values shown."; default: return "check your email provider's admin panel under DKIM settings → generate a new record → copy the CNAME target value."; } })()}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          </section>
        </section>
      )}

      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={closeForm}>
          <section
            className="modal"
            onClick={(event) => {
              event.stopPropagation();
              setClientMenuOpen(false);
            }}
            aria-label={editId ? "Edit project" : "New project"}
          >
            <div className="modal-header">
              <div>
                <p className="card-kicker">{editId ? "Edit project" : "New project"}</p>
                <h2>{editId ? form.name : "Create deadline"}</h2>
              </div>
              <button className="icon-action" type="button" aria-label="Close modal" onClick={closeForm}>
                X
              </button>
            </div>

            <label>
              Website name
              <input
                value={form.name}
                placeholder="Client portal"
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>

            <label>
              URL
              <input
                value={form.url}
                placeholder="https://example.com"
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
              />
            </label>

            <label>
              Client
              <div className="client-select" onClick={(event) => event.stopPropagation()}>
                <button
                  className="client-select-button"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={clientMenuOpen}
                  onClick={() => setClientMenuOpen((open) => !open)}
                >
                  <span>{selectedClient ? selectedClient.name : "No client selected"}</span>
                  <b aria-hidden="true">v</b>
                </button>

                {clientMenuOpen && (
                  <div className="client-select-menu" role="listbox">
                    <button
                      className={!form.clientId ? "client-option client-option-active" : "client-option"}
                      type="button"
                      role="option"
                      aria-selected={!form.clientId}
                      onClick={() => {
                        setForm((current) => ({ ...current, clientId: "" }));
                        setClientMenuOpen(false);
                      }}
                    >
                      <span>No client selected</span>
                    </button>

                    {clients.map((client) => (
                      <button
                        className={String(form.clientId) === String(client.id) ? "client-option client-option-active" : "client-option"}
                        type="button"
                        role="option"
                        aria-selected={String(form.clientId) === String(client.id)}
                        key={client.id}
                        onClick={() => {
                          setForm((current) => ({ ...current, clientId: String(client.id) }));
                          setClientMenuOpen(false);
                        }}
                      >
                        <span>{client.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>

            <div className="price-field-row">
              <label>
                Project price
                <input
                  value={form.price}
                  placeholder={form.currency === "EGP" ? "E£ EGP — e.g. 50000" : "$ USD — e.g. 1500"}
                  inputMode="decimal"
                  onChange={(event) => handlePriceChange(event.target.value)}
                />
              </label>
              <label>
                Currency
                <div className="currency-toggle project-currency-toggle" role="group" aria-label="Project currency">
                  {Object.values(CURRENCIES).map((currency) => (
                    <button
                      className={normalizeCurrency(form.currency, form.price) === currency.code ? "currency-toggle-button currency-toggle-active" : "currency-toggle-button"}
                      type="button"
                      aria-pressed={normalizeCurrency(form.currency, form.price) === currency.code}
                      key={currency.code}
                      onClick={() => setForm((current) => ({ ...current, currency: currency.code }))}
                    >
                      <span className="currency-toggle-label">{currency.label}</span>
                    </button>
                  ))}
                </div>
              </label>
            </div>

            <label className="payment-toggle">
              <input
                type="checkbox"
                checked={form.paid}
                onChange={(event) => setForm((current) => ({ ...current, paid: event.target.checked }))}
              />
              <span>
                <strong>{form.paid ? "Paid" : "Unpaid"}</strong>
                Payment status
              </span>
            </label>

            <label>
              Start date
              <input
                value={form.start}
                placeholder="dd/mm/yyyy"
                inputMode="numeric"
                onChange={(event) => handleDaysChange(form.deadlineDays, event.target.value)}
              />
            </label>

            <label>
              Deadline days
              <input
                value={form.deadlineDays}
                placeholder="7"
                inputMode="numeric"
                onChange={(event) => handleDaysChange(event.target.value)}
              />
            </label>

            <div className="notes-editor">
              <div className="notes-editor-head">
                <span>Notes</span>
                <button className="secondary-action note-add-action" type="button" onClick={handleAddNote}>
                  Add Note
                </button>
              </div>

              <div className="note-editor-list">
                {formNotes.map((note, index) => (
                  <div
                    className={[
                      "note-editor-row",
                      note.done ? "note-editor-row-done" : "",
                      draggingNoteId === note.id ? "note-editor-row-dragging" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={note.id}
                    onDragOver={handleNoteDragOver}
                    onDrop={(event) => handleNoteDrop(event, note.id)}
                  >
                    <button
                      className="note-drag-handle"
                      type="button"
                      draggable={formNotes.length > 1}
                      disabled={formNotes.length <= 1}
                      aria-label={`Reorder note ${index + 1}; drag or press arrow keys`}
                      title="Drag to reorder, or focus and press Up/Down"
                      onDragStart={(event) => handleNoteDragStart(event, note.id)}
                      onDragEnd={() => setDraggingNoteId(null)}
                      onKeyDown={(event) => handleNoteMoveKeyDown(event, note.id)}
                    >
                      ::
                    </button>
                    <input
                      className="note-done-check"
                      type="checkbox"
                      checked={note.done}
                      aria-label={`Mark note ${index + 1} ${note.done ? "not done" : "done"}`}
                      onChange={(event) => handleNoteChange(note.id, { done: event.target.checked })}
                    />
                    <span className="note-editor-number">{index + 1}</span>
                    <input
                      className="note-text-input"
                      dir={getTextDirection(note.text)}
                      value={note.text}
                      placeholder="Important task, client request, blocker..."
                      onChange={(event) => handleNoteChange(note.id, { text: event.target.value })}
                    />
                    <button
                      className="icon-action danger-action note-delete-action"
                      type="button"
                      aria-label={`Delete note ${index + 1}`}
                      title={`Delete note ${index + 1}`}
                      onClick={() => handleDeleteNote(note.id)}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v5" />
                        <path d="M14 11v5" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {form.deadline && (
              <div className="deadline-preview">
                Deadline <strong>{form.deadline}</strong>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" onClick={closeForm}>
                Cancel
              </button>
              <button className="primary-action" type="button" onClick={handleSave}>
                {editId ? "Save Changes" : "Add Project"}
              </button>
            </div>
          </section>
        </div>
      )}

      {showClients && (
        <div className="modal-backdrop" onClick={() => setShowClients(false)}>
          <section className="modal" onClick={(event) => event.stopPropagation()} aria-label="Clients">
            <div className="modal-header">
              <div>
                <p className="card-kicker">Clients</p>
                <h2>Client list</h2>
              </div>
              <button className="icon-action" type="button" aria-label="Close clients" onClick={() => setShowClients(false)}>
                X
              </button>
            </div>

            <div className="client-entry">
              <input
                value={clientName}
                placeholder="Client name"
                onChange={(event) => setClientName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleAddClient();
                }}
              />
              <button className="primary-action" type="button" onClick={handleAddClient}>
                Add Client
              </button>
            </div>

            <div className="client-list">
              {clients.length === 0 ? (
                <p className="muted">No clients added yet.</p>
              ) : (
                clients.map((client) => (
                  <div className="client-row" key={client.id}>
                    <span>{client.name}</span>
                    <button className="danger-action" type="button" onClick={() => handleDeleteClient(client.id)}>
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {todoDueId && (
        <div className="modal-backdrop" onClick={closeTodoDue}>
          <section className="modal todo-due-modal" onClick={(event) => { event.stopPropagation(); setDueTimeMenu(null); }} aria-label="Set due date and time">
            <div className="modal-header">
              <div>
                <p className="card-kicker">To-Do Reminder</p>
                <h2>Due date &amp; time</h2>
              </div>
              <button className="icon-action" type="button" aria-label="Close reminder settings" onClick={closeTodoDue}>
                X
              </button>
            </div>
            <p className="todo-due-task" dir={getTextDirection(todoDueText)}>{todoDueText}</p>
            <div className="todo-due-field">
              <span>Remind me at</span>
              <div className="due-picker">
                <div className="due-picker-calendar">
                  <div className="due-picker-header">
                    <button className="icon-action due-picker-nav" type="button" aria-label="Previous month" onClick={() => shiftDueViewMonth(-1)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m15 18-6-6 6-6" />
                      </svg>
                    </button>
                    <span className="due-picker-month">{dueViewMonth.toLocaleDateString([], { month: "long", year: "numeric" })}</span>
                    <button className="icon-action due-picker-nav" type="button" aria-label="Next month" onClick={() => shiftDueViewMonth(1)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  </div>
                  <div className="due-picker-weekdays">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((weekday) => (
                      <span key={weekday}>{weekday}</span>
                    ))}
                  </div>
                  <div className="due-picker-grid">
                    {dueCells.map((day, cellIndex) =>
                      day === null ? (
                        <span key={`pad-${cellIndex}`} />
                      ) : (
                        <button
                          className={[
                            "due-picker-day",
                            dueSelected && dueSelected.getFullYear() === dueViewYear && dueSelected.getMonth() === dueViewMonthIndex && dueSelected.getDate() === day ? "due-picker-day-selected" : "",
                          ].filter(Boolean).join(" ")}
                          key={day}
                          type="button"
                          aria-pressed={dueSelected && dueSelected.getDate() === day && dueSelected.getMonth() === dueViewMonthIndex ? "true" : "false"}
                          onClick={() => selectDueDay(day)}
                        >
                          {day}
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className="due-picker-time">
                  <div className="client-select due-time-select">
                    <button
                      className="secondary-action due-time-trigger"
                      type="button"
                      aria-label="Hour"
                      aria-expanded={dueTimeMenu === "hour"}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDueTimeMenu(dueTimeMenu === "hour" ? null : "hour");
                      }}
                    >
                      <span>{String(dueHour12).padStart(2, "0")}</span>
                      <b aria-hidden="true">v</b>
                    </button>
                    {dueTimeMenu === "hour" && (
                      <div className="client-select-menu due-time-menu" role="listbox">
                        {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                          <button
                            className={hour === dueHour12 ? "client-option client-option-active" : "client-option"}
                            key={hour}
                            type="button"
                            role="option"
                            aria-selected={hour === dueHour12}
                            onClick={() => selectDueHour(hour)}
                          >
                            <span>{String(hour).padStart(2, "0")}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="client-select due-time-select">
                    <button
                      className="secondary-action due-time-trigger"
                      type="button"
                      aria-label="Minute"
                      aria-expanded={dueTimeMenu === "minute"}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDueTimeMenu(dueTimeMenu === "minute" ? null : "minute");
                      }}
                    >
                      <span>{String(dueSelected ? dueSelected.getMinutes() : 0).padStart(2, "0")}</span>
                      <b aria-hidden="true">v</b>
                    </button>
                    {dueTimeMenu === "minute" && (
                      <div className="client-select-menu due-time-menu" role="listbox">
                        {dueMinuteOptions.map((minute) => (
                          <button
                            className={dueSelected && dueSelected.getMinutes() === minute ? "client-option client-option-active" : "client-option"}
                            key={minute}
                            type="button"
                            role="option"
                            aria-selected={Boolean(dueSelected && dueSelected.getMinutes() === minute)}
                            onClick={() => selectDueMinute(minute)}
                          >
                            <span>{String(minute).padStart(2, "0")}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="client-select due-time-select">
                    <button
                      className="secondary-action due-time-trigger"
                      type="button"
                      aria-label="AM or PM"
                      aria-expanded={dueTimeMenu === "ampm"}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDueTimeMenu(dueTimeMenu === "ampm" ? null : "ampm");
                      }}
                    >
                      <span>{dueAmPm}</span>
                      <b aria-hidden="true">v</b>
                    </button>
                    {dueTimeMenu === "ampm" && (
                      <div className="client-select-menu due-time-menu" role="listbox">
                        {["AM", "PM"].map((ampm) => (
                          <button
                            className={ampm === dueAmPm ? "client-option client-option-active" : "client-option"}
                            key={ampm}
                            type="button"
                            role="option"
                            aria-selected={ampm === dueAmPm}
                            onClick={() => selectDueAmPm(ampm)}
                          >
                            <span>{ampm}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="todo-due-presets">
              <button className="secondary-action" type="button" onClick={() => applyDuePreset("hour")}>+1 hour</button>
              <button className="secondary-action" type="button" onClick={() => applyDuePreset("tonight")}>Tonight 21:00</button>
              <button className="secondary-action" type="button" onClick={() => applyDuePreset("tomorrow")}>Tomorrow 09:00</button>
              <button className="danger-action" type="button" onClick={removeTodoDue}>
                Remove
              </button>
            </div>
            <div className="modal-actions">
              <span className="modal-actions-spacer" />
              <button className="secondary-action" type="button" onClick={closeTodoDue}>
                Cancel
              </button>
              <button className="primary-action" type="button" onClick={saveTodoDue} disabled={!todoDueDraft}>
                Save
              </button>
            </div>
          </section>
        </div>
      )}

      {notificationsOpen && (
        <div className="modal-backdrop" onClick={() => setNotificationsOpen(false)}>
          <section className="modal notifications-modal" onClick={(event) => event.stopPropagation()} aria-label="Notifications">
            <div className="modal-header">
              <div>
                <p className="card-kicker">Activity</p>
                <h2>Notifications</h2>
              </div>
              <button className="icon-action" type="button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)}>
                X
              </button>
            </div>
            {!isElectron() && notifPermission !== "granted" && (
              <div className="notifications-enable-row">
                <span>Get reminder alerts on this device.</span>
                <button className="primary-action" type="button" onClick={enableNotifications}>
                  Enable notifications
                </button>
              </div>
            )}
            <div className="notifications-toolbar">
              <button className="secondary-action" type="button" onClick={markAllNotificationsRead} disabled={unreadNotificationCount === 0}>
                Mark read
              </button>
              <button className="secondary-action" type="button" onClick={sendTestNotification} title="Temporary: fires a test reminder through the real pipeline">
                Test alert
              </button>
              <button className="danger-action" type="button" onClick={clearAllNotifications} disabled={notifications.length === 0}>
                Clear all
              </button>
            </div>
            <div className="notifications-list">
              {notifications.length === 0 ? (
                <p className="muted">No notifications yet. Reminders you set on to-do items will appear here.</p>
              ) : (
                notifications.map((notification) => (
                  <div className={notification.read ? "notification-row" : "notification-row notification-unread"} key={notification.id}>
                    <span className={notification.read ? "notification-dot notification-dot-read" : "notification-dot"} aria-hidden="true" />
                    <div className="notification-main">
                      <p className="notification-title" dir={getTextDirection(notification.text)}>{notification.text}</p>
                      <p className="notification-meta">
                        Due {formatDueLabel(notification.dueAt)} · Sent {formatDueLabel(notification.sentAt)} · {notification.category || "General"}
                      </p>
                    </div>
                    <button className="icon-action danger-action notification-delete-action" type="button" aria-label="Delete notification" onClick={() => deleteNotificationById(notification.id)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {backupMessage && (
        <div className="modal-backdrop" onClick={() => { if (backupMessage.reload) return; setBackupMessage(null); }}>
          <section
            className="modal unsaved-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="card-kicker">{backupMessage.type === "success" ? "Success" : "Error"}</p>
                <h2>{backupMessage.title}</h2>
              </div>
              <button className="icon-action" type="button" aria-label="Close" onClick={() => { if (backupMessage.reload) window.location.reload(); setBackupMessage(null); }}>
                X
              </button>
            </div>

            <div className="unsaved-modal-body">
              <div className={`unsaved-icon ${backupMessage.type === "success" ? "unsaved-icon-ok" : ""}`} aria-hidden="true">
                {backupMessage.type === "success" ? "\u2713" : "!"}
              </div>
              <div className="unsaved-copy">
                <p>{backupMessage.message}</p>
                {backupMessage.path ? <p className="muted" style={{ wordBreak: "break-all" }}>{backupMessage.path}</p> : null}
              </div>
            </div>

            <div className="modal-actions unsaved-actions">
              <button className="primary-action" type="button" onClick={() => { if (backupMessage.reload) window.location.reload(); setBackupMessage(null); }}>
                {backupMessage.reload ? "Reload now" : "OK"}
              </button>
            </div>
          </section>
        </div>
      )}

      {closePrompt && (
        <div className="modal-backdrop" onClick={() => resolveClosePrompt("cancel")}>
          <section
            className="modal unsaved-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="card-kicker">Unsaved changes</p>
                <h2 id="unsaved-title">You have unsaved changes.</h2>
              </div>
              <button className="icon-action" type="button" aria-label="Cancel close" onClick={() => resolveClosePrompt("cancel")}>
                X
              </button>
            </div>

            <div className="unsaved-modal-body">
              <div className="unsaved-icon" aria-hidden="true">
                !
              </div>
              <div className="unsaved-copy">
                <p>Save these changes before closing:</p>
                <ul className="unsaved-list">
                  {closePrompt.labels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
                <p className="muted">Choose Save and close to keep your changes, or Close anyway to continue without saving.</p>
                {closePrompt.error ? <p className="unsaved-error">{closePrompt.error}</p> : null}
              </div>
            </div>

            <div className="modal-actions unsaved-actions">
              <button className="primary-action" type="button" onClick={handleSaveAndClose}>
                Save and close
              </button>
              <button type="button" onClick={() => resolveClosePrompt("close")}>
                Close anyway
              </button>
              <button type="button" onClick={() => resolveClosePrompt("cancel")}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
