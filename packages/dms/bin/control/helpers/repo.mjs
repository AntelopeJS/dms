import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Writes `text` to `file`, creating its folder.
 *
 * @param {string} file The file
 * @param {string} text Its content
 */
export function write(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
