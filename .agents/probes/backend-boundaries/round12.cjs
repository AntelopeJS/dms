const assert = require("node:assert/strict");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  cpSync,
} = require("node:fs");
const {
  baselineRules,
  dirname,
  execPath,
  expectRejections,
  join,
  loadTypescript,
  makeTempDir,
  parseCruiseResult,
  root,
  spawnSync,
} = require("./context.cjs");
const {
  copyBackend,
  copyRules,
  scratchLayout,
} = require("./scratch-layout.cjs");


/**
 * @typedef {import("./scratch-layout.cjs").Layout} Layout
 * @typedef {{ name: string, targetName: string, marker: string }} Scenario
 * @typedef {Scenario & { accepted: boolean, fixtureCallers: Buffer[] }} RunScenario
 * @typedef {{ layout: Layout, scanner: string, callers: string[], originals: Buffer[], config: string, checks: number }} State
 */

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseJson(text) {
  return JSON.parse(text);
}

const rule = "backend-unranked-folder";
const scenarios = [
  {
    name: "unranked-routes-laundering",
    targetName: "newmod/index.ts",
    marker: "routes",
  },
  {
    name: "ranked-domain-control",
    targetName: "config/__round12/index.ts",
    marker: "ranked",
  },
  {
    name: "test-folder-exemption",
    targetName: "test/__round12/index.ts",
    marker: "test",
  },
];

/**
 * @param {Layout} layout
 * @param {string} name
 * @param {string} body
 */
function writeSource(layout, name, body) {
  const path = join(layout.sourceRoot, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  const compiled = join(layout.distRoot, name.replace(/\.ts$/, ".js"));
  mkdirSync(dirname(compiled), { recursive: true });
  writeFileSync(
    compiled,
    layout.ts.transpileModule(body, {
      compilerOptions: {
        target: layout.ts.ScriptTarget.ES2022,
        module: layout.ts.ModuleKind.CommonJS,
        rewriteRelativeImportExtensions: true,
      },
      fileName: path,
    }).outputText,
  );
}

/**
 * @param {Layout} layout
 * @param {string[]} args
 */
function run(layout, args) {
  return spawnSync(execPath, args, {
    cwd: layout.scratch,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

/**
 * @param {Layout} layout
 */
function prepareScratch(layout) {
  copyBackend(layout);
  for (const name of ["frontend-vue", "playground", "node_modules"])
    symlinkSync(join(root, "packages/dms", name), join(layout.backend, name));
  symlinkSync(join(root, "node_modules"), join(layout.scratch, "node_modules"));
  symlinkSync(
    join(root, "packages/interface-dms"),
    join(layout.scratch, "packages/interface-dms"),
  );
  cpSync(join(root, "pnpm-lock.yaml"), join(layout.scratch, "pnpm-lock.yaml"));
  copyRules(layout);
}

/**
 * @param {Layout} layout
 */
function snapshotFrontendModule(layout) {
  for (const [folder, extension] of [
    ["src", "ts"],
    ["dist", "js"],
  ]) {
    const path = join(layout.backend, folder, `frontend-module.${extension}`);
    writeFileSync(
      path,
      readFileSync(path, "utf8").replaceAll(
        '"./routes/oauth-config"',
        '"./routes/oauth"',
      ),
    );
  }
  process.stdout.write(
    "Baseline snapshot only: frontend composition uses the historical public routes/oauth face; old rules are unchanged.\n",
  );
}

/**
 * @param {Layout} layout
 */
function seedSources(layout) {
  writeSource(layout, "routes/index.ts", 'export const marker = "routes";\n');
  writeSource(
    layout,
    "newmod/index.ts",
    'export * from "../routes/index.ts";\n',
  );
  writeSource(
    layout,
    "config/__round12/index.ts",
    'export const marker = "ranked";\n',
  );
  writeSource(
    layout,
    "test/__round12/index.ts",
    'export const marker = "test";\n',
  );
}

/**
 * @param {State} state
 * @param {RunScenario} scenario
 */
function cruiseScenario(state, scenario) {
  const { layout, config } = state;
  const { name, targetName, accepted } = scenario;
  const cruise = run(layout, [
    join(root, "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs"),
    "packages/dms/src/db/index.ts",
    "--config",
    config,
    "--output-type",
    "json",
  ]);
  assert.equal(cruise.status, 0, cruise.stderr);
  const graph = parseCruiseResult(cruise.stdout);
  const from = "packages/dms/src/db/index.ts";
  const to = `packages/dms/src/${targetName}`;
  assert.ok(
    graph.modules
      .find((item) => item.source === from)
      ?.dependencies.some((item) => item.resolved === to),
    `${name}: depcruise must resolve the tested importer-target edge`,
  );
  assert.deepEqual(
    graph.summary.violations.map((item) => [
      item.rule.name,
      item.from,
      item.to,
    ]),
    accepted ? [] : [[rule, from, to]],
    `${name}: no unrelated or transitive violation may satisfy this probe`,
  );
  process.stdout.write(
    JSON.stringify({
      name,
      depcruise: { from, to, violations: graph.summary.violations },
    }) + "\n",
  );
}

/**
 * @param {string} folder
 * @param {Scenario} scenario
 * @param {string} caller
 * @param {string} target
 */
function runtimeScript(folder, scenario, caller, target) {
  const { targetName, marker } = scenario;
  return `
          const assert = require('node:assert/strict');
          assert.equal(require(${JSON.stringify(caller)}).marker, ${JSON.stringify(marker)});
          assert.equal(require('node:module').createRequire(${JSON.stringify(caller)}).resolve(${JSON.stringify(`../${targetName.replace(/\.ts$/, folder === "src" ? ".ts" : ".js")}`)}), ${JSON.stringify(target)});
          if (${JSON.stringify(folder === "dist")}) assert.ok(require.cache[${JSON.stringify(target)}], 'tested CJS target actually cached');
          console.log(JSON.stringify({ marker: ${JSON.stringify(marker)}, resolved: true, cached: ${JSON.stringify(folder === "dist")} }));
        `;
}

/**
 * @param {State} state
 * @param {RunScenario} scenario
 * @param {number} index
 * @param {string} folder
 */
function scanFolder(state, scenario, index, folder) {
  const { layout, scanner, callers, originals } = state;
  const { name, targetName, accepted } = scenario;
  callers.forEach((path, i) =>
    writeFileSync(
      path,
      i === index ? scenario.fixtureCallers[i] : originals[i],
    ),
  );
  const caller = callers[index];
  const target = join(
    layout.backend,
    folder,
    targetName.replace(/\.ts$/, folder === "src" ? ".ts" : ".js"),
  );
  const edge = `${caller} -> ${target} violates ${rule}`;
  const scanned = run(layout, [scanner]);
  assert.equal(
    scanned.status,
    accepted ? 0 : 1,
    `${name}/${folder}\n${scanned.stderr}`,
  );
  if (!accepted) assert.ok(scanned.stderr.includes(edge), scanned.stderr);
  const runtimeCode = runtimeScript(folder, scenario, caller, target);
  const loaded = run(layout, ["-e", runtimeCode]);
  assert.equal(
    loaded.status,
    0,
    `${name}/${folder} unguarded load\n${loaded.stderr}`,
  );
  const guarded = run(layout, ["--require", layout.hook, "-e", runtimeCode]);
  assert.equal(
    guarded.status,
    accepted ? 0 : 1,
    `${name}/${folder} hook\n${guarded.stderr}`,
  );
  if (!accepted) assert.ok(guarded.stderr.includes(edge), guarded.stderr);
  state.checks++;
  process.stdout.write(
    JSON.stringify({
      name,
      format: folder === "src" ? "typed-source" : "emitted-cjs",
      from: caller,
      to: target,
      scanner: scanned.status,
      unguarded: parseJson(loaded.stdout),
      hook: guarded.status,
      diagnostic: accepted ? undefined : edge,
    }) + "\n",
  );
}

/**
 * @param {State} state
 * @param {Scenario} scenario
 */
function runScenario(state, { name, targetName, marker }) {
  const { layout, callers, originals } = state;
  const accepted =
    name !== "unranked-routes-laundering" ||
    (!!baselineRules && !expectRejections);
  writeSource(layout, "db/index.ts", `export * from "../${targetName}";\n`);
  const fixtureCallers = callers.map((path) => readFileSync(path));
  const scenario = { name, targetName, marker, accepted, fixtureCallers };
  cruiseScenario(state, scenario);
  for (const [index, folder] of ["src", "dist"].entries())
    scanFolder(state, scenario, index, folder);
  callers.forEach((path, i) => writeFileSync(path, originals[i]));
}

/**
 * @param {Layout} layout
 * @param {string} scanner
 * @returns {State}
 */
function fixtureState(layout, scanner) {
  const callers = [
    join(layout.sourceRoot, "db/index.ts"),
    join(layout.distRoot, "db/index.js"),
  ];
  const originals = callers.map((path) => readFileSync(path));
  const config = join(layout.scratch, "focused.cjs");
  writeFileSync(
    config,
    `module.exports = { ...require('./.dependency-cruiser/backend.cjs'), options: { tsPreCompilationDeps: true } };\n`,
  );
  return { layout, scanner, callers, originals, config, checks: 0 };
}

function round12Targets() {
  const scratch = makeTempDir("backend-round12-");
  const layout = scratchLayout(scratch, loadTypescript());
  try {
    prepareScratch(layout);
    if (baselineRules) snapshotFrontendModule(layout);
    const scanner = join(layout.backend, "scripts/backend-checks.cjs");
    const healthy = run(layout, [scanner]);
    assert.equal(healthy.status, 0, healthy.stderr);
    seedSources(layout);
    const state = fixtureState(layout, scanner);
    for (const scenario of scenarios) runScenario(state, scenario);
    const restored = run(layout, [scanner]);
    assert.equal(restored.status, 0, restored.stderr);
    process.stdout.write(
      JSON.stringify({
        round: 12,
        rules: baselineRules ?? "current",
        checks: state.checks,
      }) + "\n",
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    assert.equal(existsSync(scratch), false, "isolated snapshot removed");
  }
}

module.exports = { round12Targets };
