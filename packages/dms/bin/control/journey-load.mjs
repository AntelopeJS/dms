import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isRecord, isString } from "./json.mjs";
import { isBackendMode } from "./run-state.mjs";

/**
 * @typedef {{ id: string, title: string, entryPoint: string, database?: string, onboard?: boolean, backend?: import("./run-state.mjs").BackendMode, standby?: boolean, run: (context: import("./journey.mjs").JourneyContext) => Promise<void> }} Journey `backend` pins how the backend of its fresh database runs, whatever mode `up` gave the run; `standby: false` serves its fresh database with a backend started for it, not a standby, and starts no standby while it runs
 */

/**
 * @param {unknown} value A value a journeys module exports
 * @returns {value is Journey} True for an object with the fields a journey run reads
 */
function isJourney(value) {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isString(value.entryPoint) &&
    (value.database === undefined || isString(value.database)) &&
    (value.onboard === undefined || typeof value.onboard === "boolean") &&
    (value.backend === undefined ||
      (value.database !== "shared" && isBackendMode(value.backend))) &&
    (value.standby === undefined ||
      (value.database !== "shared" && typeof value.standby === "boolean")) &&
    typeof value.run === "function"
  );
}

/**
 * Loads the journeys a feature's file exports (`export const journeys`).
 *
 * @param {string} file The journeys module
 * @returns {Promise<Journey[]>} The journeys
 */
export async function loadJourneys(file) {
  if (!existsSync(file)) throw new Error(`${file} does not exist`);
  /** @type {unknown} */
  const exported = await import(pathToFileURL(file).href);
  const entries = isRecord(exported) ? exported.journeys : undefined;
  if (!Array.isArray(entries))
    throw new Error(`${file} exports no journeys array`);
  const journeys = entries.filter(isJourney);
  if (journeys.length !== entries.length)
    throw new Error(
      `${file} exports a journey without an id, title, entry point or run function, or pins a backend or standby on a shared database`,
    );
  return journeys;
}
