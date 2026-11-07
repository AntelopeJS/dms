import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";

const MAX_PID = 2 ** 31 - 1;

/** @type {("pid" | "time")[]} The namespaces a recorded pid and start time hold in: the PID namespace numbers a process, and the time namespace offsets its start time. */
const NAMESPACE_KINDS = ["pid", "time"];

/** @typedef {{ pid?: string, time?: string }} Namespaces The namespaces a process runs in, as `/proc/self/ns` names them, such as `pid:[4026531836]` */

/** The index of the start time, field 22 of `/proc/<pid>/stat`, among the fields after the command name, which start at field 3. */
const START_TIME_FIELD = 19;

/** The length of a clock tick in /proc: USER_HZ is 100 on every architecture Node runs on. */
const MS_PER_TICK = 10;

const MS_PER_SECOND = 1000;

/** How far the kernel start of a process may sit from the time a record without a start time says the run started it: `/proc/stat` gives the boot time to the second, and a loaded host can take a moment between the start and the record. */
const START_TOLERANCE_MS = 5_000;

/**
 * Whether `pid` names one process a signal may target: a whole number above
 * 1 that fits a signed 32-bit process id. `kill(-1)` reaches every process
 * of the user, `kill(0)` the caller's own process group, and `kill(-pid)` on
 * 1 is `kill(-1)`.
 *
 * @param {unknown} pid The value to check
 * @returns {pid is number} True for a whole number above 1
 */
export function isSignalable(pid) {
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
 * When the kernel started `pid`, in clock ticks since boot (field 22 of
 * `/proc/<pid>/stat`), or `null` when no such process exists.
 *
 * @param {number} pid The process id
 * @returns {number | null} Its start time
 */
export function startTimeOf(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const ticks = Number(fields[START_TIME_FIELD]);
    return Number.isSafeInteger(ticks) ? ticks : null;
  } catch {
    return null;
  }
}

/** @returns {number | null} The pid `/proc/self/stat` gives this process, or `null` without one */
function pidInProc() {
  try {
    const stat = readFileSync("/proc/self/stat", "utf8");
    return Number(stat.slice(0, stat.indexOf(" ")));
  } catch {
    return null;
  }
}

/**
 * Whether this system has a /proc at all. Without one, as on macOS, nothing
 * records start times and a process is told apart by its pid alone, as
 * dms-control always did there.
 *
 * @returns {boolean} True when `/proc/self` exists
 */
function hasProc() {
  return existsSync("/proc/self");
}

/**
 * Throws unless /proc belongs to this process's PID namespace, the only
 * place a start time tells a recorded process from another that holds its
 * pid now. A system with no /proc at all passes: there the pid alone names
 * a process. In a PID namespace that mounted no /proc of its own, as under
 * `unshare --pid` without `--mount-proc`, `/proc/<pid>` is whichever process
 * of another namespace has that number.
 *
 * @throws When `/proc/self` exists but `/proc/self/stat` names another pid or cannot be read
 */
export function assertOwnProc() {
  if (!hasProc()) return;
  const shown = pidInProc();
  if (shown === process.pid) return;
  const seen =
    shown === null
      ? "/proc/self/stat cannot be read"
      : `/proc shows this process as pid ${shown}, not ${process.pid}`;
  throw new Error(
    `${seen}: /proc is not this PID namespace's, so no process the run recorded can be told from another that holds its pid now; nothing was started or signalled. Run dms-control where /proc belongs to its PID namespace, such as under unshare --mount-proc`,
  );
}

/**
 * @param {"pid" | "time"} kind
 * @returns {string | undefined}
 */
function namespaceOf(kind) {
  try {
    return readlinkSync(`/proc/self/ns/${kind}`);
  } catch {
    return undefined;
  }
}

/**
 * The PID and time namespaces this process runs in. A kind the kernel does
 * not have, or a system with no /proc, leaves its field out.
 *
 * @returns {Namespaces} The namespaces
 */
export function currentNamespaces() {
  return { pid: namespaceOf("pid"), time: namespaceOf("time") };
}

/**
 * Throws unless this process runs in every namespace a run recorded when it
 * started. Each pid and start time the run recorded names a process only in
 * those namespaces: elsewhere every record would look gone, and a command
 * would forget processes that still run. A run that recorded none, as an
 * earlier dms-control or a system with no /proc wrote it, passes.
 *
 * @param {Namespaces | undefined} recorded The namespaces the run was started in
 * @throws When one of them is not this process's
 */
export function assertSameNamespaces(recorded) {
  const current = currentNamespaces();
  const differ = NAMESPACE_KINDS.filter(
    (kind) =>
      recorded?.[kind] !== undefined && recorded[kind] !== current[kind],
  );
  if (recorded === undefined || differ.length === 0) return;
  const kinds = differ.map((kind) => (kind === "pid" ? "PID" : kind));
  const run = differ.map((kind) => recorded[kind]).join(", ");
  const here = differ.map((kind) => current[kind] ?? "unknown").join(", ");
  throw new Error(
    `this run was started in another ${kinds.join(" and ")} namespace (run: ${run}; here: ${here}); run this command there`,
  );
}

/**
 * Whether the kernel started a process `ticks` after boot within a few
 * seconds of `startedAt`.
 *
 * @param {number} ticks The kernel start time, in clock ticks since boot
 * @param {string | undefined} startedAt When the run says it started the process, as an ISO time
 * @returns {boolean} True when both name the same moment
 */
function startedAround(ticks, startedAt) {
  try {
    const btime = /^btime (\d+)$/m.exec(readFileSync("/proc/stat", "utf8"));
    const started = Number(btime?.[1]) * MS_PER_SECOND + ticks * MS_PER_TICK;
    return (
      Math.abs(started - Date.parse(startedAt ?? "")) <= START_TOLERANCE_MS
    );
  } catch {
    return false;
  }
}

/**
 * Whether `record` still names the process the run started: its pid runs,
 * and the kernel started that process at the time recorded with it, so a
 * pid the system has since given to another process is not taken for it. A
 * record with no start time, as an earlier dms-control wrote, names the
 * process only while the kernel started it within a few seconds of the
 * record's `startedAt`. On a system with no /proc, a running pid names it.
 *
 * @param {{ pid: number, startTime?: number | null, startedAt?: string }} record A process the run recorded
 * @returns {boolean} True while that process runs
 * @throws When /proc is not this PID namespace's, before it reads any record
 */
export function isSameProcess(record) {
  assertOwnProc();
  if (!isSignalable(record.pid)) return false;
  if (!hasProc()) return isAlive(record.pid);
  if (!isRunning(record.pid)) return false;
  const ticks = startTimeOf(record.pid);
  const recorded = record.startTime ?? null;
  if (ticks === null) return false;
  return recorded === null
    ? startedAround(ticks, record.startedAt)
    : ticks === recorded;
}
