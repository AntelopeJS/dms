import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";

/**
 * @typedef {{ id: number, result?: unknown, error?: unknown }} Answer
 * @typedef {{ request: (method: string, params?: Record<string, unknown>) => Promise<Answer>, call: (name: string, args?: Record<string, unknown>) => Promise<Answer> }} Session
 * @typedef {Pick<import("../../../packages/dms/bin/control/journey.mjs").JourneyContext, "state" | "restartBackend">} Run
 */

/** The launcher the project's `.mcp.json` runs, relative to the project root. */
export const BRIDGE_LAUNCHER = posix.join("node_modules", ".cache", "dms", "mcp-bridge.cjs");

const ANSWER_TIMEOUT_MS = 60_000;
const OWNER_ONLY_MODE = 0o600;
const CREDENTIAL_ATTEMPTS = 3;

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>} Whether it is a JSON object, not an array, a primitive or `null`
 */
export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isString(value) {
  return typeof value === "string";
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isNumber(value) {
  return typeof value === "number";
}

/**
 * @param {unknown} value
 * @returns {value is Answer}
 */
function isAnswer(value) {
  return isRecord(value) && Object.hasOwn(value, "id") && isNumber(value.id);
}

/**
 * @param {string} text
 * @returns {unknown} The parsed JSON, `undefined` when the text is not JSON
 */
export function parseJson(text) {
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown} The field the object itself holds, `undefined` for any other value
 */
export function fieldOf(value, key) {
  return isRecord(value) && Object.hasOwn(value, key) ? value[key] : undefined;
}

/**
 * @param {unknown} value
 * @returns {unknown[]} The items of a list, empty for any other value
 */
export function itemsOf(value) {
  if (!Array.isArray(value)) return [];
  /** @type {unknown[]} */
  const items = value;
  return items;
}

/**
 * @param {unknown} value
 * @returns {string} The string, empty for any other value
 */
export function textOf(value) {
  return isString(value) ? value : "";
}

/**
 * The credential the serving backend published, with the URL moved onto the
 * run's API port. The playground's `apiBaseUrl` is the dashboard's address,
 * and the dashboard server adds `X-Forwarded-For`, which the MCP route
 * refuses. A developer keeps `apiBaseUrl` on loopback, so the run reaches the
 * route through its API port, which forwards to the backend as is.
 *
 * @param {string} projectRoot The run's playground
 * @param {string} apiUrl The run's API URL
 * @returns {{ url: string, token: string }} The route and the token
 */
function publishedCredential(projectRoot, apiUrl) {
  const read = parseJson(readFileSync(join(projectRoot, "node_modules", ".cache", "dms", "mcp.json"), "utf8"));
  const route = textOf(fieldOf(read, "url"));
  const token = textOf(fieldOf(read, "token"));
  if (route === "" || token === "") throw new Error("the bridge credential file holds no url and token");
  return { url: `${apiUrl}${new URL(route).pathname}`, token };
}

/**
 * The credential of the backend the run serves. Every backend of a run
 * publishes into the same project folder, including the standby already
 * booting for the next journey, so the file may hold another backend's token.
 * A restart of the serving backend publishes last of the backends that booted
 * before it.
 *
 * @param {Run} ctx The journey
 * @param {string} projectRoot The run's playground
 * @returns {Promise<{ url: string, token: string }>} The route and the token
 */
async function servingCredential(ctx, projectRoot) {
  for (let attempt = 1; attempt <= CREDENTIAL_ATTEMPTS; attempt += 1) {
    const credential = publishedCredential(projectRoot, ctx.state.apiUrl);
    const answer = await fetch(credential.url, {
      method: "POST",
      headers: { authorization: `Bearer ${credential.token}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" }),
    });
    if (answer.ok) return credential;
    await ctx.restartBackend();
  }
  throw new Error(`no credential in the bridge file is the serving backend's after ${CREDENTIAL_ATTEMPTS} restarts`);
}

/**
 * Starts the stdio bridge as a coding agent does, and hands `action` a
 * session that sends one JSON-RPC line per request and waits for the line
 * that answers it. The bridge reads its credential file for every message,
 * and a standby backend rewrites the project's file while a journey runs, so
 * the project's launcher is copied beside a private credential file.
 *
 * @template T
 * @param {Run} ctx The journey
 * @param {(session: Session) => Promise<T>} action What to do with the session
 * @returns {Promise<T>} What `action` returned
 */
export async function withBridge(ctx, action) {
  const projectRoot = ctx.state.runPlayground ?? ctx.state.playground;
  const credential = await servingCredential(ctx, projectRoot);
  const folder = mkdtempSync(join(tmpdir(), "verify-dms-mcp-"));
  copyFileSync(join(projectRoot, BRIDGE_LAUNCHER), join(folder, "mcp-bridge.cjs"));
  writeFileSync(join(folder, "mcp.json"), JSON.stringify(credential), { mode: OWNER_ONLY_MODE });
  const child = spawn(process.execPath, [join(folder, "mcp-bridge.cjs")], { stdio: ["pipe", "pipe", "inherit"] });
  /** @type {Map<number, (answer: Answer) => void>} */
  const waiting = new Map();
  let pending = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (/** @type {string} */ chunk) => {
    const lines = `${pending}${chunk}`.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const answer = parseJson(line);
      if (isAnswer(answer)) waiting.get(answer.id)?.(answer);
    }
  });
  let next = 0;
  /** @type {Session["request"]} */
  const request = (method, params) => {
    next += 1;
    const id = next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no answer to ${method} in ${ANSWER_TIMEOUT_MS} ms`)), ANSWER_TIMEOUT_MS);
      waiting.set(id, (answer) => {
        clearTimeout(timer);
        resolve(answer);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  };
  try {
    await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify-dms", version: "1" } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    return await action({ request, call: (name, args = {}) => request("tools/call", { name, arguments: args }) });
  } finally {
    child.kill();
    rmSync(folder, { recursive: true, force: true });
  }
}

/**
 * The text of a `tools/call` answer, the one block the DMS tools return. A
 * JSON-RPC error answer has no block: its message stands in, as a failure.
 *
 * @param {Answer} answer
 * @returns {{ text: string, isError: boolean }} The block's text, and whether the tool reported a failure
 */
export function toolText(answer) {
  if (answer.error !== undefined) return { text: textOf(fieldOf(answer.error, "message")), isError: true };
  const [first] = itemsOf(fieldOf(answer.result, "content"));
  return { text: textOf(fieldOf(first, "text")), isError: fieldOf(answer.result, "isError") === true };
}
