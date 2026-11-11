import { readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import type { Readable, Writable } from "node:stream";
import { z } from "zod";

const HTTP_ACCEPTED = 202;
const JSON_RPC_INTERNAL_ERROR = -32603;

const BACKEND_UNREACHABLE =
  "The DMS backend is not running. Start the project with ajs project dev, then retry.";

const REFUSALS: ReadonlyMap<number, string> = new Map([
  [
    401,
    "The DMS backend refused the bridge's credential. Restart the project with ajs project dev, then retry.",
  ],
  [
    403,
    "The DMS backend refused a caller that is not on its machine. Set the dms apiBaseUrl to a loopback address such as http://127.0.0.1:5010.",
  ],
  [
    404,
    "The DMS backend serves no MCP route: it runs outside development mode, or mcp.enabled is false. Start the project with ajs project dev, then retry.",
  ],
  [
    413,
    "The request is larger than the DMS MCP server reads. Split it into smaller calls.",
  ],
]);

const BridgeConfigSchema = z.object({ url: z.string(), token: z.string() });

type BridgeConfig = z.infer<typeof BridgeConfigSchema>;

const RequestIdSchema = z.object({
  method: z.string(),
  id: z.union([z.string(), z.number()]),
});

interface RelayAnswer {
  status: number;
  text: string;
}

async function readConfig(configPath: string): Promise<BridgeConfig> {
  return BridgeConfigSchema.parse(
    JSON.parse(await readFile(configPath, "utf8")),
  );
}

function post(config: BridgeConfig, body: string): Promise<RelayAnswer> {
  const url = new URL(config.url);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}

function requestIdOf(line: string): string | number | undefined {
  try {
    return RequestIdSchema.safeParse(JSON.parse(line)).data?.id;
  } catch {
    return undefined;
  }
}

function failure(id: string | number, message: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: { code: JSON_RPC_INTERNAL_ERROR, message },
  });
}

async function relay(configPath: string, line: string): Promise<RelayAnswer> {
  return post(await readConfig(configPath), line);
}

function answerLine(
  id: string | number | undefined,
  answer: RelayAnswer,
): string | undefined {
  if (answer.status === HTTP_ACCEPTED) return undefined;
  if (answer.status >= 200 && answer.status < 300) return answer.text;
  if (id === undefined) return undefined;
  const refusal =
    REFUSALS.get(answer.status) ??
    `${BACKEND_UNREACHABLE} (HTTP ${answer.status})`;
  return failure(id, refusal);
}

/**
 * Calls `onLine` with each `\n`-terminated line of the stream. MCP's stdio
 * framing is `\n` alone: `readline` would also split at U+2028 and U+2029,
 * which `JSON.stringify` leaves raw inside strings.
 */
function onLines(input: Readable, onLine: (line: string) => void): void {
  let pending = "";
  input.setEncoding("utf8");
  input.on("data", (chunk: string) => {
    const parts = `${pending}${chunk}`.split("\n");
    pending = parts.pop() ?? "";
    for (const part of parts) onLine(part);
  });
}

/** The stdio MCP server a coding agent launches from the project's `.mcp.json`. */
export function runBridge(
  configPath: string,
  input: Readable,
  output: Writable,
): void {
  const write = (message: string | undefined) => {
    if (message !== undefined) output.write(`${message}\n`);
  };
  onLines(input, (line) => {
    if (line.trim().length === 0) return;
    const id = requestIdOf(line);
    relay(configPath, line).then(
      (answer) => write(answerLine(id, answer)),
      (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        if (id !== undefined) {
          write(failure(id, `${BACKEND_UNREACHABLE} (${reason})`));
        }
      },
    );
  });
}
