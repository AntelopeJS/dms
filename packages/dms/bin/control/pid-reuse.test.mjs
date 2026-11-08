import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { decode, isBoolean, isNumber, objectOf } from "./json.mjs";

const CONTROL = join(import.meta.dirname);
const NESTED_TIMEOUT_MS = 60_000;

/**
 * Runs as pid 1 of a PID namespace of its own, so the pid it frees is the
 * next one the kernel gives. A shell leads a group of its own and runs
 * `sleep`, the victim, at least ten clock ticks before the new process
 * starts, so their start times differ. The run records either the victim (`root`) or the
 * shell (`child`). Inside `killRecorded`, right after the read named by the
 * mode, the victim dies, the shell reaps it, and a new process takes its
 * pid. Every signal aimed at that pid is recorded instead of sent.
 */
const NESTED = `
import fs, { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { syncBuiltinESMExports } from "node:module";
import { createInterface } from "node:readline";
const [control, mode] = process.argv.slice(1);
const { killRecorded } = await import(control + "/processes.mjs");
const { isRunning, startTimeOf } = await import(control + "/identity.mjs");
const shell = spawn("sh", ["-c", "sleep 60 & echo $!; wait; exec sleep 60"], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
const lines = createInterface({ input: shell.stdout })[Symbol.asyncIterator]();
const victim = Number((await lines.next()).value);
const recordedPid = mode === "root" ? victim : shell.pid;
const record = { pid: recordedPid, startTime: startTimeOf(recordedPid) };
await sleep(100);
const realKill = process.kill.bind(process);
let taker;
const takePid = () => {
  if (taker) return;
  realKill(victim, "SIGKILL");
  const deadline = Date.now() + 5000;
  while (fs.existsSync("/proc/" + victim) && Date.now() < deadline);
  writeFileSync("/proc/sys/kernel/ns_last_pid", String(victim - 1));
  taker = spawn("sleep", ["60"], { stdio: "ignore" });
};
const { readdirSync, readFileSync } = fs;
fs.readdirSync = (path, ...rest) => {
  if (mode === "root" && path === "/proc") takePid();
  return readdirSync(path, ...rest);
};
fs.readFileSync = (path, ...rest) => {
  const read = readFileSync(path, ...rest);
  if (mode === "child" && path === "/proc/" + victim + "/stat") takePid();
  return read;
};
syncBuiltinESMExports();
const signals = [];
process.kill = (pid, signal) => {
  if (Math.abs(pid) !== victim || signal === 0) return realKill(pid, signal);
  signals.push(signal);
  return true;
};
await killRecorded([record]).catch(() => []);
console.log(JSON.stringify({ taken: taker?.pid === victim, signals: signals.length, running: isRunning(victim) }));
process.exit(0);
`;

const isReport = objectOf({
  taken: isBoolean,
  signals: isNumber,
  running: isBoolean,
});

/** @returns {boolean} True where the test may make a user and PID namespace */
function canUnshare() {
  return (
    spawnSync("unshare", ["-Ur", "--fork", "--pid", "--mount-proc", "true"])
      .status === 0
  );
}

/**
 * Runs {@link NESTED} in a PID namespace of its own.
 *
 * @param {"root" | "child"} mode Which process the run records
 * @returns {{ taken: boolean, signals: number, running: boolean }} Whether the new process took the victim's pid, how many signals were aimed at that pid, and whether it still runs
 */
function reuseDuringKill(mode) {
  const nested = spawnSync(
    "unshare",
    [
      "-Ur",
      "--fork",
      "--pid",
      "--mount-proc",
      process.execPath,
      "--input-type=module",
      "-e",
      NESTED,
      CONTROL,
      mode,
    ],
    { encoding: "utf8", timeout: NESTED_TIMEOUT_MS },
  );
  assert.equal(nested.status, 0, nested.stderr);
  /** @type {unknown} */
  const parsed = JSON.parse(nested.stdout);
  return decode(isReport, parsed, "the nested kill", "a report");
}

const unshareSkip =
  !canUnshare() && "this host does not let the test make a PID namespace";

await test(
  "killRecorded sends no signal to a process that took a recorded pid after the record was checked; a version that reads the start time again after the check kills it",
  { skip: unshareSkip, timeout: NESTED_TIMEOUT_MS },
  () => {
    assert.deepEqual(reuseDuringKill("root"), {
      taken: true,
      signals: 0,
      running: true,
    });
  },
);

await test(
  "killRecorded sends no signal to a process that took a descendant's pid after the descendant was found; a version that does not check its start time again right before the signal kills it",
  { skip: unshareSkip, timeout: NESTED_TIMEOUT_MS },
  () => {
    assert.deepEqual(reuseDuringKill("child"), {
      taken: true,
      signals: 0,
      running: true,
    });
  },
);
