import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { decode, isBoolean, isNumber, objectOf } from "./json.mjs";

const NESTED_TIMEOUT_MS = 60_000;

/** The imports, helpers and signal recorder every nested script shares. `run(sh)` starts `sh` leading a group of its own and returns it with the pid of the `sleep` it starts in the background; `gone(pid)` waits until the pid is free; `recordSignalsTo(pid)` records instead of sends every signal aimed at it. */
const PRELUDE = `
import fs, { mkdtempSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { syncBuiltinESMExports } from "node:module";
import { createInterface } from "node:readline";
const [control, mode] = process.argv.slice(1);
const { killRecorded, stopRecorded } = await import(control + "/processes.mjs");
const { isRunning, startTimeOf } = await import(control + "/identity.mjs");
const realKill = process.kill.bind(process);
const { readdirSync, readFileSync } = fs;
const run = async (script) => {
  const shell = spawn("sh", ["-c", script], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
  const lines = createInterface({ input: shell.stdout })[Symbol.asyncIterator]();
  return { shell, child: Number((await lines.next()).value) };
};
const gone = (pid) => {
  const deadline = Date.now() + 5000;
  while (fs.existsSync("/proc/" + pid) && Date.now() < deadline);
};
const nextPid = (pid) => writeFileSync("/proc/sys/kernel/ns_last_pid", String(pid - 1));
const recordSignalsTo = (target) => {
  const signals = [];
  process.kill = (pid, signal) => {
    if (Math.abs(pid) !== target || signal === 0) return realKill(pid, signal);
    signals.push(signal);
    return true;
  };
  return signals;
};
const REAPER = "sleep 60 & echo $!; wait; exec sleep 60";
`;

/**
 * A shell runs `sleep`, the victim, and reaps it. The run records the
 * victim (`root`) or the shell (`child`), at least ten clock ticks before
 * the new process starts, so their start times differ. Inside
 * `killRecorded` the victim dies and a new process takes its pid: in `root`
 * mode when the walk lists /proc, in `child` mode after the second read of
 * the victim's stat, once the tree is read and confirmed.
 */
const TAKE_PID = `${PRELUDE}
const { shell, child: victim } = await run(REAPER);
const recordedPid = mode === "root" ? victim : shell.pid;
const record = { pid: recordedPid, startTime: startTimeOf(recordedPid) };
await sleep(100);
let taker;
let reads = 0;
const takePid = () => {
  if (taker) return;
  realKill(victim, "SIGKILL");
  gone(victim);
  nextPid(victim);
  taker = spawn("sleep", ["60"], { stdio: "ignore" });
};
fs.readdirSync = (path, ...rest) => {
  if (mode === "root" && path === "/proc") takePid();
  return readdirSync(path, ...rest);
};
fs.readFileSync = (path, ...rest) => {
  const read = readFileSync(path, ...rest);
  if (mode === "child" && path === "/proc/" + victim + "/stat" && ++reads === 2) takePid();
  return read;
};
syncBuiltinESMExports();
const signals = recordSignalsTo(victim);
await killRecorded([record]).catch(() => []);
console.log(JSON.stringify({ taken: taker?.pid === victim, signals: signals.length, running: isRunning(victim) }));
process.exit(0);
`;

/**
 * The run records a shell whose child is a member of its tree; an unrelated
 * shell has a child at pid 96, which the walk reads after the member since
 * /proc lists in string order. Right after the walk reads the member's
 * stat, both children die, a newcomer takes the member's pid and forks a
 * child that takes pid 96, so the walk finds that child under the member's
 * pid.
 */
const LINK_CHILD = `${PRELUDE}
const { shell, child: member } = await run(REAPER);
nextPid(95);
const { child: foreign } = await run(REAPER);
const record = { pid: shell.pid, startTime: startTimeOf(shell.pid) };
await sleep(100);
const dir = mkdtempSync(tmpdir() + "/pid-reuse-");
let newcomer;
let parent;
fs.readFileSync = (path, ...rest) => {
  const read = readFileSync(path, ...rest);
  if (!newcomer && path === "/proc/" + member + "/stat") {
    realKill(member, "SIGKILL");
    gone(member);
    realKill(foreign, "SIGKILL");
    gone(foreign);
    nextPid(member);
    newcomer = spawn("sh", ["-c", "while [ ! -e " + dir + "/go ]; do :; done; sleep 60 & wait"], { stdio: "ignore" });
    nextPid(foreign);
    writeFileSync(dir + "/go", "");
    const deadline = Date.now() + 5000;
    while (!fs.existsSync("/proc/" + foreign) && Date.now() < deadline);
    parent = Number(readFileSync("/proc/" + foreign + "/stat", "utf8").split(") ")[1].split(" ")[1]);
  }
  return read;
};
syncBuiltinESMExports();
const signals = recordSignalsTo(foreign);
await killRecorded([record]).catch(() => []);
console.log(JSON.stringify({ linked: newcomer?.pid === member && parent === member, signals: signals.length }));
process.exit(0);
`;

/**
 * The run records a shell that starts a group leader and never reaps it:
 * the leader starts `sleep` in its group and exits, so it stays a zombie
 * and its `sleep` moves to pid 1, out of the tree the walk finds. Only the
 * signal to the leader's group reaches that `sleep`.
 */
const ZOMBIE_LEADER = `${PRELUDE}
const { shell, child: member } = await run("setsid sh -c 'sleep 60 & echo $!; exit 0' & exec sleep 60");
const record = { pid: shell.pid, startTime: startTimeOf(shell.pid) };
await sleep(300);
const leader = Number(readFileSync("/proc/" + member + "/stat", "utf8").split(") ")[1].split(" ")[2]);
const zombie = readFileSync("/proc/" + leader + "/stat", "utf8").split(") ")[1].startsWith("Z");
await (mode === "stop" ? stopRecorded : killRecorded)([record]);
await sleep(200);
console.log(JSON.stringify({ zombie, running: isRunning(member) }));
process.exit(0);
`;

/**
 * Runs where /proc is hidden behind an empty mount, as on a system with no
 * /proc: the run records one group leader twice, as two records with its
 * pid.
 */
const TWICE_WITHOUT_PROC = `${PRELUDE}
const { child } = await run("echo $$; exec sleep 60");
const signals = [];
process.kill = (pid, signal) => {
  if (Math.abs(pid) === child && signal !== 0) signals.push(signal);
  return realKill(pid, signal);
};
const startedAt = new Date().toISOString();
const lines = await killRecorded([{ pid: child, startedAt }, { pid: child, startedAt }]);
console.log(JSON.stringify({ lines: lines.length, signals: signals.length }));
process.exit(0);
`;

const isTakeReport = objectOf({
  taken: isBoolean,
  signals: isNumber,
  running: isBoolean,
});

const isLinkReport = objectOf({ linked: isBoolean, signals: isNumber });

const isZombieReport = objectOf({ zombie: isBoolean, running: isBoolean });

const isTwiceReport = objectOf({ lines: isNumber, signals: isNumber });

/** @returns {boolean} True where the test may make a user and PID namespace */
function canUnshare() {
  return (
    spawnSync("unshare", ["-Ur", "--fork", "--pid", "--mount-proc", "true"])
      .status === 0
  );
}

/**
 * Runs a nested script as pid 1 of a PID namespace of its own, so the pid
 * it frees is the next one the kernel gives, and decodes the one line it
 * prints. In mode `no-proc`, /proc is hidden behind an empty mount instead.
 *
 * @template T
 * @param {string} script The script
 * @param {string} mode Its mode argument
 * @param {import("./json.mjs").Guard<T>} guard The shape of its report
 * @returns {T} Its report
 */
function nested(script, mode, guard) {
  const namespace =
    mode === "no-proc"
      ? ["--mount", "sh", "-c", 'mount -t tmpfs none /proc && exec "$@"', "sh"]
      : ["--mount-proc"];
  const result = spawnSync(
    "unshare",
    [
      "-Ur",
      "--fork",
      "--pid",
      ...namespace,
      process.execPath,
      "--input-type=module",
      "-e",
      script,
      import.meta.dirname,
      mode,
    ],
    { encoding: "utf8", timeout: NESTED_TIMEOUT_MS },
  );
  assert.equal(result.status, 0, result.stderr);
  /** @type {unknown} */
  const parsed = JSON.parse(result.stdout);
  return decode(guard, parsed, "the nested script", "a report");
}

const options = {
  skip: !canUnshare() && "this host does not let the test make a PID namespace",
  timeout: NESTED_TIMEOUT_MS,
};

await test(
  "killRecorded sends no signal to a process that took a recorded pid after the record was checked; a version that reads the start time again after the check kills it",
  options,
  () => {
    assert.deepEqual(nested(TAKE_PID, "root", isTakeReport), {
      taken: true,
      signals: 0,
      running: true,
    });
  },
);

await test(
  "killRecorded sends no signal to a process that took a descendant's pid after the tree was read and confirmed; a version that does not check its start time again right before the signal kills it",
  options,
  () => {
    assert.deepEqual(nested(TAKE_PID, "child", isTakeReport), {
      taken: true,
      signals: 0,
      running: true,
    });
  },
);

await test(
  "killRecorded sends no signal to a child forked by a process that took the pid of a tree member while the tree was read; a version that does not confirm the tree after the walk kills it",
  options,
  () => {
    assert.deepEqual(nested(LINK_CHILD, "kill", isLinkReport), {
      linked: true,
      signals: 0,
    });
  },
);

for (const mode of ["kill", "stop"]) {
  await test(
    `${mode === "kill" ? "killRecorded" : "stopRecorded"} stops the group of a tree member that exited and was never reaped; a version that signals only processes that still run leaves that group running`,
    options,
    () => {
      assert.deepEqual(nested(ZOMBIE_LEADER, mode, isZombieReport), {
        zombie: true,
        running: false,
      });
    },
  );
}

await test(
  "on a system with no /proc, killRecorded signals and reports a process recorded twice once; a version that keeps one target per record signals it twice",
  options,
  () => {
    assert.deepEqual(nested(TWICE_WITHOUT_PROC, "no-proc", isTwiceReport), {
      lines: 1,
      signals: 1,
    });
  },
);
