import { readFileSync } from "node:fs";
import { matchesGlob } from "node:path";

/**
 * The one-way door kinds whose path rules a set of changed files hits, with
 * the files per kind. A declared funnel module is a path rule of its kind.
 *
 * @param {Record<string, any>} skill The skill
 * @param {string[]} files Repository paths
 * @returns {{ kind: string, files: string[] }[]} The flagged kinds
 */
export function flaggedDoors(skill, files) {
  return Object.entries(skill.config.doors).flatMap(([kind, rule]) => {
    const globs = rule ? [...rule.globs, ...rule.funnels] : [];
    const hits = files.filter((file) =>
      globs.some((glob) => matchesGlob(file, glob)),
    );
    return hits.length > 0 ? [{ kind, files: hits }] : [];
  });
}

/**
 * The files a unified diff changes, read from its `+++ b/` headers.
 *
 * @param {string} patch The patch file
 * @returns {string[]} Repository paths
 */
export function patchFiles(patch) {
  return [...readFileSync(patch, "utf8").matchAll(/^\+\+\+ b\/(.+)$/gm)].map(
    (match) => match[1],
  );
}

/**
 * The `One-way-door:` line for the flagged kinds, empty when none is.
 *
 * @param {{ kind: string }[]} doors The flagged kinds
 * @returns {string} The line
 */
export function doorLine(doors) {
  return doors.length > 0
    ? `One-way-door: ${doors.map((door) => door.kind).join(", ")}`
    : "";
}
