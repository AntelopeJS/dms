import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { shardOf, testFiles } from "./test-files.mjs";

await test("lists every test file but those under an excluded folder, so the builder specs leave test:unit", () => {
  const root = mkdtempSync(join(tmpdir(), "dms-test-files-"));
  try {
    for (const folder of ["a", "a/deep", "builder", "builder/helpers"]) {
      mkdirSync(join(root, folder), { recursive: true });
    }
    for (const file of [
      "top.test.js",
      "a/one.spec.js",
      "a/deep/two.test.js",
      "a/helper.js",
      "builder/three.test.js",
      "builder/helpers/four.test.js",
    ]) {
      writeFileSync(join(root, file), "");
    }
    const files = testFiles(root, [join(root, "builder")]).map((path) =>
      path.slice(root.length + 1),
    );
    assert.deepEqual(files, [
      "a/deep/two.test.js",
      "a/one.spec.js",
      "top.test.js",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("splits the files into shards that cover each file exactly once, so no builder spec is skipped or run twice", () => {
  const files = ["a", "b", "c", "d", "e"];
  const shards = [1, 2].map((index) => shardOf(files, index, 2));
  assert.deepEqual(shards, [
    ["a", "c", "e"],
    ["b", "d"],
  ]);
  assert.deepEqual(shards.flat().sort(), files);
  assert.throws(() => shardOf(files, 3, 2), RangeError);
});
