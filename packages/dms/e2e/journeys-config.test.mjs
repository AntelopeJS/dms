import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { write } from "./helpers/repo.mjs";
import { loadSuiteConfig } from "./journeys-config.mjs";
import { targetOf } from "./start.mjs";

const JOURNEY = "export const journeys = [];\n";

/**
 * A git checkout with journeys modules for `alpha`, `beta` and `smoke` under
 * `e2e/journeys/`.
 *
 * @param {import("node:test").TestContext} t The test
 * @returns {string} The checkout root
 */
function checkout(t) {
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), "dms-e2e-config-")),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  spawnSync("git", ["init", "-q"], { cwd: root });
  for (const feature of ["alpha", "beta", "smoke"]) {
    write(join(root, "e2e", "journeys", `${feature}.mjs`), JOURNEY);
  }
  write(join(root, "e2e", "journeys", "alpha", "steps.mjs"), JOURNEY);
  spawnSync("git", ["add", "-A"], { cwd: root });
  spawnSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "journeys"],
    { cwd: root },
  );
  return root;
}

/**
 * @param {string} root The checkout
 * @param {Record<string, unknown>} config The default export of its `e2e/journeys.config.ts`
 */
function ownConfig(root, config) {
  write(
    join(root, "e2e", "journeys.config.ts"),
    `export default ${JSON.stringify(config)};\n`,
  );
}

await test("every top-level module of e2e/journeys is a feature of e2e/journeys.config.ts (catches a kit that reads features from elsewhere)", async (t) => {
  const root = checkout(t);
  ownConfig(root, {
    playground: "own-playground",
    renderer: "renderer",
    prepare: [["own-build"]],
    smoke: "beta",
  });

  const config = await loadSuiteConfig(join(root, "e2e"));

  assert.deepEqual(config, {
    source: join(root, "e2e", "journeys.config.ts"),
    repo: root,
    playground: join(root, "own-playground"),
    renderer: join(root, "renderer"),
    prepare: [["own-build"]],
    smoke: "beta",
    journeysDir: join(root, "e2e", "journeys"),
    features: ["alpha", "beta", "smoke"],
  });
  assert.deepEqual(await targetOf({}, root), {
    playground: join(root, "own-playground"),
    renderer: join(root, "renderer"),
  });
});

await test("a repository without e2e/journeys.config.ts is refused, even with a verify skill (catches a kit that still falls back to verify.config.ts)", async (t) => {
  const root = checkout(t);
  write(
    join(root, ".agents", "skills", "verify-x", "verify.config.ts"),
    `export default ${JSON.stringify({ playground: "p", prepare: [], smoke: "alpha" })};\n`,
  );

  await assert.rejects(loadSuiteConfig(root), {
    message: `the journeys config ${join(root, "e2e", "journeys.config.ts")} does not exist`,
  });
});

await test("a malformed e2e/journeys.config.ts is refused with its path (catches a config whose missing smoke fails later as an empty suite)", async (t) => {
  const root = checkout(t);
  ownConfig(root, { playground: "p", prepare: [] });

  await assert.rejects(loadSuiteConfig(root), {
    message: `${join(root, "e2e", "journeys.config.ts")} is malformed: expected a journeys config`,
  });
});

await test("a config option reads that file and the journeys folder beside it, and the default stays e2e/journeys.config.ts (catches a kit that always reads e2e/journeys)", async (t) => {
  const root = checkout(t);
  ownConfig(root, { playground: "main", prepare: [], smoke: "alpha" });
  write(
    join(root, "e2e", "builder", "journeys.config.ts"),
    `export default ${JSON.stringify({ playground: "builder", prepare: [], smoke: "only" })};\n`,
  );
  write(join(root, "e2e", "builder", "journeys", "only.mjs"), JOURNEY);

  const second = await loadSuiteConfig(root, "e2e/builder/journeys.config.ts");
  const first = await loadSuiteConfig(root);

  assert.equal(
    second.source,
    join(root, "e2e", "builder", "journeys.config.ts"),
  );
  assert.equal(second.journeysDir, join(root, "e2e", "builder", "journeys"));
  assert.deepEqual(second.features, ["only"]);
  assert.equal(second.playground, join(root, "builder"));
  assert.deepEqual(first.features, ["alpha", "beta", "smoke"]);
  assert.deepEqual(
    await targetOf(
      { config: join(root, "e2e", "builder", "journeys.config.ts") },
      root,
    ),
    { playground: join(root, "builder"), renderer: undefined },
  );
  await assert.rejects(
    loadSuiteConfig(root, "e2e/none.config.ts"),
    /does not exist/,
  );
});
