import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { arrayOf, decode, isNumber, isString, objectOf } from "./json.mjs";
import { dropDatabase, dropRunDatabases, mongodBinary } from "./mongo.mjs";

const isDriverLog = objectOf({
  label: isString,
  built: isNumber,
  closed: isNumber,
  dropped: arrayOf(isString),
});

/**
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>} packages Package name to the source of its `index.js`
 * @returns {string} The folder whose `node_modules` holds them
 */
function project(t, packages) {
  const folder = mkdtempSync(join(tmpdir(), "dms-control-mongo-test-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  writeFileSync(join(folder, "package.json"), "{}");
  for (const [name, source] of Object.entries(packages)) {
    const root = join(folder, "node_modules", name);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "package.json"), `{"name":"${name}"}`);
    writeFileSync(join(root, "index.js"), source);
  }
  return folder;
}

/**
 * A driver whose client lists databases and records what is done to it in `globalThis.fakeMongo`, labelled by `label`.
 * @param {{ label?: string, names?: string, listing?: string, client?: string, exported?: string }} [shape] `exported` is the expression the module exports as `MongoClient`
 * @returns {string}
 */
function fakeDriver({
  label = "driver",
  names = '["verify_run1_a", "verify_run1_b", "other", "verify_run2_a"]',
  listing = `{ databases: ${names}.map((name) => ({ name })), ok: 1 }`,
  client = "",
  exported = "MongoClient",
} = {}) {
  return `
const state = { label: "${label}", built: 0, closed: 0, dropped: [] };
Object.defineProperty(globalThis, "fakeMongo", { value: state, configurable: true });
class MongoClient {
  constructor() { state.built += 1; }
  async connect() {}
  async close() { state.closed += 1; }
  db(name) {
    return {
      admin: () => ({ listDatabases: async () => (${listing}) }),
      dropDatabase: async () => { state.dropped.push(name); },
    };
  }
}
${client}
module.exports = { MongoClient: ${exported} };
`;
}

/**
 * @returns {{ label: string, built: number, closed: number, dropped: string[] }} What was done to the client built last
 */
function driverLog() {
  /** @type {unknown} */
  const recorded = Object.getOwnPropertyDescriptor(
    globalThis,
    "fakeMongo",
  )?.value;
  return decode(isDriverLog, recorded, "fakeMongo", "the driver log");
}

await test("the run's databases are dropped and every other one is kept", async (t) => {
  const folder = project(t, { mongodb: fakeDriver() });
  const lines = await dropRunDatabases("mongodb://x", "verify_run1", [folder]);
  assert.deepEqual(lines, [
    "dropped database verify_run1_a",
    "dropped database verify_run1_b",
  ]);
  assert.deepEqual(driverLog().dropped, ["verify_run1_a", "verify_run1_b"]);
  assert.equal(driverLog().closed, 1);
});

await test("one database is dropped by name", async (t) => {
  const folder = project(t, { mongodb: fakeDriver() });
  await dropDatabase("mongodb://x", "verify_run1_a", [folder]);
  assert.deepEqual(driverLog().dropped, ["verify_run1_a"]);
  assert.equal(driverLog().closed, 1);
});

await test("the driver beside mongodb-memory-server-core wins over an earlier folder's own", async (t) => {
  const first = project(t, { mongodb: fakeDriver({ label: "first" }) });
  const second = project(t, {
    mongodb: fakeDriver({ label: "second" }),
    "mongodb-memory-server-core": "module.exports = {};",
  });
  await dropDatabase("mongodb://x", "verify_run1_a", [first, second]);
  assert.equal(driverLog().label, "second");
});

await test("a list of databases with a nameless entry is refused and the client still closes", async (t) => {
  const folder = project(t, {
    mongodb: fakeDriver({ listing: "{ databases: [{ id: 1 }] }" }),
  });
  await assert.rejects(
    dropRunDatabases("mongodb://x", "verify_run1", [folder]),
    {
      message: "listDatabases is malformed: expected a list of databases",
    },
  );
  assert.equal(driverLog().closed, 1);
  assert.deepEqual(driverLog().dropped, []);
});

await test("a driver without MongoClient is refused", async (t) => {
  const folder = project(t, {
    mongodb: "module.exports = { MongoClient: 1 };",
  });
  await assert.rejects(dropDatabase("mongodb://x", "a", [folder]), {
    message: "The MongoDB driver exports no MongoClient",
  });
});

await test("an arrow function is no MongoClient and is never called", async (t) => {
  const folder = project(t, {
    mongodb: fakeDriver({ exported: "(url) => { state.built += 1; }" }),
  });
  await assert.rejects(dropDatabase("mongodb://x", "a", [folder]), {
    message: "The MongoDB driver exports no MongoClient",
  });
  assert.equal(driverLog().built, 0);
});

await test("a class is a MongoClient and is built once", async (t) => {
  const folder = project(t, { mongodb: fakeDriver() });
  await dropDatabase("mongodb://x", "a", [folder]);
  assert.equal(driverLog().built, 1);
  assert.deepEqual(driverLog().dropped, ["a"]);
});

await test("a bound class is a MongoClient and is built once", async (t) => {
  const folder = project(t, {
    mongodb: fakeDriver({ exported: "MongoClient.bind(null)" }),
  });
  await dropDatabase("mongodb://x", "a", [folder]);
  assert.equal(driverLog().built, 1);
  assert.deepEqual(driverLog().dropped, ["a"]);
});

for (const member of ["connect", "close", "db"]) {
  await test(`a client whose ${member} is no function is refused before it is used`, async (t) => {
    const folder = project(t, {
      mongodb: fakeDriver({ client: `MongoClient.prototype.${member} = 1;` }),
    });
    await assert.rejects(dropDatabase("mongodb://x", "a", [folder]), {
      message: "MongoClient built something that is no client",
    });
    assert.deepEqual(driverLog().dropped, []);
  });
}

await test("a client without close is refused before it is used", async (t) => {
  const folder = project(t, {
    mongodb: fakeDriver({ client: "delete MongoClient.prototype.close;" }),
  });
  await assert.rejects(dropDatabase("mongodb://x", "a", [folder]), {
    message: "MongoClient built something that is no client",
  });
  assert.deepEqual(driverLog().dropped, []);
});

const NO_DATABASES = [
  ["nothing", "{}"],
  ["no admin", "{ dropDatabase: async () => {} }"],
  ["no dropDatabase", "{ admin: () => ({}) }"],
  [
    "an admin that is no function",
    "{ admin: 1, dropDatabase: async () => {} }",
  ],
  [
    "a dropDatabase that is no function",
    "{ admin: () => ({}), dropDatabase: 1 }",
  ],
];

for (const [kind, database] of NO_DATABASES) {
  await test(`a driver whose db() answers ${kind} is refused`, async (t) => {
    const folder = project(t, {
      mongodb: fakeDriver({
        client: `MongoClient.prototype.db = () => (${database});`,
      }),
    });
    await assert.rejects(dropDatabase("mongodb://x", "a", [folder]), {
      message: "MongoClient.db(a) returned no database",
    });
    assert.equal(driverLog().closed, 1);
  });
}

const NO_LIST_DATABASES = [
  ["no listDatabases", "{}"],
  ["a listDatabases that is no function", "{ listDatabases: 1 }"],
];

for (const [kind, admin] of NO_LIST_DATABASES) {
  await test(`an admin handle with ${kind} is refused and drops nothing`, async (t) => {
    const folder = project(t, {
      mongodb: fakeDriver({
        client: `MongoClient.prototype.db = () => ({ admin: () => (${admin}), dropDatabase: async () => { state.dropped.push("any"); } });`,
      }),
    });
    await assert.rejects(
      dropRunDatabases("mongodb://x", "verify_run1", [folder]),
      {
        message: "The admin handle of the driver has no listDatabases",
      },
    );
    assert.equal(driverLog().closed, 1);
    assert.deepEqual(driverLog().dropped, []);
  });
}

await test("a missing driver names the devDependency to add", async (t) => {
  const folder = project(t, {});
  await assert.rejects(dropDatabase("mongodb://x", "a", [folder]), {
    message:
      "dms-control needs mongodb: add it to the playground's devDependencies.",
  });
});

/**
 * @param {import("node:test").TestContext} t
 * @param {string} resolver The source of the `getPath` the package exports
 * @returns {string}
 */
function memoryServer(t, resolver) {
  return project(t, {
    "mongodb-memory-server-core": `
module.exports = { MongoBinary: { getPath: async (options) => { Object.defineProperty(globalThis, "fakeBinaryRequest", { value: options, configurable: true }); return ${resolver}; } } };
`,
  });
}

/**
 * @param {import("node:test").TestContext} t
 */
function withoutConfiguredMongod(t) {
  const saved = { ...process.env };
  t.after(() => {
    process.env = saved;
  });
  delete process.env.DMS_CONTROL_MONGOD;
  process.env.PATH = "";
}

await test("the binary comes from the memory server package when none is configured", async (t) => {
  withoutConfiguredMongod(t);
  const folder = memoryServer(t, '"/cache/mongod"');
  assert.equal(await mongodBinary([folder]), "/cache/mongod");
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(globalThis, "fakeBinaryRequest")?.value,
    { version: "8.0.8" },
  );
});

await test("a binary path that is no string is refused", async (t) => {
  withoutConfiguredMongod(t);
  const folder = memoryServer(t, "42");
  await assert.rejects(mongodBinary([folder]), {
    message:
      "MongoBinary.getPath is malformed: expected the path of a mongod binary",
  });
});

await test("a MongoBinary whose getPath is no function is refused", async (t) => {
  withoutConfiguredMongod(t);
  const folder = project(t, {
    "mongodb-memory-server-core":
      "module.exports = { MongoBinary: { getPath: 42 } };",
  });
  await assert.rejects(mongodBinary([folder]), {
    message: "mongodb-memory-server-core exports no MongoBinary",
  });
});

await test("a memory server package without MongoBinary is refused", async (t) => {
  withoutConfiguredMongod(t);
  const folder = project(t, {
    "mongodb-memory-server-core": "module.exports = {};",
  });
  await assert.rejects(mongodBinary([folder]), {
    message: "mongodb-memory-server-core exports no MongoBinary",
  });
});
