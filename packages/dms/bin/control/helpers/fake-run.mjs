import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, get } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { arrayOf, decode, isNumber, isString, objectOf } from "../json.mjs";
import { isSameProcess, startTimeOf } from "../identity.mjs";
import { freePort } from "../processes.mjs";
import { backendsFolder, createRunFolders, saveRun } from "../run-state.mjs";
import { down } from "../stack.mjs";

/** How many runs the tests made, which tells their databases apart */
let runs = 0;
const REGISTRY_WAIT_MS = 10_000;

/** A backend that answers every request with its pid and the database it was started on, and reports both to the test's registry once it listens. */
const FAKE_BACKEND = `
const http = require("node:http");
const self = JSON.stringify({ pid: process.pid, database: process.env.MONGO_DATABASE });
const server = http.createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  response.end(self);
});
server.listen(Number(process.env.PORT), "127.0.0.1", () => {
  const report = http.request(process.env.FAKE_REGISTRY, { method: "POST" });
  report.on("error", () => undefined);
  report.end(self);
});
`;

/** A MongoDB driver that records the databases dropped through it. */
const FAKE_DRIVER = `
const dropped = [];
Object.defineProperty(globalThis, "fakeMongoDropped", { value: dropped, configurable: true });
class MongoClient {
  async connect() {}
  async close() {}
  db(name) {
    return { admin: () => ({}), dropDatabase: async () => { dropped.push(name); } };
  }
}
module.exports = { MongoClient };
`;

const PLAYGROUND_FILES = {
  "package.json": "{}",
  "node_modules/@antelopejs/core/package.json": '{"name":"@antelopejs/core"}',
  "node_modules/@antelopejs/core/dist/core/cli/index.js": FAKE_BACKEND,
  "node_modules/@antelopejs/dms-frontend/package.json":
    '{"name":"@antelopejs/dms-frontend"}',
  "node_modules/mongodb-memory-server-core/package.json":
    '{"name":"mongodb-memory-server-core","main":"index.js"}',
  "node_modules/mongodb-memory-server-core/index.js": "",
  "node_modules/mongodb/package.json": '{"name":"mongodb","main":"index.js"}',
  "node_modules/mongodb/index.js": FAKE_DRIVER,
};

const isServed = objectOf({ pid: isNumber, database: isString });
const isDropped = arrayOf(isString);

/** @type {{ pid: number, database: string, startTime: number | null }[]} Every fake backend the tests started, in the order they listened, with the start time that tells it from a later process given its pid */
const started = [];

const registry = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => {
    body += String(chunk);
  });
  request.on("end", () => {
    /** @type {unknown} */
    const parsed = JSON.parse(body);
    const backend = decode(isServed, parsed, "a report", "a pid and database");
    started.push({ ...backend, startTime: startTimeOf(backend.pid) });
    response.end();
  });
});
const registryPort = await freePort();
await new Promise((resolve) =>
  registry.listen(registryPort, "127.0.0.1", resolve),
);
registry.unref();

/**
 * The backend started on `database`, once it listens. Fails the test when
 * none does, so no test signals a pid it made up.
 *
 * @param {string} database The database
 * @returns {Promise<{ pid: number, database: string }>} The backend
 */
export async function startedOn(database) {
  const deadline = Date.now() + REGISTRY_WAIT_MS;
  for (;;) {
    const backend = started.findLast((entry) => entry.database === database);
    if (backend) {
      assert.ok(backend.pid > 1, "a backend reports a real pid");
      return backend;
    }
    assert.ok(Date.now() < deadline, `a backend starts on ${database}`);
    await sleep(20);
  }
}

/**
 * A process of the test's own that is no backend, stopped after the test.
 *
 * @param {import("node:test").TestContext} t The test
 * @param {NodeJS.ProcessEnv} [env] Its environment, such as the database of a backend, as the dashboard has it
 * @returns {number} Its pid
 */
export function bystander(t, env = process.env) {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    env,
  });
  t.after(() => child.kill());
  assert.ok(child.pid !== undefined && child.pid > 1, "the bystander started");
  return child.pid;
}

/** @returns {number[]} The pids of the fake backends that still run, each only while its pid still runs that backend */
export function running() {
  return started
    .filter((backend) => isSameProcess(backend))
    .map((backend) => backend.pid)
    .toSorted((a, b) => a - b);
}

/**
 * A run whose playground starts the fake backend, with no process yet, and
 * the files a build writes: the module's `dist`, the `dist` of a workspace
 * package the playground links, the playground's `dist` and its project
 * build, which `up` records as the run's build folders. `down` stops what
 * the test started.
 *
 * @param {import("node:test").TestContext} t The test
 * @returns {Promise<import("../run-state.mjs").RunState>} The run
 */
export async function newRun(t) {
  const parent = mkdtempSync(join(tmpdir(), "dms-control-backend-test-"));
  const playground = join(parent, "playground");
  for (const [path, content] of Object.entries(PLAYGROUND_FILES)) {
    mkdirSync(dirname(join(playground, path)), { recursive: true });
    writeFileSync(join(playground, path), content);
  }
  for (const file of buildFiles(parent)) rebuild(file);
  symlinkSync(
    join(parent, "interface"),
    join(playground, "node_modules/@antelopejs/interface-t"),
  );
  const paths = createRunFolders(join(parent, "run"));
  const apiPort = await freePort();
  runs += 1;
  const prefix = `verify_t${runs}`;
  const state = {
    ...paths,
    id: "t",
    createdAt: new Date().toISOString(),
    environment: "docs",
    playground,
    moduleRoot: parent,
    repo: null,
    headSha: null,
    baseRef: "origin/main",
    skill: null,
    apiPort,
    webPort: 0,
    smtpPort: 0,
    mail: join(paths.evidence, "mail"),
    apiUrl: `http://127.0.0.1:${apiPort}`,
    webUrl: "http://127.0.0.1:0",
    databasePrefix: prefix,
    database: prefix,
    mongoUrl: "",
    ownsMongo: false,
    secrets: {},
    adminPassword: "",
    extraEnv: { FAKE_REGISTRY: `http://127.0.0.1:${registryPort}` },
    processes: [],
    accounts: {},
    tokens: {},
    ready: true,
    runPlayground: playground,
    buildRoots: buildFiles(parent).map((file) => dirname(file)),
  };
  saveRun(state);
  t.after(async () => {
    await down(state);
    rmSync(parent, { recursive: true, force: true });
  });
  return state;
}

/**
 * Who answers through the run's API port, on a connection of its own.
 *
 * @param {import("../run-state.mjs").RunState} state The run
 * @returns {Promise<{ pid: number, database: string }>} The backend's pid and database
 */
export function served(state) {
  return new Promise((resolve, reject) => {
    const request = get(
      `${state.apiUrl}/api/onboarding/informations`,
      { agent: false },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += String(chunk);
        });
        response.on("end", () => {
          /** @type {unknown} */
          const parsed = JSON.parse(body);
          resolve(decode(isServed, parsed, "the answer", "a pid and database"));
        });
      },
    );
    request.on("error", reject);
  });
}

/** @returns {string[]} The databases dropped so far */
export function dropped() {
  /** @type {unknown} */
  const recorded = Object.getOwnPropertyDescriptor(
    globalThis,
    "fakeMongoDropped",
  )?.value;
  return decode(isDropped, recorded ?? [], "fakeMongoDropped", "names");
}

/**
 * The files a build of the run writes, one per build input.
 *
 * @param {string} parent The folder of the module, which holds the playground
 * @returns {string[]} The files
 */
export function buildFiles(parent) {
  return [
    join(parent, "dist/index.js"),
    join(parent, "interface/dist/index.js"),
    join(parent, "playground/dist/index.js"),
    join(parent, "playground/.antelope/build/build.json"),
  ];
}

/** @param {string} file A file a build writes */
export function rebuild(file) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `built at ${new Date().toISOString()}\n`);
}

/**
 * Rewrites every backend record of the run without its start time, as this
 * branch wrote them before it recorded one.
 *
 * @param {import("../run-state.mjs").RunState} state The run
 * @returns {number} How many records held a start time
 */
export function withoutStartTimes(state) {
  const folder = backendsFolder(state.dir);
  let rewritten = 0;
  for (const name of readdirSync(folder)) {
    const file = join(folder, name);
    const record = readFileSync(file, "utf8");
    const without = record.replace(/,"startTime":\d+/, "");
    if (without !== record) rewritten += 1;
    writeFileSync(file, without);
  }
  return rewritten;
}

/**
 * The run's `run.json` as the file holds it, so a test can tell whether a
 * command changed it.
 *
 * @param {string} dir The run root
 * @returns {string} The file's text
 */
export function storedRun(dir) {
  return readFileSync(join(dir, "run.json"), "utf8");
}
