import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";

/**
 * What a folder holds, for a test to compare: each file's text and each
 * symbolic link's target (as `-> target`), by path, or null when the folder
 * does not exist.
 *
 * @param {string} folder The folder
 * @returns {Record<string, string> | null} Its content
 */
export function treeOf(folder) {
  if (!existsSync(folder)) return null;
  /** @type {Record<string, string>} */
  const content = {};
  /** @param {string} prefix */
  const walk = (prefix) => {
    for (const entry of readdirSync(join(folder, prefix), {
      withFileTypes: true,
    })) {
      const name = join(prefix, entry.name);
      const path = join(folder, name);
      if (entry.isSymbolicLink()) content[name] = `-> ${readlinkSync(path)}`;
      else if (entry.isDirectory()) walk(name);
      else content[name] = readFileSync(path, "utf8");
    }
  };
  walk("");
  return content;
}

/**
 * The names a folder holds.
 *
 * @param {string} folder The folder
 * @returns {string[]} Its entries, sorted
 */
export function namesIn(folder) {
  return readdirSync(folder).sort();
}
