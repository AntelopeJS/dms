import assert from "node:assert/strict";
import { test } from "node:test";
import {
  affectedPackages,
  loadFormalChecks,
  PACKAGES,
  planRun,
  selectFormal,
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

await test("a journey of the e2e suite selects only the verify map that loads it (catches e2e/ left to no package, which selects every package)", () => {
  assert.deepEqual(affectedPackages(["e2e/journeys/smoke.mjs"]), [
    "verify-dms",
  ]);
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

const CHECKS = await loadFormalChecks();
const BUILDER_SUITE_CHECKS = [
  "formal-theme-logo-orphans",
  "formal-builder-option-echo",
];

/**
 * @param {string} tier
 * @param {string[] | undefined} diff The changed files, or undefined for no base.
 * @returns {{ formal: string[], formalGenerated: string[] }}
 */
const formalFor = (tier, diff) =>
  selectFormal(
    { tier, base: diff === undefined ? undefined : "abc" },
    CHECKS,
    () => diff ?? failOnDiff(),
  );

await test("a diff touching one covered path selects only the check that covers it (catches a diff that selects every check)", () => {
  assert.deepEqual(formalFor("fast", ["packages/dms/src/realtime/broker.ts"]), {
    formal: ["formal-realtime-tabs"],
    formalGenerated: [],
  });
});

await test("a shared property runner selects the two checks whose files name it (catches matching only covers)", () => {
  assert.deepEqual(
    formalFor("fast", [".agents/formal/run-properties.cts"]).formal,
    ["formal-route-patterns", "formal-option-patch-prune"],
  );
});

await test("a path two generated checks cover selects both (catches a path that stops at the first check)", () => {
  assert.deepEqual(
    formalFor("fast", ["packages/dms/src/mcp/tools/builder-pages.ts"]),
    {
      formal: [],
      formalGenerated: [
        "formal-ai-answers-no-row-values",
        "formal-block-writes-judge-request-targets",
      ],
    },
  );
});

await test("a glob of a check's own files selects that check (catches exact-path matching only)", () => {
  assert.deepEqual(
    formalFor("fast", [".agents/skills/formal-invite-creation/check.mjs"]),
    { formal: ["formal-invite-creation"], formalGenerated: [] },
  );
});

await test("no base selects every CI check and reads no diff (catches a diff against an empty base)", () => {
  for (const tier of ["queue", "nightly", "full"]) {
    const { formal, formalGenerated } = formalFor(tier, undefined);
    assert.equal(formal.length + formalGenerated.length, 9);
  }
});

await test("a base narrows the formal checks on the full tier too (catches narrowing on the fast tier only)", () => {
  assert.deepEqual(
    formalFor("full", ["packages/dms/src/realtime/broker.ts"]).formal,
    ["formal-realtime-tabs"],
  );
});

await test("the checks split 7 and 2 and the builder suite's two never appear (catches a check run twice)", () => {
  const { formal, formalGenerated } = formalFor("queue", undefined);
  assert.equal(formal.length, 7);
  assert.equal(formalGenerated.length, 2);
  for (const name of BUILDER_SUITE_CHECKS) {
    assert.equal(
      formal.includes(name) || formalGenerated.includes(name),
      false,
    );
  }
});

await test("a diff to a builder-suite check's own files runs no formal job (catches the builder suite's checks left to formal)", () => {
  assert.deepEqual(
    formalFor("fast", [
      "packages/dms/src/implementations/dms-builder/engine/theme.ts",
      "packages/dms/src/test/unit/builder/builder-option-echo.formal.test.ts",
    ]),
    { formal: [], formalGenerated: [] },
  );
});

await test("a documentation-only diff runs no formal check (catches docs treated as shared tooling)", () => {
  assert.deepEqual(
    formalFor("fast", ["README.md", "packages/dms/docs/01.intro.md"]),
    { formal: [], formalGenerated: [] },
  );
});

await test("the draft and none tiers run no formal check even without a base (catches a draft run that runs the models)", () => {
  for (const tier of ["draft", "none"]) {
    assert.deepEqual(formalFor(tier, undefined), {
      formal: [],
      formalGenerated: [],
    });
  }
});

/**
 * @param {string} tier
 * @param {string[] | undefined} diff
 * @returns {ReturnType<typeof planRun>}
 */
const planFor = (tier, diff) =>
  planRun(
    { tier, base: diff === undefined ? undefined : "abc" },
    CHECKS,
    () => diff ?? failOnDiff(),
  );

/**
 * @param {string} tier
 * @param {string[] | undefined} diff
 * @returns {string[]}
 */
const jobsFor = (tier, diff) => planFor(tier, diff).jobs;

await test("the docs-playground job runs on the queue and nightly tiers only (catches it on a pull request tier)", () => {
  assert.equal(
    jobsFor("fast", ["packages/dms/src/index.ts"]).includes("docs-playground"),
    false,
  );
  assert.equal(jobsFor("full", undefined).includes("docs-playground"), false);
  assert.equal(jobsFor("queue", undefined).includes("docs-playground"), true);
  assert.equal(jobsFor("nightly", undefined).includes("docs-playground"), true);
});

await test("the dependents job runs on the nightly and none tiers only (catches it on every tier)", () => {
  assert.equal(jobsFor("nightly", undefined).includes("dependents"), true);
  assert.deepEqual(jobsFor("none", undefined), ["dependents"]);
  assert.equal(jobsFor("queue", undefined).includes("dependents"), false);
  assert.equal(jobsFor("full", undefined).includes("dependents"), false);
});

await test("a draft run needs no job (catches the gate requiring a job a draft skips)", () => {
  assert.deepEqual(jobsFor("draft", undefined), []);
});

await test("a documentation-only fast diff needs no job (catches a docs diff that runs the backend)", () => {
  assert.deepEqual(jobsFor("fast", ["README.md"]), []);
});

await test("a realtime broker diff needs the backend, the map, the smoke journey and one formal job (catches a job table that drops a package's job)", () => {
  assert.deepEqual(jobsFor("fast", ["packages/dms/src/realtime/broker.ts"]), [
    "backend",
    "verify-map",
    "e2e",
    "formal",
  ]);
});

await test("a Vue layer diff needs the Vue jobs and not the backend (catches the Vue jobs keyed on the backend)", () => {
  const jobs = jobsFor("fast", [
    "packages/dms/frontend-vue/layers/dms-ui/app/components/X.vue",
  ]);
  assert.equal(jobs.includes("frontend-test"), true);
  assert.equal(jobs.includes("frontend-verify"), true);
  assert.equal(jobs.includes("backend"), false);
});

await test("the queue tier needs every job but dependents (catches a queue run that skips a job)", () => {
  assert.deepEqual(jobsFor("queue", undefined), [
    "backend",
    "frontend-test",
    "frontend-verify",
    "verify-map",
    "e2e",
    "docs-playground",
    "formal",
    "formal-generated",
  ]);
});

await test("the output keys are the five the select step appends, in order (catches a renamed or dropped key)", () => {
  assert.deepEqual(Object.keys(planFor("queue", undefined)), [
    "packages",
    "formal",
    "formal-generated",
    "jobs",
    "backend-suites",
  ]);
});

await test("the backend suites are unit, integration and four builder shards as index/count (catches a shard count changed without a decision, or a shard test-files.mjs refuses)", () => {
  assert.deepEqual(planFor("queue", undefined)["backend-suites"], [
    "unit",
    "integration",
    "builder:1/4",
    "builder:2/4",
    "builder:3/4",
    "builder:4/4",
  ]);
});
