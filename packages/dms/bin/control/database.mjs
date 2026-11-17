import { apiTargetFile, readTarget } from "./forwarder.mjs";
import { isSameProcess } from "./identity.mjs";
import { startMongod } from "./mongo.mjs";
import { killRecorded, stopRecorded } from "./processes.mjs";
import { resolutionFolders } from "./launch.mjs";
import { liveBackends, record } from "./stack.mjs";

/** @typedef {import("./run-state.mjs").RunState} RunState */

/**
 * @param {RunState} state The run
 * @returns {import("./run-state.mjs").ServerRecord} The mongod the run started
 * @throws When the run uses a server it does not own (`--mongo-url`) or recorded no mongod
 */
function ownedMongod(state) {
  if (!state.ownsMongo) {
    throw new Error(
      "this run uses --mongo-url: it does not own the server, so it neither stops nor starts it",
    );
  }
  const mongod = state.processes.find((entry) => entry.name === "mongod");
  if (mongod?.port === undefined) {
    throw new Error("this run recorded no mongod");
  }
  return { ...mongod, port: mongod.port };
}

/**
 * Stops the run's mongod, as a crash of the database would: the backend the
 * API forwards to loses its connection until {@link startDatabase}. Every
 * other backend, such as the next database's standby, is killed first, so
 * none that booted without its database is ever promoted. The mongod's
 * record stays, and stopping a mongod that no longer runs signals nothing.
 *
 * @param {RunState} state The run
 * @returns {Promise<void>} Resolves once mongod no longer runs
 * @throws When the run does not own its server, before it stops anything
 */
export async function stopDatabase(state) {
  const mongod = ownedMongod(state);
  const target = readTarget(apiTargetFile(state.dir));
  await killRecorded(
    liveBackends(state).filter((backend) => backend.port !== target),
  );
  await stopRecorded([mongod]);
}

/**
 * Starts the run's mongod again on its port and data folder, so the URL the
 * backend holds reaches it and the data written before is still there. A
 * mongod that still runs is kept.
 *
 * @param {RunState} state The run
 * @returns {Promise<void>} Resolves once mongod listens
 * @throws When the run does not own its server
 */
export async function startDatabase(state) {
  const mongod = ownedMongod(state);
  if (isSameProcess(mongod)) return;
  const started = await startMongod(
    state,
    resolutionFolders(state),
    mongod.port,
  );
  record(state, started.record);
}
