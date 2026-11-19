import { spawnSync } from "node:child_process";
import { matchesGlob } from "node:path/posix";
import { formal } from "./formal-checks.ts";

/** @typedef {{ name: string, root: string, reads: string[], dependsOn: string[] }} TestPackage */

/**
 * The workspace's test packages, in the order the selection lists them.
 *
 * `root` owns a path by its longest matching prefix, so a package nested in
 * another owns its own files. `reads` lists the paths outside `root` that the
 * package's tests or checks read, documentation included, and `dependsOn`
 * lists the packages whose change can break it. When a test starts reading a
 * new path, add the path here.
 *
 * - `dms` reads frontend-vue through the package-contents test (which packs
 *   with the layer's ignore files), the shared fixtures, the locales, the
 *   e-mail templates, the layer manifests and `scripts/backend-checks.cjs`, and
 *   the docs examples through the mockup compile test.
 * - `frontend-vue` reads `packages/dms/data`, `packages/dms/checks`,
 *   `packages/dms/package.json` and the playground layer.
 * - `e2e` is the Playwright suite and its journeys, which drive the
 *   playground.
 * - `agents` holds the TLA+ formal models, which cover code in every package.
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
      "packages/dms/frontend-vue/**/.{gitignore,npmignore}",
      "packages/dms/playground/frontend-vue/package.json",
      "packages/dms/docs-data/examples.json",
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
    name: "e2e",
    root: "e2e",
    reads: [],
    dependsOn: [
      "interface-dms",
      "interface-dms-builder",
      "dms",
      "frontend-vue",
      "playground",
    ],
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
  "packages/*/docs/**/.*",
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
 * touches and, transitively, the packages that depend on them. A documentation
 * path selects only the packages that read it. Any other path no package owns
 * or reads is shared tooling and selects every package.
 *
 * @param {string[]} files Changed repository paths.
 * @returns {string[]} Package names, in table order.
 */
export const affectedPackages = (files) => {
  /** @type {Set<string>} */
  const selected = new Set();
  for (const file of files) {
    const reading = PACKAGES.filter(({ reads }) => matchesAny(file, reads));
    const docs = matchesAny(file, DOCS);
    const owning = docs ? undefined : owner(file);
    const touched = owning === undefined ? reading : [owning, ...reading];
    const names = touched.length === 0 && !docs ? PACKAGES : touched;
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
 * The paths that differ between a base commit and HEAD. Exits the process when
 * git fails.
 *
 * @param {string} base
 * @returns {string[]}
 */
export const gitChangedFiles = (base) => {
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

/**
 * @typedef {{ name: string, covers: string[], files: string[] }} FormalCheck
 */

/**
 * Where a formal check runs, by the folder of its own files. The first rule a
 * file matches decides, and a check none of whose files match runs in the
 * `formal` job. The builder suite already runs the checks under
 * `packages/dms/src/test/unit/`, so they get no job of their own.
 *
 * @type {{ prefix: string, job: "formal-generated" | null }[]}
 */
const FORMAL_JOB_RULES = [
  { prefix: "packages/dms/src/test/formal/", job: "formal-generated" },
  { prefix: "packages/dms/src/test/unit/", job: null },
];

/**
 * The job that runs a formal check, or `null` when another job already does.
 *
 * @param {FormalCheck} check
 * @returns {"formal" | "formal-generated" | null}
 */
export const formalJob = ({ files }) => {
  for (const { prefix, job } of FORMAL_JOB_RULES) {
    if (files.some((file) => file.startsWith(prefix))) return job;
  }
  return "formal";
};

/**
 * The formal checks a run executes, split by the job that runs them. The draft
 * and none tiers run none. With a base, only the checks whose `covers` or
 * `files` the diff against it touches run. Without one, every check runs.
 *
 * @param {{ tier?: string, base?: string }} env
 * @param {FormalCheck[]} checks
 * @param {(base: string) => string[]} changedFiles Called only with a base.
 * @returns {{ formal: string[], formalGenerated: string[] }}
 */
export const selectFormal = ({ tier, base }, checks, changedFiles) => {
  /** @type {string[]} */
  const formal = [];
  /** @type {string[]} */
  const formalGenerated = [];
  if (tier === "draft" || tier === "none") return { formal, formalGenerated };
  const changed =
    base === undefined || base === "" ? undefined : changedFiles(base);
  for (const check of checks) {
    const touched =
      changed === undefined ||
      changed.some(
        (file) =>
          check.covers.includes(file) ||
          check.files.some((glob) => matchesGlob(file, glob)),
      );
    if (!touched) continue;
    const job = formalJob(check);
    if (job === "formal") formal.push(check.name);
    else if (job === "formal-generated") formalGenerated.push(check.name);
  }
  return { formal, formalGenerated };
};

/**
 * @typedef {{
 *   tier: string | undefined,
 *   packages: Set<string>,
 *   formal: string[],
 *   formalGenerated: string[],
 * }} Plan
 */

/**
 * Every job of `ci.yml` that the run can need, with the rule that decides it.
 * The `if:` of each job and the gate read the list this table produces.
 *
 * @type {{ job: string, when: (plan: Plan) => boolean }[]}
 */
const JOB_RULES = [
  { job: "backend", when: ({ packages }) => packages.has("dms") },
  {
    job: "frontend-test",
    when: ({ packages }) => packages.has("frontend-vue"),
  },
  {
    job: "frontend-verify",
    when: ({ packages }) => packages.has("frontend-vue"),
  },
  { job: "e2e", when: ({ packages }) => packages.has("e2e") },
  {
    job: "docs-playground",
    when: ({ tier }) => tier === "queue" || tier === "nightly",
  },
  {
    job: "dependents",
    when: ({ tier }) => tier === "nightly",
  },
  { job: "formal", when: ({ formal }) => formal.length > 0 },
  {
    job: "formal-generated",
    when: ({ formalGenerated }) => formalGenerated.length > 0,
  },
];

/**
 * The `ci.yml` job ids a run needs.
 *
 * @param {Plan} plan
 * @returns {string[]}
 */
export const requiredJobs = (plan) =>
  JOB_RULES.filter(({ when }) => when(plan)).map(({ job }) => job);

/** How many jobs share the builder suite, balanced by `scripts/test-weights.json`. */
const BUILDER_SHARDS = 4;

/**
 * The suites of the `backend` job's matrix: `unit`, `integration` and one
 * `builder:<index>/<count>` per builder shard.
 *
 * @type {string[]}
 */
const BACKEND_SUITES = [
  "unit",
  "integration",
  ...Array.from(
    { length: BUILDER_SHARDS },
    (_, index) => `builder:${index + 1}/${BUILDER_SHARDS}`,
  ),
];

/**
 * What a run executes: the selected packages, the formal checks of each formal
 * job, the `ci.yml` jobs those need and the backend suites. The keys are the
 * select step's outputs.
 *
 * @param {{ tier?: string, base?: string }} env
 * @param {FormalCheck[]} checks
 * @param {(base: string) => string[]} changedFiles
 * @returns {{ packages: string[], formal: string[], "formal-generated": string[], jobs: string[], "backend-suites": string[] }}
 */
export const planRun = (env, checks, changedFiles) => {
  const packages = selectPackages(env, changedFiles);
  const { formal, formalGenerated } = selectFormal(env, checks, changedFiles);
  const jobs = requiredJobs({
    tier: env.tier,
    packages: new Set(packages),
    formal,
    formalGenerated,
  });
  return {
    packages,
    formal,
    "formal-generated": formalGenerated,
    jobs,
    "backend-suites": BACKEND_SUITES,
  };
};

/**
 * The formal checks `checks/formal-checks.ts` lists.
 *
 * @returns {Promise<FormalCheck[]>}
 */
export const loadFormalChecks = async () =>
  formal.map(({ name, covers, files }) => ({ name, covers, files }));

if (import.meta.main) {
  const run = planRun(
    {
      tier: process.env["ANTELOPEJS_CI_TIER"],
      base: process.env["ANTELOPEJS_TEST_BASE"],
    },
    await loadFormalChecks(),
    gitChangedFiles,
  );
  for (const [key, value] of Object.entries(run)) {
    process.stdout.write(`${key}=${JSON.stringify(value)}\n`);
  }
}
