import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
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

await test("a config loads its shared globs, and none when it lists none; a loader that drops the fields escalates nothing", async (t) => {
  const bare = await loadSkill(skillFolder(t, CONFIG), tmpdir());
  assert.deepEqual([bare.config.shared, bare.config.notShared], [[], []]);
  const listed = await loadSkill(
    skillFolder(
      t,
      CONFIG.replace(
        "  smoke:",
        '  shared: ["**/package.json"],\n  notShared: ["hosts/**"],\n  smoke:',
      ),
    ),
    tmpdir(),
  );
  assert.deepEqual(listed.config.shared, ["**/package.json"]);
  assert.deepEqual(listed.config.notShared, ["hosts/**"]);
});

await test("a config whose shared globs are not strings is refused", async (t) => {
  const dir = skillFolder(
    t,
    CONFIG.replace("  smoke:", '  shared: "**/package.json",\n  smoke:'),
  );
  await assert.rejects(
    loadSkill(dir, tmpdir()),
    /verify\.config\.ts is malformed: expected a verification skill config/,
  );
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
      'formal: [{ name: "f", covers: [], command: ["node"], violation: "^x" }]',
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
