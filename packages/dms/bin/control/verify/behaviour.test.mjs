import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { behaviourChange } from "./behaviour.mjs";

const COVERS = ["src/a.ts", "src/b.ts"];
const IMPORT_OUTPUT = 'import { FAILURE, SUCCESS } from "./output";\n';

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

/**
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>} base
 * @param {Record<string, string>} head
 * @param {string[]} [covers]
 */
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

await test("a function declaration moved verbatim to another covered file is unchanged", (t) => {
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

await test("an import that moves with its use to another covered file is unchanged", (t) => {
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

await test("a comment, a type annotation and a reformat are unchanged", (t) => {
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

await test("single quotes against double quotes are unchanged", (t) => {
  assert.equal(
    changed(t, { "src/a.ts": "run('x');\n" }, { "src/a.ts": 'run("x");\n' }),
    false,
  );
});

await test("a body edit is changed", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": FUNCTION },
      { "src/a.ts": FUNCTION.replace("a + b", "a - b") },
    ),
    true,
  );
});

await test("swapping two statements of a covered file is changed", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": "await first();\nawait second();\n" },
      { "src/a.ts": "await second();\nawait first();\n" },
    ),
    true,
  );
});

await test("moving a statement that is not a function declaration to another covered file is changed", (t) => {
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

await test("importing the same name under an alias that points elsewhere is changed", (t) => {
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

await test("importing a binding from another module is changed", (t) => {
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

await test("retargeting a re-export is changed", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": 'export { add } from "./one";\n' },
      { "src/a.ts": 'export { add } from "./two";\n' },
    ),
    true,
  );
});

await test("removing a side-effect import is changed", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": 'import "./init";\nrun();\n' },
      { "src/a.ts": "run();\n" },
    ),
    true,
  );
});

await test("swapping two assignments to the same field is changed", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": "target.value = 1;\ntarget.value = 2;\n" },
      { "src/a.ts": "target.value = 2;\ntarget.value = 1;\n" },
    ),
    true,
  );
});

await test("swapping two registrations pushed to the same list is changed", (t) => {
  assert.equal(
    changed(
      t,
      { "src/a.ts": "handlers.push(first);\nhandlers.push(second);\n" },
      { "src/a.ts": "handlers.push(second);\nhandlers.push(first);\n" },
    ),
    true,
  );
});

await test("importing min instead of max under the same alias, both in covered files, is changed", (t) => {
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

/**
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>} base
 * @param {Record<string, string>} head
 */
function changedAll(t, base, head) {
  return changed(t, base, head, Object.keys(base));
}

const OPS =
  "export function add(a, b) {\n  return a + b;\n}\nexport function sub(a, b) {\n  return a - b;\n}\n";

await test("retargeting a re-export of a covered module to another of its exports is changed", (t) => {
  assert.equal(
    changedAll(
      t,
      { "src/ops.ts": OPS, "src/index.ts": 'export { add } from "./ops";\n' },
      {
        "src/ops.ts": OPS,
        "src/index.ts": 'export { sub as add } from "./ops";\n',
      },
    ),
    true,
  );
});

await test("a re-export of a covered module under its own name, reflowed, is unchanged", (t) => {
  assert.equal(
    changedAll(
      t,
      { "src/ops.ts": OPS, "src/index.ts": 'export { add } from "./ops";\n' },
      { "src/ops.ts": OPS, "src/index.ts": 'export { add } from "./ops";\n\n' },
    ),
    false,
  );
});

await test("retargeting a local export alias is changed", (t) => {
  const local = (target) =>
    `function f() {\n  return 1;\n}\nfunction g() {\n  return 2;\n}\nexport { ${target} as run };\n`;
  assert.equal(
    changedAll(t, { "src/a.ts": local("f") }, { "src/a.ts": local("g") }),
    true,
  );
  assert.equal(
    changedAll(
      t,
      { "src/a.ts": local("f") },
      { "src/a.ts": `${local("f")}\n` },
    ),
    false,
  );
});

await test("exporting a local under its own name, by keyword or by list, is unchanged", (t) => {
  assert.equal(
    changedAll(
      t,
      { "src/a.ts": "export const limit = 1;\n" },
      { "src/a.ts": "const limit = 1;\nexport { limit };\n" },
    ),
    false,
  );
});

await test("swapping two side-effect imports is changed", (t) => {
  assert.equal(
    changedAll(
      t,
      { "src/a.ts": 'import "./first";\nimport "./second";\nrun();\n' },
      { "src/a.ts": 'import "./second";\nimport "./first";\nrun();\n' },
    ),
    true,
  );
});

await test("a function moved verbatim into a file with a different top-level variable of the same name is changed", (t) => {
  const log = "export function report() {\n  return Logger.channel;\n}\n";
  assert.equal(
    changedAll(
      t,
      {
        "src/a.ts": `const Logger = { channel: "a" };\nexport const keep = 1;\n${log}`,
        "src/b.ts":
          'const Logger = { channel: "b" };\nexport const other = 1;\n',
      },
      {
        "src/a.ts":
          'const Logger = { channel: "a" };\nexport const keep = 1;\n',
        "src/b.ts": `const Logger = { channel: "b" };\nexport const other = 1;\n${log}`,
      },
    ),
    true,
  );
});

await test("a function moved with the variable it reads, or reading it through an import, is judged by that variable", (t) => {
  const log = "export function report() {\n  return Logger.channel;\n}\n";
  assert.equal(
    changedAll(
      t,
      {
        "src/a.ts": `export const Logger = { channel: "a" };\n${log}`,
        "src/b.ts": "export const other = 1;\n",
      },
      {
        "src/a.ts": 'export const Logger = { channel: "a" };\n',
        "src/b.ts": `import { Logger } from "./a";\nexport const other = 1;\n${log}`,
      },
    ),
    false,
  );
});

await test("an import aliased to a name that a local variable also has is changed when a function switches to the local", (t) => {
  const lib = "export const x = 1;\n";
  const use = (name) =>
    `import { x as y } from "./lib";\nconst x = 2;\nexport function value() {\n  return ${name};\n}\n`;
  assert.equal(
    changedAll(
      t,
      { "src/lib.ts": lib, "src/a.ts": use("y") },
      { "src/lib.ts": lib, "src/a.ts": use("x") },
    ),
    true,
  );
});

const NON_LITERAL_SPECIFIERS = [
  ["an identifier", "import x from foo;\nx();\n", "import x from bar;\nx();\n"],
  [
    "a template without substitutions",
    "import x from `./a`;\nx();\n",
    "import x from `./b`;\nx();\n",
  ],
  ["a numeric literal", "import x from 1;\nx();\n", "import x from 2;\nx();\n"],
  ["an export-star identifier", "export * from foo;\n", "export * from bar;\n"],
  [
    "a named re-export identifier",
    "export { a } from foo;\n",
    "export { a } from bar;\n",
  ],
];

for (const [kind, base, head] of NON_LITERAL_SPECIFIERS) {
  await test(`retargeting a module specifier written as ${kind} is changed`, (t) => {
    assert.equal(changed(t, { "src/a.ts": base }, { "src/a.ts": head }), true);
  });
}

await test("retargeting an identifier specifier in a Vue script is changed", (t) => {
  const vue = (specifier) =>
    `<template><p/></template>\n<script>import x from ${specifier}; x();</script>\n`;
  assert.equal(
    changed(t, { "src/a.vue": vue("foo") }, { "src/a.vue": vue("bar") }, [
      "src/a.vue",
    ]),
    true,
  );
});

const SAME_TEXT_SPECIFIERS = [
  [
    "a bare package against the same name as an identifier",
    'import ts from "typescript";\nts.version;\n',
    "import ts from typescript;\nts.version;\n",
  ],
  [
    "a bare package against the same name as a template",
    'import ts from "typescript";\nts.version;\n',
    "import ts from `typescript`;\nts.version;\n",
  ],
  [
    "a quoted number against the number",
    'import x from "1";\nx();\n',
    "import x from 1;\nx();\n",
  ],
  [
    "a quoted relative path against the same text as a template",
    'import x from "./a";\nx();\n',
    "import x from `./a`;\nx();\n",
  ],
];

for (const [kind, base, head] of SAME_TEXT_SPECIFIERS) {
  await test(`${kind} is unchanged`, (t) => {
    assert.equal(changed(t, { "src/a.ts": base }, { "src/a.ts": head }), false);
  });
}

await test("a module specifier that is a call expression throws on either commit", (t) => {
  const call = "import x from a();\nx();\n";
  const valid = 'import x from "./a";\nx();\n';
  assert.throws(() => changed(t, { "src/a.ts": valid }, { "src/a.ts": call }), {
    name: "TypeError",
    message: /startsWith/,
  });
  assert.throws(() => changed(t, { "src/a.ts": call }, { "src/a.ts": valid }), {
    name: "TypeError",
    message: /startsWith/,
  });
});
