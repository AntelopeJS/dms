import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const playgroundRoot = join(packageRoot, "playground");
const require = createRequire(join(playgroundRoot, "package.json"));
const coreCli = join(
  dirname(require.resolve("@antelopejs/core/package.json")),
  "dist/core/cli/index.js",
);
const frontendCli = require.resolve("@antelopejs/dms-frontend/dist/index.js");
const apiUrl = process.env.DMS_API_BASE_URL ?? "http://127.0.0.1:5010";
const previewUrl = "http://127.0.0.1:3001";
const READY_ATTEMPTS = 120;
const POLL_MS = 1000;
const SECRET_BYTES = 32;
/** @typedef {import("node:child_process").ChildProcess & { done: Promise<void> }} Server */

/** @type {Set<Server>} */
const children = new Set();

for (const name of [
  "DMS_JWT_SECRET",
  "AUTH_JWT_SECRET",
  "DMS_BOOTSTRAP_SECRET",
  "DMS_HTML_RENDER_SECRET",
  "DMS_SESSION_SECRET",
]) {
  process.env[name] ??= randomBytes(SECRET_BYTES).toString("hex");
}
process.env.DMS_CLIENT_BASE_URL ??= previewUrl;
process.env.DMS_API_BASE_URL = apiUrl;
process.env.DMS_DOCS_PREVIEW = "1";
process.env.PORT = "5010";

/**
 * @param {string} script
 * @param {string[]} [args]
 * @returns {Server}
 */
function start(script, args = []) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: playgroundRoot,
    stdio: "inherit",
    env: process.env,
  });
  /** @type {Promise<void>} */
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`${script} exited: ${code ?? signal}`)),
    );
  });
  done.catch(() => {});
  const server = Object.assign(child, { done });
  children.add(server);
  child.once("exit", () => children.delete(server));
  return server;
}

function backend() {
  return start(coreCli, ["project", "start", "-e", "docs", "--refresh-config"]);
}

function frontend() {
  return start(frontendCli, ["start", "-b", apiUrl, "-p", "3001"]);
}

/**
 * @param {string} url
 * @param {Server} child
 * @param {Record<string, string | undefined>} [headers]
 */
async function waitFor(url, child, headers = {}) {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
    if (child.exitCode !== null || child.signalCode) {
      await child.done;
      throw new Error(`Server exited before ${url} was ready`);
    }
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(POLL_MS),
    }).catch(() => undefined);
    if (response?.ok) return;
    await setTimeout(POLL_MS);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopChildren() {
  for (const child of children) child.kill("SIGTERM");
  await Promise.allSettled([...children].map((child) => child.done));
}

async function build() {
  const { MongoMemoryServer } = await import("mongodb-memory-server-core");
  const mongo = await MongoMemoryServer.create({
    binary: { version: "7.0.45" },
  });
  process.env.MONGO_URL = mongo.getUri();
  try {
    await start(coreCli, ["project", "build", "-e", "docs"]).done;
    await start(join(packageRoot, "scripts/docs-catalog.mjs")).done;
    const api = backend();
    await waitFor(`${apiUrl}/dms/frontend`, api, {
      "x-dms-bootstrap": process.env.DMS_BOOTSTRAP_SECRET,
    });
    await start(frontendCli, ["build", "-e", "docs"]).done;
    const client = frontend();
    await waitFor(`${previewUrl}/dms-preview`, client);
    await start(join(packageRoot, "scripts/docs-screenshots.mjs"), [
      "--base-url",
      previewUrl,
    ]).done;
  } finally {
    await stopChildren();
    await mongo.stop();
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await stopChildren();
    process.exit(0);
  });
}

/** @type {Record<string, () => Promise<void>>} */
const modes = {
  build,
  backend: () => backend().done,
  frontend: () => frontend().done,
};
const mode = modes[process.argv[2]];
if (!mode) throw new Error("Expected build, backend or frontend");
await mode();
