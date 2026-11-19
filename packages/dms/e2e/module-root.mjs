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
 * module, not the skill folder. The search stops at the playground's
 * checkout, so a module above the checkout is never its module. Its parent
 * when no folder in that range declares one.
 *
 * @param {string} playground The playground folder
 * @param {string | null} checkout The root of the git checkout holding the
 *   playground, or `null` to search up to the filesystem root
 * @returns {string} The module's folder
 */
export function moduleRootOf(playground, checkout) {
  for (
    let folder = dirname(playground);
    folder !== dirname(folder);
    folder = dirname(folder)
  ) {
    if (isAntelopeModule(folder)) return folder;
    if (folder === checkout) break;
  }
  return dirname(playground);
}
