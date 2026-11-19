import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isRecord, isString } from "./json.mjs";
import { isBackendMode } from "./run-state.mjs";

/**
 * @typedef {{ id: string, title: string, entryPoint: string, database?: string, onboard?: boolean, backend?: import("./run-state.mjs").BackendMode, standby?: boolean, tag?: string | string[], knownFailures?: Readonly<Record<string, string>>, last?: boolean, frontend?: "dev", run: (context: import("./journey.mjs").JourneyContext) => Promise<void> }} Journey `backend` pins how the backend of its fresh database runs, whatever mode `up` gave the run; `standby: false` serves its fresh database with a backend started for it, not a standby, and starts no standby while it runs; `tag` is its Playwright tags, such as `@smoke`; `knownFailures` maps the name of each check that fails today to the finding that makes it fail; `last: true` runs it after every other journey of the suite, for a journey that leaves the run's playground changed for every later backend; `frontend: "dev"` needs a run whose dashboard `ajs dms dev` serves (`up --dev-frontend`), for what only development renders
 */

const TAG = /^@[a-z0-9-]+$/;

/**
 * @param {unknown} value A journey's `tag`
 * @returns {boolean} True for none, a tag or a list of tags
 */
function isTags(value) {
  const tags = Array.isArray(value) ? value : [value];
  return (
    value === undefined || tags.every((tag) => isString(tag) && TAG.test(tag))
  );
}

/**
 * @param {unknown} value A journey's `knownFailures`
 * @returns {boolean} True for none, or a record of non-empty findings
 */
function isKnownFailures(value) {
  return (
    value === undefined ||
    (isRecord(value) &&
      Object.entries(value).every(
        ([name, finding]) => name !== "" && isString(finding) && finding !== "",
      ))
  );
}

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
    isSuiteJourney(value) &&
    typeof value.run === "function"
  );
}

/**
 * @param {Record<string, unknown>} value A journey
 * @returns {value is Pick<Journey, "tag" | "knownFailures" | "last" | "frontend">} True when the fields the Playwright suite reads are absent or valid
 */
function isSuiteJourney(value) {
  return (
    isTags(value.tag) &&
    isKnownFailures(value.knownFailures) &&
    (value.last === undefined || typeof value.last === "boolean") &&
    (value.frontend === undefined || value.frontend === "dev")
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
      `${file} exports a journey without an id, title, entry point or run function, pins a backend or standby on a shared database, or has a tag that is not @kebab-case, a known failure without its finding, a last that is not a boolean or a frontend other than "dev"`,
    );
  return journeys;
}
