import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import { isSameProcess } from "./identity.mjs";
import { apiRequest, onboard, startRun } from "./run.mjs";
import globalSetup, { currentRun } from "./global-setup.mjs";
import { loadRun, recordedBackends } from "./run-state.mjs";
import { down } from "./stack.mjs";
import { declareSuite } from "./suite.mjs";

/**
 * Every process a run recorded, its backends included, once each.
 *
 * @param {string} dir The run folder
 * @returns {import("./run-state.mjs").ProcessRecord[]}
 */
function processesOf(dir) {
  return [
    ...new Map(
      [...loadRun(dir).processes, ...recordedBackends(dir)].map((entry) => [
        entry.pid,
        entry,
      ]),
    ).values(),
  ];
}

await test("a node:test file starts the checkout's playground, calls its backend anonymously and as the onboarded administrator, and leaves no process once it stops (catches a stop that leaves the backend, the mail sink or mongod running)", async (t) => {
  const { run, stop } = await startRun({ prepare: false });
  t.after(async () => {
    await down(loadRun(run.dir));
  });

  const before = await apiRequest(run, {
    method: "GET",
    path: "/api/onboarding/informations",
    as: "anon",
  });
  assert.equal(before.status, 200, JSON.stringify(before.body));
  assert.deepEqual(before.body, { has_onboarded: false });

  const admin = await onboard(run, {});
  assert.equal(admin.register.status, 200, JSON.stringify(admin.register));
  assert.equal(admin.login?.status, 200, JSON.stringify(admin.login));
  const after = await apiRequest(run, {
    method: "GET",
    path: "/api/onboarding/informations",
    as: "admin",
  });
  assert.deepEqual(after.body, { has_onboarded: true });

  const started = processesOf(run.dir);
  assert.ok(
    started.some((entry) => entry.name === "backend"),
    "the run recorded its backend",
  );
  await stop();
  assert.deepEqual(
    started.filter(isSameProcess).map((entry) => `${entry.name} ${entry.pid}`),
    [],
  );
});

await test("a SIGINT to a process that started a run stops the run and ends the process by the signal (catches a run whose detached backend, mail sink and mongod outlive an interrupted node:test)", async () => {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { startRun } from ${JSON.stringify(import.meta.resolve("./run.mjs"))};
const { run } = await startRun({ prepare: false });
process.stdout.write(run.dir + "\\n");
setInterval(() => {}, 1000);`,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const exited = new Promise((resolve) =>
    child.once("exit", (_code, signal) => resolve(signal)),
  );
  /** @type {string} */
  const dir = await new Promise((resolve, reject) => {
    child.once("exit", () => reject(new Error("the run did not start")));
    child.stdout.once("data", (chunk) => resolve(String(chunk).trim()));
  });
  const started = loadRun(dir).processes;
  child.kill("SIGINT");
  assert.equal(await exited, "SIGINT");
  assert.deepEqual(
    started.filter(isSameProcess).map((entry) => `${entry.name} ${entry.pid}`),
    [],
  );
});

await test("the global setup of a two-worker suite starts a run for each worker, apart from the other, and its teardown leaves no process of either (catches workers that share a run, a database, a mail sink or a dashboard, or a teardown that stops only the first run)", async (t) => {
  const saved = {
    DMS_E2E_SUITE: process.env.DMS_E2E_SUITE,
    DMS_E2E_PREBUILT: process.env.DMS_E2E_PREBUILT,
    DMS_E2E_RUN: process.env.DMS_E2E_RUN,
    DMS_E2E_LANES: process.env.DMS_E2E_LANES,
  };
  process.env.DMS_E2E_PREBUILT = "1";
  delete process.env.DMS_E2E_RUN;
  const suite = declareSuite({});
  const teardown = await globalSetup({ workers: 2 });
  const runs = [currentRun(suite, 0), currentRun(suite, 1)];
  t.after(async () => {
    for (const run of runs) await down(loadRun(run.dir));
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const [first, second] = runs;
  for (const key of /** @type {const} */ ([
    "dir",
    "apiPort",
    "webPort",
    "smtpPort",
    "mongoUrl",
    "runPlayground",
  ])) {
    assert.notEqual(first[key], second[key], key);
  }
  assert.throws(() => currentRun(suite, 2), /worker 2 has no run/);

  const admin = await onboard(first, {});
  assert.equal(admin.register.status, 200, JSON.stringify(admin.register));
  const other = await apiRequest(second, {
    method: "GET",
    path: "/api/onboarding/informations",
    as: "anon",
  });
  assert.deepEqual(other.body, { has_onboarded: false });

  const started = runs.flatMap((run) => processesOf(run.dir));
  assert.ok(teardown, "the global setup returned its teardown");
  await teardown();
  assert.deepEqual(
    started.filter(isSameProcess).map((entry) => `${entry.name} ${entry.pid}`),
    [],
  );
});
