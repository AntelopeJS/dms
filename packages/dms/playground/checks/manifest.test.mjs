import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const scanner = path.join(import.meta.dirname, "aliases.cjs");

await test("rejects browser remapping and unknown fields in both trusted manifests", (t) => {
  const fixtures = mkdtempSync(path.join(tmpdir(), "playground-manifests-"));
  t.after(() => rmSync(fixtures, { recursive: true, force: true }));
  const preload = path.join(fixtures, "manifest.cjs");
  writeFileSync(
    preload,
    `
    const fs = require("node:fs");
    const read = fs.readFileSync;
    const fixtures = new Map(JSON.parse(process.env.PLAYGROUND_MANIFEST_FIXTURES));
    fs.readFileSync = (file, ...options) =>
      fixtures.has(file) ? fixtures.get(file) : read(file, ...options);
  `,
  );
  const manifests = [root, path.join(root, "frontend-vue")].map((directory) =>
    path.join(directory, "package.json"),
  );
  /** @param {string} fixture */
  const scan = (fixture) =>
    spawnSync(process.execPath, ["--require", preload, scanner], {
      encoding: "utf8",
      env: {
        ...process.env,
        PLAYGROUND_MANIFEST_FIXTURES: JSON.stringify(
          manifests.map((manifest) => [manifest, fixture]),
        ),
      },
    });
  const plain = scan('{"name":"guard-fixture"}');
  assert.equal(plain.status, 0, plain.stdout + plain.stderr);

  const fields = [
    "browser",
    "module",
    "types",
    "imports",
    "exports",
    "react-native",
    "workspaces",
    "futureResolver",
    "__proto__",
  ];
  const remap = JSON.stringify({
    "./app/safe.ts": "../../src/utils/run-in-batches.ts",
  });
  const remapped = scan(
    `{"name":"guard-fixture",${fields.map((field) => `${JSON.stringify(field)}:${remap}`).join(",")}}`,
  );
  assert.equal(remapped.status, 1, remapped.stdout + remapped.stderr);
  const lines = remapped.stderr.split("\n");
  for (const manifest of manifests)
    for (const field of fields)
      assert.ok(
        lines.includes(
          `${manifest}: unsupported playground package field ${field}`,
        ),
        `${manifest} ${field}\n${remapped.stderr}`,
      );
});
