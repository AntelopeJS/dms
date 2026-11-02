import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { decode } from "./json.mjs";

const RUN_FILE = "run.json";
const ID_BYTES = 3;
const TIMESTAMP_LENGTH = 15;

/**
 * @typedef {{ name: string, pid: number, command: string, cwd: string, log: string, startedAt: string, port?: number }} ProcessRecord
 * @typedef {ProcessRecord & { port: number }} ServerRecord
 * @typedef {{ email: string, password: string, userId?: string | null }} Account
 * @typedef {{ dir: string, root: string, home: string, logs: string, mongo: string, browser?: ServerRecord, evidence: string, cache: string, id: string, createdAt: string, environment: string, playground: string, moduleRoot: string, repo: string | null, headSha: string | null, baseRef: string, skill: string | null, apiPort: number, webPort: number, smtpPort: number, mail: string, apiUrl: string, webUrl: string, databasePrefix: string, database: string, mongoUrl: string, ownsMongo: boolean, secrets: Record<string, string>, adminPassword: string, extraEnv: Record<string, string>, processes: ProcessRecord[], accounts: Record<string, Account>, tokens: Record<string, string>, ready: boolean, error?: string, runPlayground?: string, baseRoot?: string, resetCount?: number, journeyCount?: number }} RunState
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
 * @typedef {Omit<RunState, "browser"> & { browser?: string | ServerRecord }} StoredRunState The state as a file may hold it. A run saved by an earlier release holds the browser's folder in `browser` until the browser starts.
 */

const strings = z.record(z.string(), z.string());

const processRecord = z.object({
  name: z.string(),
  pid: z.number(),
  command: z.string(),
  cwd: z.string(),
  log: z.string(),
  startedAt: z.string(),
  port: z.number().optional(),
});

const serverRecord = processRecord.extend({ port: z.number() });

const account = z.object({
  email: z.string(),
  password: z.string(),
  userId: z.string().nullable().optional(),
});

/** The state as `run.json` holds it. Keys the schema does not name are kept, so saving a loaded run writes them back. */
const storedRunSchema = /** @satisfies {z.ZodType<StoredRunState>} */ (
  z
    .object({
      dir: z.string(),
      root: z.string(),
      home: z.string(),
      logs: z.string(),
      mongo: z.string(),
      browser: z.union([z.string(), serverRecord]).optional(),
      evidence: z.string(),
      cache: z.string(),
      id: z.string(),
      createdAt: z.string(),
      environment: z.string(),
      playground: z.string(),
      moduleRoot: z.string(),
      repo: z.string().nullable(),
      headSha: z.string().nullable(),
      baseRef: z.string(),
      skill: z.string().nullable(),
      apiPort: z.number(),
      webPort: z.number(),
      smtpPort: z.number(),
      mail: z.string(),
      apiUrl: z.string(),
      webUrl: z.string(),
      databasePrefix: z.string(),
      database: z.string(),
      mongoUrl: z.string(),
      ownsMongo: z.boolean(),
      secrets: strings,
      adminPassword: z.string(),
      extraEnv: strings,
      processes: z.array(processRecord),
      accounts: z.record(z.string(), account),
      tokens: strings,
      ready: z.boolean(),
      error: z.string().optional(),
      runPlayground: z.string().optional(),
      baseRoot: z.string().optional(),
      resetCount: z.number().optional(),
      journeyCount: z.number().optional(),
    })
    .passthrough()
);

/**
 * @param {StoredRunState} stored The state as the file holds it
 * @returns {stored is RunState} Whether `browser` holds no folder
 */
function holdsNoFolder(stored) {
  return typeof stored?.browser !== "string";
}

/**
 * Reads the state `up` recorded for a run. A folder an earlier release stored
 * in `browser` is dropped, since nothing creates or reads that folder.
 *
 * @param {string} dir The run root, as `up` printed it
 * @returns {RunState} The run state
 * @throws When the folder holds no run.json
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
  const stored = decode(storedRunSchema, parsed, file);
  if (holdsNoFolder(stored)) return stored;
  const { browser, ...current } = stored;
  return current;
}

/**
 * Writes the run state, readable by its owner only since it holds the run's
 * secrets and the admin password.
 *
 * @param {RunState} state The run state
 */
export function saveRun(state) {
  writeFileSync(
    join(state.dir, RUN_FILE),
    `${JSON.stringify(state, null, 2)}\n`,
    { mode: 0o600 },
  );
}
