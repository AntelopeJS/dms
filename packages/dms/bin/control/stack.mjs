import { randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { checkoutOf } from "./git.mjs";
import { dropRunDatabases, startMongod } from "./mongo.mjs";
import {
  freePort,
  isAlive,
  runToEnd,
  startDetached,
  stopAll,
  waitForOk,
  waitForPort,
} from "./processes.mjs";
import {
  createRunFolders,
  databaseName,
  newRunId,
  runsRoot,
  saveRun,
} from "./run-state.mjs";
import { newPassword } from "./session.mjs";

const READY_TIMEOUT_MS = 180_000;
const SECRET_BYTES = 32;
const COPY_SKIPPED = new Set(["node_modules", ".antelope", ".dms-frontend"]);
const SHADOW_SKIPPED = new Set([".antelope", ".dms-frontend", ".git"]);
const SECRET_NAMES = [
  "DMS_JWT_SECRET",
  "AUTH_JWT_SECRET",
  "DMS_BOOTSTRAP_SECRET",
  "DMS_HTML_RENDER_SECRET",
  "DMS_SESSION_SECRET",
];
const DROPPED_PREFIXES = ["ANTELOPEJS_", "npm_", "PNPM_", "DMS_", "MONGO_"];

/** This package's root, which resolves dms-control's own dependencies. */
export const PACKAGE_ROOT = resolve(import.meta.dirname, "..", "..");

/** The dms-control entry, which also serves the mail sink and the browser. */
export const CONTROL_BIN = join(PACKAGE_ROOT, "bin", "dms-control.mjs");

/** The AntelopeJS environment every run builds and starts. */
export const ENVIRONMENT = "docs";

/**
 * The folders the project's dependencies resolve from: the playground, the
 * module it belongs to, then this package.
 *
 * @param {{ playground: string, moduleRoot: string }} state The run
 * @returns {string[]} The folders, in order
 */
export function resolutionFolders(state) {
  return [state.playground, state.moduleRoot, PACKAGE_ROOT];
}

/**
 * The `ajs` and `ajs dms` entry points the playground installs.
 *
 * @param {string} playground The playground folder
 * @returns {{ ajs: string, dms: string }} Their scripts
 */
export function cliPaths(playground) {
  const require = createRequire(join(playground, "package.json"));
  const core = dirname(require.resolve("@antelopejs/core/package.json"));
  const frontend = dirname(
    require.resolve("@antelopejs/dms-frontend/package.json"),
  );
  return {
    ajs: join(core, "dist", "core", "cli", "index.js"),
    dms: join(frontend, "dist", "index.js"),
  };
}

function shadowLevel(real, shadow, keep) {
  mkdirSync(shadow, { recursive: true });
  for (const entry of readdirSync(real)) {
    if (entry === keep || SHADOW_SKIPPED.has(entry)) continue;
    symlinkSync(join(real, entry), join(shadow, entry));
  }
}

/**
 * Lays out the run's copy of the checkout: from the checkout root down to
 * the playground, every sibling is linked, so relative paths such as a
 * tsconfig `extends` resolve as in the checkout. The playground itself is
 * copied without its installed modules and build, so `.antelope/` and the
 * frontend build belong to the run.
 *
 * @param {string} playground The playground folder
 * @param {string} checkout The checkout root, or the module folder outside one
 * @param {string} root The run's copy of the checkout
 * @returns {string} The run's playground folder
 */
export function layOutCopy(playground, checkout, root) {
  const segments = relative(checkout, playground).split(sep);
  let real = checkout;
  let shadow = root;
  for (const segment of segments) {
    shadowLevel(real, shadow, segment);
    real = join(real, segment);
    shadow = join(shadow, segment);
  }
  cpSync(playground, shadow, {
    recursive: true,
    filter: (source) => !COPY_SKIPPED.has(basename(source)),
  });
  symlinkSync(join(playground, "node_modules"), join(shadow, "node_modules"));
  return shadow;
}

function inheritedEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !DROPPED_PREFIXES.some((prefix) => key.startsWith(prefix)),
    ),
  );
}

/**
 * The environment of every process a run starts: its own HOME, ports,
 * database, origin and secrets, an npm cache and a pnpm store shared by
 * every run, no update checks and no colors. Extra `KEY=VALUE` pairs from `--env` come last.
 *
 * @param {Record<string, any>} state The run
 * @returns {NodeJS.ProcessEnv} The environment
 */
export function runEnv(state) {
  const cacheHome = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return {
    ...inheritedEnv(),
    HOME: state.home,
    USERPROFILE: state.home,
    CI: "1",
    NO_COLOR: "1",
    AJS_NO_UPDATE_CHECK: "1",
    NO_UPDATE_NOTIFIER: "1",
    COREPACK_HOME:
      process.env.COREPACK_HOME ?? join(cacheHome, "node", "corepack"),
    npm_config_cache: join(cacheHome, "dms-control", "npm"),
    npm_config_store_dir: join(cacheHome, "dms-control", "pnpm-store"),
    PORT: String(state.apiPort),
    DMS_CLIENT_BASE_URL: state.webUrl,
    DMS_API_BASE_URL: state.apiUrl,
    DMS_PREBUILT: "1",
    DMS_SMTP_PORT: String(state.smtpPort),
    MONGO_URL: state.mongoUrl,
    MONGO_DATABASE: state.database,
    ...state.secrets,
    ...state.extraEnv,
  };
}

function parseExtraEnv(pairs) {
  return Object.fromEntries(
    pairs.map((pair) => {
      const index = pair.indexOf("=");
      if (index <= 0) throw new Error(`--env expects KEY=VALUE, got ${pair}`);
      return [pair.slice(0, index), pair.slice(index + 1)];
    }),
  );
}

async function initialState(options) {
  const playground = resolve(options.playground);
  if (!existsSync(join(playground, "antelope.config.ts"))) {
    throw new Error(`${playground} has no antelope.config.ts`);
  }
  const id = newRunId();
  const paths = createRunFolders(join(runsRoot(options.runs), id));
  const apiPort = await freePort();
  const webPort = await freePort();
  const smtpPort = await freePort();
  const checkout = checkoutOf(playground);
  return {
    ...paths,
    id,
    createdAt: new Date().toISOString(),
    environment: ENVIRONMENT,
    playground,
    moduleRoot: dirname(playground),
    repo: checkout.root,
    headSha: checkout.head,
    baseRef: options.base ?? "origin/main",
    skill: options.skill ?? null,
    apiPort,
    webPort,
    smtpPort,
    mail: join(paths.evidence, "mail"),
    apiUrl: `http://127.0.0.1:${apiPort}`,
    webUrl: `http://127.0.0.1:${webPort}`,
    databasePrefix: databaseName(id),
    database: databaseName(id),
    mongoUrl: options.mongoUrl ?? "",
    ownsMongo: !options.mongoUrl,
    secrets: Object.fromEntries(
      SECRET_NAMES.map((name) => [
        name,
        randomBytes(SECRET_BYTES).toString("hex"),
      ]),
    ),
    adminPassword: newPassword(),
    extraEnv: parseExtraEnv(options.env ?? []),
    processes: [],
    accounts: {},
    tokens: {},
    ready: false,
  };
}

/**
 * How to run one of the playground's CLIs for the run: its own log, the
 * run's environment, from the run's playground copy or `cwd`.
 *
 * @param {Record<string, any>} state The run
 * @param {string} name The log name
 * @param {string} script The CLI script
 * @param {string[]} args Its arguments
 * @param {string} [cwd] Where to run it
 * @returns {{ name: string, program: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, logs: string }} The process spec
 */
export function spec(state, name, script, args, cwd = state.runPlayground) {
  return {
    name,
    program: process.execPath,
    args: [script, ...args],
    cwd,
    env: runEnv(state),
    logs: state.logs,
  };
}

function record(state, processRecord) {
  state.processes = [
    ...state.processes.filter((entry) => entry.name !== processRecord.name),
    processRecord,
  ];
  saveRun(state);
}

/**
 * Starts the run's mail sink unless it already runs.
 *
 * @param {Record<string, any>} state The run
 * @returns {Promise<void>} Resolves once it listens
 */
export async function ensureMail(state) {
  const running = state.processes.find((entry) => entry.name === "mail");
  if (running && isAlive(running.pid)) return;
  const mail = startDetached({
    name: "mail",
    program: process.execPath,
    args: [CONTROL_BIN, "serve-mail", state.dir],
    cwd: state.dir,
    env: process.env,
    logs: state.logs,
  });
  record(state, { ...mail, port: state.smtpPort });
  await waitForPort(state.smtpPort, mail, READY_TIMEOUT_MS);
}

async function startBackend(state, build) {
  const { ajs } = cliPaths(build?.playground ?? state.playground);
  const backend = startDetached(
    spec(
      state,
      "backend",
      ajs,
      ["project", "start", "-e", ENVIRONMENT, "--refresh-config"],
      build?.cwd,
    ),
  );
  record(state, { ...backend, port: state.apiPort });
  await waitForOk(
    `${state.apiUrl}/api/onboarding/informations`,
    backend,
    READY_TIMEOUT_MS,
  );
}

async function buildAndStart(state) {
  const clis = cliPaths(state.playground);
  state.runPlayground = layOutCopy(
    state.playground,
    state.repo ?? state.moduleRoot,
    state.root,
  );
  if (state.ownsMongo) {
    const mongo = await startMongod(state, resolutionFolders(state));
    state.mongoUrl = mongo.url;
    record(state, mongo.record);
  }
  await ensureMail(state);
  await runToEnd(
    spec(state, "project-build", clis.ajs, [
      "project",
      "build",
      "-e",
      ENVIRONMENT,
    ]),
  );
  await runToEnd(
    spec(state, "frontend-build", clis.dms, ["build", "-e", ENVIRONMENT]),
  );
  await startBackend(state);
  const frontend = startDetached(
    spec(state, "frontend", clis.dms, [
      "start",
      "-e",
      ENVIRONMENT,
      "-b",
      state.apiUrl,
      "-p",
      String(state.webPort),
    ]),
  );
  record(state, { ...frontend, port: state.webPort });
  await waitForOk(`${state.webUrl}/dms-preview`, frontend, READY_TIMEOUT_MS);
}

/**
 * Starts an isolated DMS from a playground: a copy of it in a run folder,
 * free ports, the `docs` environment, a `verify_<run>` database on a mongod
 * the run owns (or `--mongo-url`), fresh secrets and a mail sink. Ready once
 * `/api/onboarding/informations` and `/dms-preview` answer 200. On failure
 * it stops what it started and keeps the logs.
 *
 * @param {{ playground: string, runs?: string, mongoUrl?: string, env?: string[], base?: string, skill?: string }} options Where the playground and the runs are
 * @returns {Promise<Record<string, any>>} The ready run
 */
export async function up(options) {
  const state = await initialState(options);
  saveRun(state);
  try {
    await buildAndStart(state);
  } catch (error) {
    state.error = String(error?.message ?? error);
    saveRun(state);
    await stopAll(state.processes.map((entry) => entry.pid));
    throw error;
  }
  state.ready = true;
  saveRun(state);
  return state;
}

/**
 * Stops the backend and starts it again on `state.database`, as a deploy or
 * a crash would, from the run's build or another one (`build`, the base
 * version's). The frontend keeps serving and proxies to the same port.
 *
 * @param {Record<string, any>} state The run
 * @param {{ playground: string, cwd: string }} [build] Another build to start
 * @returns {Promise<void>} Resolves once the backend answers again
 */
export async function restartBackend(state, build) {
  const backend = state.processes.find((entry) => entry.name === "backend");
  if (backend) await stopAll([backend.pid]);
  await startBackend(state, build);
}

/**
 * Restarts the backend on another database of the run, so a journey starts
 * from an empty one: not onboarded, no user, no session.
 *
 * @param {Record<string, any>} state The run
 * @param {string} suffix What tells the database apart, such as `j03`
 * @returns {Promise<string>} The database now in use
 */
export async function freshDatabase(state, suffix) {
  state.database = `${state.databasePrefix}_${suffix}`;
  state.tokens = {};
  state.accounts = {};
  saveRun(state);
  await restartBackend(state);
  return state.database;
}

/**
 * Stops every process the run recorded and their descendants, drops the
 * run's databases, and removes everything but `evidence/`, `logs/` and
 * `run.json`, from which the secrets and passwords are removed.
 *
 * @param {Record<string, any>} state The run
 * @returns {Promise<string[]>} One line per action
 */
export async function down(state) {
  const browser = state.browser ? [state.browser.pid] : [];
  const app = state.processes
    .filter((entry) => entry.name !== "mongod")
    .map((entry) => entry.pid);
  const lines = await stopAll([...app, ...browser]);
  const mongod = state.processes.find((entry) => entry.name === "mongod");
  if (mongod && !isAlive(mongod.pid)) {
    lines.push(`mongod already stopped; its data goes with ${state.mongo}`);
  } else if (state.mongoUrl) {
    const dropped = await dropRunDatabases(
      state.mongoUrl,
      state.databasePrefix,
      resolutionFolders(state),
    ).catch((error) => [
      `could not drop the run's databases: ${error.message}`,
    ]);
    lines.push(...dropped);
  }
  lines.push(...(await stopAll(state.processes.map((entry) => entry.pid))));
  for (const folder of [
    state.root,
    state.home,
    state.mongo,
    state.baseRoot,
    state.cache,
  ]) {
    if (folder && existsSync(folder)) {
      rmSync(folder, { recursive: true, force: true });
      lines.push(`removed ${folder}`);
    }
  }
  Object.assign(state, {
    processes: [],
    browser: undefined,
    secrets: {},
    adminPassword: "",
    tokens: {},
    accounts: Object.fromEntries(
      Object.entries(state.accounts ?? {}).map(([name, account]) => [
        name,
        { email: account.email },
      ]),
    ),
    ready: false,
    stoppedAt: new Date().toISOString(),
  });
  saveRun(state);
  return lines;
}

/**
 * The version a package.json declares, or `missing`.
 *
 * @param {string} file The package.json
 * @returns {string} The version
 */
export function packageVersion(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8")).version ?? "missing";
  } catch {
    return "missing";
  }
}
