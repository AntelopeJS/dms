const assert = require("node:assert/strict");
const { unlinkSync, writeFileSync } = require("node:fs");
const { baseline, join, root, runGuard } = require("./context.cjs");

const escapeTarget = '"../../../interface-dms/dist/page.js"';
const verifierGroups = [
  { folder: "src", extensions: ["ts", "mts", "cts"] },
  { folder: "dist", extensions: ["js", "mjs", "cjs"] },
];

function escapeBodies(folder, extension) {
  if (extension === "mts" || extension === "mjs")
    return [
      `import {createRequire as make} from 'node:module'; const load = make(import.meta.url); load(${escapeTarget});`,
    ];
  return [
    `const {createRequire} = require('node:module'); const load = createRequire(__filename); load(${escapeTarget});`,
    `eval('require')(${escapeTarget});`,
    `Function('m','s','return m["require"](s)')(module,${escapeTarget});`,
    `module[['requ','ire'].join('')](${escapeTarget});`,
    `process.mainModule[['requ','ire'].join('')](${escapeTarget});`,
    ...(folder === "src"
      ? [
          `import {createRequire as make} from 'node:module'; const load = make(__filename); load(${escapeTarget});`,
        ]
      : []),
  ];
}

function verifierProbe(folder, extension) {
  const bodies = escapeBodies(folder, extension);
  const file = join(
    root,
    "packages/dms",
    folder,
    "utils",
    `__verifier_probe_${process.pid}.${extension}`,
  );
  writeFileSync(file, "", { flag: "wx" });
  try {
    for (const body of bodies) {
      writeFileSync(file, body);
      const result = runGuard();
      assert.equal(
        result.status,
        baseline ? 0 : 1,
        `${folder}/${extension}: ${body}\n${result.stderr}`,
      );
      if (!baseline) {
        assert.ok(result.stderr.includes(file));
        assert.match(
          result.stderr,
          /loader construction|computed loader|indirect loader|module|process/,
        );
      }
    }
  } finally {
    unlinkSync(file);
  }
  return bodies.length;
}

function verifierMatrix() {
  let verifierCases = 0;
  for (const { folder, extensions } of verifierGroups) {
    for (const extension of extensions)
      verifierCases += verifierProbe(folder, extension);
  }
  assert.equal(verifierCases, 24);
  process.stdout.write(
    `Verifier runtime-confirmed escape matrix: ${verifierCases} ${baseline ? "old escapes reproduced" : "rejected"}.\n`,
  );
}

module.exports = { verifierMatrix };
