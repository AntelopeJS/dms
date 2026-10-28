const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { test } = require("node:test");

const root = resolve(__dirname, "..");
const scanner = join(__dirname, "aliases.cjs");

test("rejects browser remapping and unknown fields in both trusted manifests", (t) => {
  const fixtures = mkdtempSync(join(tmpdir(), "playground-manifests-"));
  t.after(() => rmSync(fixtures, { recursive: true, force: true }));
  const preload = join(fixtures, "manifest.cjs");
  for (const directory of [root, join(root, "frontend-vue")]) {
    const manifest = join(directory, "package.json");
    writeFileSync(
      preload,
      `
      const fs = require("node:fs");
      const read = fs.readFileSync;
      fs.readFileSync = (file, ...options) => file === ${JSON.stringify(manifest)}
        ? process.env.PLAYGROUND_MANIFEST_FIXTURE : read(file, ...options);
    `,
    );
    for (const field of [
      null,
      "browser",
      "module",
      "types",
      "imports",
      "exports",
      "react-native",
      "workspaces",
      "futureResolver",
    ]) {
      const metadata = { name: "guard-fixture" };
      if (field !== null)
        metadata[field] = {
          "./app/safe.ts": "../../src/utils/run-in-batches.ts",
        };
      const result = spawnSync(
        process.execPath,
        ["--require", preload, scanner],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PLAYGROUND_MANIFEST_FIXTURE: JSON.stringify(metadata),
          },
        },
      );
      assert.equal(
        result.status,
        field === null ? 0 : 1,
        result.stdout + result.stderr,
      );
    }
  }
});
