const assert = require("node:assert/strict");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const {
  baselineRules,
  dirname,
  execPath,
  expectRejections,
  join,
  loadTypescript,
  makeTempDir,
  relative,
  root,
  spawnSync,
} = require("./context.cjs");
const { round11Cases } = require("./round11-cases.cjs");
const {
  copyBackend,
  copyRules,
  scratchLayout,
} = require("./scratch-layout.cjs");





/**
 * Retired paths still need policy coverage if a future file reintroduces them.
 */
const retiredPaths = [
  "startup-config.ts",
  "client-origin-cors.ts",
  "dev/index.ts",
  "page-extensions/index.ts",
];
const configFaces = [
  "config/index.ts",
  "config/startup-config.ts",
  "config/client-origin-cors.ts",
  "config/session-handoff.ts",
];

function emit(layout, name) {
  const { ts, sourceRoot, distRoot } = layout;
  const from = join(sourceRoot, name);
  const to = join(distRoot, name.replace(/\.ts$/, ".js"));
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(
    to,
    ts.transpileModule(readFileSync(from, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
      fileName: from,
    }).outputText,
  );
  return to;
}

function seedRetiredPaths(layout, synthetic) {
  for (const name of retiredPaths) {
    if (!existsSync(join(layout.sourceRoot, name))) {
      assert.ok(
        baselineRules || !name.endsWith("/index.ts"),
        `${name} public barrel must exist`,
      );
      writeFileSync(
        join(layout.sourceRoot, name),
        "export const boundaryProbe = true;\n",
      );
      synthetic.push(name);
    }
    emit(layout, name);
  }
}

function prepareScratch(layout, synthetic) {
  copyBackend(layout);
  symlinkSync(join(root, "node_modules"), join(layout.scratch, "node_modules"));
  symlinkSync(
    join(root, "packages/dms/node_modules"),
    join(layout.backend, "node_modules"),
  );
  copyRules(layout);
  seedRetiredPaths(layout, synthetic);
  for (const name of configFaces)
    if (existsSync(join(layout.sourceRoot, name))) emit(layout, name);
  if (!baselineRules)
    assert.ok(existsSync(layout.hook), "runtime boundary preload must exist");
}

/**
 * Exercises the same resolver/edge checker as the scanner, without scanning
 * unrelated production code or fixtures owned by another agent.
 */
function edgeFailure(checkTarget, request, file, boundary, isCompiled) {
  try {
    checkTarget(request, file, boundary, isCompiled, {
      runtime: isCompiled,
      esm: false,
    });
  } catch (error) {
    return error;
  }
  return undefined;
}

function checkEdges(state, edge) {
  const { layout, checkTarget } = state;
  const { item, request, caller, compiled, accepted } = edge;
  for (const [file, boundary, isCompiled] of [
    [caller, layout.sourceRoot, false],
    [compiled, layout.distRoot, true],
  ]) {
    const failure = edgeFailure(
      checkTarget,
      request,
      file,
      boundary,
      isCompiled,
    );
    if (accepted) assert.ifError(failure);
    else {
      assert.ok(failure, `${item.name}: ${file} must reject`);
      assert.match(failure.message, /violates backend-/);
      if (item.rule)
        assert.ok(failure.message.includes(item.rule), failure.message);
    }
    state.edges++;
    process.stdout.write(
      JSON.stringify({
        name: item.name,
        format: isCompiled ? "emitted-cjs" : "typed-source",
        accepted: !failure,
        diagnostic: failure?.message,
      }) + "\n",
    );
  }
}

function runtimeScript(layout, item, compiled, runtimeTarget) {
  return `
        const assert = require('node:assert/strict');
        const target = require('node:fs').realpathSync(${JSON.stringify(runtimeTarget)});
        require(${JSON.stringify(compiled)});
        assert.ok(require.cache[target], 'actual target cached after Node load');
        if (${JSON.stringify(item.name === "db-root-getConfig")}) {
          assert.ok(require.cache[require.resolve(${JSON.stringify(join(layout.distRoot, "routes/index.js"))})], 'root import really loaded ranked routes');
        }
        console.log(JSON.stringify({ target, cached: true }));
      `;
}

function nodeLoad(state, item, runtimeCode) {
  const loaded = spawnSync(execPath, ["-e", runtimeCode], {
    cwd: state.layout.scratch,
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(loaded.status, 0, `${item.name}\n${loaded.stderr}`);
  state.loads++;
  process.stdout.write(
    JSON.stringify({ name: item.name, node: JSON.parse(loaded.stdout) }) + "\n",
  );
}

function hookLoad(state, edge, runtimeTarget, runtimeCode) {
  const { item, compiled, accepted } = edge;
  const loaded = spawnSync(
    execPath,
    ["--require", state.layout.hook, "-e", runtimeCode],
    {
      cwd: state.layout.scratch,
      encoding: "utf8",
      timeout: 15000,
    },
  );
  assert.equal(
    loaded.status,
    accepted ? 0 : 1,
    `${item.name} runtime hook\n${loaded.stderr}`,
  );
  if (!accepted) {
    assert.match(loaded.stderr, /violates backend-/);
    assert.ok(
      loaded.stderr.includes(`${compiled} -> ${runtimeTarget}`),
      `${item.name} must reject the tested edge, not a transitive dependency\n${loaded.stderr}`,
    );
    if (item.rule) assert.ok(loaded.stderr.includes(item.rule), loaded.stderr);
  }
  state.hookChecks++;
  process.stdout.write(
    JSON.stringify({ name: item.name, hook: loaded.status }) + "\n",
  );
}

function runCase(state, item, index) {
  const { layout } = state;
  const callerName = join(item.from, `__round11_${index}.ts`);
  const caller = join(layout.sourceRoot, callerName);
  const target = join(layout.sourceRoot, item.target);
  const path = relative(dirname(caller), target)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "");
  const request = item.request ?? (path.startsWith(".") ? path : `./${path}`);
  const body = item.binding
    ? `import { ${item.binding} } from ${JSON.stringify(request)}; void ${item.binding};\n`
    : `import * as value from ${JSON.stringify(request)}; void value;\n`;
  writeFileSync(caller, body, { flag: "wx" });
  const compiled = emit(layout, callerName);
  const accepted =
    item.allowed || (baselineRules && item.escape && !expectRejections);
  const edge = { item, request, caller, compiled, accepted };
  checkEdges(state, edge);
  const runtimeTarget = join(
    layout.distRoot,
    item.target.replace(/\.ts$/, ".js"),
  );
  const runtimeCode = runtimeScript(layout, item, compiled, runtimeTarget);
  if (item.runtime) nodeLoad(state, item, runtimeCode);
  if (!baselineRules && existsSync(layout.hook))
    hookLoad(state, edge, runtimeTarget, runtimeCode);
}

function round11Targets() {
  const scratch = makeTempDir("backend-round11-");
  const layout = scratchLayout(scratch, loadTypescript());
  const synthetic = [];
  try {
    prepareScratch(layout, synthetic);
    const checkTarget = require(
      join(layout.backend, "scripts/backend-import-target.cjs"),
    );
    const state = { layout, checkTarget, edges: 0, loads: 0, hookChecks: 0 };
    for (const [index, item] of round11Cases(layout.sourceRoot).entries())
      runCase(state, item, index);
    process.stdout.write(
      JSON.stringify({
        round: 11,
        rules: baselineRules ?? "current",
        edges: state.edges,
        loads: state.loads,
        hookChecks: state.hookChecks,
        synthetic,
      }) + "\n",
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

module.exports = { round11Targets };
