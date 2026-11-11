import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { Logging } from "@antelopejs/interface-core/logging";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { z } from "zod";
import { resolveBridgeOrigin } from "./backend-url";
import { JsonObjectSchema } from "./json";

const CACHE_DIR_SEGMENTS = ["node_modules", ".cache", "dms"];
const BRIDGE_CONFIG_FILE_NAME = "mcp.json";
const BRIDGE_LAUNCHER_FILE_NAME = "mcp-bridge.cjs";
const PROJECT_MCP_JSON_FILE_NAME = ".mcp.json";
/** The server's key in `.mcp.json`, and so the `mcp__dms__` prefix of its tools. */
const MCP_SERVER_KEY = "dms";
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const JSON_INDENT = 2;
const FORMAT_PRINT_WIDTH = 80;
const EXPANDED_PRIMITIVE_ARRAY =
  /\[\n((?: *(?:"(?:[^"\\\n]|\\.)*"|-?\d[\d.eE+-]*|true|false|null),?\n)+) *\]/g;
const ZERO_WIDTH = /^[\p{M}\p{Cc}​-‏⁠﻿]$/u;
const DOUBLE_WIDTH =
  /^[\p{Extended_Pictographic}ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3FFFD}]$/u;

const LAUNCHER_FROM_ROOT = path.posix.join(
  ...CACHE_DIR_SEGMENTS,
  BRIDGE_LAUNCHER_FILE_NAME,
);

const BRIDGE_MODULE_PATH = path.join(__dirname, "bridge.js");

export interface BridgeFiles {
  projectPath: string;
  url: string;
  token: string;
  writeMcpJson: boolean;
}

type JsonObject = { [key: string]: JsonValue };

function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    if (ZERO_WIDTH.test(char)) continue;
    width += DOUBLE_WIDTH.test(char) ? 2 : 1;
  }
  return width;
}

/** Serializes `.mcp.json` the way oxfmt and Prettier print JSON with their default options. */
export function formatMcpJson(value: JsonValue): string {
  const expanded = JSON.stringify(value, null, JSON_INDENT);
  return expanded.replace(
    EXPANDED_PRIMITIVE_ARRAY,
    (match: string, body: string, offset: number) => {
      const items = body
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => line.trim().replace(/,$/, ""));
      const inline = `[${items.join(", ")}]`;
      const lineStart = expanded.lastIndexOf("\n", offset) + 1;
      const end = offset + match.length;
      const lineEnd = expanded.indexOf("\n", end);
      const line =
        expanded.slice(lineStart, offset) +
        inline +
        expanded.slice(end, lineEnd === -1 ? expanded.length : lineEnd);
      return displayWidth(line) <= FORMAT_PRINT_WIDTH ? inline : match;
    },
  );
}

function launcherSource(): string {
  return `require(${JSON.stringify(BRIDGE_MODULE_PATH)}).runBridge(require("node:path").join(__dirname, ${JSON.stringify(BRIDGE_CONFIG_FILE_NAME)}), process.stdin, process.stdout);\n`;
}

async function writePrivateAtomically(
  filePath: string,
  content: string,
): Promise<void> {
  const temp = `${filePath}.${process.pid}.tmp`;
  await writeFile(temp, content, { mode: PRIVATE_FILE_MODE });
  await chmod(temp, PRIVATE_FILE_MODE);
  await rename(temp, filePath);
}

const MissingFileSchema = z.object({ code: z.literal("ENOENT") });
const McpJsonSchema = z.object({ mcpServers: JsonObjectSchema.optional() });

interface McpJsonFile {
  file: JsonObject;
  servers: JsonObject;
}

async function readMcpJson(filePath: string): Promise<McpJsonFile | undefined> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (MissingFileSchema.safeParse(error).success) {
      return { file: {}, servers: {} };
    }
    throw error;
  }
  try {
    const file = JsonObjectSchema.safeParse(JSON.parse(raw));
    const declared = McpJsonSchema.safeParse(file.data);
    if (!file.success || !declared.success) return undefined;
    return { file: file.data, servers: declared.data.mcpServers ?? {} };
  } catch {
    return undefined;
  }
}

async function ensureMcpJsonEntry(projectPath: string): Promise<void> {
  const filePath = path.join(projectPath, PROJECT_MCP_JSON_FILE_NAME);
  const current = await readMcpJson(filePath);
  if (current === undefined) {
    Logging.Warn(
      `[DMS] ${PROJECT_MCP_JSON_FILE_NAME} is not a JSON object with an object of servers, so the ${MCP_SERVER_KEY} MCP server was not added to it.`,
    );
    return;
  }
  const { file, servers } = current;
  if (Object.hasOwn(servers, MCP_SERVER_KEY)) return;
  const next = {
    ...file,
    mcpServers: {
      ...servers,
      [MCP_SERVER_KEY]: { command: "node", args: [LAUNCHER_FROM_ROOT] },
    },
  };
  await writeFile(filePath, `${formatMcpJson(next)}\n`);
}

/** What `publishMcpBridge` needs to write the bridge for one start. */
export interface McpBridgeTarget {
  projectPath: string;
  token: string;
  writeMcpJson: boolean;
  backendUrl: string | undefined;
  apiBaseUrl: string;
  routePath: string;
}

/**
 * Writes the bridge files for the backend this start serves, unless that
 * backend is not on this machine: then it writes nothing, so the credential
 * stays here, and logs one warning that names `mcp.backendUrl`.
 */
export async function publishMcpBridge(target: McpBridgeTarget): Promise<void> {
  const resolved = resolveBridgeOrigin(target.backendUrl, target.apiBaseUrl);
  if ("refusal" in resolved) {
    Logging.Warn(resolved.refusal);
    return;
  }
  try {
    await publishBridge({
      projectPath: target.projectPath,
      url: `${resolved.origin}${target.routePath}`,
      token: target.token,
      writeMcpJson: target.writeMcpJson,
    });
  } catch (error) {
    Logging.Error(
      "[DMS] The MCP bridge files could not be written, so coding agents cannot reach the MCP server:",
      error,
    );
  }
}

export async function publishBridge(files: BridgeFiles): Promise<void> {
  const cacheDir = path.join(files.projectPath, ...CACHE_DIR_SEGMENTS);
  await mkdir(cacheDir, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  await writePrivateAtomically(
    path.join(cacheDir, BRIDGE_CONFIG_FILE_NAME),
    JSON.stringify({ url: files.url, token: files.token }),
  );
  await writeFile(
    path.join(cacheDir, BRIDGE_LAUNCHER_FILE_NAME),
    launcherSource(),
  );
  if (files.writeMcpJson) await ensureMcpJsonEntry(files.projectPath);
}
