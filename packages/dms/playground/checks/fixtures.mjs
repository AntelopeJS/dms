import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import assert from "node:assert/strict";

export const root = nodePath.resolve(import.meta.dirname, "..");
const scanner = nodePath.join(import.meta.dirname, "aliases.cjs");

/**
 * Writes every fixture, scans the tree once, and removes the fixtures.
 *
 * @param {readonly (readonly [path: string, source: string, ...unknown[]])[]} fixtures
 */
function scan(fixtures) {
  const paths = fixtures.map(([path]) => path);
  assert.equal(new Set(paths).size, paths.length, "fixture paths repeat");
  try {
    for (const [path, source] of fixtures) writeFileSync(path, source);
    return spawnSync(process.execPath, [scanner], { encoding: "utf8" });
  } finally {
    for (const path of paths) rmSync(path, { force: true });
  }
}

/**
 * Asserts that the tree passes with every fixture in it.
 *
 * @param {readonly (readonly [path: string, source: string])[]} fixtures
 */
export function assertAccepted(fixtures) {
  const result = scan(fixtures);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

/**
 * The scanner's diagnostic kinds, each the message prefix of one failure site.
 * A kind that prints without failing the scan leaves the exit status at 0 only
 * when no other kind shares the scan, so a rejected batch holds one kind set.
 */
const kinds = /** @type {const} */ ({
  static: "playground import must be a static constant string",
  forbidden: "forbidden playground import ",
  loader: "unsupported playground loader ",
  parse: "invalid playground script: ",
  extStyle: "external playground styles are forbidden",
  inlineStyle: "unsupported playground inline style",
  customBlock: "playground custom block ",
  extScript: "external playground scripts are forbidden",
  metadata: "additional playground package metadata is forbidden",
});

/** @typedef {keyof typeof kinds} Kind */

/**
 * @param {string} line
 * @param {string} path
 * @returns {Kind | undefined}
 */
function kindOf(line, path) {
  const message = line.slice(path.length + 2);
  return /** @type {Kind[]} */ (Object.keys(kinds)).find((kind) =>
    message.startsWith(kinds[kind]),
  );
}

/**
 * Asserts that each fixture fails the scan on its own path with exactly the
 * given kinds. A diagnostic names the file that holds the import, so each
 * fixture proves its own rejection, and the fixtures share one scan because
 * they share one kind set: a kind that stops failing the scan turns the exit
 * status to 0 here, where a sibling of another kind could hide it.
 *
 * @param {Kind | readonly Kind[]} expected the kinds every fixture reports
 * @param {readonly (readonly [path: string, source: string, failures?: number | null])[]} fixtures
 *   `failures` is the diagnostic count expected on `path`, 1 by default; null accepts any non-empty set.
 */
export function assertRejected(expected, fixtures) {
  const want = [expected].flat().sort();
  assert.ok(fixtures.length > 0, "a rejected batch needs a fixture");
  for (const [path, , failures = 1] of fixtures)
    assert.notEqual(failures, 0, `${path} expects no diagnostic`);
  const result = scan(fixtures);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const lines = result.stderr.split("\n");
  for (const [path, , failures = 1] of fixtures) {
    const diagnostics = lines.filter((line) => line.startsWith(`${path}:`));
    if (failures === null) {
      assert.ok(diagnostics.length > 0, `${path}\n${result.stderr}`);
    } else {
      assert.equal(diagnostics.length, failures, `${path}\n${result.stderr}`);
    }
    const found = [
      ...new Set(diagnostics.map((line) => kindOf(line, path) ?? line)),
    ].sort();
    assert.deepEqual(found, want, `${path}\n${result.stderr}`);
  }
}

/**
 * @param {string} area
 * @param {string} [extension]
 */
export function fixturePath(area, extension = "ts") {
  return nodePath.join(
    root,
    area,
    `__import_guard_${randomUUID().replaceAll("-", "")}.${extension}`,
  );
}
