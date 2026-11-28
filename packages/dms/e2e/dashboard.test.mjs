import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { freshDatabase } from "./backend.mjs";
import { awaitDashboard, recordDashboardModules } from "./dashboard.mjs";
import { newRun } from "./helpers/fake-run.mjs";
import { freePort, restartablePort, startDetached } from "./processes.mjs";
import { waitForOk } from "./waits.mjs";
import { saveRun } from "./run-state.mjs";
import { record } from "./stack.mjs";

const SECRET = "fake-bootstrap-secret";
const READY_TIMEOUT_MS = 10_000;

/** A dev dashboard that serves the module set it read from the API at start, answering every request with it, and rebuilds as `ajs dms dev` does: after two polls that read another set, it stops listening, reads the set again and listens on it. */
const FAKE_DASHBOARD = `
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
const manifest = process.env.FAKE_API + "/dms/frontend?renderer=vue&rendererVersion=3";
const headers = { "x-dms-bootstrap": process.env.DMS_BOOTSTRAP_SECRET };
const read = async () => JSON.stringify((await (await fetch(manifest, { headers })).json()).modules);
let served = await read();
let candidate;
const server = createServer((request, response) => response.end(served));
const listen = () => new Promise((resolve) => server.listen(Number(process.env.PORT), "127.0.0.1", resolve));
await listen();
for (;;) {
  await sleep(500);
  const now = await read().catch(() => served);
  if (now === served) candidate = undefined;
  else if (now !== candidate) candidate = now;
  else {
    server.close();
    server.closeAllConnections();
    await sleep(500);
    served = await read();
    candidate = undefined;
    await listen();
  }
}
`;

/**
 * A run with a dev dashboard on its first journey database, served by a
 * production backend, as `up --dev-frontend` leaves it.
 *
 * @param {import("node:test").TestContext} t The test
 * @returns {Promise<import("./run-state.mjs").RunState>} The run
 */
async function devDashboardRun(t) {
  const state = await newRun(t);
  state.frontendMode = "dev";
  state.secrets = { DMS_BOOTSTRAP_SECRET: SECRET };
  state.webPort = await restartablePort();
  state.webUrl = `http://127.0.0.1:${state.webPort}`;
  saveRun(state);
  await freshDatabase(state, "j001");
  const script = join(state.dir, "fake-dashboard.mjs");
  writeFileSync(script, FAKE_DASHBOARD);
  const frontend = startDetached({
    name: "frontend",
    program: process.execPath,
    args: [script],
    cwd: state.dir,
    env: {
      ...process.env,
      FAKE_API: state.apiUrl,
      PORT: String(state.webPort),
      DMS_BOOTSTRAP_SECRET: SECRET,
    },
    logs: state.logs,
  });
  record(state, { ...frontend, port: state.webPort });
  await waitForOk(`${state.webUrl}/dms-preview`, frontend, READY_TIMEOUT_MS);
  await recordDashboardModules(state);
  return state;
}

/**
 * @param {import("./run-state.mjs").RunState} state
 * @returns {Promise<unknown>}
 */
async function dashboardModules(state) {
  const response = await fetch(`${state.webUrl}/dms-preview`);
  return JSON.parse(await response.text());
}

await test("in a dev-frontend run, a journey backend that serves another module set is served only once the dashboard has rebuilt on that set", async (t) => {
  const state = await devDashboardRun(t);
  await freshDatabase(state, "j002", { backend: "dev" });
  assert.deepEqual(await dashboardModules(state), [
    { name: "fake", priority: 0, path: "/fake" },
  ]);
});

await test("the dashboard's wait reads the API's module set on a connection of its own, not on one an earlier read left open to a backend the run has since stopped", async (t) => {
  const state = await newRun(t);
  state.frontendMode = "dev";
  state.secrets = { DMS_BOOTSTRAP_SECRET: SECRET };
  const answered = new WeakSet();
  const api = createServer((request, response) => {
    if (answered.has(request.socket)) {
      request.socket.destroy();
      return;
    }
    answered.add(request.socket);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ version: 1, modules: [{ name: "fake" }] }));
  });
  const port = await freePort();
  await new Promise((resolve) => api.listen(port, "127.0.0.1", resolve));
  t.after(() => {
    api.closeAllConnections();
    api.close();
  });
  state.apiUrl = `http://127.0.0.1:${port}`;
  await recordDashboardModules(state);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.doesNotReject(awaitDashboard(state));
});

await test("in a dev-frontend run, a journey backend that serves the same module set is served without waiting for a rebuild", async (t) => {
  const state = await devDashboardRun(t);
  await freshDatabase(state, "j002");
  assert.deepEqual(await dashboardModules(state), [
    { name: "fake", priority: 0 },
  ]);
});
