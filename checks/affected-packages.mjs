import { spawnSync } from "node:child_process";
import { matchesGlob } from "node:path/posix";

/** @typedef {{ name: string, root: string, reads: string[], dependsOn: string[] }} TestPackage */

/**
 * The workspace's test packages, in the order the selection lists them.
 *
 * `root` owns a path by its longest matching prefix, so a package nested in
 * another owns its own files. `reads` lists the paths outside `root` that the
 * package's tests or checks read, and `dependsOn` lists the packages whose
 * change can break it. When a test starts reading a new path, add the path
 * here.
 *
 * - `dms` reads frontend-vue through the package-contents test, the shared
 *   fixtures, the locales, the e-mail templates, the layer manifests and
 *   `scripts/backend-checks.cjs`.
 * - `frontend-vue` reads `packages/dms/data`, `packages/dms/checks`,
 *   `packages/dms/package.json` and the playground layer.
 * - `.agents` holds the TLA+ formal models and the verify-dms map, which cover
 *   code in every package.
 *
 * @type {TestPackage[]}
 */
export const PACKAGES = [
  {
    name: "interface-dms",
    root: "packages/interface-dms",
    reads: [],
    dependsOn: [],
  },
  {
    name: "interface-dms-builder",
    root: "packages/interface-dms-builder",
    reads: [],
    dependsOn: [],
  },
  {
    name: "dms",
    root: "packages/dms",
    reads: [
      "packages/dms/frontend-vue/package.json",
      "packages/dms/frontend-vue/dms.{frontend,server,email}.ts",
      "packages/dms/frontend-vue/layers/dms-core/types.d.ts",
      "packages/dms/frontend-vue/layers/dms-core/i18n/locales/**",
      "packages/dms/frontend-vue/layers/dms-layout/app/emails/**",
      "packages/dms/frontend-vue/server/private-options.ts",
      "packages/dms/frontend-vue/tests/fixtures/**",
      "packages/dms/playground/frontend-vue/package.json",
    ],
    dependsOn: ["interface-dms", "interface-dms-builder"],
  },
  {
    name: "frontend-vue",
    root: "packages/dms/frontend-vue",
    reads: [
      "packages/dms/package.json",
      "packages/dms/data/**",
      "packages/dms/checks/**",
      "packages/dms/playground/frontend-vue/**",
    ],
    dependsOn: ["interface-dms", "interface-dms-builder"],
  },
  {
    name: "playground",
    root: "packages/dms/playground",
    reads: [],
    dependsOn: ["interface-dms", "dms", "frontend-vue"],
  },
  {
    name: "agents",
    root: ".agents",
    reads: [".claude/**"],
    dependsOn: [
      "interface-dms",
      "interface-dms-builder",
      "dms",
      "frontend-vue",
    ],
  },
];

const DOCS = [
  "README.md",
  "docs/**",
  "docs-data/examples.json",
  "packages/*/README.md",
  "packages/*/docs/**",
  "packages/*/docs-data/examples.json",
];

/**
 * @param {string} path
 * @param {string[]} globs
 * @returns {boolean}
 */
const matchesAny = (path, globs) =>
  globs.some((glob) => matchesGlob(path, glob));

/**
 * @param {string} path
 * @returns {TestPackage | undefined}
 */
const owner = (path) =>
  PACKAGES.filter(({ root }) => path.startsWith(`${root}/`)).reduce(
    /** @param {TestPackage | undefined} longest */
    (longest, candidate) =>
      longest === undefined || candidate.root.length > longest.root.length
        ? candidate
        : longest,
    undefined,
  );

/**
 * The names of the packages whose tests a change can affect: the packages it
 * touches and, transitively, the packages that depend on them. A path no
 * package owns or reads is shared tooling and selects every package.
 *
 * @param {string[]} files Changed repository paths.
 * @returns {string[]} Package names, in table order.
 */
export const affectedPackages = (files) => {
  /** @type {Set<string>} */
  const selected = new Set();
  for (const file of files) {
    if (matchesAny(file, DOCS)) continue;
    const owning = owner(file);
    const reading = PACKAGES.filter(({ reads }) => matchesAny(file, reads));
    const touched = owning === undefined ? reading : [owning, ...reading];
    const names = touched.length === 0 ? PACKAGES : touched;
    for (const { name } of names) selected.add(name);
  }
  let size = -1;
  while (selected.size !== size) {
    size = selected.size;
    for (const { name, dependsOn } of PACKAGES) {
      if (dependsOn.some((dependency) => selected.has(dependency))) {
        selected.add(name);
      }
    }
  }
  return PACKAGES.map(({ name }) => name).filter((name) => selected.has(name));
};

/**
 * The packages whose tests a run should execute. The draft and none tiers run
 * none, the fast tier runs what its base commit's diff affects, and any other
 * value, or none, runs every package.
 *
 * @param {{ tier?: string, base?: string }} env
 * @param {(base: string) => string[]} changedFiles Called only for the fast tier with a base.
 * @returns {string[]}
 */
export const selectPackages = ({ tier, base }, changedFiles) => {
  if (tier === "draft" || tier === "none") return [];
  if (tier === "fast" && base !== undefined && base !== "") {
    return affectedPackages(changedFiles(base));
  }
  return PACKAGES.map(({ name }) => name);
};

/**
 * @param {string} base
 * @returns {string[]}
 */
const gitChangedFiles = (base) => {
  const diff = spawnSync(
    "git",
    ["diff", "--name-only", "--no-renames", base, "HEAD"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (diff.status !== 0) {
    process.stderr.write(diff.stderr || String(diff.error));
    process.exit(diff.status ?? 1);
  }
  return diff.stdout.split("\n").filter((line) => line !== "");
};

if (import.meta.main) {
  const selection = selectPackages(
    {
      tier: process.env["ANTELOPEJS_CI_TIER"],
      base: process.env["ANTELOPEJS_TEST_BASE"],
    },
    gitChangedFiles,
  );
  process.stdout.write(`${JSON.stringify(selection)}\n`);
}
