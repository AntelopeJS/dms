import { readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { isAlive } from "./identity.mjs";
import { descendantsOf, listenersOf } from "./processes.mjs";

const POLL_MS = 500;
const READY_POLL_MS = 100;
const PROBE_TIMEOUT_MS = 3_000;
const READY_TIMEOUT_MS = 180_000;

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
 * @typedef {() => string | null} Refusal Why a wait cannot succeed any more, or `null` while it can
 */

/** @type {Refusal} */
const NEVER = () => null;

/**
 * Polls `url` until it answers 200, the process exits, `refused` tells why
 * it never will, or the timeout passes.
 *
 * @param {string} url The readiness URL
 * @param {{ pid: number, log: string }} record The process that must serve it
 * @param {number} timeoutMs How long to wait
 * @param {Refusal} [refused] Read at every poll
 * @returns {Promise<void>} Resolves once ready
 * @throws When the process exits first, `refused` tells a reason or the timeout passes, naming its log
 */
export async function waitForOk(url, record, timeoutMs, refused = NEVER) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(record.pid)) {
      throw new Error(`${url}: the process exited first; see ${record.log}`);
    }
    const reason = refused();
    if (reason !== null) throw new Error(reason);
    if ((await probe(url)) === 200) return;
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
 * Polls until the process or one it started listens on the port, so a port
 * another program took after it was picked is not mistaken for ours.
 *
 * @param {number} port The port
 * @param {{ name: string, pid: number, log: string }} record The process that must listen
 * @param {number} timeoutMs How long to wait
 * @param {Refusal} [refused] Read at every poll
 * @returns {Promise<void>} Resolves once the process listens
 * @throws When it exits first (the port was taken), `refused` tells a reason or the timeout passes
 */
export async function waitForOwnPort(port, record, timeoutMs, refused = NEVER) {
  if (listenersOf(port) === null) return waitForPort(port, record, timeoutMs);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && isAlive(record.pid)) {
    const own = new Set([record.pid, ...descendantsOf([record.pid])]);
    if (listenersOf(port)?.some((pid) => own.has(pid))) return;
    const reason = refused();
    if (reason !== null) throw new Error(reason);
    await sleep(READY_POLL_MS);
  }
  throw new Error(
    `${record.name} does not listen on ${port}; see ${record.log}`,
  );
}

/**
 * Why a backend never listens on its port: its log says the port was in use
 * when it started, and it listens on another one instead.
 *
 * @param {import("./run-state.mjs").ServerRecord} backend The backend
 * @returns {Refusal}
 */
function movedOff(backend) {
  const line = `Port ${backend.port} in use, listening on `;
  return () => {
    let log = "";
    try {
      log = readFileSync(backend.log, "utf8");
    } catch {
      return null;
    }
    if (!log.includes(line)) return null;
    return `${backend.name} found port ${backend.port} in use when it started and listens on another one; see ${backend.log}`;
  };
}

/**
 * Waits until a backend listens on its own port and answers
 * `/api/onboarding/informations` there.
 *
 * @param {import("./run-state.mjs").ServerRecord} backend The backend
 * @returns {Promise<void>} Resolves once it answers 200
 * @throws When it exits first, another process holds its port, its log says it listens on another port, or the timeout passes, naming its log
 */
export async function waitForBackend(backend) {
  const refused = movedOff(backend);
  await waitForOwnPort(backend.port, backend, READY_TIMEOUT_MS, refused);
  await waitForOk(
    `http://127.0.0.1:${backend.port}/api/onboarding/informations`,
    backend,
    READY_TIMEOUT_MS,
    refused,
  );
}

/**
 * Waits until the run's dashboard listens on the run's web port and answers
 * `/dms-preview` there.
 *
 * @param {Pick<import("./run-state.mjs").RunState, "webPort" | "webUrl">} state The run
 * @param {import("./run-state.mjs").ProcessRecord} frontend The dashboard's process
 * @returns {Promise<void>} Resolves once it answers 200
 * @throws When it exits first, another process holds its port or the timeout passes, naming its log
 */
export async function waitForDashboard(state, frontend) {
  await waitForOwnPort(state.webPort, frontend, READY_TIMEOUT_MS);
  await waitForOk(`${state.webUrl}/dms-preview`, frontend, READY_TIMEOUT_MS);
}
