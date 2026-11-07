import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { isDeepStrictEqual, promisify } from "node:util";
import { KEPT_BUILDS, restoreBuild, storeBuild } from "./build-cache.mjs";
import { buildChangedSince, existingBuildRoots } from "./build-inputs.mjs";
import { write } from "./helpers/repo.mjs";
import { namesIn, treeOf } from "./helpers/tree.mjs";

const exec = promisify(execFile);
const FILES_PER_STORE = 400;
const START_DELAY_MS = 500;
const UNTOUCHABLE = "/proc/version";
const CLOCK_STEP_MS = 20;

const SOURCES = { "main.ts": "mount();\n" };
const BUILT = {
  "dist/client/index.html": "<html>one</html>\n",
  "dist/server.mjs": "serve();\n",
  "dist/current": "-> client",
  "components.d.ts": "declare const a: 1;\n",
};
const OUTPUTS = ["components.d.ts", "dist"];

/**
 * A cache folder and a run's built workspace: the sources its setup wrote
 * and what the build added, a relative link among them as Vite writes none
 * but pnpm does.
 *
 * @param {import("node:test").TestContext} t The test
 */
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-build-cache-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const built = join(dir, "built");
  write(join(built, "main.ts"), SOURCES["main.ts"]);
  write(
    join(built, "dist", "client", "index.html"),
    BUILT["dist/client/index.html"],
  );
  write(join(built, "dist", "server.mjs"), BUILT["dist/server.mjs"]);
  write(join(built, "components.d.ts"), BUILT["components.d.ts"]);
  symlinkSync("client", join(built, "dist", "current"));
  /** @param {string} name */
  const prepared = (name) => {
    const workspace = join(dir, name);
    write(join(workspace, "main.ts"), SOURCES["main.ts"]);
    return workspace;
  };
  return {
    dir,
    cache: join(dir, "cache"),
    build: { workspace: built, outputs: OUTPUTS },
    prepared,
  };
}

await test("a stored build restores beside another run's sources, and outlives the run that built it", (t) => {
  const { cache, build, prepared } = fixture(t);
  assert.equal(storeBuild(cache, "k1", { inputs: 1 }, build), null);
  rmSync(build.workspace, { recursive: true });
  const workspace = prepared("next");
  assert.equal(restoreBuild(cache, "k1", workspace), true);
  assert.deepEqual(
    treeOf(workspace),
    { ...SOURCES, ...BUILT },
    "a link resolved into a copy, a link into the cache, or the builder's sources in place of the run's, serve another build",
  );
  assert.equal(
    restoreBuild(cache, "k1", prepared("again")),
    true,
    "restoring by moving the entry leaves nothing for the next run",
  );
});

await test("a restore into a run's workspace is no change to the build its backends load; a rebuild after it still is", async (t) => {
  const { dir, cache, build } = fixture(t);
  assert.equal(storeBuild(cache, "k1", {}, build), null);
  const moduleRoot = join(dir, "module");
  const playground = join(moduleRoot, "playground");
  write(join(moduleRoot, "dist", "index.js"), "serve();\n");
  mkdirSync(join(playground, "node_modules"), { recursive: true });
  const runPlayground = join(dir, "run", "playground");
  write(join(runPlayground, "dist", "index.js"), "project();\n");
  write(join(runPlayground, ".antelope", "build", "build.json"), "{}\n");
  const workspace = join(runPlayground, ".dms-frontend");
  write(join(workspace, "main.ts"), SOURCES["main.ts"]);
  const run = { moduleRoot, playground, runPlayground, buildRoots: [""] };
  run.buildRoots = existingBuildRoots(run);
  await sleep(CLOCK_STEP_MS);
  const standbyStartedAt = new Date().toISOString();
  await sleep(CLOCK_STEP_MS);
  assert.equal(restoreBuild(cache, "k1", workspace), true);
  assert.equal(
    buildChangedSince(run, standbyStartedAt),
    null,
    "a staleness check that reads the run's frontend workspace takes every restore for a rebuild, and no standby is ever promoted",
  );
  write(join(moduleRoot, "dist", "index.js"), "rebuilt();\n");
  assert.equal(
    buildChangedSince(run, standbyStartedAt),
    `${join(moduleRoot, "dist", "index.js")} changed`,
    "a hit that resets what the check compares against hides the module's rebuild, and the standby serves the old code",
  );
});

await test("only a complete entry restores, and a second store of a key keeps the first", (t) => {
  const { cache, build, prepared } = fixture(t);
  mkdirSync(join(cache, "partial", "outputs", "dist"), { recursive: true });
  const workspace = prepared("next");
  assert.equal(
    restoreBuild(cache, "partial", workspace),
    false,
    "an entry without its ready mark is a store that did not finish",
  );
  assert.deepEqual(
    treeOf(workspace),
    SOURCES,
    "a half restore serves no dashboard",
  );
  assert.equal(storeBuild(cache, "k1", {}, build), null);
  write(join(build.workspace, "dist", "server.mjs"), "other();\n");
  assert.equal(storeBuild(cache, "k1", {}, build), null);
  assert.equal(restoreBuild(cache, "k1", workspace), true);
  assert.deepEqual(
    treeOf(workspace),
    { ...SOURCES, ...BUILT },
    "a store over a live entry, or a file shared with the run that built it, changes a build under its reader",
  );
  assert.deepEqual(
    namesIn(cache).filter((name) => name.startsWith(".pending-")),
    [],
    "a pending store left behind fills the disk",
  );
});

await test("a restore never replaces what the run's own setup wrote", (t) => {
  const { cache, build, prepared } = fixture(t);
  assert.equal(storeBuild(cache, "k1", {}, build), null);
  const workspace = prepared("next");
  write(join(workspace, "components.d.ts"), "mine\n");
  assert.equal(restoreBuild(cache, "k1", workspace), false);
  assert.deepEqual(
    treeOf(workspace),
    { ...SOURCES, "components.d.ts": "mine\n" },
    "a restore over the run's sources serves the builder's",
  );
});

await test("a build holding an absolute link is not stored", (t) => {
  const { cache, build, prepared } = fixture(t);
  symlinkSync(build.workspace, join(build.workspace, "dist", "self"));
  assert.match(
    storeBuild(cache, "k1", {}, build) ?? "",
    /links to/u,
    "an absolute link points into the run that built it",
  );
  assert.equal(restoreBuild(cache, "k1", prepared("next")), false);
});

await test("a cache that cannot be written refuses the store without throwing", (t) => {
  const { dir, build } = fixture(t);
  writeFileSync(join(dir, "file"), "");
  assert.match(
    storeBuild(join(dir, "file", "cache"), "k1", {}, build) ?? "",
    /ENOTDIR/u,
    "a cache folder created outside a try fails the run after its build",
  );
});

await test("the cache keeps the most recently used builds", (t) => {
  const { cache, build, prepared } = fixture(t);
  const old = new Date("2026-01-01T00:00:00Z");
  for (let index = 0; index < KEPT_BUILDS; index += 1) {
    assert.equal(storeBuild(cache, `k${index}`, {}, build), null);
    utimesSync(join(cache, `k${index}`, ".dms-control-ready"), old, old);
  }
  assert.equal(restoreBuild(cache, "k0", prepared("used")), true);
  assert.equal(storeBuild(cache, "new", {}, build), null);
  const kept = namesIn(cache);
  assert.equal(
    kept.length,
    KEPT_BUILDS,
    "an unbounded cache fills the shared disk",
  );
  assert.ok(
    kept.includes("k0"),
    "pruning by creation drops the build every run uses",
  );
  assert.ok(kept.includes("new"));
});

await test("two stores of one key at once leave one whole entry", async (t) => {
  const { dir, cache, prepared } = fixture(t);
  /** @type {Record<string, string>} */
  const sides = {};
  for (const side of ["a", "b"]) {
    sides[side] = join(dir, side);
    for (let index = 0; index < FILES_PER_STORE; index += 1)
      write(
        join(sides[side], "dist", `chunk-${index}.js`),
        `${side}${index}\n`,
      );
  }
  const at = Date.now() + START_DELAY_MS;
  const script = `const { storeBuild } = await import(${JSON.stringify(new URL("build-cache.mjs", import.meta.url).href)});
while (Date.now() < ${at});
storeBuild(process.argv[1], "k", {}, { workspace: process.argv[2], outputs: ["dist"] });`;
  await Promise.all(
    Object.values(sides).map((source) =>
      exec(process.execPath, [
        "--input-type=module",
        "-e",
        script,
        cache,
        source,
      ]),
    ),
  );
  assert.deepEqual(
    namesIn(cache),
    ["k"],
    "a store left pending fills the disk",
  );
  const workspace = prepared("restored");
  assert.equal(restoreBuild(cache, "k", workspace), true);
  assert.ok(
    [treeOf(sides.a), treeOf(sides.b)].some((side) =>
      isDeepStrictEqual({ ...side, ...SOURCES }, treeOf(workspace)),
    ),
    "two runs writing one folder leave a mix of both builds",
  );
});

await test("a restore that fails part-way leaves the run's sources alone, and one that cannot mark the entry used still lays it out", (t) => {
  const { cache, build, prepared } = fixture(t);
  assert.equal(storeBuild(cache, "k1", {}, build), null);
  symlinkSync("/pruned", join(cache, "k1", "outputs", "dist", "gone"));
  const workspace = prepared("half");
  assert.equal(restoreBuild(cache, "k1", workspace), false);
  assert.deepEqual(
    treeOf(workspace),
    SOURCES,
    "a restore that stops part-way serves a dashboard missing chunks",
  );
  if (!existsSync(UNTOUCHABLE)) return;
  assert.equal(storeBuild(cache, "k2", {}, build), null);
  const mark = join(cache, "k2", ".dms-control-ready");
  rmSync(mark);
  symlinkSync(UNTOUCHABLE, mark);
  const whole = prepared("whole");
  assert.equal(
    restoreBuild(cache, "k2", whole),
    true,
    "a use time touched outside the try throws on an entry another user owns or a prune removed",
  );
  assert.deepEqual(treeOf(whole), { ...SOURCES, ...BUILT });
});
