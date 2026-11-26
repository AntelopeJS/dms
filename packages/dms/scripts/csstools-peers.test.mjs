import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { unmetTokenizerPeers } from "./helpers/csstools-peers.mjs";

await test("every installed @csstools sibling accepts the lowest css-tokenizer dms allows", () => {
  assert.deepEqual(unmetTokenizerPeers(), []);
});

await test("reads a sibling whose store folder pnpm hashed down to name@_hash, as it does on Windows (catches a name parsed from a version after the @)", () => {
  const store = mkdtempSync(join(tmpdir(), "csstools-peers-"));
  const sibling = join(
    store,
    "@csstools+css-color-parser@_31de92bebfc1f18a1c71c54d4fcee2bf",
    "node_modules",
    "@csstools",
    "css-color-parser",
  );
  mkdirSync(sibling, { recursive: true });
  writeFileSync(
    join(sibling, "package.json"),
    JSON.stringify({
      peerDependencies: { "@csstools/css-tokenizer": "^99.0.0" },
    }),
  );
  const unmet = unmetTokenizerPeers(store);
  rmSync(store, { recursive: true, force: true });
  assert.deepEqual(unmet, [
    "@csstools/css-color-parser needs css-tokenizer ^99.0.0, dms allows ^4.0.3",
  ]);
});
