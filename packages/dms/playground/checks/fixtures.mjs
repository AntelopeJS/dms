import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import assert from "node:assert/strict";

export const root = nodePath.resolve(import.meta.dirname, "..");
const scanner = nodePath.join(import.meta.dirname, "aliases.cjs");

/**
 * @param {string} path
 * @param {string} source
 * @param {boolean} accepted
 * @param {number | null} [expectedFailures] null accepts any non-empty set of diagnostics
 */
export function checkFixture(
  path,
  source,
  accepted,
  expectedFailures = accepted ? 0 : 1,
) {
  writeFileSync(path, source);
  /** @type {import("node:child_process").SpawnSyncReturns<string>} */
  let result;
  try {
    result = spawnSync(process.execPath, [scanner], { encoding: "utf8" });
  } finally {
    rmSync(path);
  }
  assert.equal(result.status, accepted ? 0 : 1, result.stdout + result.stderr);
  const diagnostics = result.stderr
    .split("\n")
    .filter((line) => line.startsWith(`${path}:`));
  if (expectedFailures === null) {
    assert.ok(diagnostics.length > 0, result.stderr);
  } else {
    assert.equal(diagnostics.length, expectedFailures, result.stderr);
  }
  return result;
}

/** @param {string} area */
export function fixturePath(area) {
  return nodePath.join(
    root,
    area,
    `__import_guard_${randomUUID().replaceAll("-", "")}.ts`,
  );
}
