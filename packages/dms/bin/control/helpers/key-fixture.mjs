import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildInputs, buildKey, sourceNames } from "../build-key.mjs";
import { write } from "./repo.mjs";

/**
 * An installed dms-frontend, a checkout whose playground pnpm installed
 * (its `node_modules` links into the checkout root's store, whose lockfile
 * and install records sit beside it), and a project whose workspace a run
 * set up at `<run>/.dms-frontend` with its own web URL: a template, a
 * module's copied page, the registry the setup generated (which names the
 * workspace's folder and the run's URL), the install record, the lockfile
 * and the installed modules. The project's `node_modules` links to the
 * playground's, as the run's copy does. A key reads no install above the
 * fixture's folder, so what sits above `TMPDIR` leaves it unchanged.
 *
 * @param {import("node:test").TestContext} t The test
 */
export function fixture(t) {
  const dir = realpathSync(
    mkdtempSync(join(tmpdir(), "dms-control-build-key-test-")),
  );
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const frontend = join(dir, "dms-frontend");
  write(join(frontend, "package.json"), '{"version":"0.10.0"}');
  write(join(frontend, "dist", "index.js"), "build();\n");
  write(join(frontend, "templates", "vue", "main.ts"), "mount();\n");
  const checkout = join(dir, "checkout");
  write(join(checkout, "pnpm-lock.yaml"), "zod: 3.24.4\n");
  write(join(checkout, "node_modules", ".pnpm", "lock.yaml"), "zod: 3.24.4\n");
  write(
    join(checkout, "node_modules", ".modules.yaml"),
    "hoistedDependencies: {}\npendingBuilds:\n  - .\nprunedAt: Sat, 07 Nov 2026 01:24:21 GMT\nlayoutVersion: 5\n",
  );
  const modules = join(checkout, "playground", "node_modules");
  write(join(modules, ".bin", "tsc"), "tsc\n");
  write(join(modules, "@types", ".keep"), "");
  symlinkSync(
    "../../node_modules/.pnpm/zod@3.24.4/node_modules/zod",
    join(modules, "zod"),
  );
  /**
   * @param {string} name
   * @param {number} port
   */
  const prepare = (name, port) => {
    const project = join(dir, name);
    const workspace = join(project, ".dms-frontend");
    const webUrl = `http://127.0.0.1:${port}`;
    write(join(project, "package.json"), "{}");
    symlinkSync(modules, join(project, "node_modules"));
    write(join(workspace, "main.ts"), "mount();\n");
    write(
      join(workspace, "frontend-modules", "layer", "page.vue"),
      "<template>one</template>\n",
    );
    write(
      join(workspace, "generated-frontend-modules.json"),
      JSON.stringify({ root: join(workspace, "frontend-modules"), webUrl }),
    );
    write(join(workspace, ".deps-hash"), "a\n");
    write(join(workspace, "pnpm-lock.yaml"), "vue: 3.5.0\n");
    write(join(workspace, "node_modules", "vue", "index.js"), "vue();\n");
    const run = { environment: "docs", extraEnv: {}, webUrl };
    /** @type {import("../build-key.mjs").PreparedWorkspace} */
    const prepared = {
      project,
      workspace,
      names: sourceNames(workspace),
      installed: workspace,
    };
    return { project, workspace, run, prepared, top: dir };
  };
  return { dir, frontend, checkout, modules, prepare };
}

/**
 * @param {string} frontend
 * @param {{ run: import("../build-key.mjs").KeyedRun, prepared: import("../build-key.mjs").PreparedWorkspace, top: string }} side
 * @returns {string}
 */
export function keyOf(frontend, side) {
  return buildKey(buildInputs(side.run, frontend, side.prepared, side.top));
}
