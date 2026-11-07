import assert from "node:assert/strict";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { withBaseBackend } from "./base.mjs";
import { targetOf } from "./commands-stack.mjs";
import { git } from "./git.mjs";
import { resolveRenderer } from "./renderer.mjs";
import { decodeSkillConfig } from "./verify/decode.mjs";
import { layOutCopy } from "./run-copy.mjs";
import { cliPaths } from "./stack.mjs";

/**
 * @param {import("node:test").TestContext} t The test
 * @returns {string} A real scratch folder removed when the test ends
 */
function scratch(t) {
  const dir = realpathSync(
    mkdtempSync(join(tmpdir(), "dms-control-renderer-test-")),
  );
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * @param {string} folder The package folder
 * @param {string} name Its name
 * @returns {string} The folder
 */
function writePackage(folder, name) {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "package.json"), JSON.stringify({ name }));
  return folder;
}

/**
 * @param {string} folder The renderer checkout
 * @returns {string} The folder
 */
function builtRenderer(folder) {
  writePackage(folder, "@antelopejs/dms-frontend");
  mkdirSync(join(folder, "dist"), { recursive: true });
  writeFileSync(join(folder, "dist", "index.js"), "");
  return folder;
}

/**
 * A checkout whose playground has installed modules: core, a published
 * dms-frontend and one other package.
 *
 * @param {string} root The scratch folder
 * @returns {{ checkout: string, playground: string, modules: string }} Its paths
 */
function checkoutWithPlayground(root) {
  const checkout = join(root, "dms");
  const playground = join(checkout, "playground");
  const modules = join(playground, "node_modules");
  mkdirSync(playground, { recursive: true });
  writeFileSync(join(playground, "antelope.config.ts"), "");
  writePackage(join(modules, "@antelopejs", "core"), "@antelopejs/core");
  writePackage(
    join(modules, "@antelopejs", "dms-frontend"),
    "@antelopejs/dms-frontend",
  );
  writePackage(join(modules, "zod"), "zod");
  return { checkout, playground, modules };
}

await test("--renderer takes a built dms-frontend checkout as an absolute folder", (t) => {
  const folder = builtRenderer(join(scratch(t), "dms-frontend"));
  assert.equal(resolveRenderer(folder), folder);
});

await test("--renderer refuses a folder without a package.json", (t) => {
  assert.throws(() => resolveRenderer(scratch(t)), /has no package\.json/);
});

await test("--renderer refuses a package that is not dms-frontend", (t) => {
  const folder = writePackage(join(scratch(t), "other"), "@antelopejs/dms");
  assert.throws(
    () => resolveRenderer(folder),
    /is @antelopejs\/dms, not @antelopejs\/dms-frontend/,
  );
});

await test("--renderer refuses a checkout that is not built", (t) => {
  const folder = writePackage(
    join(scratch(t), "dms-frontend"),
    "@antelopejs/dms-frontend",
  );
  assert.throws(() => resolveRenderer(folder), /has no dist.index\.js/);
});

await test("the run's playground resolves dms-frontend to the renderer and everything else to the playground's modules", (t) => {
  const root = scratch(t);
  const { checkout, playground, modules } = checkoutWithPlayground(root);
  const renderer = builtRenderer(join(root, "dms-frontend"));
  const copy = layOutCopy(playground, checkout, join(root, "run"), renderer);
  const linked = join(copy, "node_modules");
  assert.equal(
    realpathSync(join(linked, "@antelopejs", "dms-frontend")),
    renderer,
  );
  assert.equal(
    realpathSync(join(linked, "@antelopejs", "core")),
    realpathSync(join(modules, "@antelopejs", "core")),
  );
  assert.equal(
    realpathSync(join(linked, "zod")),
    realpathSync(join(modules, "zod")),
  );
});

await test("linking a renderer leaves the playground's own modules alone", (t) => {
  const root = scratch(t);
  const { checkout, playground, modules } = checkoutWithPlayground(root);
  const published = realpathSync(join(modules, "@antelopejs", "dms-frontend"));
  layOutCopy(
    playground,
    checkout,
    join(root, "run"),
    builtRenderer(join(root, "dms-frontend")),
  );
  assert.equal(
    realpathSync(join(modules, "@antelopejs", "dms-frontend")),
    published,
  );
});

await test("a playground that installs no @antelopejs scope still gets the renderer", (t) => {
  const root = scratch(t);
  const { checkout, playground, modules } = checkoutWithPlayground(root);
  rmSync(join(modules, "@antelopejs"), { recursive: true });
  const renderer = builtRenderer(join(root, "dms-frontend"));
  const copy = layOutCopy(playground, checkout, join(root, "run"), renderer);
  assert.equal(
    realpathSync(join(copy, "node_modules", "@antelopejs", "dms-frontend")),
    renderer,
  );
});

await test("without a renderer the run's node_modules is the playground's", (t) => {
  const root = scratch(t);
  const { checkout, playground, modules } = checkoutWithPlayground(root);
  const copy = layOutCopy(playground, checkout, join(root, "run"));
  const linked = join(copy, "node_modules");
  assert.equal(lstatSync(linked).isSymbolicLink(), true);
  assert.equal(realpathSync(linked), realpathSync(modules));
});

await test("the dashboard CLI is the renderer's build, the backend CLI stays the playground's core", (t) => {
  const root = scratch(t);
  const { playground } = checkoutWithPlayground(root);
  const renderer = builtRenderer(join(root, "dms-frontend"));
  const published = cliPaths(playground);
  const served = cliPaths(playground, renderer);
  assert.equal(served.dms, join(renderer, "dist", "index.js"));
  assert.notEqual(published.dms, served.dms);
  assert.equal(served.ajs, published.ajs);
});

/**
 * @param {string} root The scratch folder
 * @param {string} config The text after `export default` in `verify.config.ts`
 * @returns {string} The checkout holding a verification skill with that config
 */
function checkoutWithSkill(root, config) {
  const checkout = join(root, "dms-frontend");
  const skill = join(checkout, ".agents", "skills", "verify-dms-frontend");
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, "verify.config.ts"), `export default ${config};\n`);
  git(["init", "--quiet"], checkout);
  git(["add", "."], checkout);
  git(
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.com",
      "commit",
      "--quiet",
      "-m",
      "skill",
    ],
    checkout,
  );
  return checkout;
}

const EMPTY_CONFIG = `prepare: [], userFacing: [], smoke: "", smokeJourney: "", doors: {}, formal: []`;

await test("up takes the playground and the renderer from the skill's config, relative ones from its repository", async (t) => {
  const root = scratch(t);
  const checkout = checkoutWithSkill(
    root,
    `{ playground: "/dms/playground", renderer: ".", ${EMPTY_CONFIG} }`,
  );
  assert.deepEqual(await targetOf({}, checkout), {
    playground: "/dms/playground",
    renderer: checkout,
  });
});

await test("--renderer and --playground win over the skill's config", async (t) => {
  const checkout = checkoutWithSkill(
    scratch(t),
    `{ playground: "/dms/playground", renderer: ".", ${EMPTY_CONFIG} }`,
  );
  assert.deepEqual(
    await targetOf(
      { playground: "/other/playground", renderer: "/other/ui" },
      checkout,
    ),
    { playground: "/other/playground", renderer: "/other/ui" },
  );
});

await test("a skill without a renderer serves the published one", async (t) => {
  const checkout = checkoutWithSkill(
    scratch(t),
    `{ playground: "packages/dms/playground", ${EMPTY_CONFIG} }`,
  );
  assert.deepEqual(await targetOf({}, checkout), {
    playground: resolve(checkout, "packages/dms/playground"),
    renderer: undefined,
  });
});

const CONFIG = {
  playground: "p",
  prepare: [],
  userFacing: [],
  smoke: "",
  smokeJourney: "",
  doors: {},
  formal: [],
};

await test("a skill config keeps its renderer, and refuses one that is not a path", () => {
  assert.equal(
    decodeSkillConfig({ ...CONFIG, renderer: "." }, "verify.config.ts")
      .renderer,
    ".",
  );
  assert.equal(
    decodeSkillConfig(CONFIG, "verify.config.ts").renderer,
    undefined,
  );
  assert.throws(
    () => decodeSkillConfig({ ...CONFIG, renderer: 3 }, "verify.config.ts"),
    /verify\.config\.ts/,
  );
});

await test("a run with a renderer has no base backend", async () => {
  await assert.rejects(
    withBaseBackend({ renderer: "/ui" }, {}, async () => {}),
    /no base backend/,
  );
});
