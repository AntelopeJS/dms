import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { serveForwarder, writeTarget } from "./forwarder.mjs";
import {
  EPHEMERAL_RANGE_FILE,
  ephemeralRange,
} from "./helpers/ephemeral-range.mjs";
import { decode, isNumber, isString, nullable, objectOf } from "./json.mjs";
import { freePort, restartablePort } from "./processes.mjs";

const TIMEOUT_MS = 3_000;
const NESTED_TIMEOUT_MS = 30_000;
const NARROW_RANGE = "40000 40007";

/**
 * Runs in a network namespace whose ephemeral range is eight ports wide: it
 * serves a forwarder on the port `restartablePort` gives, stops it, then
 * opens a connection from every ephemeral port and closes each from the
 * client side, which leaves the client's port in TIME_WAIT, as a busy host
 * would. It serves the forwarder on the same port again and reports the
 * port and the code of the error that listen failed with, if any.
 */
const RESTART = `
import { mkdtempSync, rmSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
const control = process.argv[1];
const { restartablePort } = await import(join(control, "processes.mjs"));
const { serveForwarder } = await import(join(control, "forwarder.mjs"));
const RANGE_SIZE = 8;
const dir = mkdtempSync(join(tmpdir(), "dms-control-forwarder-restart-"));
const file = join(dir, "api-target");
const port = await restartablePort();
const first = await serveForwarder(port, file);
await new Promise((resolve) => first.close(resolve));
const backend = createServer((socket) => {
  socket.resume();
  socket.on("end", () => socket.end());
});
let backendPort = port;
while (backendPort === port) backendPort = await restartablePort();
await new Promise((resolve) => backend.listen(backendPort, "127.0.0.1", resolve));
const closeFromClient = () =>
  new Promise((resolve) => {
    const client = createConnection({ host: "127.0.0.1", port: backendPort });
    client.on("connect", () => client.end());
    client.on("error", resolve);
    client.on("close", resolve);
    client.resume();
  });
await Promise.all(Array.from({ length: RANGE_SIZE }, closeFromClient));
let code = null;
try {
  const again = await serveForwarder(port, file);
  again.close();
} catch (error) {
  code = error.code ?? String(error);
}
backend.close();
rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ port, code }));
`;

const isRestartReport = objectOf({
  port: isNumber,
  code: nullable(isString),
});

/** @returns {boolean} True where the test may make a user and network namespace with a loopback interface */
function canUnshareNetwork() {
  return (
    spawnSync("unshare", ["-rn", "ip", "link", "set", "lo", "up"]).status === 0
  );
}

/**
 * A backend stand-in that answers `<name>:<what it received>` once the
 * client finishes sending, and can drop every connection it holds.
 *
 * @param {import("node:test").TestContext} t The test
 * @param {string} name What it answers with
 * @returns {Promise<{ port: number, dropAll: () => void, received: () => string }>} Its port, a way to drop its connections, and what it received
 */
async function backend(t, name) {
  const port = await freePort();
  /** @type {Set<import("node:net").Socket>} */
  const sockets = new Set();
  let total = "";
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let received = "";
    socket.on("data", (chunk) => {
      received += String(chunk);
      total += String(chunk);
    });
    socket.on("end", () => socket.end(`${name}:${received}`));
  });
  const dropAll = () => {
    for (const socket of sockets) socket.destroy();
  };
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  t.after(() => {
    dropAll();
    server.close();
  });
  return {
    port,
    dropAll,
    received: () => total,
  };
}

/**
 * A forwarder on a free port, with its target file.
 *
 * @param {import("node:test").TestContext} t The test
 * @returns {Promise<{ port: number, file: string }>} Its port and target file
 */
async function forwarder(t) {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-forwarder-test-"));
  const file = join(dir, "api-target");
  const port = await freePort();
  const server = await serveForwarder(port, file);
  t.after(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { port, file };
}

/**
 * Opens a connection to `port`, sends `message` and finishes sending.
 *
 * @param {number} port The port
 * @param {string} message What to send
 * @returns {Promise<string>} What came back before the connection ended
 * @throws When the connection is reset, or nothing ends it in time
 */
function exchange(port, message) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let answer = "";
    socket.setTimeout(TIMEOUT_MS, () => {
      socket.destroy();
      reject(new Error("the connection hung"));
    });
    socket.on("data", (chunk) => {
      answer += String(chunk);
    });
    socket.on("end", () => resolve(answer));
    socket.on("error", reject);
    socket.end(message);
  });
}

await test("each connection reaches the port the target names when it arrives", async (t) => {
  const first = await backend(t, "first");
  const second = await backend(t, "second");
  const api = await forwarder(t);
  writeTarget(api.file, first.port);
  assert.equal(await exchange(api.port, "x"), "first:x");
  writeTarget(api.file, second.port);
  assert.equal(await exchange(api.port, "y"), "second:y");
  writeTarget(api.file, first.port);
  assert.equal(await exchange(api.port, "z"), "first:z");
});

await test("a client that finishes sending still receives the whole answer", async (t) => {
  const only = await backend(t, "only");
  const api = await forwarder(t);
  writeTarget(api.file, only.port);
  const message = "m".repeat(256 * 1024);
  assert.equal(await exchange(api.port, message), `only:${message}`);
});

await test("a connection whose backend goes away is closed, not left open", async (t) => {
  const dying = await backend(t, "dying");
  const api = await forwarder(t);
  writeTarget(api.file, dying.port);
  const socket = createConnection({ host: "127.0.0.1", port: api.port });
  t.after(() => socket.destroy());
  socket.on("error", () => undefined);
  const closed = new Promise((resolve, reject) => {
    socket.on("close", resolve);
    setTimeout(() => reject(new Error("still open")), TIMEOUT_MS).unref();
  });
  socket.write("partial");
  while (dying.received() !== "partial") {
    await new Promise((resolve) => setImmediate(resolve));
  }
  dying.dropAll();
  await closed;
  assert.equal(socket.destroyed, true);
});

await test("with no listener or no port to reach, a connection is reset at once and the next one is served", async (t) => {
  const alive = await backend(t, "alive");
  const api = await forwarder(t);
  await assert.rejects(exchange(api.port, "x"), { code: "ECONNRESET" });
  writeTarget(api.file, await freePort());
  await assert.rejects(exchange(api.port, "x"), { code: "ECONNRESET" });
  writeTarget(api.file, alive.port);
  assert.equal(await exchange(api.port, "y"), "alive:y");
});

await test(
  "a forwarder stopped and served again listens on its port while every ephemeral port is in another connection's TIME_WAIT; a version that takes the port from freePort fails to listen with EADDRINUSE",
  {
    skip:
      !canUnshareNetwork() &&
      "this host does not let the test make a network namespace",
  },
  () => {
    const nested = spawnSync(
      "unshare",
      [
        "-rn",
        "sh",
        "-c",
        `ip link set lo up && echo "${NARROW_RANGE}" > ${EPHEMERAL_RANGE_FILE} && exec "$0" --input-type=module -e "$1" "$2"`,
        process.execPath,
        RESTART,
        import.meta.dirname,
      ],
      { encoding: "utf8", timeout: NESTED_TIMEOUT_MS },
    );
    assert.equal(nested.status, 0, nested.stderr);
    const report = decode(
      isRestartReport,
      JSON.parse(nested.stdout),
      "the nested restart",
      "a report",
    );
    assert.equal(report.code, null, `listening again on ${report.port}`);
  },
);

await test("a restartable port lies outside the kernel's ephemeral range and is free to listen on", async () => {
  const { low, high } = ephemeralRange();
  const port = await restartablePort();
  assert.ok(
    port < low || port > high,
    `${port} lies in the ephemeral range ${low}-${high}`,
  );
  const server = await serveForwarder(port, join(tmpdir(), "unused-target"));
  server.close();
});
