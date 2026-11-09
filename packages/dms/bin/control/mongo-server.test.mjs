import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { mongodBinary, startMongod } from "./mongo.mjs";
import { stopRecorded } from "./processes.mjs";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * @param {import("node:test").TestContext} t
 * @returns {{ root: string, mongo: string, logs: string }} A run's folders, removed after the test
 */
function runFolders(t) {
  const root = mkdtempSync(join(tmpdir(), "dms-control-mongod-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = { root, mongo: join(root, "mongo"), logs: join(root, "logs") };
  mkdirSync(paths.logs);
  return paths;
}

await test("the run's mongod serves a change stream", async (t) => {
  const paths = runFolders(t);
  const server = await startMongod(paths, [PACKAGE_ROOT]);
  const client = new MongoClient(server.url);
  t.after(async () => {
    await client.close();
    await stopRecorded([server.record]);
  });
  const items = client.db("verify_test").collection("items");
  const stream = items.watch();
  assert.equal(await stream.tryNext(), null);
  await items.insertOne({ name: "watched" });
  const change = await stream.next();
  assert.equal(
    change.operationType === "insert" ? change.fullDocument.name : undefined,
    "watched",
  );
});

await test("a mongod that cannot join the replica set is stopped", async (t) => {
  const paths = runFolders(t);
  const binary = await mongodBinary([PACKAGE_ROOT]);
  const wrapper = join(paths.root, "mongod-standalone");
  writeFileSync(
    wrapper,
    `#!/bin/sh\nexec "${binary}" --dbpath "$2" --port "$4" --bind_ip 127.0.0.1\n`,
  );
  chmodSync(wrapper, 0o755);
  const saved = process.env.DMS_CONTROL_MONGOD;
  process.env.DMS_CONTROL_MONGOD = wrapper;
  t.after(() => {
    if (saved === undefined) delete process.env.DMS_CONTROL_MONGOD;
    else process.env.DMS_CONTROL_MONGOD = saved;
  });
  await assert.rejects(startMongod(paths, [PACKAGE_ROOT]), {
    message: "This node was not started with replication enabled.",
  });
  assert.equal(spawnSync("pgrep", ["-f", paths.mongo]).status, 1);
});

await test("a mongod restarted on its port and data folder serves a change stream again", async (t) => {
  const paths = runFolders(t);
  const first = await startMongod(paths, [PACKAGE_ROOT]);
  await stopRecorded([first.record]);
  const again = await startMongod(paths, [PACKAGE_ROOT], first.record.port);
  const client = new MongoClient(again.url);
  t.after(async () => {
    await client.close();
    await stopRecorded([again.record]);
  });
  const items = client.db("verify_test").collection("items");
  const stream = items.watch();
  assert.equal(await stream.tryNext(), null);
  await items.insertOne({ name: "after restart" });
  const change = await stream.next();
  assert.equal(
    change.operationType === "insert" ? change.fullDocument.name : undefined,
    "after restart",
  );
});
