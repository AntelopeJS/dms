import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { evidenceText } from "../helpers/evidence.mjs";
import { runFormalCheck, touchedFormalChecks } from "./formal.mjs";

const CHECK = `console.log("holds AddWorks");
console.log("BROKEN Overflow");
console.log("finding NegativeZero");
console.log("finding NegativeZero");
process.exit(1);
`;

const CHECK_CONFIG = {
  name: "formal-add",
  covers: ["src/math.js"],
  files: [".agents/skills/formal-add/**"],
  command: ["node", ".agents/skills/formal-add/check.mjs"],
  violation: /^(?:finding|BROKEN) (\w+)/gm,
};

/**
 * @param {import("node:test").TestContext} t
 * @param {string} check What the check script holds
 */
function formalRepo(t, check) {
  const root = mkdtempSync(join(tmpdir(), "dms-control-formal-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const script = join(root, ".agents/skills/formal-add/check.mjs");
  mkdirSync(dirname(script), { recursive: true });
  writeFileSync(script, check);
  const evidence = join(root, "evidence");
  mkdirSync(evidence);
  return {
    skill: { repo: root, config: { formal: [CHECK_CONFIG] } },
    evidence,
  };
}

await test("a run records each violated rule once with the command, output and exit code; a runner that reports only the exit code loses the rule names", (t) => {
  const { skill, evidence } = formalRepo(t, CHECK);
  const result = runFormalCheck(skill, { evidence }, CHECK_CONFIG);
  assert.deepEqual(result, {
    name: "formal-add",
    exitCode: 1,
    violated: ["Overflow", "NegativeZero"],
    folder: join("formal", "formal-add"),
  });
  const folder = join(evidence, "formal", "formal-add");
  assert.deepEqual(JSON.parse(evidenceText(folder, "result.json")), result);
  assert.equal(
    evidenceText(folder, "command.txt"),
    "node .agents/skills/formal-add/check.mjs\n",
  );
  assert.equal(
    evidenceText(folder, "stdout.txt"),
    "holds AddWorks\nBROKEN Overflow\nfinding NegativeZero\nfinding NegativeZero\n",
  );
  assert.equal(evidenceText(folder, "exit-code.txt"), "1\n");
});

await test("a check that holds reports no violated rule; a runner that counts a printed holds line as a violation fails it", (t) => {
  const { skill, evidence } = formalRepo(t, 'console.log("holds AddWorks");\n');
  const result = runFormalCheck(skill, { evidence }, CHECK_CONFIG);
  assert.deepEqual([result.exitCode, result.violated], [0, []]);
});

await test("a check with no violation pattern reports the property when it exits non-zero and nothing when it exits zero", (t) => {
  const check = { ...CHECK_CONFIG, violation: null };
  const failing = formalRepo(t, "process.exit(1);\n");
  assert.deepEqual(
    runFormalCheck(failing.skill, { evidence: failing.evidence }, check)
      .violated,
    ["property"],
  );
  const passing = formalRepo(t, "");
  assert.deepEqual(
    runFormalCheck(passing.skill, { evidence: passing.evidence }, check)
      .violated,
    [],
  );
});

await test("a diff touches a check through a covered file or one of its own files; a diff of neither leaves it untouched", (t) => {
  const { skill } = formalRepo(t, CHECK);
  assert.deepEqual(touchedFormalChecks(skill, ["src/math.js"]), [CHECK_CONFIG]);
  assert.deepEqual(
    touchedFormalChecks(skill, [".agents/skills/formal-add/check.mjs"]),
    [CHECK_CONFIG],
  );
  assert.deepEqual(touchedFormalChecks(skill, ["README.md"]), []);
});
