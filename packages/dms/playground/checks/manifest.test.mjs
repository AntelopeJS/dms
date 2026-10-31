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
  for (const directory of [root, path.join(root, "frontend-vue")]) {
    const manifest = path.join(directory, "package.json");
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
      /** @type {Record<string, unknown>} */
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
