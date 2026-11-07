import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkMap, planFor } from "./map.mjs";
import { renderVerdict } from "./verdict.mjs";

const JOURNEYS = (/** @type {string} */ id) =>
  `export const journeys = [{ id: "${id}", title: "t", entryPoint: "e", async run() {} }];\n`;
const FEATURE = (/** @type {string} */ id, /** @type {string[]} */ covers) =>
  `---\ncovers:\n${covers.map((glob) => `  - ${glob}`).join("\n")}\n---\n\`${id}\`\n`;

const BASE_FILES = {
  "package.json": "{}\n",
  "pnpm-lock.yaml": "lock: 1\n",
  "src/a/x.ts": "export const x = 1;\n",
  "src/b/y.ts": "export const y = 1;\n",
  "fixtures/host/package.json": "{}\n",
  "skill/features/smoke.md": "---\ncovers:\n---\n`smoke`\n",
  "skill/features/a.md": FEATURE("a-journey", ["src/a/**"]),
  "skill/features/b.md": FEATURE("b-journey", ["src/b/**"]),
  "skill/journeys/smoke.mjs": JOURNEYS("smoke"),
  "skill/journeys/a.mjs": JOURNEYS("a-journey"),
  "skill/journeys/b.mjs": JOURNEYS("b-journey"),
};

/**
 * @param {string} repo
 * @param {...string} args
 * @returns {string}
 */
function git(repo, ...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

/**
 * @param {string} repo
 * @param {Record<string, string>} files
 * @returns {string} The new HEAD
 */
function commit(repo, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  git(repo, "add", "-A");
  git(
    repo,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "-m",
    "change",
  );
  return git(repo, "rev-parse", "HEAD");
}

/**
 * A repository with two features beside the smoke one, committed once, then
 * changed by `changes` in a second commit.
 *
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>} changes
 * @param {Partial<import("./skill.mjs").SkillConfig>} [config]
 */
function fixture(t, changes, config = {}) {
  const repo = mkdtempSync(join(tmpdir(), "dms-control-map-test-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  git(repo, "init", "-q");
  git(repo, "remote", "add", "origin", "https://github.com/o/r.git");
  const base = commit(repo, BASE_FILES);
  const head = commit(repo, changes);
  /** @type {import("./skill.mjs").Skill} */
  const skill = {
    dir: join(repo, "skill"),
    name: "verify-x",
    repo,
    featuresDir: join(repo, "skill", "features"),
    journeysDir: join(repo, "skill", "journeys"),
    config: {
      playground: "p",
      prepare: [],
      userFacing: ["src/**"],
      notUserFacing: [],
      shared: ["**/package.json", "pnpm-lock.yaml"],
      notShared: ["fixtures/**"],
      smoke: "smoke",
      smokeJourney: "",
      doors: {},
      formal: [],
      ...config,
    },
  };
  return { repo, base, head, skill };
}

await test("a changed lockfile runs smoke and then every feature and names the file; a planner that maps only covers globs runs smoke alone", (t) => {
  const { skill, base } = fixture(t, { "pnpm-lock.yaml": "lock: 2\n" });
  const plan = planFor(skill, base);
  assert.deepEqual(plan.run, ["smoke", "a", "b"]);
  assert.deepEqual(plan.shared, ["pnpm-lock.yaml"]);
  assert.deepEqual(plan.touched, []);
});

await test("a nested manifest is shared too; a root-only package.json glob leaves it to the covers", (t) => {
  const { skill, base } = fixture(t, { "src/a/package.json": "{ }\n" });
  const plan = planFor(skill, base);
  assert.deepEqual(plan.run, ["smoke", "a", "b"]);
  assert.deepEqual(plan.shared, ["src/a/package.json"]);
});

await test("a diff of covered files runs those features beside smoke; escalating on every change would run b too", (t) => {
  const { skill, base } = fixture(t, { "src/a/x.ts": "export const x = 2;\n" });
  const plan = planFor(skill, base);
  assert.deepEqual(plan.run, ["smoke", "a"]);
  assert.deepEqual(plan.shared, []);
  assert.deepEqual(plan.touched, [{ feature: "a", files: ["src/a/x.ts"] }]);
});

await test("a shared file next to a covered one keeps touched and shared apart; dropping touched on escalation loses the diff-to-feature evidence", (t) => {
  const { skill, base } = fixture(t, {
    "src/b/y.ts": "export const y = 2;\n",
    "package.json": '{ "name": "x" }\n',
  });
  const plan = planFor(skill, base);
  assert.deepEqual(plan.run, ["smoke", "a", "b"]);
  assert.deepEqual(plan.shared, ["package.json"]);
  assert.deepEqual(plan.touched, [{ feature: "b", files: ["src/b/y.ts"] }]);
});

await test("a fixture manifest under notShared stays on smoke; a planner that ignores notShared escalates on test fixtures", (t) => {
  const { skill, base } = fixture(t, {
    "fixtures/host/package.json": '{ "name": "host" }\n',
  });
  const plan = planFor(skill, base);
  assert.deepEqual(plan.run, ["smoke"]);
  assert.deepEqual(plan.shared, []);
});

await test("a skill without shared globs still plans from covers alone; a planner that treats every package.json as shared breaks the other dms-* repositories", (t) => {
  const { skill, base } = fixture(
    t,
    { "pnpm-lock.yaml": "lock: 2\n" },
    { shared: [], notShared: [] },
  );
  assert.deepEqual(planFor(skill, base).run, ["smoke"]);
});

await test("all runs every feature on a diff that touches none and lists no shared file; ignoring the flag runs smoke alone", (t) => {
  const { skill, base } = fixture(t, { "README.md": "x\n" });
  const plan = planFor(skill, base, true);
  assert.deepEqual(plan.run, ["smoke", "a", "b"]);
  assert.deepEqual(plan.shared, []);
  assert.deepEqual(planFor(skill, base).run, ["smoke"]);
});

await test("map fails a shared glob that matches no tracked file or only notShared ones; a checkMap blind to shared globs lets a renamed lockfile glob rot", async (t) => {
  const { skill } = fixture(
    t,
    { "README.md": "x\n" },
    {
      shared: ["**/package.json", "gone/**", "fixtures/**"],
    },
  );
  const problems = (await checkMap(skill)).filter((line) =>
    line.includes("shared glob"),
  );
  assert.deepEqual(problems, [
    "verify.config.ts: shared glob gone/** matches no tracked file",
    "verify.config.ts: shared glob fixtures/** matches no tracked file",
  ]);
});

/**
 * @param {string} evidence
 * @param {string[]} features
 */
function recordPassing(evidence, features) {
  for (const feature of features) {
    mkdirSync(join(evidence, feature), { recursive: true });
    const journey = feature === "smoke" ? "smoke" : `${feature}-journey`;
    writeFileSync(
      join(evidence, feature, "feature.json"),
      JSON.stringify([
        {
          feature,
          journey,
          title: "t",
          entryPoint: "e",
          status: "PASS",
          database: "d",
          steps: [],
          error: null,
          folder: `${feature}/${journey}`,
        },
      ]),
    );
  }
}

const JUDGEMENT = {
  notVerified: [],
  attention: [],
  docs: [],
  doorsNone: "none",
  doors: [],
  falsePositives: [],
  verifier: "v",
};

await test("the verdict fails a run that skipped features the shared-file plan required; a verdict that requires only the touched features passes the smoke-only run", async (t) => {
  const { skill, base, head } = fixture(t, { "pnpm-lock.yaml": "lock: 2\n" });
  const evidence = mkdtempSync(join(tmpdir(), "dms-control-evidence-test-"));
  t.after(() => rmSync(evidence, { recursive: true, force: true }));
  const state = /** @type {import("../run-state.mjs").RunState} */ (
    /** @type {unknown} */ ({ baseRef: base, headSha: head, evidence })
  );
  recordPassing(evidence, ["smoke"]);
  const skipped = await renderVerdict(skill, state, 1, JUDGEMENT);
  assert.equal(skipped.result, "FAIL");
  assert.deepEqual(skipped.reasons, [
    "a/a-journey was not run",
    "b/b-journey was not run",
  ]);
  recordPassing(evidence, ["a", "b"]);
  assert.equal(
    (await renderVerdict(skill, state, 1, JUDGEMENT)).result,
    "PASS",
  );
});

await test("the verdict of a covered-only diff needs the other features only when all is set; a verdict that drops all passes an incomplete release run", async (t) => {
  const { skill, base, head } = fixture(t, {
    "src/a/x.ts": "export const x = 2;\n",
  });
  const evidence = mkdtempSync(join(tmpdir(), "dms-control-evidence-test-"));
  t.after(() => rmSync(evidence, { recursive: true, force: true }));
  const state = /** @type {import("../run-state.mjs").RunState} */ (
    /** @type {unknown} */ ({ baseRef: base, headSha: head, evidence })
  );
  recordPassing(evidence, ["smoke", "a"]);
  assert.equal(
    (await renderVerdict(skill, state, 1, JUDGEMENT)).result,
    "PASS",
  );
  const release = await renderVerdict(skill, state, 1, JUDGEMENT, true);
  assert.deepEqual(release.reasons, ["b/b-journey was not run"]);
});
