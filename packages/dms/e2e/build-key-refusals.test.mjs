import assert from "node:assert/strict";
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fixture, keyOf } from "./helpers/key-fixture.mjs";
import { write } from "./helpers/repo.mjs";

/**
 * The key fixture with a workspace package, `packages/shared-ui`, linked
 * into the playground's `node_modules` as pnpm links a `workspace:`
 * dependency.
 *
 * @param {import("node:test").TestContext} t The test
 */
function linkedFixture(t) {
  const keyed = fixture(t);
  const side = keyed.prepare("run", 1001);
  const shared = join(keyed.checkout, "packages", "shared-ui");
  write(join(shared, "index.js"), 'export const label = "SHARED-V1";\n');
  symlinkSync("../../packages/shared-ui", join(keyed.modules, "shared-ui"));
  return { ...keyed, side, shared };
}

await test("a .modules.yaml that is not pnpm 10's YAML refuses the key instead of keying none of its layout", (t) => {
  const { frontend, checkout, prepare } = fixture(t);
  const side = prepare("run", 1001);
  const record = join(checkout, "node_modules", ".modules.yaml");
  for (const [text, where] of [
    [
      `${JSON.stringify({ hoistPattern: ["*"], layoutVersion: 5 }, null, 2)}\n`,
      "line 1",
    ],
    [`{"hoistPattern":[],"layoutVersion":5}\n`, "line 1"],
    ["\"layoutVersion\": 5\nhoistPattern:\n  - '*'\n", "line 1"],
    ['layoutVersion: 5\n"hoistPattern": []\n', "line 2"],
    ["hoistPattern:\n  - '*'\n", "no layoutVersion field"],
  ]) {
    write(record, text);
    assert.throws(
      () => keyOf(frontend, side),
      new RegExp(
        `\\.modules\\.yaml is not the YAML layout the build cache reads \\(${where}\\)`,
        "u",
      ),
      "a line reader keys none of pnpm 12's JSON fields, so toggling hoistPattern there keeps the key and serves a build that resolved otherwise",
    );
  }
});

await test("a package copied into a linked package's node_modules refuses the key", (t) => {
  const { frontend, checkout, side, shared } = linkedFixture(t);
  const store = join(
    "node_modules",
    ".pnpm",
    "color-lib@1.0.0",
    "node_modules",
  );
  write(join(checkout, store, "color-lib", "index.js"), "export default 1;\n");
  for (const name of [["color-lib"], ["@acme", "color-lib"]]) {
    const copied = join(shared, "node_modules", ...name);
    write(join(copied, "index.js"), 'export default "COLOR-V1";\n');
    assert.throws(
      () => keyOf(frontend, side),
      new RegExp(
        `${name.join("[\\\\/]")} is a package copied into a linked package's node_modules`,
        "u",
      ),
      "a key that skips a linked package's node_modules serves the build of the copy's old files",
    );
    rmSync(copied, { recursive: true });
    symlinkSync(
      join("../".repeat(name.length + 2), store, "color-lib"),
      copied,
    );
  }
  assert.match(
    keyOf(frontend, side),
    /^[0-9a-f]{64}$/u,
    "a key refusing every package in a linked package's node_modules never hits in this repository, whose packages link their dependencies from pnpm's store",
  );
});

await test("a link the key cannot follow refuses the key; a link into a keyed package or pnpm's store does not", (t) => {
  const { dir, frontend, checkout, modules, side, shared } = linkedFixture(t);
  const inner = join(checkout, "packages", "inner");
  write(join(inner, "index.js"), 'export const inner = "INNER-V1";\n');
  mkdirSync(join(shared, "node_modules"));
  symlinkSync("../../inner", join(shared, "node_modules", "inner"));
  const vue = join("node_modules", ".pnpm", "vue@3.5.0", "node_modules", "vue");
  write(join(checkout, vue, "index.js"), "vue();\n");
  symlinkSync(join("../../..", vue), join(shared, "node_modules", "vue"));
  symlinkSync("index.js", join(shared, "alias.js"));
  symlinkSync("missing.js", join(shared, "dangling.js"));
  assert.throws(
    () => keyOf(frontend, side),
    /node_modules[\\/]inner links to .*packages[\\/]inner, which the build cache does not key/u,
    "a key reading a linked package's node_modules by link text serves a build of the old files of a package linked only from inside it",
  );
  symlinkSync("../../packages/inner", join(modules, "inner"));
  const covered = keyOf(frontend, side);
  write(join(inner, "index.js"), 'export const inner = "INNER-V2";\n');
  assert.notEqual(
    keyOf(frontend, side),
    covered,
    "a nested link to a package the key reads anyway is keyed by that package's files",
  );
  const theme = join(dir, "elsewhere", "theme.css");
  write(theme, "a { color: red; }\n");
  symlinkSync(theme, join(shared, "theme.css"));
  assert.throws(
    () => keyOf(frontend, side),
    /shared-ui[\\/]theme\.css links to .*elsewhere[\\/]theme\.css, which the build cache does not key/u,
    "a key that hashes a link's text serves a build of the old file it reaches",
  );
  rmSync(join(shared, "theme.css"));
  write(join(inner, ".dms-frontend", "dist", "chunk.js"), "built();\n");
  symlinkSync("../inner/.dms-frontend/dist/chunk.js", join(shared, "chunk.js"));
  assert.throws(
    () => keyOf(frontend, side),
    /shared-ui[\\/]chunk\.js links to .*\.dms-frontend[\\/]dist[\\/]chunk\.js, which the build cache does not key/u,
    "a key that counts a keyed package's run outputs as keyed serves a build of the output it reached",
  );
});

await test("a link inside a package copied into node_modules that the key cannot follow refuses the key", (t) => {
  const { dir, frontend, modules, prepare } = fixture(t);
  const side = prepare("run", 1001);
  const color = join(dir, "elsewhere", "color-lib");
  write(join(color, "index.js"), 'export default "COLOR-V1";\n');
  write(join(modules, "ui-kit", "index.js"), 'import "color-lib";\n');
  mkdirSync(join(modules, "ui-kit", "node_modules"));
  symlinkSync(color, join(modules, "ui-kit", "node_modules", "color-lib"));
  assert.throws(
    () => keyOf(frontend, side),
    /ui-kit[\\/]node_modules[\\/]color-lib links to/u,
    "a key that hashes a copied package's links by their text serves a build of the old files they reach",
  );
});
