import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { layOutFrontendBuild } from "./build-cache.mjs";
import { buildInputs, buildKey, sourceNames } from "./build-key.mjs";
import { PREPARED_WORKSPACE_REFUSED } from "./frontend-workspace.mjs";
import { setEnv } from "./helpers/env.mjs";
import { write } from "./helpers/repo.mjs";
import { namesIn, treeOf } from "./helpers/tree.mjs";
import { ExitError } from "./processes.mjs";

const PAGE = join("frontend-vue", "page.vue");
const SOURCE = join("frontend-modules", "page");
const REGISTRY = "generated-frontend-modules.json";

/**
 * A checkout holding a module's page, an installed dms-frontend and a build
 * cache. Each run copies the page into its workspace, as the dms-frontend
 * setup does, with a registry naming its own folder and URL; its build
 * serves the page its workspace holds. A key reads no install above the
 * fixture's folder unless a run names a higher `top`, so what sits above
 * `TMPDIR` leaves it unchanged.
 *
 * @param {import("node:test").TestContext} t The test
 */
function fixture(t) {
  const dir = realpathSync(
    mkdtempSync(join(tmpdir(), "dms-control-build-layout-test-")),
  );
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  setEnv(t, { XDG_CACHE_HOME: join(dir, "xdg") });
  const checkout = join(dir, "checkout");
  write(join(checkout, PAGE), "clean");
  const frontend = join(dir, "dms-frontend");
  write(join(frontend, "package.json"), '{"version":"0.10.0"}');
  /** @param {string} workspace */
  const copySources = (workspace) => {
    cpSync(join(checkout, "frontend-vue"), join(workspace, SOURCE), {
      recursive: true,
    });
  };
  let port = 1000;
  /**
   * @param {{ runs?: string, prepare?: (workspace: string) => void, build?: (workspace: string, prepared: boolean) => void, useCache?: boolean, top?: string }} [options]
   */
  const up = async (options = {}) => {
    port += 1;
    const runDir = join(options.runs ?? join(dir, "runs"), String(port));
    const webUrl = `http://127.0.0.1:${port}`;
    /** @type {Parameters<typeof layOutFrontendBuild>[0]} */
    const state = {
      environment: "docs",
      extraEnv: {},
      webUrl,
      runPlayground: join(runDir, "playground"),
    };
    const workspace = join(state.runPlayground ?? "", ".dms-frontend");
    /** @param {string} log */
    const log = (log) => write(join(runDir, "logs", `${log}.log`), "ran\n");
    /**
     * @param {string} into
     * @param {(workspace: string) => void} copy
     */
    const setUp = (into, copy) => {
      copy(into);
      write(join(into, REGISTRY), JSON.stringify({ into, webUrl }));
      write(join(into, ".deps-hash"), "a\n");
      write(join(into, "pnpm-lock.yaml"), "vue: 3.5.0\n");
    };
    /** @type {boolean[]} */
    const builds = [];
    await layOutFrontendBuild(
      state,
      frontend,
      {
        prepare: (into) => {
          log("frontend-prepare");
          setUp(into, options.prepare ?? copySources);
          return Promise.resolve();
        },
        build: (prepared) => {
          builds.push(prepared);
          log("frontend-build");
          if (!prepared) setUp(workspace, copySources);
          options.build?.(workspace, prepared);
          const page = treeOf(workspace)?.[join(SOURCE, "page.vue")] ?? "";
          write(join(workspace, "dist", "index.html"), page);
          return Promise.resolve();
        },
      },
      options.useCache ?? true,
      options.top ?? dir,
    );
    const laidOut = treeOf(workspace) ?? {};
    return {
      state,
      workspace,
      builds,
      frontendBuild: state.frontendBuild,
      served: laidOut[join("dist", "index.html")],
      registry: laidOut[REGISTRY],
    };
  };
  return { dir, checkout, frontend, up };
}

await test("a run restores the build of the sources it set up into its own workspace, and builds when they changed", async (t) => {
  const { checkout, up } = fixture(t);
  const first = await up();
  assert.deepEqual(
    first.builds,
    [true],
    "a miss builds in the workspace the key was read from",
  );
  const second = await up();
  assert.equal(
    second.frontendBuild?.cached,
    true,
    "a cache never read saves nothing",
  );
  assert.deepEqual(second.builds, []);
  assert.equal(second.served, "clean");
  assert.match(
    second.registry,
    /"webUrl":"http:\/\/127.0.0.1:1002"/u,
    "restoring the builder's sources over the run's serves the builder's registry",
  );
  write(join(checkout, PAGE), "edited");
  const edited = await up();
  assert.equal(edited.frontendBuild?.cached, false);
  assert.equal(
    edited.served,
    "edited",
    "a key that missed the edit serves the old page",
  );
});

await test("an edit present only while a run copies its sources is keyed with them, so a clean run never serves it", async (t) => {
  const { checkout, up } = fixture(t);
  const edited = await up({
    prepare: (workspace) => {
      write(join(checkout, PAGE), "RV787-STALE");
      cpSync(join(checkout, "frontend-vue"), join(workspace, SOURCE), {
        recursive: true,
      });
      write(join(checkout, PAGE), "clean");
    },
  });
  assert.equal(edited.served, "RV787-STALE");
  const clean = await up();
  assert.notEqual(clean.frontendBuild?.key, edited.frontendBuild?.key);
  assert.equal(
    clean.served,
    "clean",
    "a key read off the checkout before and after the build stores the edited build as the clean one",
  );
  assert.equal((await up()).served, "clean");
});

await test("a build whose workspace sources change while it builds is not stored", async (t) => {
  const { up } = fixture(t);
  const changed = await up({
    build: (workspace) => write(join(workspace, SOURCE, "page.vue"), "late"),
  });
  assert.match(
    changed.frontendBuild?.reason ?? "",
    /changed while it built/u,
    "storing under the key read before the build caches a build of other sources",
  );
  const next = await up();
  assert.equal(next.frontendBuild?.cached, false);
  assert.equal(next.served, "clean");
});

await test("a cache that cannot be written leaves the run built and says why", async (t) => {
  const { dir, up } = fixture(t);
  writeFileSync(join(dir, "xdg"), "");
  const run = await up();
  assert.equal(
    run.served,
    "clean",
    "a store that throws fails up after its build",
  );
  assert.match(run.frontendBuild?.reason ?? "", /refused it/u);
});

await test("runs inside the checkout keep the cache", async (t) => {
  const { checkout, up } = fixture(t);
  const runs = join(checkout, "runs");
  await up({ runs });
  const second = await up({ runs });
  assert.equal(
    second.frontendBuild?.cached,
    true,
    "a key on the checkout's untracked files changes with the run's own folder and logs",
  );
});

await test("without the cache, or when the workspace cannot be prepared, the run builds as ajs dms build does and says why", async (t) => {
  const { dir, checkout, up } = fixture(t);
  await up();
  write(join(checkout, PAGE), "edited");
  const forced = await up({ useCache: false });
  assert.deepEqual(
    forced.builds,
    [false],
    "--no-build-cache must build as it is",
  );
  assert.equal(forced.frontendBuild?.key, null);
  assert.equal(
    namesIn(join(dir, "xdg", "dms-control", "frontend")).length,
    1,
    "--no-build-cache stores what it built",
  );
  const unprepared = await up({
    prepare: () => {
      throw new Error("no setupWorkspace");
    },
  });
  assert.deepEqual(unprepared.builds, [false]);
  assert.match(
    unprepared.frontendBuild?.reason ?? "",
    /could not be prepared \(no setupWorkspace\)/u,
    "a run that skips the cache without saying why looks like a cache that never hits",
  );
  assert.equal(unprepared.served, "edited");
});

await test("an install record the key cannot read is a miss that builds as ajs dms build does, stores nothing and says why", async (t) => {
  const { dir, up } = fixture(t);
  const record = join(dir, "node_modules", ".modules.yaml");
  write(record, "hoistPattern:\n  - '*'\nlayoutVersion: 5\n");
  await up();
  assert.equal((await up()).frontendBuild?.cached, true);
  write(record, `${JSON.stringify({ hoistPattern: [], layoutVersion: 5 })}\n`);
  const unread = await up();
  assert.deepEqual(
    unread.builds,
    [false],
    "a key that skips a record it cannot read restores the build of another layout",
  );
  assert.deepEqual(unread.frontendBuild, {
    key: null,
    cached: false,
    reason: `its inputs could not be keyed (${record} is not the YAML layout the build cache reads (line 1))`,
  });
  assert.equal(
    namesIn(join(dir, "xdg", "dms-control", "frontend")).length,
    1,
    "a build whose inputs were not all keyed is stored under no key",
  );
});

await test("a build that refuses its prepared workspace builds again as ajs dms build does; a failing build fails the run once", async (t) => {
  const { dir, up } = fixture(t);
  const refused = await up({
    build: (_workspace, prepared) => {
      if (!prepared) return;
      throw new ExitError(
        "frontend-build exited with 75",
        PREPARED_WORKSPACE_REFUSED,
      );
    },
  });
  assert.deepEqual(
    refused.builds,
    [true, false],
    "a preload that cannot take hold fails up instead of building",
  );
  assert.equal(refused.served, "clean");
  assert.equal(refused.frontendBuild?.key, null);
  assert.match(
    refused.frontendBuild?.reason ?? "",
    /refused its prepared workspace \(frontend-build exited with 75\)/u,
  );
  assert.equal(
    treeOf(join(dir, "xdg", "dms-control", "frontend")),
    null,
    "a build outside the prepared workspace is stored under the key of sources it did not read",
  );
  /** @type {boolean[]} */
  const builds = [];
  await assert.rejects(
    up({
      build: (_workspace, prepared) => {
        builds.push(prepared);
        throw new ExitError("frontend-build exited with 1", 1);
      },
    }),
    /exited with 1/u,
  );
  assert.deepEqual(
    builds,
    [true],
    "a build that fails on its own sources builds a second time",
  );
});

await test("a run records the VITE_ and NODE_ENV variables it keyed on, so another shell keys its sources the same", async (t) => {
  const { dir, frontend, up } = fixture(t);
  setEnv(t, { VITE_PROBE: "on" });
  const run = await up();
  delete process.env.VITE_PROBE;
  assert.deepEqual(run.state.bakedEnv, { VITE_PROBE: "on" });
  const sources = sourceNames(run.workspace).filter((name) => name !== "dist");
  const again = buildInputs(
    run.state,
    frontend,
    {
      project: run.state.runPlayground ?? "",
      workspace: run.workspace,
      names: sources,
      installed: run.workspace,
    },
    dir,
  );
  assert.equal(
    buildKey(again),
    run.frontendBuild?.key,
    "doctor keys with its own shell's variables and fails a fresh build",
  );
});

await test("an install record above TMPDIR that the key cannot read leaves the runs cached, through a linked TMPDIR too", async (t) => {
  const outer = realpathSync(
    mkdtempSync(join(tmpdir(), "dms-control-build-layout-outer-")),
  );
  t.after(() => rmSync(outer, { recursive: true, force: true }));
  const record = join(outer, "node_modules", ".modules.yaml");
  write(record, '{"layoutVersion":5}\n');
  write(join(outer, "tmp", ".keep"), "");
  symlinkSync(join(outer, "tmp"), join(outer, "linked-tmp"));
  setEnv(t, { TMPDIR: join(outer, "linked-tmp") });
  const { dir, up } = fixture(t);
  write(join(dir, "node_modules", ".modules.yaml"), "layoutVersion: 5\n");
  assert.match(
    (await up({ top: outer })).frontendBuild?.reason ?? "",
    /\.modules\.yaml is not the YAML layout the build cache reads/u,
    "a run whose key reads the folder above TMPDIR refuses the record there, so the fixture's runs below hit only by not reading it",
  );
  await up();
  assert.equal(
    (await up()).frontendBuild?.cached,
    true,
    "a fixture whose keys read above its folder, by its linked path or its real one, misses on whatever install sits above TMPDIR",
  );
});
