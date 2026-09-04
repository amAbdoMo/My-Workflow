const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const PROJECT_ROOT = path.join(__dirname, "..");

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
