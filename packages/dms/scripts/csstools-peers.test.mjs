import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { unmetTokenizerPeers } from "./helpers/csstools-peers.mjs";

await test("every installed @csstools sibling accepts the lowest css-tokenizer dms allows", () => {
  assert.deepEqual(unmetTokenizerPeers(), []);
});

/**
 * Writes a pnpm store folder named `folder` holding the package `name` and a
 * link to its css-tokenizer dependency, the layout pnpm installs.
 * @param {string} store
 * @param {string} folder
 * @param {string} name
 * @param {string} tokenizerPeer
 */
function storeFolder(store, folder, name, tokenizerPeer) {
  const scope = join(store, folder, "node_modules", "@csstools");
  mkdirSync(join(scope, name), { recursive: true });
  writeFileSync(
    join(scope, name, "package.json"),
    JSON.stringify({
      peerDependencies: { "@csstools/css-tokenizer": tokenizerPeer },
    }),
  );
  const tokenizer = join(store, "tokenizer");
  mkdirSync(tokenizer, { recursive: true });
  writeFileSync(join(tokenizer, "package.json"), "{}");
  symlinkSync(tokenizer, join(scope, "css-tokenizer"), "junction");
}

await test("reads a sibling whose store folder pnpm hashed down, as it does on Windows (catches a package name parsed from the folder name)", () => {
  const store = mkdtempSync(join(tmpdir(), "csstools-peers-"));
  storeFolder(
    store,
    "@csstools+css-color-parser@_31de92bebfc1f18a1c71c54d4fcee2bf",
    "css-color-parser",
    "^99.0.0",
  );
  storeFolder(
    store,
    "@csstools+css-parser-algori_6afebb6c11a3879d5a5a8373291da73e",
    "css-parser-algorithms",
    "^98.0.0",
  );
  const unmet = unmetTokenizerPeers(store);
  rmSync(store, { recursive: true, force: true });
  assert.deepEqual(unmet.sort(), [
    "@csstools/css-color-parser needs css-tokenizer ^99.0.0, dms allows ^4.0.3",
    "@csstools/css-parser-algorithms needs css-tokenizer ^98.0.0, dms allows ^4.0.3",
  ]);
});
