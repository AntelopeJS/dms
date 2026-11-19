import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { join } from "node:path";

const MAX_PORT = 65_535;

/**
 * The file that names the port the run's API forwarder sends new
 * connections to.
 *
 * @param {string} dir The run folder
 * @returns {string} The file
 */
export function apiTargetFile(dir) {
  return join(dir, "api-target");
}

/**
 * The port a target file names, or `null` when it is missing or names none.
 *
 * @param {string} file The target file
 * @returns {number | null} The port
 */
export function readTarget(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const port = Number(text.trim());
  return Number.isInteger(port) && port > 0 && port <= MAX_PORT ? port : null;
}

/**
 * Points the forwarder's new connections at `port`. The file is replaced
 * whole, so a connection reads the old port or the new one, never a part.
 *
 * @param {string} file The target file
 * @param {number} port The loopback port
 */
export function writeTarget(file, port) {
  const next = `${file}.${process.pid}`;
  writeFileSync(next, `${port}\n`);
  renameSync(next, file);
}

/**
 * @param {import("node:net").Socket} client
 * @param {number | null} target
 */
function forward(client, target) {
  if (target === null) {
    client.resetAndDestroy();
    return;
  }
  const upstream = createConnection({
    host: "127.0.0.1",
    port: target,
    allowHalfOpen: true,
  });
  upstream.on("error", () => client.resetAndDestroy());
  client.on("error", () => upstream.destroy());
  client.pipe(upstream);
  upstream.pipe(client);
}

/**
 * Serves a TCP forwarder on a loopback port. Each connection goes to the
 * port `file` names when it arrives, and keeps it until it closes. One that
 * arrives while the file names no port, or names a port nothing listens on,
 * is reset at once.
 *
 * @param {number} port The loopback port to listen on
 * @param {string} file The target file
 * @returns {Promise<import("node:net").Server>} The server, once it listens
 */
export function serveForwarder(port, file) {
  const server = createServer({ allowHalfOpen: true }, (client) =>
    forward(client, readTarget(file)),
  );
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
