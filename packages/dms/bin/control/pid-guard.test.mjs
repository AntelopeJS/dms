import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunFolders, saveRun } from "./run-state.mjs";
import {
  assertSignalable,
  isAlive,
  killAll,
  killRecorded,
  stopAll,
  stopRecorded,
} from "./processes.mjs";

const UNSAFE = [
  -1,
  0,
  1,
  undefined,
  Number.NaN,
  2.5,
  "1234",
  null,
  2 ** 31,
  2 ** 32 + 1,
];

/**
 * Replaces `process.kill` with a recorder for the test, so a regression in
 * the guard records a call instead of signalling every process of the user.
 *
 * @param {import("node:test").TestContext} t The test
 * @returns {unknown[][]} The calls `process.kill` received
 */
function recordKills(t) {
  /** @type {unknown[][]} */
  const calls = [];
  const original = process.kill.bind(process);
  process.kill = (...args) => {
    calls.push(args);
    return true;
  };
  t.after(() => {
    process.kill = original;
  });
  return calls;
}

await test("stopAll throws on a pid that is not a whole number above 1 before sending any signal; a guard after the first kill lets kill(-1) reach every process of the user", async (t) => {
  const calls = recordKills(t);
  for (const pid of UNSAFE) {
    await assert.rejects(stopAll([pid]), TypeError, String(pid));
  }
  assert.deepEqual(calls, []);
});

await test("assertSignalable accepts a real process id and refuses the rest; a guard that only rejects -1 still lets 0 signal the caller's own group", () => {
  assert.doesNotThrow(() => assertSignalable(process.pid));
  for (const pid of UNSAFE) {
    assert.throws(() => assertSignalable(pid), TypeError, String(pid));
  }
});

await test("isAlive answers false for those values without probing; probing kill(-1, 0) reports some process alive", (t) => {
  const calls = recordKills(t);
  for (const pid of UNSAFE) {
    assert.equal(isAlive(pid), false, String(pid));
  }
  assert.deepEqual(calls, []);
});

await test("stopRecorded skips and reports the bad pids a run recorded and still stops the good ones; refusing the whole run leaves its real processes running", async (t) => {
  const child = spawn("sleep", ["60"], { stdio: "ignore", detached: true });
  const own = child.pid;
  if (own === undefined) throw new Error("sleep did not start");
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  });
  /** @type {unknown[][]} */
  const calls = [];
  const original = process.kill.bind(process);
  process.kill = (pid, signal) => {
    calls.push([pid, signal]);
    if (pid !== own && pid !== -own) return true;
    return original(pid, signal);
  };
  t.after(() => {
    process.kill = original;
  });
  const lines = await stopRecorded([-1, own, 0]);
  assert.deepEqual(
    calls.filter(([pid]) => pid !== own && pid !== -own),
    [],
  );
  assert.ok(lines.includes("skipped pid -1: not a process id above 1"));
  assert.ok(lines.includes("skipped pid 0: not a process id above 1"));
  assert.ok(lines.some((line) => line.startsWith(`stopped pid ${own}`)));
  assert.equal(isAlive(own), false);
});

await test("killAll throws on a pid that is not a whole number above 1 before sending any signal; a hard kill without the guard sends SIGKILL to every process of the user", async (t) => {
  const calls = recordKills(t);
  for (const pid of UNSAFE) {
    await assert.rejects(killAll([pid]), TypeError, String(pid));
  }
  assert.deepEqual(calls, []);
});

await test("killRecorded skips and reports the bad pids a run recorded and still kills the good ones; passing them to killAll throws and leaves the real backend running", async (t) => {
  const child = spawn("sleep", ["60"], { stdio: "ignore", detached: true });
  const own = child.pid;
  if (own === undefined) throw new Error("sleep did not start");
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  });
  /** @type {unknown[][]} */
  const calls = [];
  const original = process.kill.bind(process);
  process.kill = (pid, signal) => {
    calls.push([pid, signal]);
    if (pid !== own && pid !== -own) return true;
    return original(pid, signal);
  };
  t.after(() => {
    process.kill = original;
  });
  const lines = await killRecorded([-1, own, 0]);
  assert.deepEqual(
    calls.filter(([pid]) => pid !== own && pid !== -own),
    [],
  );
  assert.ok(lines.includes("skipped pid -1: not a process id above 1"));
  assert.ok(lines.includes("skipped pid 0: not a process id above 1"));
  assert.ok(lines.includes(`killed pid ${own}`));
});

const CONTROL = join(import.meta.dirname, "..", "dms-control.mjs");
const NO_UNSAFE_KILL = `data:text/javascript,const k=process.kill.bind(process);process.kill=(p,s)=>{if(!(Number.isInteger(p)&&Math.abs(p)>1))throw new Error("unsafe kill "+p);return k(p,s);};`;

await test("dms-control down prints the recorded pid it skipped; dropping the line leaves the operator unaware a record was corrupt", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-pid-guard-down-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  saveRun({
    ...createRunFolders(dir),
    id: "20261107T000000-abc123",
    createdAt: "2026-11-07T00:00:00.000Z",
    environment: "docs",
    playground: dir,
    moduleRoot: dir,
    repo: null,
    headSha: null,
    baseRef: "origin/main",
    skill: null,
    apiPort: 5010,
    webPort: 5011,
    smtpPort: 5012,
    mail: join(dir, "evidence", "mail"),
    apiUrl: "http://127.0.0.1:5010",
    webUrl: "http://127.0.0.1:5011",
    databasePrefix: "verify_x",
    database: "verify_x",
    mongoUrl: "",
    ownsMongo: false,
    secrets: {},
    adminPassword: "",
    extraEnv: {},
    processes: [
      {
        name: "bogus",
        pid: -1,
        command: "node bogus",
        cwd: dir,
        log: join(dir, "logs", "bogus.log"),
        startedAt: "2026-11-07T00:00:00.000Z",
      },
    ],
    accounts: {},
    tokens: {},
    ready: false,
  });
  const out = execFileSync(
    process.execPath,
    ["--import", NO_UNSAFE_KILL, CONTROL, "down", dir],
    { encoding: "utf8" },
  );
  assert.deepEqual(
    out.split("\n").filter((line) => line.startsWith("skipped")),
    ["skipped pid -1: not a process id above 1"],
  );
});
