import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { serveForwarder, writeTarget } from "./forwarder.mjs";
import { freePort } from "./processes.mjs";

const TIMEOUT_MS = 3_000;

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
