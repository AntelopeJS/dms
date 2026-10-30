const assert = require("node:assert/strict");
const { rmSync, symlinkSync, unlinkSync, writeFileSync } = require("node:fs");
const {
  baseline,
  dependencyViolations,
  join,
  makeTempDir,
  relative,
  root,
  runGuard,
  source,
} = require("./context.cjs");

const layerEdges = [
  {
    name: "upward",
    domain: "utils",
    target: "../routes/authentication",
    rule: "backend-utils-no-upward",
  },
  {
    name: "peer",
    domain: "utils",
    target: "../validation",
    rule: "backend-utils-no-upward",
  },
  {
    name: "entry",
    domain: "test",
    target: "../utils/auth-key",
    rule: "backend-utils-entry-only",
  },
  { name: "downward", domain: "routes", target: "../utils", rule: undefined },
];

function layerBody(form, target) {
  const literal = JSON.stringify(target);
  if (form === "literal") return `require(${literal});`;
  if (form === "const") return `const target = ${literal}; require(target);`;
  return `require(\`\${"../"}${target.slice(3)}\`);`;
}

function writeLayerCases(layerCases) {
  for (const { name, domain, target, rule } of layerEdges) {
    for (const form of ["literal", "const", "template"]) {
      const body = layerBody(form, target);
      const file = join(
        source,
        domain,
        `__layer_probe_${process.pid}_${name}_${form}.ts`,
      );
      writeFileSync(file, body, { flag: "wx" });
      layerCases.push({ file, body, form, rule });
    }
  }
}

function assertDependencyCruiser(layerCases) {
  const actual = dependencyViolations()
    .map((item) => [item.rule.name, item.from].join("\t"))
    .sort();
  const expected = layerCases
    .filter((item) => item.form === "literal" && item.rule)
    .map((item) => [item.rule, relative(root, item.file)].join("\t"))
    .sort();
  assert.deepEqual(actual, expected);
}

function guardLayerCases(layerCases) {
  let computedRejected = 0;
  let literalsAccepted = 0;
  let literalEdgesRejected = 0;
  for (const { file, body, form, rule } of layerCases) {
    writeFileSync(file, body, { flag: "wx" });
    try {
      const result = runGuard();
      const allowed = baseline || (form === "literal" && !rule);
      assert.equal(result.status, allowed ? 0 : 1, `${body}\n${result.stderr}`);
      if (!allowed && form !== "literal") {
        assert.match(result.stderr, /plain string literal/);
        computedRejected++;
      } else if (!allowed) {
        assert.ok(result.stderr.includes(rule), result.stderr);
        literalEdgesRejected++;
      } else literalsAccepted++;
    } finally {
      unlinkSync(file);
    }
  }
  return { computedRejected, literalsAccepted, literalEdgesRejected };
}

function layerMatrix() {
  const layerCases = [];
  try {
    writeLayerCases(layerCases);
    assertDependencyCruiser(layerCases);
  } finally {
    for (const { file } of layerCases) unlinkSync(file);
  }
  const { computedRejected, literalsAccepted, literalEdgesRejected } =
    guardLayerCases(layerCases);
  process.stdout.write(
    `Rank/entry bypass probes: ${computedRejected} computed forms rejected; ${literalEdgesRejected} forbidden literals rejected by guard; ${literalsAccepted} downward literal/old controls accepted; 3 forbidden literal edges also caught by dependency-cruiser.\n`,
  );
}

const linkGroups = [
  { folder: "src", extension: "ts" },
  { folder: "dist", extension: "js" },
];

function assertSymlinkRejected(link, linked) {
  symlinkSync(linked, link);
  try {
    const result = runGuard();
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stderr.includes(link));
    assert.match(result.stderr, /must not use symbolic links/);
  } finally {
    unlinkSync(link);
  }
}

function symlinkProbes() {
  const external = makeTempDir("backend-boundary-links-");
  try {
    for (const { folder, extension } of linkGroups) {
      const target = join(external, `target.${extension}`);
      writeFileSync(
        target,
        'require("../../../interface-dms/dist/page.js");\n',
      );
      for (const directory of [false, true]) {
        const link = join(
          root,
          "packages/dms",
          folder,
          `__symlink_probe_${process.pid}${directory ? "" : `.${extension}`}`,
        );
        assertSymlinkRejected(link, directory ? external : target);
      }
    }
  } finally {
    rmSync(external, { recursive: true, force: true });
  }
  process.stdout.write(
    "Symlink scanner probes: source and built file/directory links rejected (4 cases).\n",
  );
}

module.exports = { layerMatrix, symlinkProbes };
