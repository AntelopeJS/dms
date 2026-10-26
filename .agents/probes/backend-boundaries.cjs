const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdtempSync,
  mkdirSync,
  symlinkSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, relative, dirname } = require("node:path");

const root = process.argv[2] ?? process.cwd();
const baseline = process.argv[3]?.startsWith("--")
  ? undefined
  : process.argv[3];
const baselineHelper = process.argv
  .find((argument) => argument.startsWith("--baseline-helper="))
  ?.slice("--baseline-helper=".length);
const expectRejections = process.argv.includes("--expect-rejections");
function runGuard(env = process.env) {
  return spawnSync(
    process.execPath,
    baseline
      ? [
          "-e",
          `
    const Module = require("node:module");
    const filename = require("node:path").resolve("packages/dms/scripts/backend-checks.cjs");
    const guard = new Module(filename);
    guard.filename = filename;
    guard.paths = Module._nodeModulePaths(require("node:path").dirname(filename));
    const helper = ${JSON.stringify(baselineHelper ?? null)};
    if (helper) {
      const helperFilename = require("node:path").join(require("node:path").dirname(filename), "backend-import-target.cjs");
      const original = new Module(helperFilename);
      original.filename = helperFilename;
      original.paths = guard.paths;
      original._compile(require("node:fs").readFileSync(helper, "utf8"), helperFilename);
      guard.require = function(request) {
        return request === "./backend-import-target.cjs" ? original.exports : Module.prototype.require.call(this, request);
      };
    }
    guard._compile(require("node:fs").readFileSync(${JSON.stringify(baseline)}, "utf8"), filename);
  `,
        ]
      : ["packages/dms/scripts/backend-checks.cjs"],
    { cwd: root, encoding: "utf8", env },
  );
}
const source = join(root, "packages/dms/src");
if (process.argv.includes("--round10-pins")) {
  round10Pins();
  process.exit(0);
}
if (process.argv.includes("--round10-targets")) {
  round10Targets();
  round10Pins();
  process.exit(0);
}
if (process.argv.includes("--round9-targets")) {
  round9Targets();
  process.exit(0);
}
if (process.argv.includes("--source-dist-targets")) {
  sourceDistTargets();
  process.exit(0);
}
runtimeTargets();
packageTargets();
round9Targets();
round10Targets();
round10Pins();
if (process.argv.includes("--runtime-targets")) process.exit(0);
sourceDistTargets();
const tiers = [
  ["routes"],
  ["pages"],
  ["implementations"],
  ["store", "attachments", "realtime", "automation", "crons", "hooks"],
  ["db"],
  ["validation", "utils"],
  ["config"],
  ["types"],
];
const entries = new Map(
  tiers
    .flat()
    .map((name) => [
      name,
      name === "implementations"
        ? "implementations/dms/page.ts"
        : `${name}/index.ts`,
    ]),
);
const privateFiles = {
  routes: "auth/signup.ts",
  pages: "settings/users/account-credentials.ts",
  implementations: "dms/permission-preview.ts",
  store: "activity.ts",
  attachments: "save.ts",
  realtime: "broker.ts",
  automation: "actions.ts",
  crons: "sweep-stale-exports.ts",
  hooks: "invite-extensions.ts",
  db: "guard-row.ts",
  validation: "auth.schema.ts",
  config: "internal/state.ts",
  utils: "page-access.ts",
  types: "realtime.ts",
};
const files = [];
const expected = [];
const specifier = (from, to) => {
  const value = relative(dirname(from), to)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "");
  return value.startsWith(".") ? value : `./${value}`;
};
function write(path, targets) {
  writeFileSync(
    path,
    targets
      .map((target) => `import ${JSON.stringify(specifier(path, target))};`)
      .join("\n"),
    { flag: "wx" },
  );
  files.push(path);
}
try {
  for (const [rank, tier] of tiers.entries()) {
    for (const domain of tier) {
      const path = join(source, domain, `__boundary_probe_${process.pid}.ts`);
      const targets = [];
      for (const [toRank, toTier] of tiers.entries()) {
        for (const target of toTier) {
          if (target === domain) continue;
          const destination = join(source, entries.get(target));
          targets.push(destination);
          if (toRank <= rank) {
            expected.push([
              `backend-${domain}-no-upward`,
              relative(root, path),
              relative(root, destination),
            ]);
          }
        }
      }
      write(path, targets);
    }
  }
  const outsider = join(source, "test", `__boundary_probe_${process.pid}.ts`);
  write(
    outsider,
    Object.entries(privateFiles).map(([domain, name]) =>
      join(source, domain, name),
    ),
  );
  for (const [domain, name] of Object.entries(privateFiles)) {
    expected.push([
      `backend-${domain}-entry-only`,
      relative(root, outsider),
      `packages/dms/src/${domain}/${name}`,
    ]);
  }
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "depcruise",
      "packages",
      "--config",
      ".dependency-cruiser.cjs",
      "--output-type",
      "json",
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr);
  const graph = JSON.parse(result.stdout);
  const actual = graph.summary.violations.map((item) => [
    item.rule.name,
    item.from,
    item.to,
  ]);
  const normalize = (rows) => rows.map((row) => row.join("\t")).sort();
  assert.deepEqual(normalize(actual), normalize(expected));
  process.stdout.write(
    `Backend boundary probes passed: ${expected.length} forbidden imports; every allowed rank/peer import accepted.\n`,
  );
} finally {
  for (const path of files) unlinkSync(path);
}

const packageProbe = join(source, "utils", `__package_probe_${process.pid}.ts`);
const interfacePath = specifier(
  packageProbe,
  join(root, "packages/interface-dms/dist/page.ts"),
);
const relativeImports = [
  `import * as page from ${JSON.stringify(interfacePath)};`,
  `export * from ${JSON.stringify(interfacePath)};`,
  `import page = require(${JSON.stringify(interfacePath)});`,
  `const page = require(${JSON.stringify(interfacePath)});`,
  `void import(${JSON.stringify(interfacePath)});`,
  `type Page = typeof import(${JSON.stringify(interfacePath)});`,
  `const page = require(\`${interfacePath}\`);`,
  `void import(\`${interfacePath}\`);`,
  ...[JSON.stringify(interfacePath), `\`${interfacePath}\``].flatMap(
    (literal) =>
      [
        `(${literal})`,
        `${literal} satisfies string`,
        `${literal} as string`,
        `<string>${literal}`,
        `${literal}!`,
        `((${literal} as string) satisfies string)!`,
        `(<string>(${literal} satisfies string))!`,
      ].flatMap((argument) => [
        `void require(${argument});`,
        `void import(${argument});`,
      ]),
  ),
];
const adversarialImports = ["src", "dist"].flatMap((folder) => {
  const target = `../../../interface-dms/${folder}/page`;
  const literal = JSON.stringify(target);
  const template = `\`\${"../../../interface-dms"}/${folder}/page\``;
  const sum = `"../../../interface-dms" + "/${folder}/page"`;
  return [
    ...[
      template,
      sum,
      `(${literal}, ${literal})`,
      `true ? ${literal} : ${literal}`,
      `[${literal}][0]`,
      ...[template, sum].flatMap((expression) => [
        `(${expression})`,
        `(${expression}) satisfies string`,
        `(${expression}) as string`,
        `<string>(${expression})`,
        `(${expression})!`,
        `(((<string>(${expression})) as string) satisfies string)!`,
      ]),
    ].flatMap((argument) => [
      `void require(${argument});`,
      `void import(${argument});`,
    ]),
    `void (require)(${literal});`,
    `void (require as NodeRequire)(${literal});`,
    `void require.call(null, ${literal});`,
    `void require.apply(null, [${literal}]);`,
    `const other = ${literal}; void require(other);`,
  ];
});
assert.equal(adversarialImports.length, 78);
writeFileSync(packageProbe, "", { flag: "wx" });
try {
  const healthy = runGuard();
  assert.equal(healthy.status, 0, healthy.stderr);
  const escaped = [];
  for (const input of relativeImports) {
    writeFileSync(packageProbe, input);
    const result = runGuard();
    const rejected =
      result.status === 1 &&
      /relative imports must resolve inside backend|constant specifier|plain string literal|indirect require/.test(
        result.stderr,
      );
    process.stdout.write(`${rejected ? "REJECTED" : "ESCAPED"}: ${input}\n`);
    if (!rejected)
      escaped.push({ input, status: result.status, stderr: result.stderr });
  }
  let packageAccepted = 0;
  for (const [index, input] of relativeImports.entries()) {
    const control = input.replaceAll(
      interfacePath,
      "@antelopejs/interface-dms/page",
    );
    writeFileSync(packageProbe, control);
    const result = runGuard();
    const allowed = baseline || index < 6;
    assert.equal(
      result.status,
      allowed ? 0 : 1,
      `${control}\n${result.stderr}`,
    );
    if (allowed) packageAccepted++;
    else assert.match(result.stderr, /plain string literal/);
  }
  assert.deepEqual(
    escaped,
    [],
    "Relative interface specifiers escaped the guard",
  );
  process.stdout.write(
    `Package import probes passed: ${relativeImports.length} relative forms rejected; ${packageAccepted} literal package controls accepted; ${relativeImports.length - packageAccepted} computed package controls rejected.\n`,
  );
  let adversarialRejected = 0;
  for (const input of adversarialImports) {
    writeFileSync(packageProbe, input);
    const result = runGuard();
    const rejected =
      result.status === 1 &&
      /relative imports must resolve inside backend|constant specifier|plain string literal|indirect require/.test(
        result.stderr,
      );
    assert.equal(result.status, 1, `${input}\n${result.stderr}`);
    assert.ok(rejected, result.stderr);
    if (rejected) adversarialRejected++;
    process.stdout.write(`REJECTED: ${input}\n`);
  }
  process.stdout.write(
    `Verifier adversarial probes: ${relativeImports.length + adversarialImports.length} cases; ${relativeImports.length + adversarialRejected} rejected; ${adversarialImports.length - adversarialRejected} escaped.\n`,
  );
} finally {
  unlinkSync(packageProbe);
}

if (!baseline) {
  const ts = require(require.resolve("typescript", { paths: [root] }));
  const policyFailures = [
    `void require("../../frontend-vue/package.json");`,
    `void require("../../package.json");`,
    `void require("/tmp/outside.js");`,
    `void import("file:///tmp/outside.js");`,
    `void require("@antelopejs/dms/utils");`,
    `void (require)("@antelopejs/" + "dms/utils");`,
    `void require(unknownPath);`,
    `void import(unknownPath);`,
    `let target = "@antelopejs/interface-dms/page"; void require(target);`,
    `const target = "@antelopejs/interface-dms/page"; function load(target) { return require(target); }`,
    `const first = second; const second = first; void require(first);`,
    `const load = require; load("@antelopejs/interface-dms/page");`,
    `void require.bind(null, "@antelopejs/interface-dms/page")();`,
    `void (0, require)("@antelopejs/interface-dms/page");`,
    `void Reflect.apply(require, null, ["@antelopejs/interface-dms/page"]);`,
    `void require[unknownMethod]("@antelopejs/interface-dms/page");`,
    `void module["requ" + "ire"]("@antelopejs/interface-dms/page");`,
    `void module.require("@antelopejs/interface-dms/page");`,
    `const { require: load } = module;`,
    `void require.apply(null, unknownArguments);`,
    `void require.resolve("../../../interface-dms/dist/page");`,
    `void require["call"](null, "../../../interface-dms/dist/page");`,
    `void require["apply"](null, ["../../../interface-dms/dist/page"]);`,
    `new Function('m', 'return m.require("../../../interface-dms/dist/page")')(module);`,
  ];
  const formerlyComputedControls = [
    `void require.resolve("./index");`,
    `void require.call(null, "./index");`,
    `void require.apply(null, ["./index"]);`,
    `void require["call"](null, "./index");`,
    `void require["apply"](null, ["./index"]);`,
    `void require["resolve"]("./index");`,
    `void (require)("./index");`,
    `void (require as NodeRequire)("./index");`,
    `void require(("./" + "index") satisfies string);`,
    `const prefix = "."; const target = \`\${prefix}/index\`; void require(target);`,
    `const target = "./" + "index"; void require(target);`,
    `const target = "../../../interface-dms/dist/page"; { const target = "./index"; void require(target); }`,
  ];
  const policyControls = [
    `void require("./index");`,
    `void import("./index.js");`,
    `void require("node:fs");`,
    `void require("@antelopejs/interface-dms/page");`,
    `void require("semver");`,
  ];
  for (const folder of ["src", "dist"]) {
    const path = join(
      root,
      "packages/dms",
      folder,
      "utils",
      `__policy_probe_${process.pid}.${folder === "src" ? "ts" : "js"}`,
    );
    writeFileSync(path, "", { flag: "wx" });
    const emit = (input) =>
      folder === "src"
        ? input
        : ts.transpileModule(input, {
            compilerOptions: {
              target: ts.ScriptTarget.ESNext,
              module: ts.ModuleKind.ESNext,
            },
          }).outputText;
    try {
      const erasedAssertion = `void (require as NodeRequire)("./index");`;
      const failures = [
        ...(folder === "dist" ? adversarialImports : []),
        ...policyFailures,
        ...formerlyComputedControls.filter(
          (input) => folder === "src" || input !== erasedAssertion,
        ),
      ];
      const controls = [
        ...policyControls,
        ...(folder === "dist" ? [erasedAssertion] : []),
      ];
      for (const input of failures) {
        writeFileSync(path, emit(input));
        const result = runGuard();
        assert.equal(result.status, 1, `${folder}: ${input}\n${result.stderr}`);
        assert.match(
          result.stderr,
          /relative imports must resolve inside backend|plain string literal|indirect require|computed loader|indirect loader|loader construction|imports must use another package specifier|module|process/,
        );
      }
      for (const input of controls) {
        writeFileSync(path, emit(input));
        const result = runGuard();
        assert.equal(result.status, 0, `${folder}: ${input}\n${result.stderr}`);
      }
      process.stdout.write(
        `${folder} literal-only policy: ${failures.length} forbidden forms rejected; ${controls.length} package/internal controls accepted.\n`,
      );
    } finally {
      unlinkSync(path);
    }
  }
}

const escapeTarget = '"../../../interface-dms/dist/page.js"';
let verifierCases = 0;
for (const [folder, extensions] of [
  ["src", ["ts", "mts", "cts"]],
  ["dist", ["js", "mjs", "cjs"]],
]) {
  for (const extension of extensions) {
    const esm = extension === "mts" || extension === "mjs";
    const bodies = esm
      ? [
          `import {createRequire as make} from 'node:module'; const load = make(import.meta.url); load(${escapeTarget});`,
        ]
      : [
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
        verifierCases++;
      }
    } finally {
      unlinkSync(file);
    }
  }
}
assert.equal(verifierCases, 24);
process.stdout.write(
  `Verifier runtime-confirmed escape matrix: ${verifierCases} ${baseline ? "old escapes reproduced" : "rejected"}.\n`,
);

if (!baseline) {
  const verifierRegressions = [
    `export {}; const owner = module; const key = 'require'; void owner[key]('../../../interface-dms/dist/page.js');`,
    `const Loader = module.constructor; void Loader['_load']('../../../interface-dms/dist/page.js', module, false);`,
    `import Loader from 'node:module'; void Loader['_load']('../../../interface-dms/dist/page.js', module, false);`,
    `const make = (() => {}).constructor; const owner = make('return process')(); const key = 'main' + 'Module'; owner[key]['re' + 'quire']('../../../interface-dms/dist/page.js');`,
  ];
  const sourceFailures = [
    ...verifierRegressions,
    `const ordinary = {}; void ordinary.constructor;`,
    `const ordinary = {}; void ordinary['constructor'];`,
    `void module;`,
    `void module.id;`,
    `void module['exports'];`,
    `const owner = module;`,
    `const { exports: value } = module;`,
    `void exports;`,
    `void exports.value;`,
    `const owner = exports;`,
    `exports['value'] = 1;`,
    `Object.assign(exports, { value: 1 });`,
    `const { value } = exports;`,
    `void process;`,
    `const owner = process;`,
    `const { env } = process;`,
    `void process.version;`,
    `void process['env'];`,
    `const key = 'env'; void process[key];`,
    `import { findPackageJSON } from 'node:module';`,
    `\nimport { findPackageJSON } from 'node:module';`,
    `import { findPackageJSON as find } from 'node:module';`,
    `import { findPackageJSON } from 'module';`,
    `import Module, { findPackageJSON } from 'node:module';`,
    ...["module", "node:module", "vm", "node:vm"].flatMap((name) => [
      `import Loader from '${name}';`,
      `import * as Loader from '${name}';`,
      `import { ${name.endsWith("module") ? "Module" : "Script"} as Loader } from '${name}';`,
      `import '${name}';`,
      `export * from '${name}';`,
      `const Loader = require('${name}');`,
      `void import('${name}');`,
      `import Loader = require('${name}');`,
    ]),
  ];
  const sourceControls = [
    `module.exports = { value: 1 };`,
    `exports.value = 1; exports.other = () => 2;`,
    ...[
      "env",
      "pid",
      "cwd",
      "stdout",
      "exit",
      "stderr",
      "execPath",
      "hrtime",
    ].map((name) => `void process.${name};`),
    `process.env['BOUNDARY_PROBE'] = '1'; void process.hrtime.bigint();`,
    `const ordinary = { value: 1 }; void ordinary.value;`,
    `class Ordinary { constructor() {} } void new Ordinary();`,
    `import { readFileSync } from 'node:fs';`,
  ];
  for (const extension of ["ts", "mts", "cts"]) {
    const file = join(
      source,
      "utils",
      `__source_policy_probe_${process.pid}.${extension}`,
    );
    writeFileSync(file, "", { flag: "wx" });
    try {
      const healthy = runGuard();
      assert.equal(healthy.status, 0, healthy.stderr);
      for (const body of sourceFailures) {
        writeFileSync(file, body);
        const result = runGuard();
        assert.equal(
          result.status,
          1,
          `${extension}: ${body}\n${result.stderr}`,
        );
        assert.ok(result.stderr.includes(file), result.stderr);
        assert.match(
          result.stderr,
          /module|exports|process|constructor|loader|import/i,
        );
      }
      for (const body of sourceControls) {
        writeFileSync(file, body);
        const result = runGuard();
        assert.equal(
          result.status,
          0,
          `${extension}: ${body}\n${result.stderr}`,
        );
      }
      process.stdout.write(
        `Source-only capability policy (${extension}): ${sourceFailures.length} restrictions rejected (including four verifier regressions); ${sourceControls.length} ordinary controls and existing exact exemptions accepted.\n`,
      );
    } finally {
      unlinkSync(file);
    }
  }
  const ts = require(require.resolve("typescript", { paths: [root] }));
  const builtControls = [
    ts.transpileModule(
      `export const value = 1; export function read() { return value; }`,
      {
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.CommonJS,
        },
      },
    ).outputText,
    `void module.id; void exports.value; void process.version; void Object.constructor;`,
    `import Loader from 'node:module'; void Loader;`,
    `import * as VM from 'node:vm'; void VM;`,
  ];
  const file = join(
    root,
    "packages/dms/dist/utils",
    `__source_policy_control_${process.pid}.js`,
  );
  writeFileSync(file, "", { flag: "wx" });
  try {
    for (const body of builtControls) {
      writeFileSync(file, body);
      const result = runGuard();
      assert.equal(
        result.status,
        0,
        `Built policy must remain unchanged: ${body}\n${result.stderr}`,
      );
    }
  } finally {
    unlinkSync(file);
  }
  process.stdout.write(
    `Built-output controls: ${builtControls.length} accepted, including compiler-generated CommonJS export plumbing.\n`,
  );
}

const layerCases = [];
try {
  for (const [name, domain, target, rule] of [
    ["upward", "utils", "../routes/authentication", "backend-utils-no-upward"],
    ["peer", "utils", "../validation", "backend-utils-no-upward"],
    ["entry", "test", "../utils/auth-key", "backend-utils-entry-only"],
    ["downward", "routes", "../utils", undefined],
  ]) {
    for (const shape of ["literal", "const", "template"]) {
      const literal = JSON.stringify(target);
      const body =
        shape === "literal"
          ? `require(${literal});`
          : shape === "const"
            ? `const target = ${literal}; require(target);`
            : `require(\`\${"../"}${target.slice(3)}\`);`;
      const file = join(
        source,
        domain,
        `__layer_probe_${process.pid}_${name}_${shape}.ts`,
      );
      writeFileSync(file, body, { flag: "wx" });
      layerCases.push({ file, body, shape, rule });
    }
  }
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "depcruise",
      "packages",
      "--config",
      ".dependency-cruiser.cjs",
      "--output-type",
      "json",
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr);
  const violations = JSON.parse(result.stdout).summary.violations;
  const actual = violations
    .map((item) => [item.rule.name, item.from].join("\t"))
    .sort();
  const expected = layerCases
    .filter((item) => item.shape === "literal" && item.rule)
    .map((item) => [item.rule, relative(root, item.file)].join("\t"))
    .sort();
  assert.deepEqual(actual, expected);
} finally {
  for (const { file } of layerCases) unlinkSync(file);
}
let computedRejected = 0;
let literalsAccepted = 0;
let literalEdgesRejected = 0;
for (const { file, body, shape, rule } of layerCases) {
  writeFileSync(file, body, { flag: "wx" });
  try {
    const result = runGuard();
    const allowed = baseline || (shape === "literal" && !rule);
    assert.equal(result.status, allowed ? 0 : 1, `${body}\n${result.stderr}`);
    if (!allowed && shape !== "literal") {
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
process.stdout.write(
  `Rank/entry bypass probes: ${computedRejected} computed forms rejected; ${literalEdgesRejected} forbidden literals rejected by guard; ${literalsAccepted} downward literal/old controls accepted; 3 forbidden literal edges also caught by dependency-cruiser.\n`,
);

const external = mkdtempSync(join(tmpdir(), "backend-boundary-links-"));
try {
  for (const [folder, extension] of [
    ["src", "ts"],
    ["dist", "js"],
  ]) {
    const target = join(external, `target.${extension}`);
    writeFileSync(target, 'require("../../../interface-dms/dist/page.js");\n');
    for (const directory of [false, true]) {
      const link = join(
        root,
        "packages/dms",
        folder,
        `__symlink_probe_${process.pid}${directory ? "" : `.${extension}`}`,
      );
      symlinkSync(directory ? external : target, link);
      try {
        const result = runGuard();
        assert.equal(result.status, 1, result.stderr);
        assert.ok(result.stderr.includes(link));
        assert.match(result.stderr, /must not use symbolic links/);
      } finally {
        unlinkSync(link);
      }
    }
  }
} finally {
  rmSync(external, { recursive: true, force: true });
}
process.stdout.write(
  "Symlink scanner probes: source and built file/directory links rejected (4 cases).\n",
);

function runtimeTargets() {
  for (const folder of ["src", "dist"]) {
    for (const suffix of ["", ".opaque"]) {
      const directory = join(root, "packages/dms", folder, "types");
      const name = `__runtime_target_${process.pid}`;
      const caller = join(directory, `${name}.cjs`);
      const payload = join(directory, `${name}-payload${suffix}`);
      const declaration = join(directory, `${name}-payload.d${suffix}.ts`);
      const paths = [];
      try {
        writeFileSync(
          caller,
          `const loaded = require('./${name}-payload${suffix}'); console.log(loaded.isString('fresh'));`,
          { flag: "wx" },
        );
        paths.push(caller);
        writeFileSync(declaration, "export {};", { flag: "wx" });
        paths.push(declaration);
        writeFileSync(
          payload,
          `module.exports = require('../../../interface-dms/dist/utils/internal/type-check.js');`,
          { flag: "wx" },
        );
        paths.push(payload);
        const load = () =>
          spawnSync(process.execPath, [caller], {
            cwd: root,
            encoding: "utf8",
          });
        const loaded = load();
        assert.equal(loaded.status, 0, loaded.stderr);
        assert.equal(loaded.stdout.trim(), "true");
        const result = runGuard();
        assert.equal(result.status, baseline ? 0 : 1, result.stderr);
        if (!baseline) {
          assert.match(
            result.stderr,
            /executable|suffix|extension|relative imports must resolve inside backend/i,
          );
        }
        writeFileSync(
          payload,
          `module.exports = { isString: value => typeof value === 'string' };`,
        );
        const control = load();
        assert.equal(control.status, 0, control.stderr);
        assert.equal(control.stdout.trim(), "true");
        const allowed = runGuard();
        assert.equal(allowed.status, baseline ? 0 : 1, allowed.stderr);
        if (!baseline) {
          unlinkSync(payload);
          const missing = runGuard();
          assert.equal(missing.status, 1, missing.stderr);
          assert.match(
            missing.stderr,
            /relative imports must resolve inside backend/,
          );
        }
        process.stdout.write(
          `Runtime target (${folder}/${suffix || "extensionless"}): Node loaded forbidden payload; ${baseline ? "original guard escaped; harmless replacement accepted" : "fixed guard rejected hostile and harmless unknown-suffix payloads; declaration-only target rejected"}.\n`,
        );
      } finally {
        for (const path of paths) rmSync(path, { force: true });
      }
    }
  }
}

function packageTargets() {
  for (const form of ["self-reference", "directory-main"]) {
    const name = `boundary-package-${process.pid}`;
    const directory = join(source, "types", name);
    const manifest = join(directory, "package.json");
    const importer = join(directory, "importer.ts");
    const request = form === "self-reference" ? `${name}/bridge` : "./";
    const payload = join(directory, "runtime.inc");
    mkdirSync(directory);
    try {
      writeFileSync(
        manifest,
        JSON.stringify(
          form === "self-reference"
            ? {
                name,
                exports: {
                  "./bridge": { types: "./safe.ts", default: "./runtime.inc" },
                },
              }
            : { types: "./safe.ts", main: "./runtime.inc" },
        ),
      );
      writeFileSync(join(directory, "safe.ts"), "export const target = true;");
      writeFileSync(
        importer,
        `import { target } from '${request}'; void target;`,
      );
      writeFileSync(
        payload,
        "exports.target = require('../../../../interface-dms/dist/utils/internal/type-check.js').isString('fresh');",
      );
      const load = () =>
        spawnSync(
          process.execPath,
          [
            "-e",
            `console.log(require('node:module').createRequire(${JSON.stringify(importer)})(${JSON.stringify(request)}).target);`,
          ],
          { cwd: root, encoding: "utf8" },
        );
      const loaded = load();
      assert.equal(loaded.status, 0, loaded.stderr);
      assert.equal(loaded.stdout.trim(), "true");
      const result = runGuard();
      assert.equal(result.status, baseline ? 0 : 1, result.stderr);
      if (!baseline) {
        assert.ok(result.stderr.includes(manifest), result.stderr);
        assert.match(result.stderr, /source package manifests are forbidden/);
        writeFileSync(payload, "exports.target = true;");
        assert.equal(load().status, 0);
        assert.equal(runGuard().status, 1);
      }
      process.stdout.write(
        `Package target (${form}): Node loaded forbidden payload; ${baseline ? "original guard escaped" : "fixed guard rejected; harmless manifest control also rejected"}.\n`,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

function sourceDistTargets() {
  for (const hidden of ["", ".nuxt", ".output"]) {
    const directory = join(source, `__source_dist_${process.pid}`);
    const importer = join(directory, hidden, "importer.ts");
    mkdirSync(dirname(importer), { recursive: true });
    try {
      const target = relative(
        dirname(importer),
        join(root, "packages/dms/dist/index.js"),
      ).replace(/\\/g, "/");
      writeFileSync(importer, `void require('${target}');`, { flag: "wx" });
      const result = runGuard();
      assert.equal(result.status, 1, result.stderr);
      assert.ok(result.stderr.includes(importer), result.stderr);
      assert.match(
        result.stderr,
        /relative imports must resolve inside backend/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  process.stdout.write(
    "Source-to-dist runtime imports: direct and hidden-directory requests rejected (3 cases).\n",
  );
}

function round9Targets() {
  const forbidden = join(
    root,
    "packages/interface-dms/dist/utils/internal/type-check.js",
  );
  const privateTarget = join(source, "utils/auth-constants.ts");
  let cases = 0;
  function fixture(name, exercise) {
    const owned = [];
    const prefix = `__round9_${process.pid}_${cases++}_${name}`;
    const create = (path, body) => {
      writeFileSync(path, body, { flag: "wx" });
      owned.push(path);
      return path;
    };
    const directory = (path) => {
      mkdirSync(path);
      owned.push(path);
      return path;
    };
    try {
      exercise({ prefix, create, directory, owned });
    } finally {
      for (const path of owned.reverse())
        rmSync(path, { recursive: true, force: true });
    }
  }
  function check(
    name,
    caller,
    target,
    allowed = false,
    env = process.env,
    request,
  ) {
    let runtime;
    if (target) {
      const loaded = spawnSync(
        process.execPath,
        [
          "-e",
          `
        const assert = require('node:assert/strict');
        const { realpathSync } = require('node:fs');
        const load = require('node:module').createRequire(${JSON.stringify(caller)});
        const value = load(${JSON.stringify(caller)});
        const target = realpathSync(${JSON.stringify(target)});
        const request = ${JSON.stringify(request ?? null)};
        if (request) assert.equal(load.resolve(request), target, 'actual Node resolution');
        assert.ok(require.cache[target], 'actual forbidden target must be cached');
        if (${JSON.stringify(target === privateTarget)}) {
          assert.equal(value.TWO_FACTOR_RATE_LIMIT_MS, 60000);
          assert.equal(value.TWO_FACTOR_EMAIL_CODE_LIFETIME_MS, 600000);
          assert.equal(value.REFRESH_TOKEN_ROTATION_THRESHOLD_MS, 1296000000);
        } else {
          assert.equal(value.isString('actual Node load'), true);
          assert.equal(value.isString(42), false);
        }
        console.log(JSON.stringify({ target, resolved: request ? load.resolve(request) : undefined, cached: true, keys: Object.keys(value).sort() }));
      `,
        ],
        { cwd: root, encoding: "utf8", env },
      );
      assert.equal(loaded.status, 0, `${name}\n${loaded.stderr}`);
      runtime = JSON.parse(loaded.stdout);
    }
    const result = runGuard(env);
    assert.equal(
      result.status,
      baseline || allowed ? 0 : 1,
      `${name}\n${result.stderr}`,
    );
    if (!baseline && !allowed)
      assert.ok(result.stderr.includes("__round9_"), result.stderr);
    process.stdout.write(
      JSON.stringify({
        name,
        runtime,
        guard: result.status,
        output:
          result.status === 0
            ? result.stdout.trim()
            : result.stderr
                .split("\n")
                .find((line) => line.startsWith("AssertionError [")),
      }) + "\n",
    );
  }
  for (const suffix of ["", ".weird"]) {
    fixture("payload", ({ prefix, create }) => {
      const payload = create(
        join(source, "types", `${prefix}${suffix}`),
        `module.exports = require('../utils/auth-constants.ts');`,
      );
      create(join(source, "types", `${prefix}.d${suffix}.ts`), "export {};");
      const caller = create(
        join(source, "types", `${prefix}-entry.cjs`),
        `module.exports = require('./${prefix}${suffix}');`,
      );
      check(`private-${suffix || "extensionless"}`, caller, privateTarget);
      writeFileSync(payload, "module.exports = { harmless: true };");
      check(`harmless-${suffix || "extensionless"}`, caller);
    });
  }
  for (const form of ["parent-main", "exports-symlink", "node-path"]) {
    fixture(form, ({ prefix, create, directory, owned }) => {
      const base =
        form === "node-path"
          ? mkdtempSync(join(tmpdir(), "backend-round9-"))
          : join(root, "node_modules");
      if (form === "node-path") owned.push(base);
      const alias = directory(join(base, prefix));
      create(
        join(alias, "package.json"),
        JSON.stringify(
          form === "exports-symlink"
            ? { name: prefix, exports: { ".": "./bridge.cjs" } }
            : { name: prefix, main: forbidden },
        ),
      );
      if (form === "exports-symlink")
        symlinkSync(forbidden, join(alias, "bridge.cjs"));
      const caller = create(
        join(source, "types", `${prefix}.cjs`),
        `module.exports = require('${prefix}');`,
      );
      const env =
        form === "node-path"
          ? { ...process.env, NODE_PATH: base }
          : process.env;
      check(`bare-${form}`, caller, forbidden, false, env, prefix);
    });
  }
  for (const name of ["process", "node:process"]) {
    for (const folder of ["src", "dist"]) {
      fixture("builtin", ({ prefix, create }) => {
        const caller = create(
          join(root, "packages/dms", folder, "types", `${prefix}.cjs`),
          `module.exports = require('${name}').getBuiltinModule('module')._load(${JSON.stringify(forbidden)});`,
        );
        check(`${folder}-${name}-getBuiltinModule`, caller, forbidden);
      });
    }
    for (const body of [
      `import owner from '${name}';`,
      `import * as owner from '${name}';`,
      `import { getBuiltinModule as load } from '${name}';`,
      `import '${name}';`,
      `export * from '${name}';`,
      `const owner = require('${name}');`,
      `void import('${name}');`,
      `import owner = require('${name}');`,
    ]) {
      fixture("process-import", ({ prefix, create }) => {
        const caller = create(join(source, "utils", `${prefix}.ts`), body);
        check(body, caller);
      });
    }
  }
  for (const folder of ["src", "dist"]) {
    const base = join(root, "packages/dms", folder);
    const suffix = folder === "src" ? "ts" : "js";
    for (const edge of ["private", "upward", "downward", "public"]) {
      fixture(edge, ({ prefix, create }) => {
        const domain =
          edge === "private" || edge === "downward" ? "config" : "types";
        const request =
          edge === "private"
            ? `../types/${prefix}-target.cjs`
            : edge === "upward"
              ? `../utils/index.${suffix}`
              : edge === "downward"
                ? `../types/index.${suffix}`
                : "@antelopejs/interface-dms/page";
        if (edge === "private")
          create(
            join(base, "types", `${prefix}-target.cjs`),
            "exports.value = 1;",
          );
        const caller = create(
          join(base, domain, `${prefix}.cjs`),
          `void require('${request}');`,
        );
        check(
          `${folder}-supported-cjs-${edge}`,
          caller,
          undefined,
          edge === "downward" || edge === "public",
        );
      });
    }
  }
  process.stdout.write(
    `Round 9 targets complete: ${cases} isolated fixtures removed; ${baseline ? "original guard acceptance reproduced" : "strict rejections and valid controls verified"}.\n`,
  );
}

function round10Targets() {
  const forbidden = join(
    root,
    "packages/interface-dms/dist/utils/internal/type-check.js",
  );
  const scratch = mkdtempSync(join(tmpdir(), "backend-round10-"));
  let cases = 0;
  const payload = `
    const assert = require('node:assert/strict');
    const target = require('node:fs').realpathSync(${JSON.stringify(forbidden)});
    const value = require(target);
    assert.ok(require.cache[target], 'private module really cached in executing isolate');
    assert.equal(value.isString('loaded in another isolate'), true);
    assert.equal(value.isString(42), false);
    console.log(JSON.stringify({ target, cached: true, isString: true }));
  `;
  const payloadFile = join(scratch, "payload.cjs");
  writeFileSync(payloadFile, payload);
  function check(name, caller, runtimeCode, allowed = false) {
    const loaded = spawnSync(process.execPath, ["-e", runtimeCode], {
      cwd: root,
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(loaded.status, 0, `${name}\n${loaded.stderr}`);
    const runtime = JSON.parse(loaded.stdout.trim());
    const result = runGuard();
    assert.equal(
      result.status,
      (baseline && !expectRejections) || allowed ? 0 : 1,
      `${name}\n${JSON.stringify({ runtime })}\n${result.stderr}`,
    );
    if ((!baseline || expectRejections) && !allowed)
      assert.ok(result.stderr.includes(caller), result.stderr);
    cases++;
    process.stdout.write(
      JSON.stringify({ name, runtime, guard: result.status }) + "\n",
    );
  }
  try {
    for (const folder of ["src", "dist"]) {
      const base = join(root, "packages/dms", folder, "utils");
      for (const spelling of ["", "node:"]) {
        const bodies = {
          "worker-eval": `new (require('${spelling}worker_threads').Worker)(${JSON.stringify(payload)}, { 'eval': true });`,
          "worker-file": `new (require('${spelling}worker_threads').Worker)(${JSON.stringify(payloadFile)});`,
          "child-eval": `require('${spelling}child_process').execFileSync(${JSON.stringify(process.execPath)}, ['-e', ${JSON.stringify(payload)}], { stdio: 'inherit' });`,
          "child-file": `require('${spelling}child_process').execFileSync(${JSON.stringify(process.execPath)}, [${JSON.stringify(payloadFile)}], { stdio: 'inherit' });`,
          "child-fork": `require('${spelling}child_process').fork(${JSON.stringify(payloadFile)});`,
          "child-preload": `require('${spelling}child_process').execFileSync(${JSON.stringify(process.execPath)}, ['--require', ${JSON.stringify(payloadFile)}, '-e', ''], { stdio: 'inherit' });`,
          "child-node-options": `require('${spelling}child_process').execFileSync(${JSON.stringify(process.execPath)}, ['-e', ''], { stdio: 'inherit', env: { NODE_OPTIONS: '--require=' + ${JSON.stringify(payloadFile)} } });`,
        };
        const caller = join(base, `__round10_${process.pid}.cjs`);
        writeFileSync(caller, "", { flag: "wx" });
        try {
          for (const [name, body] of Object.entries(bodies)) {
            writeFileSync(caller, body);
            check(
              `${folder}-${spelling}${name}`,
              caller,
              `require(${JSON.stringify(caller)});`,
            );
          }
          writeFileSync(
            caller,
            `const assert = require('${spelling}assert/strict');
             const path = require('${spelling}path');
             const os = require('${spelling}os');
             assert.equal(path.basename('/ordinary/control'), 'control');
             assert.ok(os.cpus().length > 0);
             console.log(JSON.stringify({ builtins: true }));`,
          );
          check(
            `${folder}-${spelling}ordinary-builtins`,
            caller,
            `require(${JSON.stringify(caller)});`,
            true,
          );
        } finally {
          unlinkSync(caller);
        }
      }
      const alias = `__round10_${process.pid}_${folder}`;
      const packageRoot = join(root, "node_modules", alias);
      const caller = join(base, `${alias}.mjs`);
      mkdirSync(packageRoot);
      try {
        writeFileSync(
          join(packageRoot, "safe.cjs"),
          "exports.marker = 'safe';",
        );
        symlinkSync(forbidden, join(packageRoot, "private.cjs"));
        writeFileSync(caller, `export { default } from '${alias}';`, {
          flag: "wx",
        });
        for (const allowed of [false, true]) {
          writeFileSync(
            join(packageRoot, "package.json"),
            JSON.stringify({
              name: alias,
              exports: {
                ".": {
                  import: allowed ? "./safe.cjs" : "./private.cjs",
                  require: "./safe.cjs",
                },
              },
            }),
          );
          check(
            `${folder}-esm-import-condition-${allowed ? "safe" : "private"}`,
            caller,
            `
              const assert = require('node:assert/strict');
              const load = require('node:module').createRequire(${JSON.stringify(caller)});
              assert.equal(load(${JSON.stringify(alias)}).marker, 'safe', 'require condition is harmless');
              import(require('node:url').pathToFileURL(${JSON.stringify(caller)}).href).then(({ default: value }) => {
                const target = require('node:fs').realpathSync(${JSON.stringify(forbidden)});
                if (${allowed}) {
                  assert.equal(value.marker, 'safe');
                  assert.equal(require.cache[target], undefined);
                } else {
                  assert.equal(value.isString('actual import condition'), true);
                  assert.equal(value.isString(42), false);
                  assert.ok(require.cache[target], 'import reached canonical private CJS target');
                }
                console.log(JSON.stringify({ target, cached: !!require.cache[target], safe: ${allowed} }));
              }).catch(error => { console.error(error); process.exitCode = 1; });
            `,
            allowed,
          );
        }
      } finally {
        rmSync(packageRoot, { recursive: true, force: true });
        rmSync(caller, { force: true });
      }
    }
    for (const spelling of ["", "node:"]) {
      for (const [name, body] of [
        ["worker-named", `import { Worker } from '${spelling}worker_threads';`],
        [
          "worker-namespace",
          `import * as workers from '${spelling}worker_threads';`,
        ],
        ["worker-dynamic", `void import('${spelling}worker_threads');`],
        ["worker-reexport", `export * from '${spelling}worker_threads';`],
        [
          "child-execFile",
          `import { execFile } from '${spelling}child_process';`,
        ],
      ]) {
        const caller = join(source, "utils", `__round10_${process.pid}.mts`);
        writeFileSync(caller, body, { flag: "wx" });
        try {
          check(
            `${spelling}${name}`,
            caller,
            `import(require('node:url').pathToFileURL(${JSON.stringify(caller)}).href).then(() => console.log(JSON.stringify({ imported: true }))).catch(error => { console.error(error); process.exitCode = 1; });`,
          );
        } finally {
          unlinkSync(caller);
        }
      }
    }
    const healthy = runGuard();
    assert.equal(healthy.status, 0, healthy.stderr);
    process.stdout.write(
      `Round 10 targets complete: ${cases} isolated fixtures removed; healthy pinned production process calls accepted; ${baseline ? "original guard/helper acceptance reproduced" : "strict rejections and valid controls verified"}.\n`,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function round10Pins() {
  const healthy = runGuard();
  assert.equal(healthy.status, 0, healthy.stderr);
  let cases = 0;
  for (const [folder, extension, binding] of [
    ["src", "ts", "execFileSync"],
    ["dist", "js", "node_child_process_1"],
  ]) {
    const path = join(
      root,
      "packages/dms",
      folder,
      `test/unit/package-contents.test.${extension}`,
    );
    const original = readFileSync(path);
    const text = original.toString("utf8");
    assert.equal(text.split('"npm"').length, 2, `${path} unique npm argument`);
    for (const [name, mutant] of [
      ["new-alias", `${text}\nconst __round10ProcessAlias = ${binding};\n`],
      ["changed-command", text.replace('"npm"', '"node"')],
    ]) {
      try {
        writeFileSync(path, mutant);
        const result = runGuard();
        assert.equal(
          result.status,
          baseline && !expectRejections ? 0 : 1,
          `${folder}-${name}\n${result.stderr}`,
        );
        if (!baseline || expectRejections)
          assert.ok(
            result.stderr.includes(
              `${folder}/test/unit/package-contents.test.${extension}`,
            ),
            result.stderr,
          );
        cases++;
        process.stdout.write(
          JSON.stringify({
            name: `${folder}-pin-${name}`,
            guard: result.status,
          }) + "\n",
        );
      } finally {
        writeFileSync(path, original);
        assert.deepEqual(
          readFileSync(path),
          original,
          `${path} exact restoration`,
        );
        const restored = runGuard();
        assert.equal(restored.status, 0, restored.stderr);
      }
    }
  }
  process.stdout.write(
    `Round 10 process pins complete: ${cases} mutations ${baseline ? "accepted by original guard/helper" : "rejected"}; exact source/dist bytes restored and healthy scan passed after every mutation.\n`,
  );
}
