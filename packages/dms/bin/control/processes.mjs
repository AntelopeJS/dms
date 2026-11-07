import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import { createConnection, createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const POLL_MS = 500;
const READY_POLL_MS = 100;
const KILL_POLL_MS = 10;
const STOP_GRACE_MS = 10_000;
const PROBE_TIMEOUT_MS = 3_000;
const LISTEN_STATE = "0A";
const HEX = 16;

/**
 * @param {string | import("node:net").AddressInfo | null} address What a listening server reports
 * @returns {address is import("node:net").AddressInfo} True for the address of a TCP listener
 */
function isTcpAddress(address) {
  return typeof address === "object" && address !== null;
}

/**
 * Asks the kernel for a free TCP port on the loopback interface.
 *
 * @returns {Promise<number>} The port
 */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!isTcpAddress(address)) {
        server.close(() =>
          reject(new Error("the probe server has no TCP port")),
        );
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

/**
 * Starts a long-running program in its own process group, its output going
 * straight to `<logs>/<name>.log` so it survives the caller.
 *
 * @param {{ name: string, program: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, logs: string }} spec What to start and where its log goes
 * @returns {{ name: string, pid: number, command: string, cwd: string, log: string, startedAt: string }} The process record
 */
export function startDetached(spec) {
  const log = join(spec.logs, `${spec.name}.log`);
  const output = openSync(log, "a");
  const child = spawn(spec.program, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    detached: true,
    stdio: ["ignore", output, output],
  });
  closeSync(output);
  child.unref();
  if (child.pid === undefined) {
    throw new Error(`Could not start ${spec.name}: ${spec.program}`);
  }
  return {
    name: spec.name,
    pid: child.pid,
    command: [spec.program, ...spec.args].join(" "),
    cwd: spec.cwd,
    log,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Runs a program to completion, its output appended to `<logs>/<name>.log`.
 *
 * @param {{ name: string, program: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, logs: string }} spec What to run
 * @returns {Promise<void>} Resolves on exit code 0
 * @throws When the program exits otherwise, naming its log
 */
export function runToEnd(spec) {
  const log = join(spec.logs, `${spec.name}.log`);
  const output = openSync(log, "a");
  return new Promise((resolve, reject) => {
    const child = spawn(spec.program, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ["ignore", output, output],
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      closeSync(output);
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`${spec.name} exited with ${code ?? signal}; see ${log}`),
      );
    });
  });
}

const MAX_PID = 2 ** 31 - 1;

/**
 * Whether `pid` names one process a signal may target: a whole number above
 * 1 that fits a signed 32-bit process id. `kill(-1)` reaches every process of the user, `kill(0)` the caller's own
 * process group, and `kill(-pid)` on 1 is `kill(-1)`.
 *
 * @param {unknown} pid The value to check
 * @returns {pid is number} True for a whole number above 1
 */
function isSignalable(pid) {
  return Number.isInteger(pid) && Number(pid) > 1 && Number(pid) <= MAX_PID;
}

/**
 * Throws unless `pid` names one process a signal may target, so no caller
 * can turn a missing or corrupt PID into a signal to every process.
 *
 * @param {unknown} pid The value to check
 * @throws {TypeError} When it is not a whole number above 1
 */
export function assertSignalable(pid) {
  if (!isSignalable(pid)) {
    throw new TypeError(
      `refusing to signal pid ${String(pid)}: not a process id above 1`,
    );
  }
}

/**
 * Whether a process with this PID exists.
 *
 * @param {number} pid The process id
 * @returns {boolean} True while it runs
 */
export function isAlive(pid) {
  if (!isSignalable(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a process with this PID runs: it exists and is not a finished
 * zombie. A killed process that nothing reaps stays a zombie; once its last
 * thread has exited it holds no socket and runs no code. Its main thread
 * shows as a zombie while other threads still exit and still hold its
 * sockets, so that one still runs. Without `/proc`, existing is running.
 *
 * @param {number} pid The process id
 * @returns {boolean} True while it runs
 */
export function isRunning(pid) {
  if (!isAlive(pid)) return false;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const zombie = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0] === "Z";
    return !zombie || readdirSync(`/proc/${pid}/task`).length > 1;
  } catch {
    return isAlive(pid);
  }
}

/**
 * The status of one GET, or `null` when nothing answered.
 *
 * @param {string} url The URL
 * @returns {Promise<number | null>} The HTTP status
 */
export async function probe(url) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    await response.body?.cancel();
    return response.status;
  } catch {
    return null;
  }
}

/**
 * Polls `url` until it answers 200, the process exits or the timeout passes.
 *
 * @param {string} url The readiness URL
 * @param {{ pid: number, log: string }} record The process that must serve it
 * @param {number} timeoutMs How long to wait
 * @returns {Promise<void>} Resolves once ready
 * @throws When the process exits first or the timeout passes, naming its log
 */
export async function waitForOk(url, record, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await probe(url)) === 200) return;
    if (!isAlive(record.pid)) {
      throw new Error(`${url}: the process exited first; see ${record.log}`);
    }
    await sleep(READY_POLL_MS);
  }
  throw new Error(
    `${url} did not answer 200 in ${timeoutMs} ms; see ${record.log}`,
  );
}

/** @param {number} port */
function accepts(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/**
 * Polls a loopback port until it accepts a connection, the process exits or
 * the timeout passes.
 *
 * @param {number} port The port
 * @param {{ name: string, pid: number, log: string }} record The process that must listen
 * @param {number} timeoutMs How long to wait
 * @returns {Promise<void>} Resolves once it listens
 * @throws When the process exits first or the timeout passes, naming its log
 */
export async function waitForPort(port, record, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await accepts(port)) return;
    if (!isAlive(record.pid)) break;
    await sleep(POLL_MS);
  }
  throw new Error(
    `${record.name} did not listen on ${port}; see ${record.log}`,
  );
}

/**
 * Polls until the process itself listens on the port, so a port another
 * program took after it was picked is not mistaken for ours.
 *
 * @param {number} port The port
 * @param {{ name: string, pid: number, log: string }} record The process that must listen
 * @param {number} timeoutMs How long to wait
 * @returns {Promise<void>} Resolves once the process listens
 * @throws When it exits first (the port was taken) or the timeout passes
 */
export async function waitForOwnPort(port, record, timeoutMs) {
  if (listenersOf(port) === null) return waitForPort(port, record, timeoutMs);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && isAlive(record.pid)) {
    if (listenersOf(port).includes(record.pid)) return;
    await sleep(POLL_MS);
  }
  throw new Error(
    `${record.name} does not listen on ${port}; see ${record.log}`,
  );
}

function procEntries() {
  try {
    return readdirSync("/proc").filter((entry) => /^\d+$/.test(entry));
  } catch {
    return [];
  }
}

/** @param {string} pid */
function parentOf(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
  } catch {
    return -1;
  }
}

/**
 * Every live descendant of `pids`, read from /proc. Empty where /proc is
 * missing. A child that left the process group is found here too.
 *
 * @param {number[]} pids The roots
 * @returns {number[]} The descendants, roots excluded
 */
export function descendantsOf(pids) {
  const parents = new Map(
    procEntries().map((entry) => [Number(entry), parentOf(entry)]),
  );
  const found = new Set(pids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, parent] of parents) {
      if (!found.has(pid) && found.has(parent)) {
        found.add(pid);
        grew = true;
      }
    }
  }
  return [...found].filter((pid) => !pids.includes(pid));
}

/** @param {number} port */
function listeningInodes(port) {
  const inodes = new Set();
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    if (!existsSync(table)) continue;
    for (const line of readFileSync(table, "utf8").split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/);
      const local = fields[1]?.split(":")[1];
      if (
        local &&
        Number.parseInt(local, HEX) === port &&
        fields[3] === LISTEN_STATE
      ) {
        inodes.add(fields[9]);
      }
    }
  }
  return inodes;
}

/** @param {number} pid */
function socketInodes(pid) {
  try {
    return readdirSync(`/proc/${pid}/fd`).flatMap((fd) => {
      const link = readlinkSync(`/proc/${pid}/fd/${fd}`, { encoding: "utf8" });
      const match = /^socket:\[(\d+)\]$/.exec(link);
      return match ? [match[1]] : [];
    });
  } catch {
    return [];
  }
}

/**
 * The processes listening on a TCP port, read from /proc, or `null` where
 * /proc cannot tell.
 *
 * @param {number} port The port
 * @returns {number[] | null} The PIDs that hold a listening socket on it
 */
export function listenersOf(port) {
  if (!existsSync("/proc/net/tcp")) return null;
  const inodes = listeningInodes(port);
  return procEntries()
    .map(Number)
    .filter((pid) => socketInodes(pid).some((inode) => inodes.has(inode)));
}

/**
 * @param {number} pid
 * @param {NodeJS.Signals} signal
 */
function signalGroup(pid, signal) {
  assertSignalable(pid);
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      return;
    }
  }
}

/**
 * Stops the processes a run recorded, as {@link stopAll} does, after leaving
 * out every recorded PID that is not a whole number above 1: a corrupt or
 * missing record is reported, never signalled, and the rest still stop.
 *
 * @param {unknown[]} pids The PIDs the run recorded
 * @returns {Promise<string[]>} One line per process signalled or skipped
 */
export async function stopRecorded(pids) {
  const skipped = pids
    .filter((pid) => !isSignalable(pid))
    .map((pid) => `skipped pid ${String(pid)}: not a process id above 1`);
  const stopped = await stopAll(pids.filter(isSignalable));
  return [...skipped, ...stopped];
}

/**
 * Kills recorded processes and every descendant with SIGKILL at once, and
 * resolves once they are gone and their sockets closed. Nothing flushes or
 * shuts down, so use it only where the process's state is thrown away.
 *
 * @param {number[]} pids The recorded PIDs
 * @returns {Promise<string[]>} One line per process killed
 * @throws {TypeError} When a pid is not a whole number above 1, before any signal
 * @throws When a process is still there after the grace period
 */
export async function killAll(pids) {
  for (const pid of pids) assertSignalable(pid);
  const targets = [...pids, ...descendantsOf(pids)].filter(isAlive);
  for (const pid of targets) signalGroup(pid, "SIGKILL");
  const deadline = Date.now() + STOP_GRACE_MS;
  while (targets.some(isRunning)) {
    if (Date.now() >= deadline) {
      throw new Error(
        `pid ${targets.filter(isRunning).join(", ")} survived SIGKILL`,
      );
    }
    await sleep(KILL_POLL_MS);
  }
  return targets.map((pid) => `killed pid ${pid}`);
}

/**
 * Kills the processes a run recorded, as {@link killAll} does, after leaving
 * out every recorded PID that is not a whole number above 1: a corrupt or
 * missing record is reported, never signalled, and the rest are killed.
 *
 * @param {unknown[]} pids The PIDs the run recorded
 * @returns {Promise<string[]>} One line per process killed or skipped
 */
export async function killRecorded(pids) {
  const skipped = pids
    .filter((pid) => !isSignalable(pid))
    .map((pid) => `skipped pid ${String(pid)}: not a process id above 1`);
  const killed = await killAll(pids.filter(isSignalable));
  return [...skipped, ...killed];
}

/**
 * Stops recorded processes and every descendant: SIGTERM to each process
 * group, then SIGKILL to whatever outlives the grace period. A PID that is
 * not a whole number above 1 throws before any signal is sent.
 *
 * @param {number[]} pids The recorded PIDs
 * @returns {Promise<string[]>} One line per process signalled
 */
export async function stopAll(pids) {
  for (const pid of pids) assertSignalable(pid);
  const targets = [...pids, ...descendantsOf(pids)].filter(isAlive);
  for (const pid of targets) signalGroup(pid, "SIGTERM");
  const deadline = Date.now() + STOP_GRACE_MS;
  while (targets.some(isAlive) && Date.now() < deadline) {
    await sleep(READY_POLL_MS);
  }
  const stubborn = targets.filter(isAlive);
  for (const pid of stubborn) signalGroup(pid, "SIGKILL");
  return targets.map(
    (pid) => `stopped pid ${pid}${stubborn.includes(pid) ? " (SIGKILL)" : ""}`,
  );
}
