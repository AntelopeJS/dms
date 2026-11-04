import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * A TLA+ module of a formal skill.
 *
 * @param {string} skill
 * @param {string} file
 */
export function readModule(skill, file) {
  return readFileSync(
    new URL(`../../skills/${skill}/${file}`, import.meta.url),
    "utf8",
  );
}

/**
 * The strings of `name == {"a", "b"}` in a TLA+ module.
 *
 * @param {string} text
 * @param {string} name
 */
export function setOf(text, name) {
  const match = new RegExp(`^${name} == \\{([^}]*)\\}`, "m").exec(text);
  assert.ok(match?.[1] !== undefined, `${name} is a set of strings in the module`);
  return [...match[1].matchAll(/"([^"]*)"/g)].map(([, value]) => value ?? "");
}

/**
 * The string of `name == "a"` in a TLA+ module.
 *
 * @param {string} text
 * @param {string} name
 */
export function stringOf(text, name) {
  const match = new RegExp(`^${name} == "([^"]*)"`, "m").exec(text);
  assert.ok(match?.[1] !== undefined, `${name} is a string in the module`);
  return match[1];
}
