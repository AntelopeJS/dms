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
const STOP_GRACE_MS = 10_000;
const PROBE_TIMEOUT_MS = 3_000;
const LISTEN_STATE = "0A";
const HEX = 16;

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
      const { port } = server.address();
      server.close(() => resolve(port));
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

/**
 * Whether a process with this PID exists.
 *
 * @param {number} pid The process id
 * @returns {boolean} True while it runs
 */
export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
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
    await sleep(POLL_MS);
  }
  throw new Error(
    `${url} did not answer 200 in ${timeoutMs} ms; see ${record.log}`,
  );
}

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

function signalGroup(pid, signal) {
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
 * Stops recorded processes and every descendant: SIGTERM to each process
 * group, then SIGKILL to whatever outlives the grace period.
 *
 * @param {number[]} pids The recorded PIDs
 * @returns {Promise<string[]>} One line per process signalled
 */
export async function stopAll(pids) {
  const targets = [...pids, ...descendantsOf(pids)].filter(isAlive);
  for (const pid of targets) signalGroup(pid, "SIGTERM");
  const deadline = Date.now() + STOP_GRACE_MS;
  while (targets.some(isAlive) && Date.now() < deadline) await sleep(POLL_MS);
  const stubborn = targets.filter(isAlive);
  for (const pid of stubborn) signalGroup(pid, "SIGKILL");
  return targets.map(
    (pid) => `stopped pid ${pid}${stubborn.includes(pid) ? " (SIGKILL)" : ""}`,
  );
}
