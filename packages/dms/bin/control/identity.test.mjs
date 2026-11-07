import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import {
  decode,
  isBoolean,
  isNumber,
  isString,
  nullable,
  objectOf,
} from "./json.mjs";
import { newRun } from "./helpers/fake-run.mjs";

const CONTROL_BIN = join(import.meta.dirname, "..", "dms-control.mjs");
const INSIDE_TIMEOUT_MS = 60_000;

/**
 * Runs in a PID namespace that mounted no /proc of its own, so /proc shows
 * the processes of the namespace around it. It records a process of its own
 * with the start time /proc gives for its pid, as a run started there
 * would, runs `dms-control down` on the run, then tries to start a process,
 * and prints what happened.
 */
const INSIDE = `
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const [bin, dir] = process.argv.slice(1);
const control = new URL("./control/", "file://" + bin);
const { startDetached } = await import(new URL("processes.mjs", control));
const { loadRun, saveRun } = await import(new URL("run-state.mjs", control));
const other = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
let startTime = null;
try {
  const stat = readFileSync("/proc/" + other.pid + "/stat", "utf8");
  startTime = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]);
} catch {}
const state = loadRun(dir);
state.processes = [{ name: "frontend", pid: other.pid, startTime, command: "x", cwd: dir, log: "/dev/null", startedAt: new Date().toISOString() }];
saveRun(state);
const down = spawnSync(process.execPath, [bin, "down", dir], { encoding: "utf8" });
await sleep(200);
let start = "started";
try {
  startDetached({ name: "inside", program: process.execPath, args: ["-e", ""], cwd: dir, env: process.env, logs: dir });
} catch (error) {
  start = error.message;
}
console.log(JSON.stringify({ down: down.status, stderr: down.stderr, signal: other.signalCode, start }));
process.exit(0);
`;

const isReport = objectOf({
  down: nullable(isNumber),
  stderr: isString,
  signal: nullable(isString),
  start: isString,
});

/** @returns {boolean} True where the test may make a user and PID namespace */
function canUnshare() {
  return spawnSync("unshare", ["-Ur", "--fork", "--pid", "true"]).status === 0;
}

await test(
  "where /proc is not this PID namespace's, down and a start refuse and say why, and the process a record names is not signalled; a version that trusts that /proc signals it",
  {
    skip:
      !canUnshare() &&
      "this host does not let the test make a user and PID namespace",
  },
  async (t) => {
    const state = await newRun(t);
    const inside = spawnSync(
      "unshare",
      [
        "-Ur",
        "--fork",
        "--pid",
        process.execPath,
        "--input-type=module",
        "-e",
        INSIDE,
        CONTROL_BIN,
        state.dir,
      ],
      { encoding: "utf8", timeout: INSIDE_TIMEOUT_MS },
    );
    /** @type {unknown} */
    const parsed = JSON.parse(inside.stdout);
    const report = decode(isReport, parsed, inside.stderr, "a report");
    assert.equal(report.signal, null);
    assert.equal(report.down, 1);
    assert.match(report.stderr, /is not this PID namespace's/);
    assert.equal(report.stderr.split("\n").filter(Boolean).length, 1);
    assert.match(report.start, /is not this PID namespace's/);
  },
);

/**
 * Runs where /proc is hidden behind an empty mount, as on a system with no
 * /proc: it starts a process the way a run does, records it, and runs
 * `dms-control down` on the run.
 */
const WITHOUT_PROC = `
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const [bin, dir] = process.argv.slice(1);
const control = new URL("./control/", "file://" + bin);
const { startDetached } = await import(new URL("processes.mjs", control));
const { loadRun, saveRun } = await import(new URL("run-state.mjs", control));
const own = startDetached({ name: "own", program: "sleep", args: ["60"], cwd: dir, env: process.env, logs: dir });
const state = loadRun(dir);
state.processes = [own];
saveRun(state);
const down = spawnSync(process.execPath, [bin, "down", dir], { encoding: "utf8" });
await sleep(300);
let alive = true;
try { process.kill(own.pid, 0); } catch { alive = false; }
console.log(JSON.stringify({ down: down.status, stderr: down.stderr, alive }));
process.exit(0);
`;

const isBareReport = objectOf({
  down: nullable(isNumber),
  stderr: isString,
  alive: isBoolean,
});

await test(
  "on a system with no /proc, a run's own process is still stopped by its pid, as before; refusing whenever /proc is missing leaves every run running on such systems",
  {
    skip:
      !canUnshare() &&
      "this host does not let the test make a user and PID namespace",
  },
  async (t) => {
    const state = await newRun(t);
    const inside = spawnSync(
      "unshare",
      [
        "-Ur",
        "--fork",
        "--pid",
        "--mount",
        "sh",
        "-c",
        'mount -t tmpfs none /proc && exec "$@"',
        "sh",
        process.execPath,
        "--input-type=module",
        "-e",
        WITHOUT_PROC,
        CONTROL_BIN,
        state.dir,
      ],
      { encoding: "utf8", timeout: INSIDE_TIMEOUT_MS },
    );
    /** @type {unknown} */
    const parsed = JSON.parse(inside.stdout.trim().split("\n").at(-1) ?? "{}");
    const report = decode(isBareReport, parsed, inside.stderr, "a report");
    assert.equal(report.down, 0, report.stderr);
    assert.equal(report.alive, false, report.stderr);
  },
);
