import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import type { Readable, Writable } from "node:stream";
import { z } from "zod";
import { BACKEND_URL_HINT, isLoopbackUrl } from "./backend-url";

const HTTP_ACCEPTED = 202;
const JSON_RPC_INTERNAL_ERROR = -32603;

/** The header that names the MCP session a relayed message belongs to: one bridge process, one coding-agent session. */
export const MCP_SESSION_HEADER = "mcp-session-id";

/** The header that names which client a relayed message comes from, when the bridge was started for one. */
export const MCP_CLIENT_HEADER = "mcp-client";

/** A client the DMS tells apart from a coding agent's terminal session: `chat` is the dashboard's chat. */
export const McpClientSchema = z.enum(["chat"]);

/** A client {@link McpClientSchema} names. */
export type McpClient = z.infer<typeof McpClientSchema>;

const CLIENT_FLAG = "--client=";

/** The client the launcher's `--client=<name>` argument names, or `undefined` when it names none the DMS knows. */
export function clientFromArgs(args: readonly string[]): McpClient | undefined {
  const flag = args.find((arg) => arg.startsWith(CLIENT_FLAG));
  return McpClientSchema.safeParse(flag?.slice(CLIENT_FLAG.length)).data;
}

const BACKEND_UNREACHABLE =
  "The DMS backend is not running. Start the project with ajs project dev, then retry.";

const REFUSALS: ReadonlyMap<number, string> = new Map([
  [
    401,
    "The DMS backend refused the bridge's credential. Restart the project with ajs project dev, then retry.",
  ],
  [
    403,
    `The DMS backend refused a request that did not come straight from its own machine. ${BACKEND_URL_HINT}`,
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

const JsonRpcErrorAnswerSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]),
  error: z.object({ code: z.number(), message: z.string() }),
});

/** The `id` of a failure answer: `null` for a line that is not JSON, as JSON-RPC 2.0 requires. */
type FailureId = string | number | null;

interface RelayAnswer {
  status: number;
  text: string;
}

/** The bridge's credential is bound for a host that is not this machine, so no request was sent. */
class NonLoopbackBackendError extends Error {
  constructor() {
    super(
      `The bridge refused to send its credential to a backend that is not on this machine. ${BACKEND_URL_HINT}`,
    );
  }
}

async function readConfig(configPath: string): Promise<BridgeConfig> {
  return BridgeConfigSchema.parse(
    JSON.parse(await readFile(configPath, "utf8")),
  );
}

interface RelayOrigin {
  sessionId: string;
  client: McpClient | undefined;
}

function post(
  config: BridgeConfig,
  body: string,
  origin: RelayOrigin,
): Promise<RelayAnswer> {
  if (!isLoopbackUrl(config.url)) {
    return Promise.reject(new NonLoopbackBackendError());
  }
  const url = new URL(config.url);
  const transport = url.protocol === "https:" ? https : http;
  const headers: http.OutgoingHttpHeaders = {
    authorization: `Bearer ${config.token}`,
    [MCP_SESSION_HEADER]: origin.sessionId,
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  };
  if (origin.client !== undefined) headers[MCP_CLIENT_HEADER] = origin.client;
  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      { method: "POST", headers },
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

/** `undefined` for a notification, which gets no answer; `null` for a line that is not JSON. */
function requestIdOf(line: string): FailureId | undefined {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return null;
  }
  return RequestIdSchema.safeParse(message).data?.id;
}

function relayedJsonRpcError(text: string): string | undefined {
  try {
    return JsonRpcErrorAnswerSchema.safeParse(JSON.parse(text)).success
      ? text
      : undefined;
  } catch {
    return undefined;
  }
}

function failure(id: FailureId, message: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: { code: JSON_RPC_INTERNAL_ERROR, message },
  });
}

async function relay(
  configPath: string,
  line: string,
  origin: RelayOrigin,
): Promise<RelayAnswer> {
  return post(await readConfig(configPath), line, origin);
}

function answerLine(
  id: FailureId | undefined,
  answer: RelayAnswer,
): string | undefined {
  if (answer.status === HTTP_ACCEPTED) return undefined;
  if (answer.status >= 200 && answer.status < 300) return answer.text;
  const relayed = relayedJsonRpcError(answer.text);
  if (relayed !== undefined) return relayed;
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

/**
 * The stdio MCP server a coding agent launches from the project's `.mcp.json`.
 *
 * @param args The launcher's command-line arguments: `--client=chat` marks
 * every message of this bridge as the dashboard chat's.
 */
export function runBridge(
  configPath: string,
  input: Readable,
  output: Writable,
  args: readonly string[] = [],
): void {
  const origin: RelayOrigin = {
    sessionId: randomUUID(),
    client: clientFromArgs(args),
  };
  const write = (message: string | undefined) => {
    if (message !== undefined) output.write(`${message}\n`);
  };
  onLines(input, (line) => {
    if (line.trim().length === 0) return;
    const id = requestIdOf(line);
    relay(configPath, line, origin).then(
      (answer) => write(answerLine(id, answer)),
      (error: unknown) => {
        if (id === undefined) return;
        if (error instanceof NonLoopbackBackendError) {
          write(failure(id, error.message));
          return;
        }
        const reason = error instanceof Error ? error.message : String(error);
        write(failure(id, `${BACKEND_UNREACHABLE} (${reason})`));
      },
    );
  });
}
