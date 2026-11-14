import { randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { layOutFrontendBuild } from "./build-cache.mjs";
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
import { resolveRenderer } from "./renderer.mjs";
import { moduleRootOf } from "./module-root.mjs";
import {
  cliPaths,
  CONTROL_BIN,
  ENVIRONMENT,
  frontendPackage,
  resolutionFolders,
  spec,
} from "./launch.mjs";
import { layOutCopy } from "./run-copy.mjs";
import { newPassword } from "./session.mjs";
import { appendTiming, recordTiming, stopwatch, timed } from "./timing.mjs";

/**
 * @typedef {import("./run-state.mjs").RunState} RunState
 * @typedef {{ playground: string, renderer?: string, runs?: string, mongoUrl?: string, env?: string[], base?: string, skill?: string, prepared?: import("./timing.mjs").TimingEntry[], noStandby?: boolean, buildCache?: boolean, frontendMode?: import("./run-state.mjs").FrontendMode, backendMode?: BackendMode }} UpOptions Where the playground and the runs are, the `prepare` entries to record once the run exists, whether fresh databases start their backend on the spot, whether the frontend build may come from the build cache (it may unless `buildCache` is false), how the dashboard is served (a build unless `frontendMode` is `dev`), and how the backends run unless a journey says otherwise (production unless `backendMode` is `dev`)
 * @typedef {import("./run-state.mjs").BackendMode} BackendMode
 */

const READY_TIMEOUT_MS = 180_000;
const SECRET_BYTES = 32;
const PREPARED_WORKSPACE = new URL("prepared-workspace.mjs", import.meta.url)
  .href;
const MAIL_PORT_ATTEMPTS = 3;
const SECRET_NAMES = [
  "DMS_JWT_SECRET",
  "AUTH_JWT_SECRET",
  "DMS_BOOTSTRAP_SECRET",
  "DMS_HTML_RENDER_SECRET",
  "DMS_SESSION_SECRET",
  "DMS_SETUP_TOKEN",
];
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
    moduleRoot: moduleRootOf(playground, checkout.root),
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
  if (options.frontendMode === "dev") state.frontendMode = "dev";
  if (options.backendMode === "dev") state.backendMode = "dev";
  return state;
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
 * How the run's backends run unless a journey says otherwise.
 *
 * @param {RunState} state The run
 * @returns {BackendMode} `dev` when `up` was given `--dev-backend`
 */
export function runBackendMode(state) {
  return state.backendMode ?? "production";
}

/**
 * The `ajs` arguments that start a backend in `mode`: `project start` on the
 * build, or `project dev` without watching, which resolves
 * `antelope.config.ts` and loads the same module builds in the runtime's
 * development mode, without the module-set check of `--refresh-config`.
 *
 * @param {BackendMode} mode How it runs
 * @returns {string[]} The arguments after the `ajs` script
 */
function backendArgs(mode) {
  return mode === "dev"
    ? ["project", "dev", "-e", ENVIRONMENT]
    : ["project", "start", "-e", ENVIRONMENT, "--refresh-config"];
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
 * @param {BackendMode} [mode] How it runs, the run's mode by default
 * @returns {Promise<import("./run-state.mjs").BackendRecord>} Its record
 */
export async function launchBackend(
  state,
  database,
  build,
  mode = runBackendMode(state),
) {
  const { ajs } = cliPaths(build?.playground ?? state.playground);
  const port = await freePort();
  const launch = spec(
    state,
    `backend${database.slice(state.databasePrefix.length)}`,
    ajs,
    backendArgs(mode),
    build?.cwd,
  );
  launch.env = { ...launch.env, PORT: String(port), MONGO_DATABASE: database };
  const backend = {
    ...startDetached(launch),
    name: "backend",
    port,
    database,
    mode,
  };
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
 * @param {BackendMode} [mode] How it runs, the run's mode by default
 * @returns {Promise<void>} Resolves once the API reaches it
 */
export async function startBackend(state, build, mode) {
  await ensureApi(state);
  const backend = await launchBackend(state, state.database, build, mode);
  record(state, backend);
  await waitForBackend(backend);
  writeTarget(apiTargetFile(state.dir), backend.port);
}

/**
 * How the run sets up a frontend workspace from the project in `project`
 * as `ajs dms build` does before it builds (see `setUpFrontendWorkspace`),
 * in a process with the run's environment and its own log.
 *
 * @param {RunState} state The run, after its project build
 * @param {string} name The log name
 * @param {string} project The project folder
 * @param {boolean} install Whether to install the workspace's dependencies
 * @returns {(workspace: string) => Promise<void>} Sets up the workspace folder it is given
 */
export function workspaceSetup(state, name, project, install) {
  return (workspace) =>
    runToEnd(
      spec(
        state,
        name,
        CONTROL_BIN,
        [
          "prepare-frontend",
          frontendPackage(state.playground, state.renderer),
          workspace,
          ENVIRONMENT,
          install ? "install" : "sources",
        ],
        project,
      ),
    );
}

/**
 * Builds the run's dashboard as `ajs dms build` does, in a prepared
 * workspace, or lays out the build of the same inputs from the build cache.
 *
 * @param {RunState} state The run, after its project build
 * @param {boolean} useCache Whether the build may come from the build cache
 * @returns {Promise<void>} Resolves once the build is in the run's workspace
 */
function buildFrontend(state, useCache) {
  const { dms } = cliPaths(state.playground, state.renderer);
  return layOutFrontendBuild(
    state,
    frontendPackage(state.playground, state.renderer),
    {
      prepare: (workspace) =>
        timed(state, "frontend-prepare", () =>
          workspaceSetup(
            state,
            "frontend-prepare",
            state.runPlayground ?? "",
            true,
          )(workspace),
        ),
      build: (prepared) => {
        const build = spec(state, "frontend-build", dms, [
          "build",
          "-e",
          ENVIRONMENT,
        ]);
        if (prepared) build.args.unshift("--import", PREPARED_WORKSPACE);
        return runToEnd(build);
      },
    },
    useCache,
  );
}

/**
 * How the run serves its dashboard on its web port against its API:
 * `ajs dms start` on the build `up` made, or `ajs dms dev` on the sources
 * when the run's `frontendMode` is `dev`.
 *
 * @param {RunState} state The run
 * @returns {ReturnType<typeof spec>} The frontend's process spec
 */
export function frontendSpec(state) {
  const { dms } = cliPaths(state.playground, state.renderer);
  return spec(state, "frontend", dms, [
    state.frontendMode === "dev" ? "dev" : "start",
    "-e",
    ENVIRONMENT,
    "-b",
    state.apiUrl,
    "-p",
    String(state.webPort),
  ]);
}

/**
 * @param {RunState} state
 * @param {boolean} useCache
 * @returns {Promise<void>}
 */
async function buildAndStart(state, useCache) {
  const { ajs } = cliPaths(state.playground, state.renderer);
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
      spec(state, "project-build", ajs, [
        "project",
        "build",
        "-e",
        ENVIRONMENT,
      ]),
    ),
  );
  if (state.frontendMode !== "dev") {
    await timed(state, "frontend-build", () => buildFrontend(state, useCache));
  }
  state.buildRoots = existingBuildRoots(state);
  saveRun(state);
  await timed(state, "backend-start", () => startBackend(state));
  await timed(state, "frontend-start", async () => {
    const frontend = startDetached(frontendSpec(state));
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
 * `/api/onboarding/informations` and `/dms-preview` answer 200. The frontend
 * build comes from the build cache when an earlier run built the same inputs
 * (see `buildInputs`), unless `buildCache` is false. On failure
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
    await buildAndStart(state, options.buildCache !== false);
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
  state.processes = [];
  state.browser = undefined;
  state.secrets = {};
  state.adminPassword = "";
  state.tokens = {};
  state.ready = false;
  saveRun({
    ...state,
    accounts: Object.fromEntries(
      Object.entries(state.accounts ?? {}).map(([name, account]) => [
        name,
        { email: account.email },
      ]),
    ),
    stoppedAt: new Date().toISOString(),
  });
  return [...new Set(lines)];
}
