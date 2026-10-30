const assert = require("node:assert/strict");
const { mkdirSync, rmSync, symlinkSync, writeFileSync } = require("node:fs");
const {
  baseline,
  execPath,
  join,
  makeTempDir,
  root,
  runGuard,
  source,
  spawnSync,
  typeCheckTarget,
} = require("./context.cjs");

const privateTarget = join(source, "utils/auth-constants.ts");

function loadScript(caller, target, request) {
  return `
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
      `;
}

function check(
  name,
  caller,
  { target, allowed = false, env = process.env, request } = {},
) {
  let runtime;
  if (target) {
    const loaded = spawnSync(
      execPath,
      ["-e", loadScript(caller, target, request)],
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


function createFixtures() {
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
  return { fixture, count: () => cases };
}

function payloadCases(fixture) {
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
      check(`private-${suffix || "extensionless"}`, caller, {
        target: privateTarget,
      });
      writeFileSync(payload, "module.exports = { harmless: true };");
      check(`harmless-${suffix || "extensionless"}`, caller);
    });
  }
}

function bareCases(fixture) {
  for (const form of ["parent-main", "exports-symlink", "node-path"]) {
    fixture(form, ({ prefix, create, directory, owned }) => {
      const base =
        form === "node-path"
          ? makeTempDir("backend-round9-")
          : join(root, "node_modules");
      if (form === "node-path") owned.push(base);
      const alias = directory(join(base, prefix));
      create(
        join(alias, "package.json"),
        JSON.stringify(
          form === "exports-symlink"
            ? { name: prefix, exports: { ".": "./bridge.cjs" } }
            : { name: prefix, main: typeCheckTarget },
        ),
      );
      if (form === "exports-symlink")
        symlinkSync(typeCheckTarget, join(alias, "bridge.cjs"));
      const caller = create(
        join(source, "types", `${prefix}.cjs`),
        `module.exports = require('${prefix}');`,
      );
      const env =
        form === "node-path"
          ? { ...process.env, NODE_PATH: base }
          : process.env;
      check(`bare-${form}`, caller, {
        target: typeCheckTarget,
        env,
        request: prefix,
      });
    });
  }
}

function processCases(fixture) {
  for (const name of ["process", "node:process"]) {
    for (const folder of ["src", "dist"]) {
      fixture("builtin", ({ prefix, create }) => {
        const caller = create(
          join(root, "packages/dms", folder, "types", `${prefix}.cjs`),
          `module.exports = require('${name}').getBuiltinModule('module')._load(${JSON.stringify(typeCheckTarget)});`,
        );
        check(`${folder}-${name}-getBuiltinModule`, caller, {
          target: typeCheckTarget,
        });
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
}

function supportedRequest(edge, prefix, suffix) {
  if (edge === "private") return `../types/${prefix}-target.cjs`;
  if (edge === "upward") return `../utils/index.${suffix}`;
  if (edge === "downward") return `../types/index.${suffix}`;
  return "@antelopejs/interface-dms/page";
}

function supportedCases(fixture) {
  for (const folder of ["src", "dist"]) {
    const base = join(root, "packages/dms", folder);
    const suffix = folder === "src" ? "ts" : "js";
    for (const edge of ["private", "upward", "downward", "public"]) {
      fixture(edge, ({ prefix, create }) => {
        const domain =
          edge === "private" || edge === "downward" ? "config" : "types";
        const request = supportedRequest(edge, prefix, suffix);
        if (edge === "private")
          create(
            join(base, "types", `${prefix}-target.cjs`),
            "exports.value = 1;",
          );
        const caller = create(
          join(base, domain, `${prefix}.cjs`),
          `void require('${request}');`,
        );
        check(`${folder}-supported-cjs-${edge}`, caller, {
          allowed: edge === "downward" || edge === "public",
        });
      });
    }
  }
}

function round9Targets() {
  const { fixture, count } = createFixtures();
  payloadCases(fixture);
  bareCases(fixture);
  processCases(fixture);
  supportedCases(fixture);
  process.stdout.write(
    `Round 9 targets complete: ${count()} isolated fixtures removed; ${baseline ? "original guard acceptance reproduced" : "strict rejections and valid controls verified"}.\n`,
  );
}

module.exports = { round9Targets };
