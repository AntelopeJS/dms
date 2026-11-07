import { randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { existingBuildRoots } from "./build-inputs.mjs";
import { describeFailure } from "./failure.mjs";
import { checkoutOf } from "./git.mjs";
import { apiTargetFile, writeTarget } from "./forwarder.mjs";
import { currentNamespaces, isSameProcess } from "./identity.mjs";
import { dropRunDatabases, startMongod } from "./mongo.mjs";
import {
  freePort,
  runToEnd,
  startDetached,
  stopRecorded,
  waitForOk,
  waitForOwnPort,
} from "./processes.mjs";
import {
  backendsFolder,
  createRunFolders,
  databaseName,
  forgetBackend,
  newRunId,
  recordBackend,
  recordedBackends,
  runsRoot,
  saveRun,
} from "./run-state.mjs";
import { RENDERER_CLI, resolveRenderer } from "./renderer.mjs";
import { newPassword } from "./session.mjs";
import { appendTiming, recordTiming, stopwatch, timed } from "./timing.mjs";

/**
 * @typedef {import("./run-state.mjs").RunState} RunState
 * @typedef {{ playground: string, renderer?: string, runs?: string, mongoUrl?: string, env?: string[], base?: string, skill?: string, prepared?: import("./timing.mjs").TimingEntry[], noStandby?: boolean }} UpOptions Where the playground and the runs are, the `prepare` entries to record once the run exists, and whether fresh databases start their backend on the spot
 */

const READY_TIMEOUT_MS = 180_000;
const SECRET_BYTES = 32;
const MAIL_PORT_ATTEMPTS = 3;
const COPY_SKIPPED = new Set(["node_modules", ".antelope", ".dms-frontend"]);
const SHADOW_SKIPPED = new Set([".antelope", ".dms-frontend", ".git"]);
const SECRET_NAMES = [
  "DMS_JWT_SECRET",
  "AUTH_JWT_SECRET",
  "DMS_BOOTSTRAP_SECRET",
  "DMS_HTML_RENDER_SECRET",
  "DMS_SESSION_SECRET",
  "DMS_SETUP_TOKEN",
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
 * The `ajs` and `ajs dms` entry points the playground installs, `ajs dms`
 * being the renderer checkout's when the run serves one.
 *
 * @param {string} playground The playground folder
 * @param {string} [renderer] The renderer checkout the run serves
 * @returns {{ ajs: string, dms: string }} Their scripts
 */
export function cliPaths(playground, renderer) {
  const require = createRequire(join(playground, "package.json"));
  const core = dirname(require.resolve("@antelopejs/core/package.json"));
  const frontend =
    renderer ??
    dirname(require.resolve("@antelopejs/dms-frontend/package.json"));
  return {
    ajs: join(core, "dist", "core", "cli", "index.js"),
    dms: join(frontend, RENDERER_CLI),
  };
}

/**
 * @param {string} real
 * @param {string} shadow
 * @param {string} keep
 */
function shadowLevel(real, shadow, keep) {
  mkdirSync(shadow, { recursive: true });
  for (const entry of readdirSync(real)) {
    if (entry === keep || SHADOW_SKIPPED.has(entry)) continue;
    symlinkSync(join(real, entry), join(shadow, entry));
  }
}

/**
 * A `node_modules` that is `modules` with `@antelopejs/dms-frontend` replaced
 * by the renderer checkout, every other entry linked to the original.
 *
 * @param {string} modules The playground's installed modules
 * @param {string} shadow The run's `node_modules`
 * @param {string} renderer The renderer checkout
 */
export function linkRenderer(modules, shadow, renderer) {
  const scope = "@antelopejs";
  shadowLevel(modules, shadow, scope);
  const scoped = join(modules, scope);
  const shadowScope = join(shadow, scope);
  if (existsSync(scoped)) shadowLevel(scoped, shadowScope, "dms-frontend");
  else mkdirSync(shadowScope);
  symlinkSync(renderer, join(shadowScope, "dms-frontend"));
}

/**
 * Lays out the run's copy of the checkout: from the checkout root down to
 * the playground, every sibling is linked, so relative paths such as a
 * tsconfig `extends` resolve as in the checkout. The playground itself is
 * copied without its installed modules and build, so `.antelope/` and the
 * frontend build belong to the run. Its `node_modules` is the playground's,
 * except that `@antelopejs/dms-frontend` is the `renderer` checkout when
 * there is one.
 *
 * @param {string} playground The playground folder
 * @param {string} checkout The checkout root, or the module folder outside one
 * @param {string} root The run's copy of the checkout
 * @param {string} [renderer] The renderer checkout the run serves
 * @returns {string} The run's playground folder
 */
export function layOutCopy(playground, checkout, root, renderer) {
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
  const modules = join(playground, "node_modules");
  if (renderer) linkRenderer(modules, join(shadow, "node_modules"), renderer);
  else symlinkSync(modules, join(shadow, "node_modules"));
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
 * @param {import("./run-state.mjs").RunState} state The run
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

/**
 * @param {string[]} pairs
 * @returns {Record<string, string>}
 */
function parseExtraEnv(pairs) {
  return Object.fromEntries(
    pairs.map((pair) => {
      const index = pair.indexOf("=");
      if (index <= 0) throw new Error(`--env expects KEY=VALUE, got ${pair}`);
      return [pair.slice(0, index), pair.slice(index + 1)];
    }),
  );
}

/**
 * @param {UpOptions} options
 * @returns {Promise<RunState>}
 */
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
  const renderer = options.renderer && resolveRenderer(options.renderer);
  const verified = renderer ? checkoutOf(renderer) : checkout;
  const state = {
    ...paths,
    id,
    createdAt: new Date().toISOString(),
    environment: ENVIRONMENT,
    playground,
    moduleRoot: dirname(playground),
    repo: checkout.root,
    headSha: verified.head,
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
    namespaces: currentNamespaces(),
    accounts: {},
    tokens: {},
    ready: false,
  };
  if (renderer) state.renderer = renderer;
  if (options.noStandby) state.noStandby = true;
  return state;
}

/**
 * How to run one of the playground's CLIs for the run: its own log, the
 * run's environment, from the run's playground copy or `cwd`.
 *
 * @param {import("./run-state.mjs").RunState} state The run
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

/**
 * Records a process of the run, in place of the one of the same name.
 *
 * @param {RunState} state The run
 * @param {import("./run-state.mjs").ProcessRecord} processRecord The process
 */
export function record(state, processRecord) {
  state.processes = [
    ...state.processes.filter((entry) => entry.name !== processRecord.name),
    processRecord,
  ];
  saveRun(state);
}

/**
 * @param {RunState} state
 * @param {"mail" | "api"} name
 * @param {number} port
 * @returns {Promise<void>}
 */
async function ensureService(state, name, port) {
  const running = state.processes.find((entry) => entry.name === name);
  if (running && isSameProcess(running)) return;
  const service = startDetached({
    name,
    program: process.execPath,
    args: [CONTROL_BIN, `serve-${name}`, state.dir],
    cwd: state.dir,
    env: process.env,
    logs: state.logs,
  });
  record(state, { ...service, port });
  await waitForOwnPort(port, service, READY_TIMEOUT_MS);
}

/**
 * Starts the run's mail sink unless it already runs, and waits until it is
 * the process listening on the run's mail port.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @returns {Promise<void>} Resolves once it listens
 */
export function ensureMail(state) {
  return ensureService(state, "mail", state.smtpPort);
}

/**
 * Starts the run's API forwarder unless it already runs, and waits until it
 * is the process listening on the run's API port. The dashboard, the
 * journeys and `DMS_API_BASE_URL` reach the backend through it.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @returns {Promise<void>} Resolves once it listens
 */
export function ensureApi(state) {
  return ensureService(state, "api", state.apiPort);
}

/**
 * @param {RunState} state
 * @returns {Promise<void>}
 */
async function startFirstMail(state) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await ensureMail(state);
      return;
    } catch (error) {
      if (attempt === MAIL_PORT_ATTEMPTS) throw error;
      state.smtpPort = await freePort();
    }
  }
}

/**
 * Starts a backend of the run on `database` and a free loopback port of its
 * own, from the run's build or `build`, without waiting for it, and records
 * it in a file of its own. Its log is named after its database,
 * `backend_<suffix>.log`, so two backends that run at once write apart; the
 * first database's is `backend.log`.
 *
 * @param {RunState} state The run
 * @param {string} database The database it serves
 * @param {{ playground?: string, cwd?: string }} [build] Another build to start
 * @returns {Promise<import("./run-state.mjs").BackendRecord>} Its record
 */
export async function launchBackend(state, database, build) {
  const { ajs } = cliPaths(build?.playground ?? state.playground);
  const port = await freePort();
  const launch = spec(
    state,
    `backend${database.slice(state.databasePrefix.length)}`,
    ajs,
    ["project", "start", "-e", ENVIRONMENT, "--refresh-config"],
    build?.cwd,
  );
  launch.env = { ...launch.env, PORT: String(port), MONGO_DATABASE: database };
  const backend = { ...startDetached(launch), name: "backend", port, database };
  recordBackend(state.dir, backend);
  return backend;
}

/**
 * The backends the run started that still run. A record whose pid no longer
 * runs the process the run started is forgotten: the backend exited, and
 * the pid may be another process's now.
 *
 * @param {RunState} state The run
 * @returns {import("./run-state.mjs").BackendRecord[]} The backends
 */
export function liveBackends(state) {
  return recordedBackends(state.dir).filter((backend) => {
    if (isSameProcess(backend)) return true;
    forgetBackend(state.dir, backend.pid);
    return false;
  });
}

/**
 * Waits until a backend answers `/api/onboarding/informations` on its own port.
 *
 * @param {import("./run-state.mjs").ServerRecord} backend The backend
 * @returns {Promise<void>} Resolves once it answers 200
 * @throws When it exits first or the timeout passes, naming its log
 */
export function waitForBackend(backend) {
  return waitForOk(
    `http://127.0.0.1:${backend.port}/api/onboarding/informations`,
    backend,
    READY_TIMEOUT_MS,
  );
}

/**
 * Starts the run's backend on `state.database`, from the run's build or
 * `build`, and points the API at it once it answers.
 *
 * @param {RunState} state The run
 * @param {{ playground?: string, cwd?: string }} [build] Another build to start
 * @returns {Promise<void>} Resolves once the API reaches it
 */
export async function startBackend(state, build) {
  await ensureApi(state);
  const backend = await launchBackend(state, state.database, build);
  record(state, backend);
  await waitForBackend(backend);
  writeTarget(apiTargetFile(state.dir), backend.port);
}

/**
 * @param {RunState} state
 * @returns {Promise<void>}
 */
async function buildAndStart(state) {
  const clis = cliPaths(state.playground, state.renderer);
  state.runPlayground = await timed(state, "layout", () =>
    layOutCopy(
      state.playground,
      state.repo ?? state.moduleRoot,
      state.root,
      state.renderer,
    ),
  );
  if (state.ownsMongo) {
    const mongo = await timed(state, "mongod", () =>
      startMongod(state, resolutionFolders(state)),
    );
    state.mongoUrl = mongo.url;
    record(state, mongo.record);
  }
  await timed(state, "mail", () => startFirstMail(state));
  await timed(state, "project-build", () =>
    runToEnd(
      spec(state, "project-build", clis.ajs, [
        "project",
        "build",
        "-e",
        ENVIRONMENT,
      ]),
    ),
  );
  await timed(state, "frontend-build", () =>
    runToEnd(
      spec(state, "frontend-build", clis.dms, ["build", "-e", ENVIRONMENT]),
    ),
  );
  state.buildRoots = existingBuildRoots(state);
  await timed(state, "backend-start", () => startBackend(state));
  await timed(state, "frontend-start", async () => {
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
  });
}

/**
 * Starts an isolated DMS from a playground: a copy of it in a run folder,
 * free ports, the `docs` environment, a `verify_<run>` database on a mongod
 * the run owns (or `--mongo-url`), fresh secrets, a mail sink, and a
 * forwarder on the API port to a backend on a port of its own. With
 * `renderer`, the dashboard is that built dms-frontend checkout. Ready once
 * `/api/onboarding/informations` and `/dms-preview` answer 200. On failure
 * it stops what it started and keeps the logs.
 *
 * @param {UpOptions} options Where the playground and the runs are
 * @returns {Promise<import("./run-state.mjs").RunState>} The ready run
 */
export async function up(options) {
  const stop = stopwatch();
  const state = await initialState(options);
  saveRun(state);
  for (const entry of options.prepared ?? []) appendTiming(state, entry);
  try {
    await buildAndStart(state);
  } catch (error) {
    state.error = String(error?.message ?? error);
    saveRun(state);
    await stopRecorded(state.processes);
    recordTiming(state, "up", stop(), false);
    throw error;
  }
  state.ready = true;
  saveRun(state);
  recordTiming(state, "up", stop(), true);
  return state;
}

/**
 * Stops every process the run recorded, every backend it started and their
 * descendants, each only while its pid still runs the process the run
 * started, drops the run's databases, and removes everything but
 * `evidence/`, `logs/` and `run.json`, from which the secrets and passwords
 * are removed.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @returns {Promise<string[]>} One line per action
 */
export async function down(state) {
  const browser = state.browser ? [state.browser] : [];
  const app = state.processes.filter((entry) => entry.name !== "mongod");
  const lines = await stopRecorded([
    ...app,
    ...browser,
    ...liveBackends(state),
  ]);
  const mongod = state.processes.find((entry) => entry.name === "mongod");
  if (mongod && !isSameProcess(mongod)) {
    lines.push(`mongod already stopped; its data goes with ${state.mongo}`);
  } else if (state.mongoUrl) {
    const dropped = await dropRunDatabases(
      state.mongoUrl,
      state.databasePrefix,
      resolutionFolders(state),
    ).catch((/** @type {unknown} */ error) => [
      `could not drop the run's databases: ${describeFailure(error)}`,
    ]);
    lines.push(...dropped);
  }
  lines.push(...(await stopRecorded(state.processes)));
  for (const folder of [
    state.root,
    state.home,
    state.mongo,
    state.baseRoot,
    state.cache,
    apiTargetFile(state.dir),
    backendsFolder(state.dir),
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
  return [...new Set(lines)];
}
