const assert = require("node:assert/strict");
const { mkdirSync, rmSync, unlinkSync, writeFileSync } = require("node:fs");
const {
  baseline,
  dirname,
  execPath,
  join,
  relative,
  root,
  runGuard,
  source,
  spawnSync,
} = require("./context.cjs");

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
          spawnSync(execPath, [caller], {
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
          execPath,
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

module.exports = { packageTargets, runtimeTargets, sourceDistTargets };
