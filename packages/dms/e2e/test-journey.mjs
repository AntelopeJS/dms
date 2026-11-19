import { basename } from "node:path";

/**
 * @typedef {Pick<import("./journey-load.mjs").Journey, "database" | "onboard" | "backend" | "standby" | "knownFailures">} DmsOptions How the `dms` fixture prepares a test, with the fields of a journey: a fresh database with a backend of its own unless `database` is `"shared"`, that backend run as `backend` says, started for the test rather than taken from the standby with `standby: false`, an onboarded administrator unless `onboard` is false, and the checks of `knownFailures` judged as known failures
 * @typedef {Pick<import("@playwright/test").TestInfo, "title" | "titlePath" | "file" | "annotations">} TestIdentity What names a test
 */

/**
 * A test title as one folder name: runs of other characters than letters,
 * digits, `_` and `-` become `-`, so a title never names a folder outside
 * the run's evidence.
 *
 * @param {string} text The title
 * @returns {string} The folder name, never empty
 */
function folderName(text) {
  const name = text.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return name === "" ? "test" : name;
}

/**
 * The feature a test records its evidence under: the titles of its
 * `describe` blocks, or its file's name without its extensions.
 *
 * @param {TestIdentity} testInfo The test
 * @returns {string} The feature's folder name
 */
export function featureOf(testInfo) {
  const describes = testInfo.titlePath.slice(1, -1);
  return folderName(
    describes.length > 0
      ? describes.join(" ")
      : basename(testInfo.file).split(".")[0],
  );
}

/**
 * The journey a test is: its title as its id, the `title` and `entry
 * point` annotations `registerJourneys` gives a journey's test, and its
 * options.
 *
 * @param {TestIdentity} testInfo The test
 * @param {DmsOptions} options Its options
 * @returns {DmsOptions & { id: string, title: string, entryPoint: string }} The journey
 */
export function journeyOf(testInfo, options) {
  const annotation = (/** @type {string} */ type) =>
    testInfo.annotations.find((entry) => entry.type === type)?.description;
  return {
    ...options,
    id: folderName(testInfo.title),
    title: annotation("title") ?? testInfo.title,
    entryPoint: annotation("entry point") ?? "",
  };
}
