import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const E2E = dirname(fileURLToPath(import.meta.url));
const TYPESCRIPT = createRequire(import.meta.url).resolve("typescript/bin/tsc");

/**
 * Typechecks the files with the checks of a TypeScript project, which the e2e
 * kit's own sources do not get, and keeps the diagnostics about a port that
 * is not a `RestartablePort`.
 *
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>} sources Files to write into a folder, by name
 * @param {string[]} extra Files of the kit to check too
 * @returns {string[]} The diagnostics that name `RestartablePort` or a file of `sources`
 */
function portDiagnostics(t, sources, extra = []) {
  const folder = mkdtempSync(join(tmpdir(), "dms-e2e-restartable-port-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(sources)) {
    writeFileSync(join(folder, name), source);
  }
  writeFileSync(
    join(folder, "tsconfig.json"),
    JSON.stringify({
      extends: join(E2E, "tsconfig.json"),
      compilerOptions: {
        checkJs: true,
        module: "nodenext",
        moduleResolution: "nodenext",
        typeRoots: [join(E2E, "..", "node_modules", "@types")],
      },
      include: [],
      files: [...Object.keys(sources), ...extra.map((file) => join(E2E, file))],
    }),
  );
  const result = spawnSync(process.execPath, [TYPESCRIPT, "-p", folder], {
    encoding: "utf8",
  });
  return (result.stdout + result.stderr)
    .split("\n")
    .filter(
      (line) =>
        line.includes("RestartablePort") ||
        line.includes("restartable: true") ||
        Object.keys(sources).some((name) => line.startsWith(name)) ||
        line.includes(`${folder}/`),
    );
}

/**
 * @param {string} portSource An expression of the port of a restart
 * @returns {Record<string, string>} A module that restarts a mongod on it
 */
function restartOn(portSource) {
  /** @param {string} file A file of the kit */
  const imports = (file) =>
    JSON.stringify(join(E2E, file).replaceAll("\\", "/"));
  return {
    "restart.mjs": `import { freePort, restartablePort } from ${imports("processes.mjs")};
import { startMongod } from ${imports("mongo.mjs")};
void freePort;
void restartablePort;
await startMongod({ mongo: "m", logs: "l" }, [], ${portSource});
`,
  };
}

await test("a port from restartablePort types as the port of a mongod restart", (t) => {
  assert.deepEqual(
    portDiagnostics(t, restartOn("await restartablePort()")),
    [],
  );
});

await test("a port from freePort does not type as the port of a mongod restart; a version that takes a number compiles it", (t) => {
  const diagnostics = portDiagnostics(t, restartOn("await freePort()"));
  assert.match(diagnostics[0], /restart\.mjs.*TS2345.*RestartablePort/u);
});

await test("the kit's own restart of a mongod passes a RestartablePort", (t) => {
  assert.deepEqual(
    portDiagnostics(t, { "empty.mjs": "export {};\n" }, [
      "database.mjs",
      "stack.mjs",
    ]).filter(
      (line) =>
        line.includes("RestartablePort") || line.includes("restartable: true"),
    ),
    [],
  );
});
