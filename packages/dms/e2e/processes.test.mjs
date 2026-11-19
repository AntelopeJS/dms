import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { canChoosePid, chooseNextPid } from "./helpers/pids.mjs";
import { hasProc, isRunning, startTimeOf } from "./identity.mjs";
import {
  descendantsOf,
  freePort,
  killRecorded,
  listenersOf,
  startDetached,
  stopRecorded,
} from "./processes.mjs";

const SLOW_STOP_MS = 5_000;
const POLL_MS = 20;

/** Longer than one poll of stopRecorded's grace period, so the SIGTERM is sent before the target dies. */
const STOP_POLL_MS = 600;

/** How often the test tries to give the target's pid to a new process: a process of another test file can take the pid between the choice and the start, and then holds it itself. */
const TAKE_ATTEMPTS = 20;

const HOLDER = `
const { createServer } = require("node:net");
createServer().listen(Number(process.argv[1]), "127.0.0.1");
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`;

const LEADER = `
const { spawn } = require("node:child_process");
const [sameGroup, ownGroup] = process.argv.slice(1);
const holder = (port, options) =>
  spawn(process.execPath, ["-e", ${JSON.stringify(HOLDER)}, port], { stdio: "ignore", ...options });
holder(sameGroup, {});
holder(ownGroup, { detached: true });
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`;

/**
 * Replaces `process.kill` for the test with a recorder that passes on only
 * the calls aimed at `allowed` or its group, so a regression records a call
 * instead of signalling every process of the user.
 *
 * @param {import("node:test").TestContext} t The test
 * @param {number} [allowed] The one process a call may reach
 * @returns {unknown[][]} The calls `process.kill` received
 */
function recordKills(t, allowed) {
  /** @type {unknown[][]} */
  const calls = [];
  const original = process.kill.bind(process);
  process.kill = (pid, signal) => {
    calls.push([pid, signal]);
    return allowed !== undefined && Math.abs(pid) === allowed
      ? original(pid, signal)
      : true;
  };
  t.after(() => {
    process.kill = original;
  });
  return calls;
}

/**
 * Starts a SIGTERM-proof leader with one child in its group and one in a
 * group of its own, each holding a port.
 *
 * @param {import("node:test").TestContext} t The test
 * @param {number[]} ports The ports of the child in the group and of the other
 * @returns {Promise<ReturnType<typeof startDetached>>} The leader's record
 */
async function startTree(t, ports) {
  const logs = mkdtempSync(join(tmpdir(), "dms-control-processes-test-"));
  const leader = startDetached({
    name: "tree",
    program: process.execPath,
    args: ["-e", LEADER, ...ports.map(String)],
    cwd: logs,
    env: process.env,
    logs,
  });
  t.after(async () => {
    await killRecorded([leader]).catch(() => []);
    rmSync(logs, { recursive: true, force: true });
  });
  for (let waited = 0; waited < SLOW_STOP_MS; waited += POLL_MS) {
    if (ports.every((port) => listenersOf(port)?.length)) return leader;
    await sleep(POLL_MS);
  }
  throw new Error("the tree never listened");
}

/** @param {number} port */
function bind(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

await test(
  "killRecorded ends a SIGTERM-proof tree at once and frees every port",
  {
    skip:
      !hasProc() &&
      "the listeners of a port and the descendants of a process are read from /proc",
  },
  async (t) => {
    const ports = [await freePort(), await freePort()];
    const leader = await startTree(t, ports);
    const started = Date.now();
    const lines = await killRecorded([leader]);
    assert.ok(
      Date.now() - started < SLOW_STOP_MS,
      "a SIGTERM and a grace period take ten seconds on this tree",
    );
    assert.equal(isRunning(leader.pid), false);
    assert.equal(lines.length, 3);
    for (const port of ports) assert.equal(await bind(port), true);
  },
);

await test("killRecorded resolves for a process that is already gone", async () => {
  assert.deepEqual(
    await killRecorded([{ pid: 2 ** 22 + 1, startTime: 1 }]),
    [],
  );
});

await test(
  "killRecorded returns once a killed process is a zombie nothing reaps; waiting for the pid to vanish throws after the grace period",
  {
    skip:
      !hasProc() &&
      "a zombie and the descendants of a process are read from /proc",
  },
  async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "dms-control-zombie-"));
    const parent = startDetached({
      name: "zombie-parent",
      program: "sh",
      args: ["-c", "sleep 60 & exec sleep 60"],
      cwd: dir,
      env: process.env,
      logs: dir,
    });
    t.after(async () => {
      await killRecorded([parent]).catch(() => []);
      rmSync(dir, { recursive: true, force: true });
    });
    let children = descendantsOf([parent.pid]);
    for (
      let waited = 0;
      children.length === 0 && waited < SLOW_STOP_MS;
      waited += POLL_MS
    ) {
      await sleep(POLL_MS);
      children = descendantsOf([parent.pid]);
    }
    assert.equal(children.length, 1);
    const records = children.map((pid) => ({
      pid,
      startTime: startTimeOf(pid),
    }));
    const outcome = await Promise.race([
      killRecorded(records).then(() => "returned"),
      sleep(3_000).then(() => "still waiting"),
    ]);
    assert.equal(outcome, "returned");
  },
);

await test("killRecorded kills a process the caller started and signals nothing else", async (t) => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    detached: true,
  });
  t.after(() => child.kill());
  const pid = child.pid;
  assert.ok(pid !== undefined && pid > 1, "the child started");
  const calls = recordKills(t, pid);
  await killRecorded([{ pid, startTime: startTimeOf(pid) }]);
  assert.equal(isRunning(pid), false);
  assert.notDeepEqual(calls, []);
  assert.deepEqual(
    calls.filter(([target]) => target !== pid && target !== -pid),
    [],
  );
});

await test(
  "killRecorded and stopRecorded leave alone a process whose start time is not the one recorded for its pid; a version that signals by pid alone kills it",
  {
    skip:
      !hasProc() &&
      "a start time is read from /proc; without it a pid alone names a process",
  },
  async (t) => {
    const child = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      {
        stdio: "ignore",
      },
    );
    t.after(() => child.kill());
    const pid = child.pid;
    assert.ok(pid !== undefined && pid > 1, "the child started");
    const started = startTimeOf(pid);
    assert.ok(started !== null, "the child has a start time");
    const calls = recordKills(t);
    const earlier = { pid, startTime: started - 1 };
    await killRecorded([earlier]);
    await stopRecorded([
      earlier,
      { pid, startedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    assert.deepEqual(
      calls.filter(([, signal]) => signal !== 0),
      [],
    );
    assert.equal(isRunning(pid), true);
  },
);

await test(
  "stopRecorded sends no SIGKILL to a pid another process took during the SIGTERM grace period; a version that kills every target it signalled kills that process",
  {
    skip:
      !canChoosePid() &&
      "choosing the next pid needs a PID namespace the test owns",
  },
  async (t) => {
    const target = spawn(
      process.execPath,
      [
        "-e",
        'process.on("SIGTERM", () => {}); console.log("ready"); setInterval(() => {}, 1000);',
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    t.after(() => target.kill("SIGKILL"));
    const pid = target.pid;
    assert.ok(pid !== undefined && pid > 1, "the target started");
    await once(target.stdout, "data");
    const record = { pid, startTime: startTimeOf(pid) };
    /** @type {import("node:child_process").ChildProcess[]} */
    const takers = [];
    let taken = false;
    target.once("exit", () => {
      for (
        let attempt = 0;
        attempt < TAKE_ATTEMPTS && startTimeOf(pid) === null;
        attempt += 1
      ) {
        chooseNextPid(pid);
        takers.push(spawn("sleep", ["60"], { stdio: "ignore" }));
      }
      taken = startTimeOf(pid) !== null;
    });
    t.after(() => takers.forEach((taker) => taker.kill("SIGKILL")));
    const original = process.kill.bind(process);
    /** @type {typeof process.kill} */
    const probesOnly = (to, signal) =>
      signal === 0 ? original(to, signal) : true;
    const kill = t.mock.method(process, "kill", probesOnly);
    const stopping = stopRecorded([record]);
    await sleep(STOP_POLL_MS);
    const exited = once(target, "exit");
    target.kill("SIGKILL");
    await exited;
    await stopping;
    assert.equal(taken, true, "another process took the pid");
    const signals = kill.mock.calls
      .map((call) => call.arguments[1])
      .filter((signal) => signal !== 0);
    assert.deepEqual(signals, ["SIGTERM"]);
  },
);
