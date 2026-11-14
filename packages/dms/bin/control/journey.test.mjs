import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isSameProcess } from "./identity.mjs";
import { JourneyContext, runJourney, runJourneyFile } from "./journey.mjs";
import { loadJourneys } from "./journey-load.mjs";
import { apiTargetFile, writeTarget } from "./forwarder.mjs";
import { commandOf, newRun, served, startedOn } from "./helpers/fake-run.mjs";
import { startMongod } from "./mongo.mjs";
import {
  freePort,
  startDetached,
  stopRecorded,
  waitForPort,
} from "./processes.mjs";
import { recordBackend, saveRun } from "./run-state.mjs";
import { liveBackends } from "./stack.mjs";
import { readTimings } from "./timing.mjs";

const JOURNEY = '{ id: "smoke", title: "t", entryPoint: "e", async run() {} }';

/**
 * @param {import("node:test").TestContext} t The test
 * @param {string} source The module source
 * @returns {string} The journeys module
 */
function journeysModule(t, source) {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-journey-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "journeys.mjs");
  writeFileSync(file, source);
  return file;
}

await test("a module exporting well-formed journeys loads them", async (t) => {
  const file = journeysModule(
    t,
    `export const journeys = [${JOURNEY}, { id: "b", title: "t", entryPoint: "e", database: "fresh", onboard: false, standby: false, async run() {} }];`,
  );
  const journeys = await loadJourneys(file);
  assert.deepEqual(
    journeys.map((journey) => journey.id),
    ["smoke", "b"],
  );
});

await test("a module without a journeys array is refused", async (t) => {
  await assert.rejects(
    loadJourneys(journeysModule(t, "export const journeys = {};")),
    /exports no journeys array/,
  );
  await assert.rejects(
    loadJourneys(journeysModule(t, "export const other = [];")),
    /exports no journeys array/,
  );
});

await test("a journey missing a field a run reads is refused", async (t) => {
  const broken = [
    '{ title: "t", entryPoint: "e", async run() {} }',
    '{ id: "x", title: "t", entryPoint: "e" }',
    '{ id: "x", title: "t", entryPoint: "e", database: 3, async run() {} }',
    '{ id: "x", title: "t", entryPoint: "e", onboard: "yes", async run() {} }',
    '{ id: "x", title: "t", entryPoint: "e", backend: "development", async run() {} }',
    '{ id: "x", title: "t", entryPoint: "e", database: "shared", backend: "dev", async run() {} }',
    '{ id: "x", title: "t", entryPoint: "e", standby: "no", async run() {} }',
    '{ id: "x", title: "t", entryPoint: "e", database: "shared", standby: false, async run() {} }',
    "null",
  ];
  for (const journey of broken) {
    await assert.rejects(
      loadJourneys(journeysModule(t, `export const journeys = [${journey}];`)),
      /exports a journey without an id/,
      journey,
    );
  }
});

await test("a journey whose browser fails to launch still records its journey entry, failed; recording it only after a normal return leaves the run's total blind to it", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-journey-timing-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const evidence = join(dir, "evidence");
  mkdirSync(evidence);
  const previous = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(dir, "no-browsers");
  t.after(() => {
    if (previous === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = previous;
  });
  const state = {
    dir,
    evidence,
    playground: dir,
    moduleRoot: dir,
    accounts: {},
  };
  const journey = {
    id: "j1",
    title: "t",
    entryPoint: "e",
    database: "shared",
    onboard: false,
    async run() {},
  };
  await assert.rejects(runJourney(state, "feat", journey, {}));
  const entry = readTimings(evidence).find((line) => line.phase === "journey");
  assert.deepEqual(entry && [entry.ok, entry.feature, entry.journey], [
    false,
    "feat",
    "j1",
  ]);
});

/** A playwright-core whose Chromium launches a browser that opens nothing, so a journey runs without one. */
const FAKE_PLAYWRIGHT = `
module.exports = { chromium: { launch: async () => ({ close: async () => {} }) } };
`;

await test("a journey that pins a dev backend and no standby in a production run is served by a dev backend started for it, the only backend that runs while it does; dropping either pin fails it", async (t) => {
  const state = await newRun(t);
  state.smtpPort = await freePort();
  saveRun(state);
  const playwright = join(state.playground, "node_modules/playwright-core");
  mkdirSync(playwright, { recursive: true });
  writeFileSync(
    join(playwright, "package.json"),
    '{"name":"playwright-core","main":"index.js"}',
  );
  writeFileSync(join(playwright, "index.js"), FAKE_PLAYWRIGHT);
  const journey = {
    title: "t",
    entryPoint: "e",
    onboard: false,
    async run() {},
  };
  const first = await runJourney(state, "feat", { ...journey, id: "a" }, {});
  assert.equal(first.error, null);
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  /** @type {{ pid: number, database: string, live: number[] }[]} */
  const seen = [];
  const pinned = await runJourney(
    state,
    "feat",
    {
      ...journey,
      id: "b",
      backend: "dev",
      standby: false,
      async run() {
        const answer = await served(state);
        const live = liveBackends(state).map((backend) => backend.pid);
        seen.push({ ...answer, live });
      },
    },
    {},
  );
  assert.equal(pinned.error, null);
  const [answer] = seen;
  assert.equal(answer?.database, `${state.databasePrefix}_j002`);
  assert.notEqual(answer.pid, standby.pid);
  assert.deepEqual(
    [await commandOf(answer.pid), answer.live],
    ["dev", [answer.pid]],
  );
});

await test("a run whose backend holds the API port itself is refused before its journeys load", async (t) => {
  const old = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  t.after(() => old.kill());
  assert.ok(old.pid !== undefined && old.pid > 1, "the old backend started");
  const state = {
    apiPort: 5010,
    processes: [{ name: "backend", pid: old.pid, port: 5010 }],
  };
  await assert.rejects(
    runJourneyFile(state, {
      file: journeysModule(t, `export const journeys = [${JOURNEY}];`),
      feature: "smoke",
      ids: [],
      skill: { config: {} },
    }),
    { message: "this run was started by an older dms-control; run `up` again" },
  );
});

const FAKE_MONGOD = `#!/usr/bin/env node
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const option = (name) => process.argv[process.argv.indexOf(name) + 1];
const starts = require("node:path").join(option("--dbpath"), "starts");
const before = existsSync(starts) ? Number(readFileSync(starts, "utf8")) : 0;
writeFileSync(starts, String(before + 1));
require("node:net").createServer((socket) => socket.end(String(before + 1))).listen(Number(option("--port")), "127.0.0.1");
`;

/** A driver whose server takes the replica-set setup the run's mongod gets and answers that it accepts writes. */
const FAKE_DRIVER = `
class MongoClient {
  async connect() {}
  async close() {}
  db() {
    return {
      admin: () => ({ command: async () => ({ ok: 1, isWritablePrimary: true }) }),
      dropDatabase: async () => {},
    };
  }
}
module.exports = { MongoClient };
`;

/**
 * @param {number} port The port
 * @returns {Promise<boolean>} Whether something accepts a connection on it
 */
function accepts(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/**
 * @param {number} port The port of a fake mongod
 * @returns {Promise<string>} What it says on a connection: how many times it started on its data folder
 */
function starts(port) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let text = "";
    socket.on("data", (chunk) => {
      text += String(chunk);
    });
    socket.once("end", () => resolve(text));
    socket.once("error", reject);
  });
}

/**
 * A run that owns a mongod, a fake one that listens on the port it is given.
 *
 * @param {import("node:test").TestContext} t The test
 * @returns {Promise<{ state: { dir: string, logs: string, mongo: string, processes: import("./run-state.mjs").ProcessRecord[], ownsMongo: boolean }, context: JourneyContext, port: number }>} The run, a journey's context and the mongod's port
 */
async function runOwningMongod(t) {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-journey-mongod-"));
  const binary = join(dir, "mongod");
  writeFileSync(binary, FAKE_MONGOD);
  chmodSync(binary, 0o755);
  for (const [name, source] of [
    ["mongodb", FAKE_DRIVER],
    ["mongodb-memory-server-core", "module.exports = {};"],
  ]) {
    const root = join(dir, "node_modules", name);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "package.json"), `{"name":"${name}"}`);
    writeFileSync(join(root, "index.js"), source);
  }
  const previous = process.env.DMS_CONTROL_MONGOD;
  process.env.DMS_CONTROL_MONGOD = binary;
  const paths = { mongo: join(dir, "mongo"), logs: dir };
  const mongod = await startMongod(paths, [dir]);
  const state = {
    ...paths,
    dir,
    evidence: join(dir, "evidence"),
    playground: dir,
    moduleRoot: dir,
    mongoUrl: mongod.url,
    ownsMongo: true,
    processes: [mongod.record],
  };
  t.after(async () => {
    await stopRecorded(state.processes);
    if (previous === undefined) delete process.env.DMS_CONTROL_MONGOD;
    else process.env.DMS_CONTROL_MONGOD = previous;
    rmSync(dir, { recursive: true, force: true });
  });
  const context = new JourneyContext(state, "feat", "j1", undefined, undefined);
  return { state, context, port: mongod.record.port };
}

await test("a journey stops the run's mongod and starts it again on the same port and data folder; a mongod left running, or started on a new port or folder, fails it", async (t) => {
  const { state, context, port } = await runOwningMongod(t);
  await context.stopDatabase();
  assert.equal(await accepts(port), false, "nothing listens once stopped");
  await context.startDatabase();
  assert.equal(await accepts(port), true, "mongod listens again");
  assert.equal(await starts(port), "2");
  assert.ok(
    state.processes.some(
      (entry) => entry.name === "mongod" && isSameProcess(entry),
    ),
    "the run records the mongod that runs now",
  );
});

await test("starting a mongod that runs keeps it; spawning another fails on its taken port", async (t) => {
  const { state, context } = await runOwningMongod(t);
  const [before] = state.processes;
  await context.startDatabase();
  assert.deepEqual(state.processes, [before]);
});

await test("a journey that ends with mongod stopped leaves it running for the next one, which a fresh database needs", async (t) => {
  const { context, port } = await runOwningMongod(t);
  await context.stopDatabase();
  await context.close();
  assert.equal(await accepts(port), true);
});

await test("a run on --mongo-url refuses to stop a mongod it does not own, the server keeps answering, and the journey still closes without trying to start it", async (t) => {
  const { state, context, port } = await runOwningMongod(t);
  state.ownsMongo = false;
  await assert.rejects(context.stopDatabase(), /--mongo-url/);
  await context.close();
  assert.equal(await accepts(port), true);
});

/**
 * @param {{ dir: string, logs: string }} state The run
 * @param {number} port The port it is recorded on
 * @returns {import("./run-state.mjs").BackendRecord} A backend the run recorded, a process that waits
 */
function recordedBackend(state, port) {
  const started = startDetached({
    name: `backend-${port}`,
    program: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    cwd: state.dir,
    env: process.env,
    logs: state.logs,
  });
  const backend = { ...started, port, database: `verify_x_${port}` };
  recordBackend(state.dir, backend);
  return backend;
}

await test("stopping the database kills the standby, which would boot without its database and be promoted, and keeps the backend the API forwards to", async (t) => {
  const { state, context } = await runOwningMongod(t);
  const serving = recordedBackend(state, 41001);
  const standby = recordedBackend(state, 41002);
  t.after(() => stopRecorded([serving, standby]));
  writeTarget(apiTargetFile(state.dir), serving.port);
  await context.stopDatabase();
  assert.deepEqual(
    liveBackends(state).map((backend) => backend.port),
    [serving.port],
  );
});

await test("a mongod that cannot take its port while another program holds it fails to start, instead of the run trusting that program", async (t) => {
  const { state, context, port } = await runOwningMongod(t);
  await context.stopDatabase();
  const squatter = startDetached({
    name: "squatter",
    program: process.execPath,
    args: [
      "-e",
      `require("node:net").createServer((s) => s.end()).listen(${port}, "127.0.0.1")`,
    ],
    cwd: state.dir,
    env: process.env,
    logs: state.logs,
  });
  t.after(() => stopRecorded([squatter]));
  await waitForPort(port, squatter, 5_000);
  await assert.rejects(context.startDatabase(), /does not listen on/);
});
