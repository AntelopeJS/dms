import { buildChangedSince, missingBuildRoot } from "./build-inputs.mjs";
import { apiTargetFile, readTarget, writeTarget } from "./forwarder.mjs";
import { dropDatabase } from "./mongo.mjs";
import { killRecorded, stopRecorded } from "./processes.mjs";
import {
  ensureApi,
  launchBackend,
  liveBackends,
  record,
  resolutionFolders,
  startBackend,
  waitForBackend,
} from "./stack.mjs";
import { recordTiming, stopwatch, timed } from "./timing.mjs";

/** @typedef {import("./run-state.mjs").RunState} RunState */
/** @typedef {import("./run-state.mjs").BackendRecord} BackendRecord */

/**
 * Refuses a run whose backend holds the API port itself: an earlier
 * dms-control started it, with no forwarder to move the API between
 * backends.
 *
 * @param {RunState} state The run
 * @throws When an earlier dms-control started the run
 */
export function assertForwardedRun(state) {
  if (
    state.processes.some(
      (entry) => entry.name === "backend" && entry.port === state.apiPort,
    )
  ) {
    throw new Error(
      "this run was started by an older dms-control; run `up` again",
    );
  }
}

/**
 * Stops the backend and starts it again on `state.database`, as a deploy or
 * a crash would, from the run's build or another one (`build`, the base
 * version's). The API keeps its port and reaches the new backend once it
 * answers. A backend whose pid now runs another process has exited, and
 * nothing is stopped for it.
 *
 * @param {RunState} state The run
 * @param {{ playground: string, cwd: string }} [build] Another build to start
 * @returns {Promise<void>} Resolves once the backend answers again
 */
export async function restartBackend(state, build) {
  const backend = state.processes.find((entry) => entry.name === "backend");
  if (backend) {
    await timed(state, "backend-stop", () => stopRecorded([backend]));
  }
  await timed(state, "backend-start", () => startBackend(state, build));
}

/**
 * Drops the databases the run no longer uses: neither the one it serves
 * nor the one `up` started on, which `down` drops.
 *
 * @param {RunState} state
 * @param {string[]} databases
 */
async function dropUnused(state, databases) {
  for (const database of new Set(databases)) {
    if (database === state.databasePrefix || database === state.database) {
      continue;
    }
    await dropDatabase(state.mongoUrl, database, resolutionFolders(state));
  }
}

/**
 * Kills backends without a grace period, each only while its pid still
 * runs the backend recorded, timed as `backend-stop` when there is one.
 *
 * @param {RunState} state
 * @param {BackendRecord[]} backends
 */
async function killBackends(state, backends) {
  if (backends.length === 0) return;
  await timed(state, "backend-stop", () => killRecorded(backends));
}

/**
 * Kills backends, then drops their databases.
 *
 * @param {RunState} state
 * @param {BackendRecord[]} backends
 */
async function retire(state, backends) {
  await killBackends(state, backends);
  await dropUnused(
    state,
    backends.map((backend) => backend.database),
  );
}

/**
 * The suffix after `suffix`: its trailing number plus one, padded alike
 * (`j004` after `j003`), or `null` when it ends in no number.
 *
 * @param {string} suffix A database suffix
 * @returns {string | null} The next one
 */
function nextSuffix(suffix) {
  const match = /^(.*?)(\d+)$/.exec(suffix);
  if (!match) return null;
  const [, stem, digits] = match;
  return `${stem}${String(Number(digits) + 1).padStart(digits.length, "0")}`;
}

/**
 * Whether a standby can take over `database`: it was started on it, it
 * answers, and nothing of the run's build changed since it started. The
 * wait is timed as `standby-promote`, failed when the standby is not taken.
 *
 * @param {RunState} state
 * @param {BackendRecord} standby
 * @param {string} database
 * @returns {Promise<boolean>}
 */
async function fits(state, standby, database) {
  if (standby.database !== database) return false;
  const stop = stopwatch();
  const answers = await waitForBackend(standby).then(
    () => true,
    () => false,
  );
  const fit = answers && buildChangedSince(state, standby.startedAt) === null;
  recordTiming(state, "standby-promote", stop(), fit);
  return fit;
}

/**
 * A backend that answers on `database`: the standby when it fits, else one
 * started now. Every other backend the API does not forward to is killed
 * first and its database dropped.
 *
 * @param {RunState} state
 * @param {string} database
 * @returns {Promise<BackendRecord>}
 */
async function backendOn(state, database) {
  const target = readTarget(apiTargetFile(state.dir));
  const spares = liveBackends(state).filter(
    (backend) => backend.port !== target,
  );
  const standby = spares.find((backend) => backend.database === database);
  if (standby && (await fits(state, standby, database))) {
    await retire(
      state,
      spares.filter((backend) => backend !== standby),
    );
    return standby;
  }
  await retire(state, spares);
  return timed(state, "backend-start", async () => {
    const backend = await launchBackend(state, database);
    await waitForBackend(backend);
    return backend;
  });
}

/**
 * Moves the run onto an empty database of its own, `<prefix>_<suffix>`,
 * served by a backend that has served nothing else: not onboarded, no user,
 * no session, nothing in memory. That backend is the standby the previous
 * call started when it was started on this database, answers, and nothing
 * of the build changed since it started; else one started now. The API
 * points at it before every other backend is killed. Then the standby for
 * the next suffix starts, unless the run was started with `--no-standby`,
 * and the previous journey database is dropped, so a long run does not
 * exhaust mongod's file handles; its evidence stays.
 *
 * @param {RunState} state The run
 * @param {string} suffix What tells the database apart, such as `j003`
 * @returns {Promise<string>} The database now in use
 * @throws When an earlier dms-control started the run, or a folder of the run's build is missing (a build runs), before it starts or stops anything
 */
export async function freshDatabase(state, suffix) {
  assertForwardedRun(state);
  const missing = missingBuildRoot(state);
  if (missing) {
    throw new Error(
      `${missing} is missing: the build is not done; finish it, then try again`,
    );
  }
  const previous = state.database;
  const database = `${state.databasePrefix}_${suffix}`;
  const backend = await backendOn(state, database);
  await ensureApi(state);
  writeTarget(apiTargetFile(state.dir), backend.port);
  Object.assign(state, { database, tokens: {}, accounts: {} });
  record(state, backend);
  const replaced = liveBackends(state).filter(
    (other) => other.pid !== backend.pid,
  );
  await killBackends(state, replaced);
  const next = state.noStandby ? null : nextSuffix(suffix);
  if (next) {
    await timed(state, "standby-start", () =>
      launchBackend(state, `${state.databasePrefix}_${next}`),
    );
  }
  await dropUnused(state, [
    previous,
    ...replaced.map((other) => other.database),
  ]);
  return database;
}
