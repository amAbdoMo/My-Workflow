const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const PROJECT_ROOT = path.join(__dirname, "..");

const PUSH_SCENARIO = String.raw`
  const crypto = require("node:crypto");
  const https = require("node:https");
  const path = require("node:path");
  const { PassThrough, Writable } = require("node:stream");
  const store = require(path.join(process.env.PROJECT_ROOT, "server", "store.js"));
  const reminders = require(path.join(process.env.PROJECT_ROOT, "server", "reminders.js"));
  const requests = [];
  // Keep real web-push encryption and header generation; replace only the network.
  https.request = (options, callback) => {
    const captured = { headers: options.headers, encryptedBytes: 0 };
    requests.push(captured);
    return new Writable({
      write(chunk, encoding, done) {
        captured.encryptedBytes += chunk.length;
        done();
      },
      final(done) {
        const response = new PassThrough();
        response.statusCode = 201;
        response.headers = {};
        callback(response);
        response.end();
        done();
      },
    });
  };

  const deviceKey = crypto.createECDH("prime256v1");
  deviceKey.generateKeys();
  reminders.addSub({
    endpoint: "https://fcm.googleapis.com/fcm/send/regression-device",
    keys: {
      p256dh: deviceKey.getPublicKey().toString("base64url"),
      auth: crypto.randomBytes(16).toString("base64url"),
    },
  });
  store.mergeEntries([{
    key: "wizard-schedules-todo-items",
    value: JSON.stringify([{
      id: "locked-phone-reminder", text: "Check background delivery", done: false,
      dueAt: new Date(Date.now() - 1000).toISOString(), repeat: "",
    }]),
    updatedAt: Date.now(),
  }]);

  const delivery = process.env.SCENARIO_MODE === "scheduled"
    ? reminders.scanNow()
    : reminders.sendTestNotification();
  delivery.then((outcome) => console.log(JSON.stringify({ requests, outcome }))).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
`;

function runRepeatScenario(mode) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "workflowy-reminder-test-"));
  const scenario = String.raw`
    const path = require("node:path");
    const store = require(path.join(process.env.PROJECT_ROOT, "server", "store.js"));
    const reminders = require(path.join(process.env.PROJECT_ROOT, "server", "reminders.js"));
    const todoId = "todo-production-regression";
    const futureDueAt = new Date(Date.now() + 86_400_000).toISOString();
    store.mergeEntries([{
      key: "wizard-schedules-todo-items",
      value: JSON.stringify([{ id: todoId, text: "Renew hosting", done: false, dueAt: futureDueAt, repeat: "daily" }]),
      updatedAt: Date.now(),
    }]);
    reminders._collectDue();

    const missedDueAt = new Date(Date.now() - 10_800_000).toISOString();
    const staleTodo = { id: todoId, text: "Renew hosting", done: false, dueAt: missedDueAt };
    if (process.env.SCENARIO_MODE === "explicit-none") staleTodo.repeat = "";
    store.mergeEntries([{
      key: "wizard-schedules-todo-items",
      value: JSON.stringify([staleTodo]),
      updatedAt: Date.now() + 60_000,
    }]);

    const firstScan = reminders._collectDue();
    const secondScan = reminders._collectDue();
    const savedTodo = JSON.parse(store.getAll()["wizard-schedules-todo-items"].value)[0];
    console.log(JSON.stringify({
      firstScan,
      secondScan,
      savedTodo,
      expectedId: reminders._createOccurrenceId(todoId, missedDueAt),
      nextOccurrenceId: reminders._createOccurrenceId(todoId, savedTodo.dueAt),
    }));
  `;

  const execution = spawnSync(process.execPath, ["-e", scenario], {
    encoding: "utf8",
    env: {
      ...process.env,
      PROJECT_ROOT,
      SCENARIO_MODE: mode,
      WIZARD_DATA_DIR: dataDir,
    },
  });
  fs.rmSync(dataDir, { recursive: true, force: true });
  assert.equal(execution.status, 0, execution.stderr);
  return JSON.parse(execution.stdout);
}

test("missing repeat field heals one late occurrence without duplicate replay", () => {
  const outcome = runRepeatScenario("missing-field");
  const notification = outcome.firstScan.fresh[0];

  assert.equal(outcome.firstScan.fresh.length, 1);
  assert.equal(outcome.firstScan.rescheduled, true);
  assert.equal(notification.id, outcome.expectedId);
  assert.notEqual(notification.id, outcome.nextOccurrenceId);
  assert.equal(notification.late, true);
  assert.ok(notification.lateByMs >= 10_700_000);
  assert.equal(outcome.savedTodo.repeat, "daily");
  assert.ok(Date.parse(outcome.savedTodo.dueAt) > Date.now());
  assert.equal(outcome.secondScan.fresh.length, 0);
});

test("explicit no-repeat choice sends once and remains disabled", () => {
  const outcome = runRepeatScenario("explicit-none");

  assert.equal(outcome.firstScan.fresh.length, 1);
  assert.equal(outcome.firstScan.rescheduled, false);
  assert.equal(outcome.savedTodo.repeat, "");
  assert.equal(outcome.secondScan.fresh.length, 0);
});

function runPushScenario(mode) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "workflowy-push-test-"));
  try {
    const execution = spawnSync(process.execPath, ["-e", PUSH_SCENARIO], {
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, PROJECT_ROOT, SCENARIO_MODE: mode, WIZARD_DATA_DIR: dataDir },
    });
    assert.equal(execution.status, 0, execution.error?.message || execution.stderr);
    return JSON.parse(execution.stdout);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

for (const mode of ["scheduled", "test"]) {
  test(`${mode} reminders use high-priority HTTP delivery for sleeping phones`, () => {
    const { requests, outcome } = runPushScenario(mode);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers.Urgency, "high");
    assert.equal(requests[0].headers.TTL, 43200);
    assert.equal(requests[0].headers["Content-Encoding"], "aes128gcm");
    assert.ok(requests[0].encryptedBytes > 0);
    assert.equal(outcome.deliveries.length, 1);
    assert.equal(outcome.deliveries[0].ok, true);
    if (mode === "scheduled") assert.equal(outcome.notificationsCreated, 1);
  });
}
