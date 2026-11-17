import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The text of a file a step wrote into its evidence folder.
 *
 * @param {string} folder The step folder
 * @param {string} name The file
 * @returns {string} Its text
 */
export function evidenceText(folder, name) {
  return readFileSync(join(folder, name), "utf8");
}
