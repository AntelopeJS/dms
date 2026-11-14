import { spawn } from "node:child_process";
import { randomInt } from "node:crypto";
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
import {
  assertOwnProc,
  assertSignalable,
  hasProc,
  isAlive,
  isSameProcess,
  isSignalable,
  startedAs,
  startTimeOf,
  statOf,
} from "./identity.mjs";

const POLL_MS = 500;
const READY_POLL_MS = 100;
const KILL_POLL_MS = 10;
const STOP_GRACE_MS = 10_000;
const PROBE_TIMEOUT_MS = 3_000;
const LISTEN_STATE = "0A";
const HEX = 16;
const EPHEMERAL_RANGE_FILE = "/proc/sys/net/ipv4/ip_local_port_range";
const FIRST_UNPRIVILEGED_PORT = 1024;
const LAST_PORT = 65_535;
const RESTARTABLE_PORT_ATTEMPTS = 100;

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
 * @param {number} port A loopback port
 * @returns {Promise<boolean>} Whether a server can listen on it now
 */
function canListen(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

/**
 * The kernel's ephemeral port range, the ports it gives an outgoing
 * connection or a `listen(0)`, or `null` where /proc does not tell it.
 *
 * @returns {{ low: number, high: number } | null} Its first and last port
 */
function ephemeralRange() {
  if (!existsSync(EPHEMERAL_RANGE_FILE)) return null;
  const [low, high] = readFileSync(EPHEMERAL_RANGE_FILE, "utf8")
    .trim()
    .split(/\s+/)
    .map(Number);
  return { low, high };
}

/**
 * A free loopback port outside the kernel's ephemeral range, for a server
 * that must listen on the same port again after it restarts. No outgoing
 * connection takes such a port as its source port, so none can hold it in
 * TIME_WAIT and make that listen fail with `EADDRINUSE`, as a port from
 * {@link freePort} can be held. Where /proc does not tell the range, or no
 * unprivileged port outside it is free, it is a port from {@link freePort}.
 *
 * @returns {Promise<number>} The port
 */
export async function restartablePort() {
  const range = ephemeralRange();
  if (range === null) return freePort();
  const below = Math.max(range.low - FIRST_UNPRIVILEGED_PORT, 0);
  const above = Math.max(LAST_PORT - range.high, 0);
  if (below + above === 0) return freePort();
  for (let attempt = 0; attempt < RESTARTABLE_PORT_ATTEMPTS; attempt += 1) {
    const index = randomInt(below + above);
    const port =
      index < below
        ? FIRST_UNPRIVILEGED_PORT + index
        : range.high + 1 + index - below;
    if (await canListen(port)) return port;
  }
  return freePort();
}

/**
 * Starts a long-running program in its own process group, its output going
 * straight to `<logs>/<name>.log` so it survives the caller. The record
 * holds the kernel's start time of the process, which tells it apart from
 * a later process given the same pid.
 *
 * @param {{ name: string, program: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, logs: string }} spec What to start and where its log goes
 * @returns {{ name: string, pid: number, startTime: number | null, command: string, cwd: string, log: string, startedAt: string }} The process record
 * @throws When /proc is not this PID namespace's, before it starts anything
 */
export function startDetached(spec) {
  assertOwnProc();
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
    startTime: startTimeOf(child.pid),
    command: [spec.program, ...spec.args].join(" "),
    cwd: spec.cwd,
    log,
    startedAt: new Date().toISOString(),
  };
}

/** A program that ran to its end and exited with another code than 0. */
export class ExitError extends Error {
  /**
   * @param {string} message What exited, how, and where its log is
   * @param {number | null} exitCode Its exit code, or null when a signal ended it
   */
  constructor(message, exitCode) {
    super(message);
    /** Its exit code, or null when a signal ended it. */
    this.exitCode = exitCode;
  }
}

/**
 * Runs a program to completion, its output appended to `<logs>/<name>.log`.
 *
 * @param {{ name: string, program: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, logs: string }} spec What to run
 * @returns {Promise<void>} Resolves on exit code 0
 * @throws {ExitError} When the program exits otherwise, naming its log
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
        new ExitError(
          `${spec.name} exited with ${code ?? signal}; see ${log}`,
          code,
        ),
      );
    });
  });
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

/** @typedef {Map<number, { parent: number, startTime: number }>} ProcessTable Each process /proc lists, with its parent and start time from one read of its stat */

/** @returns {ProcessTable} */
function processTable() {
  /** @type {ProcessTable} */
  const table = new Map();
  for (const pid of procEntries().map(Number)) {
    const stat = statOf(pid);
    if (stat) table.set(pid, stat);
  }
  return table;
}

/**
 * @param {number[]} roots
 * @param {ProcessTable} table
 * @returns {Set<number>} The roots and every process of `table` below one of them
 */
function familyOf(roots, table) {
  const found = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, { parent }] of table) {
      if (!found.has(pid) && found.has(parent)) {
        found.add(pid);
        grew = true;
      }
    }
  }
  return found;
}

/**
 * Every live descendant of `pids`, read from /proc. Empty where /proc is
 * missing. A child that left the process group is found here too.
 *
 * @param {number[]} pids The roots
 * @returns {number[]} The descendants, roots excluded
 */
export function descendantsOf(pids) {
  return [...familyOf(pids, processTable())].filter(
    (pid) => !pids.includes(pid),
  );
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

/** @typedef {{ pid: number, startTime?: number | null, startedAt?: string }} RecordedProcess A process a run recorded, as {@link isSameProcess} tells it apart */

/**
 * The recorded processes that still run as the run started them, and their
 * descendants, each with the start time that tells it apart from a later
 * process given its pid. Each process is found and identified by one read
 * of its stat, so a pid another process takes while the tree is read never
 * joins it with the newcomer's start time. Once the tree is read, a process
 * whose start time changed is left out with everything found below it, so
 * a child of a process that took a parent's pid during the walk never joins
 * it. A record whose pid another process holds now, or whose pid is not a
 * whole number above 1, is left out, so no descendant of 0 or 1 is ever
 * looked up.
 *
 * @param {RecordedProcess[]} records The recorded processes
 * @returns {{ pid: number, startTime: number | null }[]} One entry per process
 */
function ownProcesses(records) {
  const live = records.filter(isSameProcess);
  if (!hasProc()) {
    return [...new Set(live.map(({ pid }) => pid))].map((pid) => ({
      pid,
      startTime: null,
    }));
  }
  const table = processTable();
  const roots = live
    .filter((record) => {
      const stat = table.get(record.pid);
      return stat !== undefined && startedAs(record, stat.startTime);
    })
    .map(({ pid }) => pid);
  /** @type {ProcessTable} */
  const unchanged = new Map();
  for (const pid of familyOf(roots, table)) {
    const stat = table.get(pid);
    if (stat && startTimeOf(pid) === stat.startTime) unchanged.set(pid, stat);
  }
  const kept = roots.filter((pid) => unchanged.has(pid));
  return [...familyOf(kept, unchanged)].flatMap((pid) => {
    const stat = unchanged.get(pid);
    return stat ? [{ pid, startTime: stat.startTime }] : [];
  });
}

/**
 * Signals the group of `target` only while its pid still names that
 * process, checked by its start time right before the signal. A zombie
 * still has its start time, and its pid cannot be reused until it is
 * reaped, so a group whose leader exited unreaped still gets the signal.
 *
 * @param {{ pid: number, startTime: number | null }} target A process of {@link ownProcesses}
 * @param {NodeJS.Signals} signal The signal
 * @returns {boolean} True when the signal was sent
 */
function signalIfSame(target, signal) {
  const same =
    target.startTime === null
      ? isSameProcess(target)
      : startTimeOf(target.pid) === target.startTime;
  if (!same) return false;
  signalGroup(target.pid, signal);
  return true;
}

/**
 * @param {RecordedProcess[]} records
 * @returns {string[]} One line per record whose pid is not a whole number above 1
 */
function skippedRecords(records) {
  return records
    .filter((record) => !isSignalable(record.pid))
    .map(
      (record) => `skipped pid ${String(record.pid)}: not a process id above 1`,
    );
}

/**
 * Stops the processes a run recorded and every descendant: SIGTERM to each
 * process group, then SIGKILL to whatever outlives the grace period. Each is
 * signalled only while its pid still runs the process recorded, checked
 * right before each signal. A record whose pid is not a whole number above
 * 1 is reported, never signalled, and the rest still stop.
 *
 * @param {RecordedProcess[]} records The recorded processes
 * @returns {Promise<string[]>} One line per record skipped and per process signalled
 * @throws When /proc is not this PID namespace's, before it signals anything
 */
export async function stopRecorded(records) {
  const targets = ownProcesses(records);
  for (const target of targets) signalIfSame(target, "SIGTERM");
  const deadline = Date.now() + STOP_GRACE_MS;
  while (targets.some(isSameProcess) && Date.now() < deadline) {
    await sleep(READY_POLL_MS);
  }
  const stubborn = targets
    .filter(isSameProcess)
    .filter((target) => signalIfSame(target, "SIGKILL"));
  return [
    ...skippedRecords(records),
    ...targets.map(
      ({ pid }) =>
        `stopped pid ${pid}${stubborn.some((target) => target.pid === pid) ? " (SIGKILL)" : ""}`,
    ),
  ];
}

/**
 * Kills the processes a run recorded and every descendant with SIGKILL at
 * once, for a backend whose database goes next, and resolves once none of
 * them runs. Nothing flushes or shuts down. A zombie whose threads have all
 * exited no longer runs, so one that nothing reaps does not hold the wait.
 * Each is signalled only while its pid still runs the process recorded,
 * checked right before the signal, so a pid another process took while the
 * caller waited is left alone. A record whose pid is not a whole number
 * above 1 is reported, never signalled, and the rest are still killed.
 *
 * @param {RecordedProcess[]} records The recorded processes
 * @returns {Promise<string[]>} One line per record skipped and per process killed
 * @throws When /proc is not this PID namespace's, before it signals anything
 * @throws When a process still runs after the grace period
 */
export async function killRecorded(records) {
  const targets = ownProcesses(records);
  for (const target of targets) signalIfSame(target, "SIGKILL");
  const deadline = Date.now() + STOP_GRACE_MS;
  while (targets.some(isSameProcess)) {
    if (Date.now() >= deadline) {
      const left = targets.filter(isSameProcess).map(({ pid }) => pid);
      throw new Error(`pid ${left.join(", ")} survived SIGKILL`);
    }
    await sleep(KILL_POLL_MS);
  }
  return [
    ...skippedRecords(records),
    ...targets.map(({ pid }) => `killed pid ${pid}`),
  ];
}
