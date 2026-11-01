import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { formalGate, runFormalCheck, touchedFormalChecks } from "./formal.mjs";

const ADD = "export function add(a, b) {\n  return a + b;\n}\n";
const CHECK = `import { readFileSync } from "node:fs";
const source = readFileSync("src/math.js", "utf8");
console.log(source.includes("a + b") ? "holds AddWorks" : "BROKEN AddWorks");
console.log("finding NegativeZero");
`;
const CHECK_WITHOUT_RULE = CHECK.replace(/console\.log\("finding[^\n]*\n/, "");
const CHECK_FIXED = CHECK.replace(
  '"finding NegativeZero"',
  '"holds NegativeZero"',
);

const CHECK_CONFIG = {
  name: "formal-add",
  covers: ["src/math.js"],
  files: [".agents/skills/formal-add/**"],
  command: ["node", ".agents/skills/formal-add/check.mjs"],
  violation: /^(?:finding|BROKEN) (\w+)/gm,
  passing: /^holds (\w+)/gm,
  behaviour: { kind: "emit" },
};

/**
 * @param {string} repo
 * @param {...string} args
 */
function git(repo, ...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

/**
 * @param {string} repo
 * @param {Record<string, string>} files
 * @param {string} message
 */
function commit(repo, files, message) {
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
    message,
  );
  return git(repo, "rev-parse", "HEAD");
}

function formalRepo(t, head) {
  const root = mkdtempSync(join(tmpdir(), "dms-control-formal-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  const baseSha = commit(
    root,
    {
      "src/math.js": ADD,
      ".agents/skills/formal-add/check.mjs": CHECK,
    },
    "base",
  );
  const headSha = commit(root, head, "head");
  const changed = git(root, "diff", "--name-only", baseSha, headSha)
    .split("\n")
    .filter(Boolean);
  const evidence = join(root, "..", `${root.split("/").pop()}-evidence`);
  mkdirSync(evidence);
  t.after(() => rmSync(evidence, { recursive: true, force: true }));
  const skill = { repo: root, config: { formal: [CHECK_CONFIG] } };
  return { skill, state: { evidence }, diff: { baseSha, headSha, changed } };
}

function gated({ skill, state, diff }) {
  const [check] = touchedFormalChecks(skill, diff.changed);
  return check ? runFormalCheck(skill, state, check, diff) : null;
}

await test("a rule counts as fixed only when HEAD reports it passing, never when HEAD drops it", (t) => {
  const fixed = gated(
    formalRepo(t, {
      "src/math.js": ADD.replace("a + b", "a + b + 0"),
      ".agents/skills/formal-add/check.mjs": CHECK_FIXED,
    }),
  );
  assert.deepEqual(fixed.fixed, ["NegativeZero"]);
  assert.deepEqual(fixed.missing, []);
  const dropped = gated(
    formalRepo(t, {
      "src/math.js": ADD.replace("a + b", "a + b + 0"),
      ".agents/skills/formal-add/check.mjs": CHECK_WITHOUT_RULE,
    }),
  );
  assert.deepEqual(dropped.fixed, []);
  assert.deepEqual(dropped.missing, ["NegativeZero"]);
});

await test("a diff that touches only a check's own files runs the check and gates it against the base", (t) => {
  const result = gated(
    formalRepo(t, {
      ".agents/skills/formal-add/check.mjs": CHECK_WITHOUT_RULE,
    }),
  );
  assert.deepEqual(result.missing, ["NegativeZero"]);
  assert.deepEqual(formalGate(result), {
    fails: true,
    outcome: "rules the base broke are absent at HEAD: NegativeZero",
  });
});

await test("a diff that touches neither the covered files nor the check's files does not touch the check", (t) => {
  const { skill, diff } = formalRepo(t, { "README.md": "# Demo\n" });
  assert.deepEqual(touchedFormalChecks(skill, diff.changed), []);
});
