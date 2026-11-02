import assert from "node:assert/strict";
import test from "node:test";
import { isManifest, parseManifest } from "./manifest.mjs";

const MANIFEST = {
  name: "@antelopejs/dms",
  version: "0.9.5",
  private: false,
  license: "Apache-2.0",
  repository: { type: "git", url: "git+https://github.com/AntelopeJS/dms.git", directory: "packages/dms" },
  publishConfig: { registry: "https://registry.npmjs.org", access: "public", provenance: true },
  antelopeJs: { implements: ["dms@0"] },
  dependencies: { "@antelopejs/interface-dms": ">=0.9.1 <0.10.0" },
};

await test("isManifest accepts a full manifest, a bare one and fields it does not read", () => {
  assert.equal(isManifest(MANIFEST), true);
  assert.equal(isManifest({}), true);
  assert.equal(isManifest({ ...MANIFEST, scripts: { build: "tsc" } }), true);
  assert.equal(isManifest({ antelopeJs: {} }), true);
});

await test("isManifest refuses a value that is not an object", () => {
  assert.equal(isManifest(null), false);
  assert.equal(isManifest([MANIFEST]), false);
  assert.equal(isManifest("{}"), false);
});

await test("isManifest refuses each field the probe reads when it has the wrong type", () => {
  for (const broken of [
    { name: 1 },
    { version: ["0.9.5"] },
    { private: "false" },
    { license: null },
    { repository: "git" },
    { repository: { url: 3 } },
    { repository: { type: [] } },
    { repository: { directory: false } },
    { publishConfig: [] },
    { publishConfig: { registry: 1 } },
    { publishConfig: { access: true } },
    { publishConfig: { provenance: "yes" } },
    { antelopeJs: "dms" },
    { antelopeJs: { implements: "dms@0" } },
    { antelopeJs: { implements: [1] } },
    { dependencies: ["a"] },
    { dependencies: { a: 1 } },
  ]) {
    assert.equal(isManifest({ ...MANIFEST, ...broken }), false, JSON.stringify(broken));
  }
});

await test("isManifest reads own fields only", () => {
  assert.equal(isManifest(Object.create({ name: 1 })), true);
});

await test("parseManifest returns the decoded manifest and names the file it refuses", () => {
  assert.deepEqual(parseManifest(JSON.stringify(MANIFEST), "packages/dms/package.json"), MANIFEST);
  assert.throws(() => parseManifest('{"name":1}', "packages/dms/package.json"), /packages\/dms\/package\.json is not a package manifest/);
  assert.throws(() => parseManifest("[]", "a/package.json"), /a\/package\.json/);
  assert.throws(() => parseManifest("not json", "a/package.json"), SyntaxError);
});
