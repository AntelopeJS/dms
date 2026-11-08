import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isRecord } from "./json.mjs";

/**
 * @param {string} folder
 * @returns {boolean} Whether its `package.json` declares an AntelopeJS manifest
 */
function isAntelopeModule(folder) {
  try {
    /** @type {unknown} */
    const manifest = JSON.parse(
      readFileSync(join(folder, "package.json"), "utf8"),
    );
    return isRecord(manifest) && Object.hasOwn(manifest, "antelopeJs");
  } catch {
    return false;
  }
}

/**
 * The module a playground verifies: the nearest folder above it whose
 * `package.json` declares `antelopeJs`, so a playground in a verification
 * skill (`.agents/skills/<skill>/playground`) verifies the repository's
 * module, not the skill folder. Its parent when no folder above declares
 * one.
 *
 * @param {string} playground The playground folder
 * @returns {string} The module's folder
 */
export function moduleRootOf(playground) {
  for (
    let folder = dirname(playground);
    folder !== dirname(folder);
    folder = dirname(folder)
  ) {
    if (isAntelopeModule(folder)) return folder;
  }
  return dirname(playground);
}
