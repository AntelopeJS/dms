import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describeFailure } from "./failure.mjs";
import { assertSameNamespaces } from "./identity.mjs";
import {
  arrayOf,
  decode,
  either,
  isBoolean,
  isNumber,
  isString,
  nullable,
  objectOf,
  oneOf,
  recordOf,
} from "./json.mjs";

const RUN_FILE = "run.json";
const ID_BYTES = 3;
const TIMESTAMP_LENGTH = 15;

/**
 * @typedef {{ name: string, pid: number, startTime?: number | null, command: string, cwd: string, log: string, startedAt: string, port?: number }} ProcessRecord A process the run started. `startTime` is when the kernel started it, in clock ticks since boot: `null` where /proc could not tell, absent in a record an earlier dms-control wrote. Without it, `startedAt` tells the process apart.
 * @typedef {ProcessRecord & { port: number }} ServerRecord
 * @typedef {ServerRecord & { database: string }} BackendRecord A backend the run started, with the database it serves
 * @typedef {{ email: string, password: string, userId?: string | null }} Account
 * @typedef {{ dir: string, root: string, home: string, logs: string, mongo: string, browser?: ServerRecord, evidence: string, cache: string, id: string, createdAt: string, environment: string, playground: string, moduleRoot: string, repo: string | null, headSha: string | null, renderer?: string, baseRef: string, skill: string | null, apiPort: number, webPort: number, smtpPort: number, mail: string, apiUrl: string, webUrl: string, databasePrefix: string, database: string, mongoUrl: string, ownsMongo: boolean, secrets: Record<string, string>, adminPassword: string, extraEnv: Record<string, string>, processes: ProcessRecord[], namespaces?: import("./identity.mjs").Namespaces, noStandby?: boolean, frontendMode?: FrontendMode, buildRoots?: string[], accounts: Record<string, Account>, tokens: Record<string, string>, ready: boolean, error?: string, runPlayground?: string, baseRoot?: string, resetCount?: number, journeyCount?: number, frontendBuild?: FrontendBuild, bakedEnv?: Record<string, string> }} RunState
 * @typedef {"build" | "dev"} FrontendMode How the run serves its dashboard: `build` runs `ajs dms build` then `ajs dms start`, `dev` runs `ajs dms dev` on the sources. A run without one serves a build.
 * @typedef {{ key: string | null, cached: boolean, reason?: string }} FrontendBuild The key of the inputs of the run's frontend build (null when it was not keyed), whether the build came from the build cache, and why the cache was not used or not filled when it should have been
 */

/**
 * Where runs are created: `--runs`, else `DMS_CONTROL_RUNS`, else
 * `<tmpdir>/dms-control`. A run holds a playground copy and its frontend
 * build, a few hundred megabytes, so prefer a folder on disk over a tmpfs.
 *
 * @param {string | undefined} option The `--runs` value
 * @returns {string} The absolute runs folder
 */
export function runsRoot(option) {
  return resolve(
    option ?? process.env.DMS_CONTROL_RUNS ?? join(tmpdir(), "dms-control"),
  );
}

/**
 * A new run id: the UTC time to the second and three random bytes, so two
 * runs started in the same second never share a folder or a database.
 *
 * @returns {string} The run id, such as `20261029T034501-a1b2c3`
 */
export function newRunId() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .slice(0, TIMESTAMP_LENGTH);
  return `${stamp}-${randomBytes(ID_BYTES).toString("hex")}`;
}

/**
 * The folders of a run, all under its root.
 *
 * @param {string} dir The run root
 * @returns {{ dir: string, root: string, home: string, logs: string, mongo: string, evidence: string, cache: string }} The run's folders
 */
export function runPaths(dir) {
  return {
    dir,
    root: join(dir, "root"),
    home: join(dir, "home"),
    logs: join(dir, "logs"),
    mongo: join(dir, "mongo"),
    evidence: join(dir, "evidence"),
    cache: join(dir, "cache"),
  };
}

/**
 * The database a run owns: `verify_<run id>` with every character MongoDB
 * refuses in a name replaced.
 *
 * @param {string} id The run id
 * @returns {string} The database name
 */
export function databaseName(id) {
  return `verify_${id.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

/**
 * Creates the folders of a new run.
 *
 * @param {string} dir The run root
 * @returns {ReturnType<typeof runPaths>} The run's folders
 */
export function createRunFolders(dir) {
  const paths = runPaths(dir);
  for (const folder of [paths.home, paths.logs, paths.evidence]) {
    mkdirSync(folder, { recursive: true });
  }
  return paths;
}

/**
 * @typedef {Omit<RunState, "browser" | "accounts"> & { browser?: string | ServerRecord, accounts: Record<string, Omit<Account, "password"> & { password?: string }>, stoppedAt?: string }} StoredRunState The state as a file may hold it. A run saved by an earlier release holds the browser's folder in `browser` until the browser starts, and `down` leaves an account without its `password` and records when it stopped in `stoppedAt`.
 */

const isStrings = recordOf(isString);

const PROCESS_FIELDS = {
  name: isString,
  pid: isNumber,
  command: isString,
  cwd: isString,
  log: isString,
  startedAt: isString,
};

const START_TIME = { startTime: nullable(isNumber) };

const isProcessRecord = objectOf(PROCESS_FIELDS, {
  port: isNumber,
  ...START_TIME,
});

const isServerRecord = objectOf(
  { ...PROCESS_FIELDS, port: isNumber },
  START_TIME,
);

const isBackendRecord = objectOf(
  { ...PROCESS_FIELDS, port: isNumber, database: isString },
  START_TIME,
);

const isAccount = objectOf(
  { email: isString },
  { password: isString, userId: nullable(isString) },
);

/** @type {import("./json.mjs").Guard<StoredRunState>} The state as `run.json` holds it. Keys it does not check are kept, so saving a loaded run writes them back. */
const isStoredRun = objectOf(
  {
    dir: isString,
    root: isString,
    home: isString,
    logs: isString,
    mongo: isString,
    evidence: isString,
    cache: isString,
    id: isString,
    createdAt: isString,
    environment: isString,
    playground: isString,
    moduleRoot: isString,
    repo: nullable(isString),
    headSha: nullable(isString),
    baseRef: isString,
    skill: nullable(isString),
    apiPort: isNumber,
    webPort: isNumber,
    smtpPort: isNumber,
    mail: isString,
    apiUrl: isString,
    webUrl: isString,
    databasePrefix: isString,
    database: isString,
    mongoUrl: isString,
    ownsMongo: isBoolean,
    secrets: isStrings,
    adminPassword: isString,
    extraEnv: isStrings,
    processes: arrayOf(isProcessRecord),
    accounts: recordOf(isAccount),
    tokens: isStrings,
    ready: isBoolean,
  },
  {
    browser: either(isString, isServerRecord),
    namespaces: objectOf({}, { pid: isString, time: isString }),
    noStandby: isBoolean,
    frontendMode: oneOf(["build", "dev"]),
    buildRoots: arrayOf(isString),
    error: isString,
    renderer: isString,
    runPlayground: isString,
    baseRoot: isString,
    resetCount: isNumber,
    journeyCount: isNumber,
    frontendBuild: objectOf(
      { key: nullable(isString), cached: isBoolean },
      { reason: isString },
    ),
    bakedEnv: isStrings,
  },
);

/**
 * Reads the state `up` recorded for a run. A folder an earlier release stored
 * in `browser` is dropped, since nothing creates or reads that folder. An
 * account that `down` left without its `password` reads with an empty one.
 * Every command opens its run here, so a command run outside the PID or
 * time namespace `up` ran in refuses before it reads a process or changes
 * anything.
 *
 * @param {string} dir The run root, as `up` printed it
 * @returns {RunState} The run state
 * @throws When the folder holds no run.json
 * @throws When the run was started in another PID or time namespace
 */
export function loadRun(dir) {
  const file = join(resolve(dir), RUN_FILE);
  if (!existsSync(file)) {
    throw new Error(
      `No run at ${dir}: run.json is missing. Start one with dms-control up.`,
    );
  }
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  const stored = decode(isStoredRun, parsed, file, "a run state");
  assertSameNamespaces(stored.namespaces);
  const { browser, accounts, ...rest } = stored;
  const run = {
    ...rest,
    accounts: Object.fromEntries(
      Object.entries(accounts).map(([name, account]) => [
        name,
        { ...account, password: account.password ?? "" },
      ]),
    ),
  };
  return browser === undefined || isString(browser) ? run : { ...run, browser };
}

/**
 * Writes the run state, readable by its owner only since it holds the run's
 * secrets and the admin password.
 *
 * @param {StoredRunState} state The run state
 */
export function saveRun(state) {
  writeFileSync(
    join(state.dir, RUN_FILE),
    `${JSON.stringify(state, null, 2)}\n`,
    { mode: 0o600 },
  );
}

/**
 * The folder that holds one file per backend the run started.
 *
 * @param {string} dir The run root
 * @returns {string} The folder
 */
export function backendsFolder(dir) {
  return join(dir, "backends");
}

/**
 * Records a backend the run started in a file of its own,
 * `backends/<pid>.json`. No other write of the run replaces that file, so
 * `down` finds the backend even after a command saved a run.json it had
 * loaded before the backend started.
 *
 * @param {string} dir The run root
 * @param {BackendRecord} backend The backend
 */
export function recordBackend(dir, backend) {
  const folder = backendsFolder(dir);
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${backend.pid}.json`);
  writeFileSync(`${file}.next`, `${JSON.stringify(backend)}\n`);
  renameSync(`${file}.next`, file);
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isMissing(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * @param {string} folder
 * @returns {string[]}
 */
function namesIn(folder) {
  try {
    return readdirSync(folder);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

/** @type {Set<string>} The records already named on stderr, so a command names each once. */
const reported = new Set();

/**
 * @param {string} file
 * @returns {BackendRecord[]}
 */
function readBackend(file) {
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return [decode(isBackendRecord, parsed, file, "a backend record")];
  } catch (error) {
    if (!isMissing(error) && !reported.has(file)) {
      reported.add(file);
      process.stderr.write(
        `dms-control: skipped ${file}, which holds no backend record: ${describeFailure(error)}\n`,
      );
    }
    return [];
  }
}

/**
 * Every backend the run recorded, whether or not it still runs. A record
 * removed while the folder is read is gone. A file that holds no backend
 * record, such as a truncated one, is skipped and named on stderr, so it
 * stops no command.
 *
 * @param {string} dir The run root
 * @returns {BackendRecord[]} The backends
 */
export function recordedBackends(dir) {
  const folder = backendsFolder(dir);
  return namesIn(folder)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => readBackend(join(folder, name)));
}

/**
 * Removes the record of a backend that no longer runs.
 *
 * @param {string} dir The run root
 * @param {number} pid Its process id
 */
export function forgetBackend(dir, pid) {
  rmSync(join(backendsFolder(dir), `${pid}.json`), { force: true });
}
