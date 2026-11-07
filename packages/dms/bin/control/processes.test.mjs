import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import {
  freePort,
  isAlive,
  killAll,
  listenersOf,
  startDetached,
} from "./processes.mjs";

const SLOW_STOP_MS = 5_000;
const POLL_MS = 20;

const HOLDER = `
const { createServer } = require("node:net");
createServer().listen(Number(process.argv[1]), "127.0.0.1");
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`;

const LEADER = `
const { spawn } = require("node:child_process");
const [sameGroup, ownGroup] = process.argv.slice(1);
const holder = (port, options) =>
  spawn(process.execPath, ["-e", ${JSON.stringify(HOLDER)}, port], { stdio: "ignore", ...options });
holder(sameGroup, {});
holder(ownGroup, { detached: true });
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`;

/**
 * Starts a SIGTERM-proof leader with one child in its group and one in a
 * group of its own, each holding a port.
 *
 * @param {import("node:test").TestContext} t The test
 * @param {number[]} ports The ports of the child in the group and of the other
 * @returns {Promise<number>} The leader's PID
 */
async function startTree(t, ports) {
  const logs = mkdtempSync(join(tmpdir(), "dms-control-processes-test-"));
  const leader = startDetached({
    name: "tree",
    program: process.execPath,
    args: ["-e", LEADER, ...ports.map(String)],
    cwd: logs,
    env: process.env,
    logs,
  });
  t.after(async () => {
    await killAll([leader.pid]).catch(() => []);
    rmSync(logs, { recursive: true, force: true });
  });
  for (let waited = 0; waited < SLOW_STOP_MS; waited += POLL_MS) {
    if (ports.every((port) => listenersOf(port)?.length)) return leader.pid;
    await sleep(POLL_MS);
  }
  throw new Error("the tree never listened");
}

/** @param {number} port */
function bind(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

await test("killAll ends a SIGTERM-proof tree at once and frees every port", async (t) => {
  const ports = [await freePort(), await freePort()];
  const leader = await startTree(t, ports);
  const started = Date.now();
  const lines = await killAll([leader]);
  assert.ok(
    Date.now() - started < SLOW_STOP_MS,
    "a SIGTERM and a grace period take ten seconds on this tree",
  );
  assert.equal(isAlive(leader), false);
  assert.equal(lines.length, 3);
  for (const port of ports) assert.equal(await bind(port), true);
});

await test("killAll resolves for a process that is already gone", async () => {
  assert.deepEqual(await killAll([2 ** 22 + 1]), []);
});
