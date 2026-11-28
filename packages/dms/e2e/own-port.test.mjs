import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { freePort } from "./processes.mjs";
import { waitForBackend, waitForDashboard } from "./stack.mjs";

const SERVE = `require("node:http").createServer((_, res) => res.end("ok")).listen(Number(process.argv[1]), "127.0.0.1")`;

/**
 * Starts `node -e code port` in a process group of its own and returns its
 * record on `port`.
 *
 * @param {string} name The record's name
 * @param {string} code The script
 * @param {number} port The port
 * @returns {import("./run-state.mjs").ServerRecord}
 */
function started(name, code, port) {
  const child = spawn(process.execPath, ["-e", code, String(port)], {
    detached: true,
    stdio: "ignore",
  });
  const pid = child.pid;
  if (pid === undefined) throw new Error(`${name} did not start`);
  return {
    name,
    pid,
    port,
    command: "node",
    cwd: process.cwd(),
    log: `${name}.log`,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Serves 200 on every path of `port` from this process, a stranger to any
 * process the test starts.
 *
 * @param {import("node:test").TestContext} t The test, which closes it
 * @param {number} port The port
 * @returns {Promise<void>}
 */
async function stranger(t, port) {
  const server = createServer((_, res) => res.end("ok"));
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
}

const UNTOLD =
  !existsSync("/proc/net/tcp") &&
  "/proc does not tell who listens on a port here";

/** @param {number} port */
function dashboardOn(port) {
  return { webPort: port, webUrl: `http://127.0.0.1:${port}` };
}

await test(
  "a backend whose port another run's server answers on fails its wait instead of serving that run (catches a readiness probe that accepts any 200 on the port)",
  { skip: UNTOLD },
  async (t) => {
    const port = await freePort();
    await stranger(t, port);
    const backend = started("backend", "setTimeout(() => {}, 2000)", port);

    await assert.rejects(waitForBackend(backend), /does not listen on/);
  },
);

await test(
  "a dashboard whose port another run's server answers on fails its wait instead of serving that run (catches a readiness probe that accepts any 200 on the port)",
  { skip: UNTOLD },
  async (t) => {
    const port = await freePort();
    await stranger(t, port);
    const frontend = started("frontend", "setTimeout(() => {}, 2000)", port);

    await assert.rejects(
      waitForDashboard(dashboardOn(port), frontend),
      /does not listen on/,
    );
  },
);

await test("a server that a started process runs in a child of its own passes both waits (catches a check that wants the recorded process itself to listen, as `ajs` starts the server below it)", async (t) => {
  const port = await freePort();
  const parent = `const c = require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(SERVE)}, process.argv[1]], { stdio: "ignore" }); setInterval(() => {}, 1000)`;
  const record = started("backend", parent, port);
  t.after(() => process.kill(-record.pid, "SIGKILL"));

  await assert.doesNotReject(waitForBackend(record));
  await assert.doesNotReject(waitForDashboard(dashboardOn(port), record));
});
