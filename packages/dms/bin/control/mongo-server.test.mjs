import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { pidIn } from "./helpers/pids.mjs";
import { isAlive } from "./identity.mjs";
import { mongodBinary, startMongod } from "./mongo.mjs";
import { stopRecorded } from "./processes.mjs";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * A run's folders, removed after the test once its `teardown` stopped what
 * the test started there: Windows removes no file a running process holds,
 * and frees those of a killed one a moment after it ends.
 *
 * @param {import("node:test").TestContext} t
 * @returns {{ root: string, mongo: string, logs: string, teardown: () => Promise<void> }} The folders, and what to run before they are removed
 */
function runFolders(t) {
  const root = mkdtempSync(join(tmpdir(), "dms-control-mongod-test-"));
  const paths = {
    root,
    mongo: join(root, "mongo"),
    logs: join(root, "logs"),
    teardown: () => Promise.resolve(),
  };
  t.after(async () => {
    await paths.teardown();
    rmSync(root, { recursive: true, force: true, maxRetries: 10 });
  });
  mkdirSync(paths.logs);
  return paths;
}

/**
 * Writes a mongod command that starts `binary` outside any replica set,
 * whatever it is asked, and records the mongod's pid in `spawned`. Where a
 * shell can `exec`, mongod keeps the pid the run records. Windows has no
 * `exec`, so there the command is a script that starts mongod as its child.
 *
 * @param {string} folder Where to write it
 * @param {string} binary The real mongod
 * @param {string} spawned The file that receives mongod's pid
 * @returns {string} The command, for `DMS_CONTROL_MONGOD`
 */
function standaloneMongod(folder, binary, spawned) {
  if (platform() === "win32") {
    const script = join(folder, "mongod-standalone.cjs");
    writeFileSync(
      script,
      `const option = (name) => process.argv[process.argv.indexOf(name) + 1];
const mongod = require("node:child_process").spawn(${JSON.stringify(binary)}, ["--dbpath", option("--dbpath"), "--port", option("--port"), "--bind_ip", "127.0.0.1"], { stdio: "inherit" });
require("node:fs").writeFileSync(${JSON.stringify(spawned)}, String(mongod.pid));
mongod.on("exit", (code) => process.exit(code ?? 1));
`,
    );
    return script;
  }
  const shell = join(folder, "mongod-standalone");
  writeFileSync(
    shell,
    `#!/bin/sh\necho $$ > "${spawned}"\nexec "${binary}" --dbpath "$2" --port "$4" --bind_ip 127.0.0.1\n`,
  );
  chmodSync(shell, 0o755);
  return shell;
}

await test("the run's mongod serves a change stream", async (t) => {
  const paths = runFolders(t);
  const server = await startMongod(paths, [PACKAGE_ROOT]);
  const client = new MongoClient(server.url);
  paths.teardown = async () => {
    await client.close();
    await stopRecorded([server.record]);
  };
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
  const saved = process.env.DMS_CONTROL_MONGOD;
  t.after(() => {
    if (saved === undefined) delete process.env.DMS_CONTROL_MONGOD;
    else process.env.DMS_CONTROL_MONGOD = saved;
  });
  const paths = runFolders(t);
  const binary = await mongodBinary([PACKAGE_ROOT]);
  const spawned = join(paths.root, "mongod.pid");
  process.env.DMS_CONTROL_MONGOD = standaloneMongod(
    paths.root,
    binary,
    spawned,
  );
  await assert.rejects(startMongod(paths, [PACKAGE_ROOT]), {
    message: "This node was not started with replication enabled.",
  });
  assert.equal(isAlive(pidIn(spawned)), false);
});

await test("a mongod restarted on its port and data folder serves a change stream again", async (t) => {
  const paths = runFolders(t);
  const first = await startMongod(paths, [PACKAGE_ROOT]);
  await stopRecorded([first.record]);
  const again = await startMongod(paths, [PACKAGE_ROOT], first.record.port);
  const client = new MongoClient(again.url);
  paths.teardown = async () => {
    await client.close();
    await stopRecorded([again.record]);
  };
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
