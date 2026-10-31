const assert = require("node:assert/strict");
const {
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const {
  baseline,
  execPath,
  expectRejections,
  join,
  makeTempDir,
  root,
  runGuard,
  source,
  spawnSync,
  typeCheckTarget,
} = require("./context.cjs");

const payload = `
    const assert = require('node:assert/strict');
    const target = require('node:fs').realpathSync(${JSON.stringify(typeCheckTarget)});
    const value = require(target);
    assert.ok(require.cache[target], 'private module really cached in executing isolate');
    assert.equal(value.isString('loaded in another isolate'), true);
    assert.equal(value.isString(42), false);
    console.log(JSON.stringify({ target, cached: true, isString: true }));
  `;

function createCheck() {
  let cases = 0;
  /**
   * @param {string} name
   * @param {string} caller
   * @param {string} runtimeCode
   * @param {boolean} [allowed]
   */
  function check(name, caller, runtimeCode, allowed = false) {
    const loaded = spawnSync(execPath, ["-e", runtimeCode], {
      cwd: root,
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(loaded.status, 0, `${name}\n${loaded.stderr}`);
    /** @type {unknown} */
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
  return { check, count: () => cases };
}

/**
 * @typedef {ReturnType<typeof createCheck>["check"]} Check
 */

/**
 * @param {string} spelling
 * @param {string} payloadFile
 */
function spawnBodies(spelling, payloadFile) {
  return {
    "worker-eval": `new (require('${spelling}worker_threads').Worker)(${JSON.stringify(payload)}, { 'eval': true });`,
    "worker-file": `new (require('${spelling}worker_threads').Worker)(${JSON.stringify(payloadFile)});`,
    "child-eval": `require('${spelling}child_process').execFileSync(${JSON.stringify(execPath)}, ['-e', ${JSON.stringify(payload)}], { stdio: 'inherit' });`,
    "child-file": `require('${spelling}child_process').execFileSync(${JSON.stringify(execPath)}, [${JSON.stringify(payloadFile)}], { stdio: 'inherit' });`,
    "child-fork": `require('${spelling}child_process').fork(${JSON.stringify(payloadFile)});`,
    "child-preload": `require('${spelling}child_process').execFileSync(${JSON.stringify(execPath)}, ['--require', ${JSON.stringify(payloadFile)}, '-e', ''], { stdio: 'inherit' });`,
    "child-node-options": `require('${spelling}child_process').execFileSync(${JSON.stringify(execPath)}, ['-e', ''], { stdio: 'inherit', env: { NODE_OPTIONS: '--require=' + ${JSON.stringify(payloadFile)} } });`,
  };
}

/**
 * @param {Check} check
 * @param {string} folder
 * @param {string} spelling
 * @param {string} payloadFile
 */
function spawnCases(check, folder, spelling, payloadFile) {
  const base = join(root, "packages/dms", folder, "utils");
  const bodies = spawnBodies(spelling, payloadFile);
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

/**
 * @param {string} caller
 * @param {string} alias
 * @param {boolean} allowed
 */
function esmConditionScript(caller, alias, allowed) {
  return `
              const assert = require('node:assert/strict');
              const load = require('node:module').createRequire(${JSON.stringify(caller)});
              assert.equal(load(${JSON.stringify(alias)}).marker, 'safe', 'require condition is harmless');
              import(require('node:url').pathToFileURL(${JSON.stringify(caller)}).href).then(({ default: value }) => {
                const target = require('node:fs').realpathSync(${JSON.stringify(typeCheckTarget)});
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
            `;
}

/**
 * @param {Check} check
 * @param {string} folder
 */
function esmConditionCases(check, folder) {
  const base = join(root, "packages/dms", folder, "utils");
  const alias = `__round10_${process.pid}_${folder}`;
  const packageRoot = join(root, "node_modules", alias);
  const caller = join(base, `${alias}.mjs`);
  mkdirSync(packageRoot);
  try {
    writeFileSync(join(packageRoot, "safe.cjs"), "exports.marker = 'safe';");
    symlinkSync(typeCheckTarget, join(packageRoot, "private.cjs"));
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
        esmConditionScript(caller, alias, allowed),
        allowed,
      );
    }
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
    rmSync(caller, { force: true });
  }
}

/** @param {Check} check */
function importCases(check) {
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
}

function round10Targets() {
  const scratch = makeTempDir("backend-round10-");
  const payloadFile = join(scratch, "payload.cjs");
  writeFileSync(payloadFile, payload);
  const { check, count } = createCheck();
  try {
    for (const folder of ["src", "dist"]) {
      for (const spelling of ["", "node:"])
        spawnCases(check, folder, spelling, payloadFile);
      esmConditionCases(check, folder);
    }
    importCases(check);
    const healthy = runGuard();
    assert.equal(healthy.status, 0, healthy.stderr);
    process.stdout.write(
      `Round 10 targets complete: ${count()} isolated fixtures removed; healthy pinned production process calls accepted; ${baseline ? "original guard/helper acceptance reproduced" : "strict rejections and valid controls verified"}.\n`,
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

module.exports = { round10Pins, round10Targets };
