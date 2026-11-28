import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { arrayOf, decode, isBoolean, isRecord, objectOf } from "./json.mjs";
import { frontendPackage } from "./launch.mjs";
import { probe, waitForOk } from "./waits.mjs";

const MODULE_SET = "./dist/module-set.js";
const MANIFEST_PATH = "/dms/frontend?renderer=vue&rendererVersion=3";
const BOOTSTRAP_HEADER = "x-dms-bootstrap";
const POLL_MS = 100;
const SETTLE_TIMEOUT_MS = 60_000;
const REBUILD_START_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 180_000;

const isManifest = objectOf(
  { modules: arrayOf(isRecord) },
  { settling: isBoolean },
);

/**
 * The file that holds the fingerprint of the frontend module set the run's
 * `ajs dms dev` dashboard serves. A run without it serves a build, or a
 * dashboard that does not rebuild when the set changes.
 *
 * @param {string} dir The run folder
 * @returns {string} The file
 */
export function dashboardModulesFile(dir) {
  return join(dir, "dashboard-modules");
}

/**
 * @param {string} file
 * @returns {string | null}
 */
function readServed(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * @param {string} file
 * @param {string} fingerprint
 */
function writeServed(file, fingerprint) {
  const next = `${file}.${process.pid}`;
  writeFileSync(next, fingerprint);
  renameSync(next, file);
}

/**
 * The `moduleSetFingerprint` of the run's dms-frontend, which its dev
 * dashboard compares the backend's module set with, or `null` when that
 * release has none and so never rebuilds on a change.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @returns {((modules: unknown[]) => string) | null} The fingerprint
 */
function fingerprintOf(state) {
  const folder = frontendPackage(state.playground, state.renderer);
  /** @type {unknown} */
  let loaded;
  try {
    loaded = createRequire(join(folder, "package.json"))(MODULE_SET);
  } catch {
    return null;
  }
  if (!isRecord(loaded)) return null;
  const fingerprint = loaded.moduleSetFingerprint;
  if (!isFingerprint(fingerprint)) return null;
  return (modules) => String(fingerprint(modules));
}

/**
 * @param {unknown} value
 * @returns {value is (modules: unknown[]) => unknown}
 */
function isFingerprint(value) {
  return typeof value === "function";
}

/**
 * GETs `url` on a connection of its own. The run's API forwarder binds a
 * connection to the backend it reached when it opened, so a pooled one can
 * still lead to a backend `freshDatabase` has stopped.
 *
 * @param {string} url The URL
 * @param {Record<string, string>} headers The request headers
 * @returns {Promise<{ status: number, body: string }>} The status and the body
 */
function getOnOwnConnection(url, headers) {
  return new Promise((resolve, reject) => {
    const request = get(url, { agent: false, headers }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("error", reject);
      response.on("end", () =>
        resolve({ status: response.statusCode ?? 0, body }),
      );
    });
    request.on("error", reject);
  });
}

/**
 * The fingerprint of the frontend module set the run's API serves now, as
 * the dev dashboard reads it: through the API, with the run's bootstrap
 * secret, once the backend is not settling a store operation.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {(modules: unknown[]) => string} fingerprint The dashboard's fingerprint
 * @returns {Promise<string>} The fingerprint
 * @throws When the API does not serve a manifest, or settles past the timeout
 */
async function servedModuleSet(state, fingerprint) {
  const url = `${state.apiUrl}${MANIFEST_PATH}`;
  const secret = state.secrets.DMS_BOOTSTRAP_SECRET;
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  for (;;) {
    const response = await getOnOwnConnection(
      url,
      secret ? { [BOOTSTRAP_HEADER]: secret } : {},
    );
    if (response.status < 200 || response.status > 299) {
      throw new Error(`${url} answered ${response.status}`);
    }
    /** @type {unknown} */
    const body = JSON.parse(response.body);
    const manifest = decode(isManifest, body, url, "a frontend manifest");
    if (!manifest.settling) return fingerprint(manifest.modules);
    if (Date.now() > deadline) {
      throw new Error(`${url} still settles after ${SETTLE_TIMEOUT_MS} ms`);
    }
    await sleep(POLL_MS);
  }
}

/**
 * Records the module set the run's API serves as the one its dev dashboard
 * serves, once that dashboard answers: `up` starts it on that set. A run
 * that serves a build, or whose dms-frontend never rebuilds on a change,
 * records nothing.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @returns {Promise<void>} Resolves once recorded
 */
export async function recordDashboardModules(state) {
  if (state.frontendMode !== "dev") return;
  const fingerprint = fingerprintOf(state);
  if (!fingerprint) return;
  writeServed(
    dashboardModulesFile(state.dir),
    await servedModuleSet(state, fingerprint),
  );
}

/**
 * Waits until the run's dev dashboard serves the module set the API serves
 * now. The dashboard rebuilds its workspace when two of its polls read
 * another set than the one it serves, and refuses connections while it
 * does, so a journey that navigates in between fails. When the set changed,
 * this waits for the dashboard to stop and then answer again; otherwise it
 * returns at once. A run with no recorded set returns at once.
 *
 * @param {import("./run-state.mjs").RunState} state The run, its API pointed at the backend it now serves
 * @returns {Promise<void>} Resolves once the dashboard serves the API's set
 * @throws When the dashboard does not rebuild for the new set, or does not answer after it
 */
export async function awaitDashboard(state) {
  const file = dashboardModulesFile(state.dir);
  const served = readServed(file);
  if (served === null) return;
  const fingerprint = fingerprintOf(state);
  if (!fingerprint) return;
  const current = await servedModuleSet(state, fingerprint);
  if (current === served) return;
  const frontend = state.processes.find((entry) => entry.name === "frontend");
  if (!frontend) throw new Error("the run records no dashboard");
  const url = `${state.webUrl}/dms-preview`;
  const deadline = Date.now() + REBUILD_START_TIMEOUT_MS;
  while ((await probe(url)) === 200) {
    if (Date.now() > deadline) {
      throw new Error(
        `the dashboard did not rebuild for the API's new module set in ${REBUILD_START_TIMEOUT_MS} ms; see ${frontend.log}`,
      );
    }
    await sleep(POLL_MS);
  }
  await waitForOk(url, frontend, READY_TIMEOUT_MS);
  writeServed(file, current);
}
