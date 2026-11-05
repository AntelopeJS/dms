import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decodeCommitStatuses, readFeatureResults } from "./decode.mjs";
import { readFormalResult } from "./formal.mjs";
import { readJudgement } from "./judgement.mjs";
import { loadSkill } from "./skill.mjs";

/**
 * @param {import("node:test").TestContext} t The test
 * @returns {string} A scratch folder removed when the test ends
 */
function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-decode-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * @param {string} file The file
 * @param {unknown} value What it holds as JSON
 */
function writeJson(file, value) {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

const FORMAL = {
  name: "formal-add",
  exitCode: 0,
  violated: [],
  passing: ["AddWorks"],
  folder: "formal/formal-add",
};

await test("a formal result is read as recorded", (t) => {
  const evidence = scratch(t);
  writeJson(join(evidence, "formal", "formal-add", "result.json"), {
    ...FORMAL,
    base: null,
    fixed: [],
  });
  assert.deepEqual(readFormalResult({ evidence }, "formal-add"), {
    ...FORMAL,
    base: null,
    fixed: [],
  });
  assert.equal(readFormalResult({ evidence }, "formal-other"), undefined);
});

await test("a formal result whose rules are no list is refused", (t) => {
  const evidence = scratch(t);
  writeJson(join(evidence, "formal", "formal-add", "result.json"), {
    ...FORMAL,
    violated: "AddWorks",
  });
  assert.throws(
    () => readFormalResult({ evidence }, "formal-add"),
    /result\.json is malformed: expected a formal check result/,
  );
});

const RESULT = {
  feature: "smoke",
  journey: "onboard",
  title: "Onboard",
  entryPoint: "/",
  status: "PASS",
  database: "dms_run",
  steps: [
    { name: "open", checks: [{ name: "loads", pass: true, detail: "" }] },
  ],
  error: null,
  folder: "smoke/onboard",
};

await test("journey results are read as recorded and none when absent", (t) => {
  const dir = scratch(t);
  assert.deepEqual(readFeatureResults(join(dir, "feature.json")), []);
  writeJson(join(dir, "feature.json"), [RESULT]);
  assert.deepEqual(readFeatureResults(join(dir, "feature.json")), [RESULT]);
});

await test("a journey result with a status that is neither PASS nor FAIL is refused", (t) => {
  const dir = scratch(t);
  writeJson(join(dir, "feature.json"), [{ ...RESULT, status: "PASSED" }]);
  assert.throws(
    () => readFeatureResults(join(dir, "feature.json")),
    /feature\.json is malformed: expected a list of journey results/,
  );
});

await test("a journey result whose check does not say pass or fail is refused", (t) => {
  const dir = scratch(t);
  const steps = [
    { name: "open", checks: [{ name: "loads", pass: "yes", detail: "" }] },
  ];
  writeJson(join(dir, "feature.json"), [{ ...RESULT, steps }]);
  assert.throws(
    () => readFeatureResults(join(dir, "feature.json")),
    /malformed: expected a list of journey results/,
  );
});

await test("a status list without a context and state is refused", () => {
  const statuses = [{ context: "verify", state: "success", id: 1 }];
  assert.deepEqual(decodeCommitStatuses(statuses, "gh"), statuses);
  assert.throws(
    () => decodeCommitStatuses({ message: "Not Found" }, "gh api statuses"),
    /gh api statuses is malformed/,
  );
  assert.throws(
    () => decodeCommitStatuses([{ context: "verify" }], "gh"),
    /malformed: expected a list of commit statuses/,
  );
});

const CONFIG = `export default {
  playground: "playground",
  prepare: [["pnpm", "install"]],
  userFacing: ["src/**"],
  smoke: "smoke",
  smokeJourney: "onboard",
  doors: { data: { globs: ["src/**"], funnels: [], why: "rows" }, format: null },
  formal: [],
};
`;

/**
 * @param {import("node:test").TestContext} t The test
 * @param {string} config What `verify.config.ts` holds
 * @returns {string} The skill folder, inside a git checkout
 */
function skillFolder(t, config) {
  const repo = scratch(t);
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.com",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "init",
    ],
    { cwd: repo },
  );
  const dir = join(repo, ".agents", "skills", "verify-demo");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "verify.config.ts"), config);
  return dir;
}

await test("a config without the optional list of non-user-facing paths loads with none", async (t) => {
  const skill = await loadSkill(skillFolder(t, CONFIG), tmpdir());
  assert.deepEqual(skill.config.notUserFacing, []);
  assert.equal(skill.config.doors.format, null);
});

await test("a config missing a field is refused where the skill loads", async (t) => {
  const dir = skillFolder(t, CONFIG.replace('smoke: "smoke",\n', ""));
  await assert.rejects(
    loadSkill(dir, tmpdir()),
    /verify\.config\.ts is malformed: expected a verification skill config/,
  );
});

await test("a config whose formal check pattern is a string is refused", async (t) => {
  const dir = skillFolder(
    t,
    CONFIG.replace(
      "formal: []",
      'formal: [{ name: "f", covers: [], command: ["node"], violation: "^x", passing: null }]',
    ),
  );
  await assert.rejects(
    loadSkill(dir, tmpdir()),
    /malformed: expected a verification skill config/,
  );
});

await test("a config module without a default export is refused", async (t) => {
  const dir = skillFolder(t, "export const config = {};\n");
  await assert.rejects(
    loadSkill(dir, tmpdir()),
    /verify\.config\.ts is malformed/,
  );
});

const JUDGEMENT = {
  verifier: "thread",
  notVerified: ["ui"],
  attention: [],
  docs: [{ page: "docs/a.md", matches: true, note: "ok" }],
  doors: { none: "no door" },
};

await test("a judgement is read into the verdict's shape", async (t) => {
  const skill = await loadSkill(skillFolder(t, CONFIG), tmpdir());
  const file = join(scratch(t), "judgement.json");
  writeJson(file, JUDGEMENT);
  assert.deepEqual(readJudgement(skill, file), {
    notVerified: ["ui"],
    attention: [],
    docs: [{ page: "docs/a.md", matches: true, note: "ok" }],
    doorsNone: "no door",
    doors: [],
    falsePositives: [],
    verifier: "thread",
  });
});

await test("a judgement whose lists hold other than strings is refused", async (t) => {
  const skill = await loadSkill(skillFolder(t, CONFIG), tmpdir());
  const file = join(scratch(t), "judgement.json");
  writeJson(file, { ...JUDGEMENT, notVerified: "ui" });
  assert.throws(
    () => readJudgement(skill, file),
    /judgement\.json is malformed: expected a verifier's judgement/,
  );
  writeJson(file, {
    ...JUDGEMENT,
    docs: [{ page: "docs/a.md", matches: "yes" }],
  });
  assert.throws(
    () => readJudgement(skill, file),
    /malformed: expected a verifier/,
  );
});

await test("a judgement that is no object is refused", async (t) => {
  const skill = await loadSkill(skillFolder(t, CONFIG), tmpdir());
  const file = join(scratch(t), "judgement.json");
  writeJson(file, ["verifier"]);
  assert.throws(() => readJudgement(skill, file), /is malformed/);
});
