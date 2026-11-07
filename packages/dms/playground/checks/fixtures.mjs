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
 * Asserts that each fixture fails the scan on its own path. A diagnostic names
 * the file that holds the import, so each fixture proves its own rejection and
 * the fixtures can share one scan.
 *
 * @param {readonly (readonly [path: string, source: string, failures?: number | null])[]} fixtures
 *   `failures` is the diagnostic count expected on `path`, 1 by default; null accepts any non-empty set.
 */
export function assertRejected(fixtures) {
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
