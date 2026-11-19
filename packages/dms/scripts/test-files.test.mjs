import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
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

/**
 * @param {string[]} files
 * @param {number} count
 * @param {Record<string, number>} [weights]
 * @returns {string[][]}
 */
const shardsOf = (files, count, weights) =>
  Array.from({ length: count }, (_, position) =>
    shardOf(files, position + 1, count, weights),
  );

await test("splits the files into shards that cover each file exactly once, so no builder spec is skipped or run twice", () => {
  const files = ["a", "b", "c", "d", "e", "f", "g"];
  const weights = { a: 9, b: 1, c: 4, d: 4, e: 2, f: 7 };
  for (const shards of [
    shardsOf(files, 4),
    shardsOf(files, 3, weights),
    shardsOf(files, 1, weights),
  ]) {
    assert.deepEqual(shards.flat().sort(), files);
  }
  assert.throws(() => shardOf(files, 3, 2), RangeError);
  assert.throws(() => shardOf(files, 0, 2), RangeError);
});

await test("gives each file to the least-loaded shard by descending weight, so a heavy file does not pile onto one shard like round-robin would", () => {
  const files = ["a", "b", "c", "d", "e", "f"];
  const weights = { a: 7, b: 5, c: 4, d: 3, e: 2, f: 1 };
  assert.deepEqual(shardsOf(files, 2, weights), [
    ["a", "d", "f"],
    ["b", "c", "e"],
  ]);
});

await test("breaks a weight tie by path and a load tie by the lowest shard, so every job computes the same split", () => {
  assert.deepEqual(
    shardsOf(["d", "c", "b", "a"], 2, { a: 3, b: 3, c: 3, d: 3 }),
    [
      ["a", "c"],
      ["b", "d"],
    ],
  );
});

await test("counts an unweighted file as the median of the known weights, so a new spec is not treated as free", () => {
  const files = ["u", "x", "y", "z"];
  const weights = { x: 10, y: 2, z: 6 };
  assert.deepEqual(shardsOf(files, 2, weights), [
    ["x", "y"],
    ["u", "z"],
  ]);
});

await test("averages the two middle weights when an even number is known, and counts 1 when none is", () => {
  assert.deepEqual(
    shardsOf(["a", "b", "c", "m", "n"], 2, { a: 8, b: 2, c: 4 }).flat().length,
    5,
  );
  assert.deepEqual(shardsOf(["u", "a", "b"], 2, { a: 2, b: 6 }), [
    ["b"],
    ["a", "u"],
  ]);
  assert.deepEqual(shardsOf(["a", "b", "c"], 2), [["a", "c"], ["b"]]);
});

await test("reads the weights of --weights from the command line, so the CI shards balance by the committed file", () => {
  const root = mkdtempSync(join(tmpdir(), "dms-test-weights-"));
  try {
    mkdirSync(join(root, "tests"));
    for (const file of ["a", "b", "c"]) {
      writeFileSync(join(root, "tests", `${file}.test.js`), "");
    }
    const weights = join(root, "weights.json");
    writeFileSync(
      weights,
      JSON.stringify({
        [`${root}/tests/a.test.js`]: 1,
        [`${root}/tests/b.test.js`]: 1,
        [`${root}/tests/c.test.js`]: 9,
      }),
    );
    const shard = (/** @type {number} */ index) =>
      execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL("./test-files.mjs", import.meta.url)),
          join(root, "tests"),
          `--shard=${index}/2`,
          `--weights=${weights}`,
        ],
        { encoding: "utf8" },
      );
    assert.equal(shard(1), `-f ${root}/tests/c.test.js`);
    assert.equal(
      shard(2),
      `-f ${root}/tests/a.test.js -f ${root}/tests/b.test.js`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
