import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import manifest from "../../package.json" with { type: "json" };
import { PACKAGE_ROOT } from "./launch.mjs";

/**
 * The environment of a consumer's shell: this process's, without the
 * `NODE_PATH` a package manager's bin shim exports, which would resolve
 * packages the consumer never installed.
 *
 * @returns {NodeJS.ProcessEnv} The environment
 */
function consumerEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name !== "NODE_PATH"),
  );
}

/**
 * A module repository that depends on `@antelopejs/dms` and declares nothing
 * else: the installed copy gets the `bin` folder it publishes and, beside it,
 * the dependencies an install of that kind gives a dependency.
 *
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>[]} installed Each dependency list of the manifest the install honours
 * @returns {string} The output of resolving playwright-core the way dms-control does, or its error
 */
function resolveFromConsumer(t, installed) {
  const moduleRoot = mkdtempSync(join(tmpdir(), "dms-control-consumer-"));
  t.after(() => rmSync(moduleRoot, { recursive: true, force: true }));
  const dms = join(moduleRoot, "node_modules", "@antelopejs", "dms");
  mkdirSync(dms, { recursive: true });
  cpSync(join(PACKAGE_ROOT, "bin"), join(dms, "bin"), { recursive: true });
  cpSync(join(PACKAGE_ROOT, "package.json"), join(dms, "package.json"));
  for (const name of installed.flatMap((list) => Object.keys(list))) {
    const link = join(dms, "node_modules", name);
    mkdirSync(join(link, ".."), { recursive: true });
    symlinkSync(join(PACKAGE_ROOT, "node_modules", name), link, "dir");
  }
  const mongo = pathToFileURL(join(dms, "bin", "control", "mongo.mjs"));
  const from = [join(moduleRoot, ".agents", "playground"), moduleRoot, dms];
  const run = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `const { importFrom } = await import(${JSON.stringify(mongo.href)});
try {
  const { chromium } = await importFrom("playwright-core", ${JSON.stringify(from)});
  process.stdout.write(chromium.name());
} catch (error) {
  process.stdout.write(error.message);
}`,
    ],
    { cwd: moduleRoot, encoding: "utf8", env: consumerEnv() },
  );
  return run.stdout;
}

await test("dms-control resolves playwright-core for a module whose install of @antelopejs/dms keeps optional dependencies", (t) => {
  assert.equal(
    resolveFromConsumer(t, [
      manifest.dependencies,
      manifest.optionalDependencies,
    ]),
    "chromium",
  );
});

await test("dms-control names the install command when the install of @antelopejs/dms omitted optional dependencies", (t) => {
  const spec = `playwright-core@${manifest.optionalDependencies["playwright-core"]}`;
  const message = resolveFromConsumer(t, [manifest.dependencies]);
  assert.ok(
    message.includes(`npm install --save-dev ${spec}`),
    `the error names the npm command: ${message}`,
  );
  assert.ok(
    message.includes(`pnpm add --save-dev ${spec}`),
    `the error names the pnpm command: ${message}`,
  );
});
