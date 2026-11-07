import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { basename, dirname, join, sep } from "node:path";

/**
 * @typedef {{ format: number, node: string, frontend: string, environment: string, env: string[], envFiles: string, sources: string, installed: string, outside: string }} BuildInputs Everything a frontend build reads, with the run's own values left out: the code of the dms-frontend that builds, the variables Vite bakes in, the project's `.env` files, the sources the workspace setup wrote, the versions its install resolved and the installs above the workspace a bare import can resolve from
 * @typedef {Pick<import("./run-state.mjs").RunState, "environment" | "extraEnv" | "webUrl" | "bakedEnv">} KeyedRun The fields of a run its build inputs depend on
 * @typedef {{ project: string, workspace: string, names: string[], installed: string }} PreparedWorkspace A workspace set up for a build: the project it was set up from, its folder, the entries the setup wrote there (see {@link sourceNames}) and the workspace whose install the build uses
 * @typedef {ReadonlyMap<string, (content: Buffer) => Buffer>} Rewrites What a file is keyed as instead of its content, by path
 * @typedef {{ rewrites: Rewrites, skipped: ReadonlySet<string> }} Walk How a folder is keyed: what its files are keyed as (see {@link Rewrites}) and the entry names left out at every depth
 */

const FORMAT = 5;
const BAKED_VARIABLE = /^(?:VITE_|NODE_ENV$)/u;
const MODULES_FOLDER = "node_modules";
const VIRTUAL_STORE = ".pnpm";
const LOCKFILE = "pnpm-lock.yaml";
const INSTALL_MARK = ".deps-hash";
const ENV_FILES = [".env.local", ".env"];
const FRONTEND_CODE = ["package.json", "dist", "templates"];
const RUN_VALUE_FILES = [
  "dms-main.css",
  "frontend-modules.generated.ts",
  "generated-frontend-modules.json",
];
const ESCAPE = "%";
const MODULES_RECORD = join(MODULES_FOLDER, ".modules.yaml");
const INSTALL_RECORDS = [
  LOCKFILE,
  join(MODULES_FOLDER, VIRTUAL_STORE, "lock.yaml"),
  MODULES_RECORD,
];
const LAYOUT_FIELDS = new Set([
  "hoistPattern",
  "hoistedDependencies",
  "hoistedLocations",
  "included",
  "injectedDeps",
  "layoutVersion",
  "nodeLinker",
  "publicHoistPattern",
  "skipped",
  "virtualStoreDir",
  "virtualStoreDirMaxLength",
]);
const TOP_LEVEL_FIELD = /^[^\s-]/u;

/** The folder `ajs dms build` builds in, in the project. */
export const WORKSPACE_FOLDER = ".dms-frontend";

/** @type {Walk} */
const SOURCES = { rewrites: new Map(), skipped: new Set([MODULES_FOLDER]) };
/** @type {Walk} */
const COPIED_PACKAGE = { rewrites: new Map(), skipped: new Set() };
/** @type {Walk} */
const LINKED_PACKAGE = {
  rewrites: new Map(),
  skipped: new Set([MODULES_FOLDER, ".git", ".antelope", WORKSPACE_FOLDER]),
};

/**
 * @param {string} text
 * @returns {string}
 */
function escaped(text) {
  return text.replaceAll(ESCAPE, `${ESCAPE}25`);
}

/**
 * Replaces the run's web URL, where a file holds it as a whole
 * double-quoted value, and the workspace folder, where a file holds it or a
 * path under it as one, with placeholders. `%` is escaped first, so no text
 * of the file reads as a placeholder.
 *
 * @param {string} webUrl The run's web URL
 * @param {string[]} folders The workspace folder, as given and resolved
 * @returns {(content: Buffer) => Buffer} The rewrite
 */
function leavingOutRunValues(webUrl, folders) {
  /** @type {Array<[string, string]>} */
  const values = [
    [JSON.stringify(webUrl), `"${ESCAPE}W"`],
    ...folders.flatMap((folder) => {
      const quoted = JSON.stringify(folder);
      /** @type {Array<[string, string]>} */
      const forms = [
        [quoted, `"${ESCAPE}P"`],
        [`${quoted.slice(0, -1)}/`, `"${ESCAPE}P/`],
      ];
      return forms;
    }),
  ];
  const pairs = values.map(([from, to]) => [
    escaped(Buffer.from(from).toString("latin1")),
    to,
  ]);
  return (content) => {
    let text = escaped(content.toString("latin1"));
    for (const [from, to] of pairs) text = text.replaceAll(from, to);
    return Buffer.from(text, "latin1");
  };
}

/**
 * @param {import("node:crypto").Hash} hash
 * @param {string} path
 * @param {Walk} walk
 */
function hashEntry(hash, path, walk) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) {
    hash.update("missing\0");
  } else if (stat.isSymbolicLink()) {
    const link = Buffer.from(readlinkSync(path));
    hash.update(`link ${link.length}\0`).update(link);
  } else if (stat.isDirectory()) {
    hash.update("folder\0");
    hashNames(hash, path, readdirSync(path), walk);
    hash.update("end\0");
  } else {
    const read = readFileSync(path);
    const content = walk.rewrites.get(path)?.(read) ?? read;
    hash.update(`file ${content.length}\0`).update(content);
  }
}

/**
 * @param {import("node:crypto").Hash} hash
 * @param {string} folder
 * @param {string[]} names
 * @param {Walk} walk
 */
function hashNames(hash, folder, names, walk) {
  for (const name of [...names].sort()) {
    if (walk.skipped.has(name)) continue;
    hash.update(`${name}\0`);
    hashEntry(hash, join(folder, name), walk);
  }
}

/**
 * @param {string} folder
 * @param {string[]} names
 * @param {Walk} [walk]
 * @returns {string}
 */
function hashFolder(folder, names, walk = SOURCES) {
  const hash = createHash("sha256");
  hashNames(hash, folder, names, walk);
  return hash.digest("hex");
}

/**
 * Keys an entry at the top of a `node_modules` above the workspace, or in a
 * scope folder there. A scope folder is keyed entry by entry. A link is keyed
 * by its target, and, when the target is not a package of pnpm's virtual
 * store (a `link:` or `workspace:` package), by the content hash of the
 * folder it resolves to, its installs left out, read once however many links
 * reach it. A package copied in is keyed by its files, its own
 * `node_modules` included.
 *
 * @param {import("node:crypto").Hash} hash
 * @param {string} path The entry
 * @param {Map<string, string>} linked The content hash of each linked folder read so far, by its real path
 */
function hashInstalled(hash, path, linked) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat?.isDirectory() && basename(path).startsWith("@")) {
    hash.update("scope\0");
    for (const name of readdirSync(path).sort()) {
      hash.update(`${name}\0`);
      hashInstalled(hash, join(path, name), linked);
    }
    hash.update("end\0");
    return;
  }
  hashEntry(hash, path, COPIED_PACKAGE);
  if (!stat?.isSymbolicLink() || !existsSync(path)) return;
  const target = realpathSync(path);
  if (target.split(sep).includes(VIRTUAL_STORE)) return;
  let digest = linked.get(target);
  if (digest === undefined) {
    const content = createHash("sha256");
    hashEntry(content, target, LINKED_PACKAGE);
    digest = content.digest("hex");
    linked.set(target, digest);
  }
  hash.update(`linked ${digest}\0`);
}

/**
 * @param {string} folder
 * @returns {string[]}
 */
function upFrom(folder) {
  const folders = [folder];
  let current = folder;
  while (dirname(current) !== current) {
    current = dirname(current);
    folders.push(current);
  }
  return folders;
}

/**
 * @param {string} path
 * @returns {string}
 */
function installRecord(path) {
  const content = readFileSync(path, "utf8");
  if (!path.endsWith(MODULES_RECORD)) return content;
  let layout = false;
  return content
    .split("\n")
    .filter((line) => {
      if (TOP_LEVEL_FIELD.test(line)) {
        layout = LAYOUT_FIELDS.has(line.slice(0, line.indexOf(":")));
      }
      return layout;
    })
    .join("\n");
}

/**
 * What the `node_modules` folders above a workspace hold, which its build
 * resolves a bare import from when the workspace's own install lacks it.
 * For each, nearest first: its top-level packages (see `hashInstalled`, dot
 * entries such as `.cache` left out), then the pnpm install records
 * (`pnpm-lock.yaml`, `node_modules/.pnpm/lock.yaml`, and the fields of
 * `node_modules/.modules.yaml` that describe what pnpm linked where, not how
 * or when it last installed) of the folder it resolves to and of every
 * folder above that.
 *
 * @param {string} workspace The workspace
 * @returns {string} A sha256, in hex
 */
function hashOutsideInstalls(workspace) {
  const hash = createHash("sha256");
  /** @type {Map<string, string>} */
  const records = new Map();
  /** @type {Map<string, string>} */
  const linked = new Map();
  for (const folder of upFrom(dirname(workspace))) {
    const modules = join(folder, MODULES_FOLDER);
    if (!existsSync(modules)) continue;
    hash.update("modules\0");
    for (const name of readdirSync(modules).sort()) {
      if (name.startsWith(".")) continue;
      hash.update(`${name}\0`);
      hashInstalled(hash, join(modules, name), linked);
    }
    hash.update("end\0");
    for (const owner of upFrom(dirname(realpathSync(modules)))) {
      for (const name of INSTALL_RECORDS) {
        const record = join(owner, name);
        if (existsSync(record)) records.set(record, name);
      }
    }
  }
  for (const [record, name] of records) {
    const content = installRecord(record);
    hash.update(`${name} ${Buffer.byteLength(content)}\0`).update(content);
  }
  return hash.digest("hex");
}

/**
 * The entries of a workspace other than its installed modules. Read right
 * after its setup, they are the sources the setup wrote; a build adds its
 * output beside them.
 *
 * @param {string} workspace The workspace
 * @returns {string[]} The entries, sorted
 */
export function sourceNames(workspace) {
  return readdirSync(workspace)
    .filter((name) => name !== MODULES_FOLDER)
    .sort();
}

/**
 * The variables of an environment that Vite bakes into a build: `VITE_*`
 * and `NODE_ENV`.
 *
 * @param {NodeJS.ProcessEnv} env The environment
 * @returns {Record<string, string>} The variables, by name
 */
export function bakedVariables(env) {
  /** @type {Array<[string, string]>} */
  const baked = Object.entries(env).flatMap(([name, value]) =>
    value !== undefined && BAKED_VARIABLE.test(name) ? [[name, value]] : [],
  );
  return Object.fromEntries(baked);
}

/**
 * What a frontend build reads, with the run's own values left out: the
 * sources the workspace setup wrote (the templates, each module's copied
 * frontend and what the setup generated from the project's configuration),
 * the versions the install resolved (`pnpm-lock.yaml`), the installs above
 * the workspace (see `hashOutsideInstalls`), the project's `.env.local` and
 * `.env`, the code of the dms-frontend that builds, the Node version, the
 * environment, the `--env` pairs and the `VITE_*` and `NODE_ENV` variables
 * the run recorded (`bakedEnv`). The files the setup writes the workspace's
 * folder and the run's web URL into (the module registries and the CSS
 * entry) are keyed with those values replaced, since `ajs dms start` serves
 * the run's own in their place; every other source is keyed as it is.
 *
 * @param {KeyedRun} run The run
 * @param {string} frontendPackage The `@antelopejs/dms-frontend` folder that builds
 * @param {PreparedWorkspace} prepared The workspace, right after its setup
 * @returns {BuildInputs} The inputs
 */
export function buildInputs(run, frontendPackage, prepared) {
  const { project, workspace, names, installed } = prepared;
  const rewrite = leavingOutRunValues(run.webUrl, [
    realpathSync(workspace),
    workspace,
  ]);
  return {
    format: FORMAT,
    node: process.version,
    frontend: hashFolder(realpathSync(frontendPackage), FRONTEND_CODE),
    environment: run.environment,
    env: [
      ...Object.entries(run.bakedEnv ?? {}),
      ...Object.entries(run.extraEnv).map(([name, value]) => [
        `--env ${name}`,
        value,
      ]),
    ]
      .map(([name, value]) => `${name}=${value}`)
      .sort(),
    envFiles: hashFolder(project, ENV_FILES),
    sources: hashFolder(
      workspace,
      names.filter((name) => name !== LOCKFILE && name !== INSTALL_MARK),
      {
        ...SOURCES,
        rewrites: new Map(
          RUN_VALUE_FILES.map((name) => [join(workspace, name), rewrite]),
        ),
      },
    ),
    installed: hashFolder(installed, [LOCKFILE]),
    outside: hashOutsideInstalls(workspace),
  };
}

/**
 * The cache key of a build's inputs.
 *
 * @param {BuildInputs} inputs The inputs
 * @returns {string} A sha256, in hex
 */
export function buildKey(inputs) {
  return createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
}
