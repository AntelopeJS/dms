import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { behaviourChange } from "./behaviour.mjs";

const COVERS = ["src/a.ts", "src/b.ts"];
const IMPORT_OUTPUT = 'import { FAILURE, SUCCESS } from "./output";\n';

function git(repo, ...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

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

function changed(t, base, head, covers = COVERS) {
  const repo = mkdtempSync(join(tmpdir(), "dms-control-emit-test-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  git(repo, "init", "-q");
  const baseSha = commit(repo, base, "base");
  const headSha = commit(repo, head, "head");
  const check = { covers, behaviour: { kind: "emit" } };
  return behaviourChange({ repo }, check, { baseSha, headSha }).changed;
}

const FUNCTION = "export function add(a, b) {\n  return a + b;\n}\n";
const OUTPUT = {
  "src/output.ts": "export const FAILURE = 1;\nexport const SUCCESS = 0;\n",
};

test("a function declaration moved verbatim to another covered file is unchanged", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": FUNCTION, "src/b.ts": "export const label = 'b';\n" },
      {
        "src/a.ts": 'export { add } from "./b";\n',
        "src/b.ts": `export const label = 'b';\n${FUNCTION}`,
      },
    ),
    false,
  );
});

test("an import that moves with its use to another covered file is unchanged", (t) => {
  const use = `${IMPORT_OUTPUT}export function code() {\n  return FAILURE + SUCCESS;\n}\n`;
  assert.equal(
    changed(
      t,
      { ...OUTPUT, "src/a.ts": use, "src/b.ts": "export const label = 1;\n" },
      {
        ...OUTPUT,
        "src/a.ts": 'export { code } from "./b";\n',
        "src/b.ts": `export const label = 1;\n${use}`,
      },
    ),
    false,
  );
});

test("a comment, a type annotation and a reformat are unchanged", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": "const total = [1, 2].reduce((sum, n) => sum + n, 0);\n" },
      {
        "src/a.ts":
          "/** The total. */\nconst total: number = [1, 2].reduce(\n  (sum: number, n: number) => (sum + n),\n  0,\n);\n",
      },
    ),
    false,
  );
});

test("single quotes against double quotes are unchanged", (t) => {
  assert.equal(
    changed(t, { "src/a.ts": "run('x');\n" }, { "src/a.ts": 'run("x");\n' }),
    false,
  );
});

test("a body edit is changed", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": FUNCTION },
      { "src/a.ts": FUNCTION.replace("a + b", "a - b") },
    ),
    true,
  );
});

test("swapping two statements of a covered file is changed", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": "await first();\nawait second();\n" },
      { "src/a.ts": "await second();\nawait first();\n" },
    ),
    true,
  );
});

test("moving a statement that is not a function declaration to another covered file is changed", (t) => {
  assert.equal(
    changed(
      t,
      {
        "src/a.ts": "const limit = 0;\nrun(limit);\n",
        "src/b.ts": "run(1);\n",
      },
      {
        "src/a.ts": "run(limit);\n",
        "src/b.ts": "const limit = 0;\nrun(1);\n",
      },
    ),
    true,
  );
});

test("importing the same name under an alias that points elsewhere is changed", (t) => {
  const use = (specifier) =>
    `import { ${specifier} } from "./output";\nexport function code() {\n  return CANCELLED + FAILURE;\n}\n`;
  assert.equal(
    changed(
      t,
      { ...OUTPUT, "src/a.ts": use("CANCELLED, FAILURE") },
      { ...OUTPUT, "src/a.ts": use("FAILURE as CANCELLED, FAILURE") },
    ),
    true,
  );
});

test("importing a binding from another module is changed", (t) => {
  const use = (module) =>
    `import { FAILURE } from "${module}";\nexport function code() {\n  return FAILURE;\n}\n`;
  assert.equal(
    changed(
      t,
      { ...OUTPUT, "src/a.ts": use("./output") },
      { ...OUTPUT, "src/a.ts": use("./other") },
    ),
    true,
  );
});

test("retargeting a re-export is changed", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": 'export { add } from "./one";\n' },
      { "src/a.ts": 'export { add } from "./two";\n' },
    ),
    true,
  );
});

test("removing a side-effect import is changed", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": 'import "./init";\nrun();\n' },
      { "src/a.ts": "run();\n" },
    ),
    true,
  );
});

test("swapping two assignments to the same field is changed", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": "target.value = 1;\ntarget.value = 2;\n" },
      { "src/a.ts": "target.value = 2;\ntarget.value = 1;\n" },
    ),
    true,
  );
});

test("swapping two registrations pushed to the same list is changed", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": "handlers.push(first);\nhandlers.push(second);\n" },
      { "src/a.ts": "handlers.push(second);\nhandlers.push(first);\n" },
    ),
    true,
  );
});

test("importing min instead of max under the same alias, both in covered files, is changed", (t) => {
  const use = (name) =>
    `import { ${name} as pick } from "./b";\nexport function best() {\n  return pick(1, 2);\n}\n`;
  const lib = {
    "src/b.ts":
      "export function max(a, b) {\n  return a > b ? a : b;\n}\nexport function min(a, b) {\n  return a < b ? a : b;\n}\n",
  };
  assert.equal(
    changed(
      t,
      { ...lib, "src/a.ts": use("max") },
      { ...lib, "src/a.ts": use("min") },
    ),
    true,
  );
});
