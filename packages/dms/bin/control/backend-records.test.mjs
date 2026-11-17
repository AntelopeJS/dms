import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { freshDatabase, restartBackend } from "./backend.mjs";
import { doctor } from "./doctor.mjs";
import {
  bystander,
  newRun,
  running,
  served,
  startedOn,
  withoutStartTimes,
} from "./helpers/fake-run.mjs";
import { canChoosePid, chooseNextPid } from "./helpers/pids.mjs";
import { hasProc, isRunning } from "./identity.mjs";
import { startDetached } from "./processes.mjs";
import { backendsFolder, recordBackend } from "./run-state.mjs";
import { down, liveBackends } from "./stack.mjs";

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

/**
 * What the code writes to stderr during the test, kept off the terminal.
 *
 * @param {import("node:test").TestContext} t The test
 * @returns {() => string} The text written so far
 */
function stderrOf(t) {
  const write = t.mock.method(process.stderr, "write", () => true);
  return () =>
    write.mock.calls.map((call) => String(call.arguments[0])).join("");
}

await test(
  "a process that took the pid of a backend the run recorded is not stopped, even with that backend's database in its environment",
  {
    skip:
      !hasProc() &&
      "a start time tells a process from another that took its pid, and only /proc gives one",
  },
  async (t) => {
    const state = await newRun(t);
    await freshDatabase(state, "j001");
    const database = `${state.databasePrefix}_j002`;
    const standby = await startedOn(database);
    const record = liveBackends(state).find(
      (backend) => backend.pid === standby.pid,
    );
    assert.ok(record, "the standby is recorded");
    const other = bystander(t, { ...process.env, MONGO_DATABASE: database });
    recordBackend(state.dir, { ...record, pid: other });
    await freshDatabase(state, "r1");
    assert.equal(isRunning(other), true);
    await down(state);
    assert.equal(isRunning(other), true);
    assert.deepEqual(running(), []);
  },
);

await test(
  "a process that took the pid of a process run.json records is not stopped by a restart or by down",
  {
    skip:
      !hasProc() &&
      "a start time tells a process from another that took its pid, and only /proc gives one",
  },
  async (t) => {
    const state = await newRun(t);
    await freshDatabase(state, "j001");
    const serving = state.processes.find((entry) => entry.name === "backend");
    assert.ok(serving, "run.json records the backend");
    const other = bystander(t, {
      ...process.env,
      MONGO_DATABASE: state.database,
    });
    const reused = { ...serving, pid: other };
    state.processes = state.processes.map((entry) =>
      entry === serving ? reused : entry,
    );
    await restartBackend(state);
    assert.equal(isRunning(other), true);
    assert.equal((await served(state)).database, state.database);
    state.processes = [...state.processes, { ...reused, name: "frontend" }];
    await down(state);
    assert.equal(isRunning(other), true);
    assert.deepEqual(running(), []);
  },
);

await test("a backend record removed while the records are read counts as gone", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const serving = await served(state);
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  symlinkSync(
    join(state.dir, "removed.json"),
    join(backendsFolder(state.dir), "4242.json"),
  );
  const stderr = stderrOf(t);
  assert.deepEqual(
    liveBackends(state)
      .map((backend) => backend.pid)
      .toSorted((a, b) => a - b),
    [serving.pid, standby.pid].toSorted((a, b) => a - b),
  );
  assert.equal(stderr(), "");
});

await test("a backend record that holds no record is skipped and named, and the run still moves on and stops", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  const file = join(backendsFolder(state.dir), "77777.json");
  writeFileSync(file, '{"name":"backend","pid":77');
  const stderr = stderrOf(t);
  await freshDatabase(state, "j002");
  assert.equal((await served(state)).pid, standby.pid);
  await down(state);
  assert.deepEqual(running(), []);
  assert.ok(stderr().includes(file), stderr());
});

await test("a backend record whose pid is not a process id above 1 is forgotten, and no call to process.kill reaches it", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  const record = liveBackends(state).find(
    (backend) => backend.pid === standby.pid,
  );
  assert.ok(record, "the standby is recorded");
  for (const pid of [-1, 0, 1]) {
    recordBackend(state.dir, { ...record, pid, startTime: null });
  }
  const original = process.kill.bind(process);
  /** @type {typeof process.kill} */
  const passOnAbove1 = (pid, signal) =>
    Math.abs(pid) > 1 ? original(pid, signal) : true;
  const kill = t.mock.method(process, "kill", passOnAbove1);
  await down(state);
  const targets = kill.mock.calls.map((call) => Math.abs(call.arguments[0]));
  assert.notDeepEqual(targets, []);
  assert.deepEqual(
    targets.filter((pid) => pid <= 1),
    [],
  );
  assert.deepEqual(running(), []);
});

/**
 * A process the run records as a backend on `database` that never answers.
 * `down` stops it with the run.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {string} database The database its record names
 * @returns {import("./run-state.mjs").BackendRecord} Its record
 */
function silentBackend(state, database) {
  const started = startDetached({
    name: `silent${database.slice(state.databasePrefix.length)}`,
    program: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    cwd: state.dir,
    env: process.env,
    logs: state.logs,
  });
  const backend = { ...started, name: "backend", port: 1, database };
  recordBackend(state.dir, backend);
  return backend;
}

/**
 * @param {import("./run-state.mjs").RunState} state The run
 * @returns {import("./run-state.mjs").ProcessRecord} The forwarder run.json records
 */
function forwarderOf(state) {
  const api = state.processes.find((entry) => entry.name === "api");
  assert.ok(api, "run.json records the forwarder");
  return api;
}

await test(
  "a run.json record without a start time, as an earlier dms-control wrote, is stopped by down only while its pid runs a process started when the record says; a version that trusts the pid alone stops a process started days later",
  {
    skip:
      !hasProc() &&
      "a start time tells a process from another that took its pid, and only /proc gives one",
  },
  async (t) => {
    const state = await newRun(t);
    const later = bystander(t);
    const own = bystander(t);
    const now = new Date();
    /**
     * @param {string} name
     * @param {number} pid
     * @param {Date} at
     */
    const recorded = (name, pid, at) => ({
      name,
      pid,
      command: "a process an earlier dms-control started",
      cwd: state.dir,
      log: join(state.logs, `${name}.log`),
      startedAt: at.toISOString(),
    });
    state.processes = [
      recorded("frontend", later, new Date(now.getTime() - SIX_DAYS_MS)),
      recorded("mail", own, now),
    ];
    await down(state);
    assert.equal(isRunning(later), true);
    assert.equal(isRunning(own), false);
  },
);

await test(
  "a backend record without a start time, as this branch wrote before, is stopped by down; a version that skips such a record leaves the standby running",
  {
    skip:
      !hasProc() &&
      "only /proc gives a start time, so no record holds one to leave out",
  },
  async (t) => {
    const state = await newRun(t);
    await freshDatabase(state, "j001");
    await startedOn(`${state.databasePrefix}_j002`);
    assert.equal(withoutStartTimes(state), 2);
    assert.equal(liveBackends(state).length, 2);
    await down(state);
    assert.deepEqual(running(), []);
  },
);

await test(
  "a recorded backend that exits while a fresh database waits for the standby, and whose pid another process takes, is not signalled; a version that kills from the list it read before the wait kills that process",
  {
    skip:
      !canChoosePid() &&
      "choosing the next pid needs a PID namespace the test owns",
  },
  async (t) => {
    const state = await newRun(t);
    await freshDatabase(state, "j001");
    const waitedFor = silentBackend(state, `${state.databasePrefix}_j003`);
    const exits = silentBackend(state, `${state.databasePrefix}_j009`);
    const pending = freshDatabase(state, "j003");
    process.kill(exits.pid, "SIGKILL");
    while (existsSync(`/proc/${exits.pid}`)) await sleep(20);
    chooseNextPid(exits.pid);
    const taker = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { stdio: "ignore" },
    );
    t.after(() => taker.kill());
    assert.equal(taker.pid, exits.pid, "another process took the pid");
    const original = process.kill.bind(process);
    /** @type {typeof process.kill} */
    const sparesTaker = (pid, signal) =>
      Math.abs(pid) === taker.pid && signal !== 0
        ? true
        : original(pid, signal);
    const kill = t.mock.method(process, "kill", sparesTaker);
    process.kill(waitedFor.pid, "SIGKILL");
    await pending;
    assert.deepEqual(
      kill.mock.calls
        .map((call) => call.arguments)
        .filter(([pid, signal]) => Math.abs(pid) === taker.pid && signal !== 0),
      [],
    );
    assert.equal(
      (await served(state)).database,
      `${state.databasePrefix}_j003`,
    );
  },
);

await test(
  "a forwarder that exited, whose pid another process holds, is started again and the API answers; a version that trusts a live pid leaves the API port closed",
  {
    skip:
      !hasProc() &&
      "a start time tells a process from another that took its pid, and only /proc gives one",
  },
  async (t) => {
    const state = await newRun(t);
    await freshDatabase(state, "j001");
    const api = forwarderOf(state);
    process.kill(api.pid, "SIGKILL");
    while (isRunning(api.pid)) await sleep(20);
    const other = bystander(t);
    state.processes = state.processes.map((entry) =>
      entry === api ? { ...api, pid: other } : entry,
    );
    await freshDatabase(state, "j002");
    assert.equal(
      (await served(state)).database,
      `${state.databasePrefix}_j002`,
    );
    assert.equal(isRunning(other), true);
  },
);

await test(
  "doctor fails a recorded process whose pid another process holds; a version that checks only that the pid is alive passes it",
  {
    skip:
      !hasProc() &&
      "a start time tells a process from another that took its pid, and only /proc gives one",
  },
  async (t) => {
    const state = await newRun(t);
    await freshDatabase(state, "j001");
    const api = forwarderOf(state);
    const other = bystander(t);
    state.processes = [
      ...state.processes,
      { ...api, name: "mail", pid: other },
    ];
    const lines = await doctor(state);
    const okOf = (/** @type {string} */ check) =>
      lines.find((line) => line.check === check)?.ok;
    assert.equal(okOf(`api pid ${api.pid} alive`), true);
    assert.equal(okOf(`mail pid ${other} alive`), false);
  },
);
