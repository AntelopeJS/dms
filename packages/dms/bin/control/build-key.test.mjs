import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setEnv } from "./helpers/env.mjs";
import { buildInputs } from "./build-key.mjs";
import { fixture, keyOf } from "./helpers/key-fixture.mjs";
import { write } from "./helpers/repo.mjs";

await test("two runs that set up the same sources share a key, whatever their folders and web URLs", (t) => {
  const { frontend, prepare } = fixture(t);
  assert.equal(
    keyOf(frontend, prepare("run-b", 2002)),
    keyOf(frontend, prepare("run-a", 1001)),
    "a key holding the run's folder or URL never hits",
  );
});

await test("a .env or .env.local of the project changes the key", (t) => {
  const { frontend, prepare } = fixture(t);
  const side = prepare("run", 1001);
  const clean = keyOf(frontend, side);
  write(join(side.project, ".env"), "NODE_ENV=development\n");
  const env = keyOf(frontend, side);
  assert.notEqual(
    env,
    clean,
    "a key on git's view of the checkout skips the ignored .env the build loads",
  );
  write(join(side.project, ".env.local"), "VITE_FLAG=on\n");
  assert.notEqual(keyOf(frontend, side), env, "the build loads .env.local too");
});

await test("the versions the install resolved change the key", (t) => {
  const { frontend, prepare } = fixture(t);
  const side = prepare("run", 1001);
  const resolved = keyOf(frontend, side);
  write(join(side.workspace, "pnpm-lock.yaml"), "vue: 3.5.1\n");
  assert.notEqual(
    keyOf(frontend, side),
    resolved,
    "a key on the declared ranges serves a build of the last release in range",
  );
});

await test("an edited copy, generated file or dms-frontend changes the key; the installed modules and later entries do not", (t) => {
  const { frontend, prepare } = fixture(t);
  const side = prepare("run", 1001);
  const keys = new Set([keyOf(frontend, side)]);
  write(join(side.workspace, "node_modules", "vue", "index.js"), "other();\n");
  write(
    join(side.workspace, "frontend-modules", "layer", "node_modules", "x"),
    "linked\n",
  );
  write(join(side.workspace, "dist", "client", "index.html"), "<html>\n");
  assert.ok(
    keys.has(keyOf(frontend, side)),
    "a key on the installed modules or the build's own output never hits",
  );
  /** @param {string} change */
  const changed = (change) => {
    const key = keyOf(frontend, side);
    assert.ok(!keys.has(key), change);
    keys.add(key);
  };
  write(
    join(side.workspace, "frontend-modules", "layer", "page.vue"),
    "<template>two</template>\n",
  );
  changed("a key read off the checkout misses what the setup copied");
  write(join(side.workspace, "generated-frontend-modules.json"), "{}");
  changed("the setup generates the registry from the configuration");
  write(join(frontend, "dist", "index.js"), "other();\n");
  changed("another dms-frontend builds another dashboard");
  write(join(frontend, "templates", "vue", "main.ts"), "other();\n");
  changed("a renderer checkout keyed by its version serves its last build");
});

await test("the environment, an --env pair or a VITE_ variable changes the key", (t) => {
  const { frontend, prepare } = fixture(t);
  const side = prepare("run", 1001);
  const keys = new Set([keyOf(frontend, side)]);
  /** @param {string} change */
  const changed = (change) => {
    const key = keyOf(frontend, side);
    assert.ok(!keys.has(key), change);
    keys.add(key);
  };
  side.run.environment = "production";
  changed("the environment picks the project's configuration");
  side.run.extraEnv = { DMS_FEATURE: "on" };
  changed("the --env pairs reach the build");
  side.run.bakedEnv = { VITE_PROBE: "on" };
  changed("Vite bakes VITE_ variables into the bundle");
});

await test("the key reads the VITE_ and NODE_ENV variables the run recorded, not those of the shell keying it again", (t) => {
  const { frontend, prepare } = fixture(t);
  const side = prepare("run", 1001);
  side.run.bakedEnv = { NODE_ENV: "production" };
  const recorded = keyOf(frontend, side);
  setEnv(t, { NODE_ENV: "development", VITE_PROBE: "on" });
  assert.equal(
    keyOf(frontend, side),
    recorded,
    "a key on the variables of the shell that keys it reports identical sources as stale from any other shell",
  );
});

await test("a source holding a URL or a placeholder is keyed as written; only the setup's registries leave the run's values out", (t) => {
  const { frontend, prepare } = fixture(t);
  let runs = 0;
  /**
   * @param {number} port
   * @param {(workspace: string) => Record<string, string>} files
   */
  const keyed = (port, files) => {
    runs += 1;
    const side = prepare(`run-${runs}`, port);
    for (const [name, text] of Object.entries(files(side.workspace))) {
      write(join(side.workspace, name), text);
    }
    return keyOf(frontend, side);
  };
  const api = join("frontend-modules", "layer", "api.ts");
  for (const path of ["", "/v1"]) {
    assert.notEqual(
      keyed(1001, () => ({
        [api]: `export const API = "http://127.0.0.1:1001${path}";`,
      })),
      keyed(1002, () => ({
        [api]: `export const API = "http://127.0.0.1:1002${path}";`,
      })),
      "a key replacing the run's URL in every source serves a build pinned to another run's URL",
    );
  }
  const registry = "generated-frontend-modules.json";
  /** @param {string} url */
  const options = (url) => JSON.stringify({ dms: { baseURL: url } });
  const own = keyed(1001, () => ({
    [registry]: options("http://127.0.0.1:1001"),
  }));
  assert.equal(
    keyed(1002, () => ({ [registry]: options("http://127.0.0.1:1002") })),
    own,
    "a registry naming each run's own URL never hits",
  );
  for (const placeholder of ["<web>", "%W", '%W"']) {
    assert.notEqual(
      keyed(1009, () => ({ [registry]: options(placeholder) })),
      own,
      `a registry holding ${placeholder} reads as one holding the run's URL`,
    );
  }
  assert.notEqual(
    keyed(1001, () => ({ [registry]: options("http://127.0.0.1:10012") })),
    keyed(1002, () => ({ [registry]: options("http://127.0.0.1:10022") })),
    "a URL that extends the run's reads as the run's with a suffix",
  );
  /** @param {string} workspace */
  const sibling = (workspace) => JSON.stringify({ root: `${workspace}-old` });
  assert.notEqual(
    keyed(1001, (workspace) => ({ [registry]: sibling(workspace) })),
    keyed(1001, (workspace) => ({ [registry]: sibling(workspace) })),
    "a folder whose name extends the workspace's reads as a path under it",
  );
});

await test("the installs above the workspace that a bare import resolves from change the key; their caches and pnpm's per-install bookkeeping do not", (t) => {
  const { dir, frontend, checkout, modules, prepare } = fixture(t);
  const side = prepare("run", 1001);
  const keys = new Set([keyOf(frontend, side)]);
  write(
    join(checkout, "node_modules", ".modules.yaml"),
    "hoistedDependencies: {}\npendingBuilds:\n  - .\n  - .\nprunedAt: Sun, 08 Nov 2026 01:24:21 GMT\nlayoutVersion: 5\n",
  );
  write(join(modules, ".cache", "jiti", "entry.json"), "{}");
  assert.ok(
    keys.has(keyOf(frontend, side)),
    "a key on pnpm's install bookkeeping or a tool's cache misses after every install that skips scripts",
  );
  /** @param {string} change */
  const changed = (change) => {
    const key = keyOf(frontend, side);
    assert.ok(!keys.has(key), change);
    keys.add(key);
  };
  write(join(checkout, "pnpm-lock.yaml"), "zod: 3.25.0\n");
  changed("a key without the playground's lockfile misses an upgrade");
  write(join(checkout, "node_modules", ".pnpm", "lock.yaml"), "zod: 3.25.0\n");
  changed("pnpm records what it installed apart from the lockfile");
  write(
    join(checkout, "node_modules", ".modules.yaml"),
    "hoistedDependencies:\n  zod: public\npendingBuilds:\n  - .\nlayoutVersion: 5\n",
  );
  changed("what pnpm hoisted changes what resolves");
  rmSync(join(modules, "zod"));
  symlinkSync(
    "../../node_modules/.pnpm/zod@3.25.0/node_modules/zod",
    join(modules, "zod"),
  );
  changed("a relinked package resolves to another version");
  write(join(modules, "rv-dep", "index.js"), "export const v = 1;\n");
  changed("a package copied into node_modules is resolved too");
  write(join(modules, "rv-dep", "index.js"), "export const v = 2;\n");
  changed("a key on a copied package's name serves its old files");
  write(join(dir, "node_modules", "hoisted", "index.js"), "export {};\n");
  changed("a key reading only the nearest node_modules misses one further up");
});

await test("a no-op install, with scripts or without, keeps the key; a change to what pnpm linked where changes it", (t) => {
  const { frontend, checkout, prepare } = fixture(t);
  const side = prepare("run", 1001);
  const layout = {
    hoistPattern: "\n  - '*'",
    hoistedDependencies: "\n  zod@3.24.4:\n    zod: public",
    hoistedLocations: " {}",
    included:
      "\n  dependencies: true\n  devDependencies: true\n  optionalDependencies: true",
    injectedDeps: " {}",
    layoutVersion: " 5",
    nodeLinker: " isolated",
    publicHoistPattern: "\n  - '*'",
    skipped: "\n  - '@esbuild/aix-ppc64@0.25.12'",
    virtualStoreDir: " .pnpm",
    virtualStoreDirMaxLength: " 120",
  };
  const bookkeeping = {
    packageManager: " pnpm@10.2.0",
    pendingBuilds: " []",
    prunedAt: " Sat, 07 Nov 2026 01:24:21 GMT",
    registries: "\n  default: https://registry.npmjs.org/",
    storeDir: " /home/a/.local/share/pnpm/store/v10",
  };
  /** @param {Record<string, string>} fields */
  const installed = (fields) => {
    const lines = Object.entries(fields).map(
      ([name, value]) => `${name}:${value}`,
    );
    write(
      join(checkout, "node_modules", ".modules.yaml"),
      `${lines.join("\n")}\n`,
    );
    return keyOf(frontend, side);
  };
  const plain = installed({ ...layout, ...bookkeeping, ignoredBuilds: " []" });
  assert.equal(
    installed({
      ...layout,
      ...bookkeeping,
      pendingBuilds: "\n  - .\n  - esbuild@0.25.12",
    }),
    plain,
    "a key on the record without only pendingBuilds and prunedAt misses after an install that skips scripts, which drops ignoredBuilds",
  );
  assert.equal(
    installed({
      ...layout,
      packageManager: " pnpm@10.3.0",
      prunedAt: " Sun, 08 Nov 2026 01:24:21 GMT",
      registries: "\n  default: https://registry.example.test/",
      storeDir: " /var/cache/pnpm/store/v10",
    }),
    plain,
    "a key on the pnpm version, its store or registries misses on an install that links the same packages",
  );
  /** @type {Record<string, string>} */
  const relaid = {
    hoistPattern: "\n  - '@types/*'",
    hoistedDependencies: "\n  zod@3.24.4:\n    zod: private",
    hoistedLocations: "\n  zod@3.24.4:\n    - node_modules/zod",
    included:
      "\n  dependencies: true\n  devDependencies: false\n  optionalDependencies: true",
    injectedDeps:
      "\n  shared-ui:\n    - node_modules/.pnpm/shared-ui@file+shared-ui",
    layoutVersion: " 6",
    nodeLinker: " hoisted",
    publicHoistPattern: " []",
    skipped: " []",
    virtualStoreDir: " ../.store",
    virtualStoreDirMaxLength: " 60",
  };
  const keys = new Set([plain]);
  for (const [field, value] of Object.entries(relaid)) {
    const key = installed({ ...layout, ...bookkeeping, [field]: value });
    assert.ok(
      !keys.has(key),
      `a key without ${field} misses that pnpm linked other packages or linked them elsewhere`,
    );
    keys.add(key);
  }
});

await test("a linked workspace package is keyed by its files, without its installs or its runs' outputs; a package of pnpm's virtual store by its link", (t) => {
  const { frontend, checkout, modules, prepare } = fixture(t);
  const side = prepare("run", 1001);
  const shared = join(checkout, "packages", "shared-ui");
  write(join(shared, "index.js"), 'export const label = "SHARED-V1";\n');
  write(join(modules, "@acme", ".keep"), "");
  symlinkSync(
    "../../../packages/shared-ui",
    join(modules, "@acme", "shared-ui"),
  );
  const store = join(
    checkout,
    "node_modules",
    ".pnpm",
    "vue@3.5.0",
    "node_modules",
    "vue",
  );
  write(join(store, "index.js"), "vue();\n");
  symlinkSync(
    "../../node_modules/.pnpm/vue@3.5.0/node_modules/vue",
    join(modules, "vue"),
  );
  write(join(shared, "node_modules", ".bin", "vue"), "vue\n");
  symlinkSync(
    "../../../node_modules/.pnpm/vue@3.5.0/node_modules/vue",
    join(shared, "node_modules", "vue"),
  );
  const linked = keyOf(frontend, side);
  for (const path of [
    join("node_modules", ".bin", "vue"),
    join(".git", "HEAD"),
    join(".antelope", "build", "build.json"),
    join(".dms-frontend", "dist", "index.html"),
  ]) {
    write(join(shared, path), "changed\n");
  }
  assert.equal(
    keyOf(frontend, side),
    linked,
    "a key on a linked package's installs, history or run outputs misses on every install and while a dev server runs there",
  );
  write(join(store, "index.js"), "patched();\n");
  assert.equal(
    keyOf(frontend, side),
    linked,
    "a key reading each package of the virtual store file by file reads every installed package on every up",
  );
  write(join(shared, "index.js"), 'export const label = "SHARED-V2";\n');
  assert.notEqual(
    keyOf(frontend, side),
    linked,
    "a key on a linked package's target path serves a build of its old files",
  );
});

await test("a package copied into node_modules is keyed with its own node_modules", (t) => {
  const { frontend, modules, prepare } = fixture(t);
  const side = prepare("run", 1001);
  write(
    join(modules, "ui-kit", "index.js"),
    'import color from "color-lib";\n',
  );
  const nested = join(
    modules,
    "ui-kit",
    "node_modules",
    "color-lib",
    "index.js",
  );
  write(nested, 'export default "COLOR-V1";\n');
  const copied = keyOf(frontend, side);
  write(nested, 'export default "COLOR-V2";\n');
  assert.notEqual(
    keyOf(frontend, side),
    copied,
    "a key that skips a copied package's node_modules serves a build of its old dependencies",
  );
});

await test("links of one name and one link text in two node_modules are keyed by the folder each resolves to", (t) => {
  const { dir, frontend, modules, prepare } = fixture(t);
  const side = prepare("run", 1001);
  const near = join(modules, "..", "packages", "shared-ui");
  const far = join(dir, "packages", "shared-ui");
  for (const target of [near, far]) {
    write(join(target, "index.js"), 'export const label = "SHARED-V1";\n');
  }
  write(join(dir, "node_modules", ".keep"), "");
  for (const folder of [modules, join(dir, "node_modules")]) {
    symlinkSync("../packages/shared-ui", join(folder, "shared-ui"));
  }
  const linked = keyOf(frontend, side);
  write(join(far, "index.js"), 'export const label = "SHARED-V2";\n');
  assert.notEqual(
    keyOf(frontend, side),
    linked,
    "a key that reuses a linked package's hash by its name or link text serves the nearer package's hash for the farther one",
  );
});

await test("an install record above TMPDIR that the key cannot read leaves the fixture's keys unchanged", (t) => {
  const outer = mkdtempSync(join(tmpdir(), "dms-control-build-key-outer-"));
  t.after(() => rmSync(outer, { recursive: true, force: true }));
  write(join(outer, "node_modules", ".modules.yaml"), '{"layoutVersion":5}\n');
  write(join(outer, "tmp", ".keep"), "");
  setEnv(t, { TMPDIR: join(outer, "tmp") });
  const { frontend, prepare } = fixture(t);
  const side = prepare("run-a", 1001);
  assert.throws(
    () => buildInputs(side.run, frontend, side.prepared),
    /\.modules\.yaml is not the YAML layout the build cache reads/u,
    "a key left unbounded reads the installs up to the filesystem root, as a bare import resolves",
  );
  assert.equal(
    keyOf(frontend, prepare("run-b", 2002)),
    keyOf(frontend, side),
    "a fixture whose keys read above its folder fails on whatever install sits above TMPDIR",
  );
});
