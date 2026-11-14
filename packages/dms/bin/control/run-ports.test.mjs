import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { ephemeralRange } from "./helpers/ephemeral-range.mjs";
import { canNarrowRange, runInNarrowRange } from "./helpers/narrow-range.mjs";
import { decode, isNumber, isString, nullable, objectOf } from "./json.mjs";
import { freePort } from "./processes.mjs";
import { runPorts } from "./stack.mjs";

/**
 * Takes the run's ports from `runPorts`, serves the mail sink on its port
 * and a dashboard stand-in on its own, and stops both. It then opens a
 * connection from every ephemeral port to a server on the API port and
 * closes each from the client side, which leaves the client's port in
 * TIME_WAIT, as a busy host would. It serves both again on the same ports
 * and reports the code each listen failed with, if any.
 */
const RESTART = `
import { mkdtempSync, rmSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
const control = process.argv[1];
const { runPorts } = await import(join(control, "stack.mjs"));
const { serveMail } = await import(join(control, "mail.mjs"));
const RANGE_SIZE = 8;
const dir = mkdtempSync(join(tmpdir(), "dms-control-run-restart-"));
const { apiPort, webPort, smtpPort } = await runPorts();
const listen = (server, port) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
const close = (server) => new Promise((resolve) => server.close(resolve));
const mail = () => serveMail(dir, smtpPort);
const dashboard = () => listen(createServer((socket) => socket.end()), webPort);
await close(await mail());
await close(await dashboard());
const backend = createServer((socket) => {
  socket.resume();
  socket.on("end", () => socket.end());
});
await listen(backend, apiPort);
const closeFromClient = () =>
  new Promise((resolve) => {
    const client = createConnection({ host: "127.0.0.1", port: apiPort });
    client.on("connect", () => client.end());
    client.on("error", resolve);
    client.on("close", resolve);
    client.resume();
  });
await Promise.all(Array.from({ length: RANGE_SIZE }, closeFromClient));
const failure = async (start) => {
  try {
    await close(await start());
    return null;
  } catch (error) {
    return error.code ?? String(error);
  }
};
const report = {
  webPort,
  smtpPort,
  mail: await failure(mail),
  dashboard: await failure(dashboard),
};
await close(backend);
rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify(report));
`;

const isRestartReport = objectOf({
  webPort: isNumber,
  smtpPort: isNumber,
  mail: nullable(isString),
  dashboard: nullable(isString),
});

await test(
  "a run's mail sink and dashboard, stopped and served again, listen on the run's ports while every ephemeral port is in another connection's TIME_WAIT; a version that takes them from freePort fails to listen with EADDRINUSE",
  {
    skip:
      !canNarrowRange() &&
      "this host does not let the test make a network namespace",
  },
  () => {
    const nested = runInNarrowRange(RESTART, import.meta.dirname);
    assert.equal(nested.status, 0, nested.stderr);
    const report = decode(
      isRestartReport,
      JSON.parse(nested.stdout),
      "the nested restart",
      "a report",
    );
    assert.deepEqual(
      { mail: report.mail, dashboard: report.dashboard },
      { mail: null, dashboard: null },
      `listening again on mail ${report.smtpPort} and dashboard ${report.webPort}`,
    );
  },
);

await test("a run's three ports are distinct and lie outside the kernel's ephemeral range", async () => {
  const { low, high } = ephemeralRange();
  const ports = Object.values(await runPorts());
  assert.equal(new Set(ports).size, 3, `${ports.join(", ")} repeat a port`);
  for (const port of ports) {
    assert.ok(
      port < low || port > high,
      `${port} lies in the ephemeral range ${low}-${high}`,
    );
  }
});

await test("a run takes no port fetch refuses to connect to; a version that keeps 6000, 10080 or 2049 makes fetch throw bad port", async (t) => {
  const candidates = [6000, 10080, 2049];
  for (let index = 0; index < 3; index += 1) candidates.push(await freePort());
  const ports = await runPorts(async () => candidates.shift() ?? freePort());
  for (const port of Object.values(ports)) {
    const server = createServer((_, response) => response.end("ok"));
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    t.after(() => server.close());
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(await response.text(), "ok", `fetch reaches ${port}`);
  }
});
