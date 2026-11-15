import assert from "node:assert/strict";
import { test } from "node:test";
import {
  affectedPackages,
  PACKAGES,
  selectPackages,
} from "./affected-packages.mjs";

const ALL = PACKAGES.map(({ name }) => name);

/** @returns {string[]} */
const failOnDiff = () => {
  throw new Error("changedFiles must not run");
};

await test("an absent tier selects every package (catches absence selecting nothing)", () => {
  assert.deepEqual(selectPackages({}, failOnDiff), ALL);
});

await test("an empty tier selects every package (catches an empty string treated as a tier)", () => {
  assert.deepEqual(selectPackages({ tier: "", base: "abc" }, failOnDiff), ALL);
});

await test("the full and nightly tiers select every package (catches a tier that narrows by diff)", () => {
  assert.deepEqual(
    selectPackages({ tier: "full", base: "abc" }, failOnDiff),
    ALL,
  );
  assert.deepEqual(
    selectPackages({ tier: "nightly", base: "abc" }, failOnDiff),
    ALL,
  );
});

await test("an unknown tier selects every package (catches an unknown tier selecting nothing)", () => {
  assert.deepEqual(selectPackages({ tier: "turbo" }, failOnDiff), ALL);
});

await test("the draft and none tiers select no package (catches a draft or none run that tests)", () => {
  assert.deepEqual(
    selectPackages({ tier: "draft", base: "abc" }, failOnDiff),
    [],
  );
  assert.deepEqual(selectPackages({ tier: "none" }, failOnDiff), []);
});

await test("the fast tier without a base selects every package and reads no diff (catches a diff against an empty base)", () => {
  assert.deepEqual(selectPackages({ tier: "fast" }, failOnDiff), ALL);
  assert.deepEqual(selectPackages({ tier: "fast", base: "" }, failOnDiff), ALL);
});

await test("the fast tier with a base selects what the diff against it affects (catches a diff against another ref or a fast tier that selects everything)", () => {
  /** @type {string[]} */
  const bases = [];
  const selection = selectPackages({ tier: "fast", base: "abc" }, (base) => {
    bases.push(base);
    return ["packages/dms/src/index.ts"];
  });
  assert.deepEqual(bases, ["abc"]);
  assert.deepEqual(selection, ["dms", "playground", "verify-dms", "agents"]);
});

await test("a backend source change selects its dependents and not the Vue layer (catches missing dependents and a backend edge to the Vue layer)", () => {
  assert.deepEqual(affectedPackages(["packages/dms/src/server/api.ts"]), [
    "dms",
    "playground",
    "verify-dms",
    "agents",
  ]);
});

await test("a Vue layer file selects the Vue layer and its dependents, not the backend (catches plain prefix ownership)", () => {
  assert.deepEqual(
    affectedPackages([
      "packages/dms/frontend-vue/layers/dms-ui/app/components/X.vue",
    ]),
    ["frontend-vue", "playground", "verify-dms", "agents"],
  );
});

await test("a Vue fixture the backend tests read selects the backend too (catches a dropped read edge)", () => {
  assert.deepEqual(
    affectedPackages(["packages/dms/frontend-vue/tests/fixtures/page.json"]),
    ["dms", "frontend-vue", "playground", "verify-dms", "agents"],
  );
});

await test("a backend data file the Vue tests read selects the Vue layer too (catches a read edge that runs one way)", () => {
  assert.deepEqual(affectedPackages(["packages/dms/data/catalog.json"]), [
    "dms",
    "frontend-vue",
    "playground",
    "verify-dms",
    "agents",
  ]);
});

await test("a page interface change selects every package that imports it (catches a dependency edge left out of the table)", () => {
  assert.deepEqual(affectedPackages(["packages/interface-dms/src/page.ts"]), [
    "interface-dms",
    "dms",
    "frontend-vue",
    "playground",
    "verify-dms",
    "agents",
  ]);
});

await test("a builder interface change selects every package that imports it (catches a builder change that stops at its own package)", () => {
  assert.deepEqual(
    affectedPackages(["packages/interface-dms-builder/src/index.ts"]),
    [
      "interface-dms-builder",
      "dms",
      "frontend-vue",
      "playground",
      "verify-dms",
      "agents",
    ],
  );
});

await test("a documentation-only change selects no package (catches a docs path treated as shared tooling)", () => {
  assert.deepEqual(
    affectedPackages([
      "README.md",
      "docs/guide.md",
      "docs-data/examples.json",
      "packages/dms/README.md",
      "packages/dms/docs/02.building/.navigation.yml",
      "packages/interface-dms/docs-data/examples.json",
    ]),
    [],
  );
});

await test("a documentation page selects only the map that names it (catches a docs page that skips verify-map)", () => {
  assert.deepEqual(
    affectedPackages(["packages/dms/docs/08.ai/10.mcp-server.md"]),
    ["verify-dms"],
  );
});

await test("the docs examples select the backend that compiles them (catches a docs read edge dropped by the docs filter)", () => {
  assert.deepEqual(affectedPackages(["packages/dms/docs-data/examples.json"]), [
    "dms",
    "playground",
    "verify-dms",
    "agents",
  ]);
});

await test("an ignore file of the Vue layer selects the backend that packs it (catches a package-contents edge left out)", () => {
  assert.deepEqual(affectedPackages(["packages/dms/frontend-vue/.gitignore"]), [
    "dms",
    "frontend-vue",
    "playground",
    "verify-dms",
    "agents",
  ]);
});

await test("a playground file is not documentation (catches the docs list skipping the playground)", () => {
  assert.deepEqual(
    affectedPackages(["packages/dms/playground/tsconfig.json"]),
    ["playground", "verify-dms"],
  );
});

await test("a lockfile change selects every package (catches a lockfile change that selects nothing)", () => {
  assert.deepEqual(affectedPackages(["pnpm-lock.yaml"]), ALL);
});

await test("a workflow change selects every package (catches a workflow change that selects nothing)", () => {
  assert.deepEqual(affectedPackages([".github/workflows/ci.yml"]), ALL);
});

await test("an agent skill change selects only the agents package (catches shared tooling swallowing agent files)", () => {
  assert.deepEqual(affectedPackages([".claude/skills/x/SKILL.md"]), ["agents"]);
  assert.deepEqual(affectedPackages([".agents/skills/x/SKILL.md"]), ["agents"]);
});

await test("a verify-dms skill change selects only the map, not the formal models (catches the nested skill owned by agents)", () => {
  assert.deepEqual(
    affectedPackages([".agents/skills/verify-dms/features/auth.md"]),
    ["verify-dms"],
  );
});

await test("a documentation file next to a code change does not narrow the selection (catches a docs file that ends the scan)", () => {
  assert.deepEqual(
    affectedPackages(["README.md", "packages/dms/src/index.ts"]),
    ["dms", "playground", "verify-dms", "agents"],
  );
});

await test("an empty diff selects no package (catches an empty diff selecting everything)", () => {
  assert.deepEqual(affectedPackages([]), []);
});
