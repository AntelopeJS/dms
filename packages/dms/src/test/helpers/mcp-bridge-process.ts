import { type ChildProcess, spawn } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { z } from "zod";
import { getBaseUrl } from "./http";
import { readBridgeConfig } from "./mcp";

const LAUNCHER = join(
  __dirname,
  "../../../node_modules/.cache/dms/mcp-bridge.cjs",
);
const OWNER_ONLY_MODE = 0o600;
const ANSWER_TIMEOUT_MS = 10_000;

const AnswerSchema = z.object({
  id: z.number(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});

/** One JSON-RPC answer, as the bridge writes it on its stdout. */
export type BridgeAnswer = z.infer<typeof AnswerSchema>;

/** The params of the requests the tests send: `initialize` names a protocol version, `tools/call` a tool and its arguments. */
export interface BridgeParams {
  protocolVersion?: string;
  name?: string;
  arguments?: Record<string, JsonValue>;
}

/** A stdio bridge a coding agent would launch, pointed at the test API. */
export interface BridgeProcess {
  /** Sends one request and resolves with the line that answers it. */
  request(method: string, params?: BridgeParams): Promise<BridgeAnswer>;
  close(): Promise<void>;
}

const ToolResultSchema = z.object({
  content: z.array(z.object({ text: z.string() })),
  isError: z.boolean().optional(),
});

/** What a tool answered through the bridge: its text blocks joined, and whether it reported a failure. */
export interface ToolAnswer {
  text: string;
  isError: boolean;
}

/** Calls a tool through the bridge as a coding agent does, failing on a JSON-RPC error instead of a tool result. */
export async function callTool(
  bridge: BridgeProcess,
  name: string,
  args: Record<string, JsonValue> = {},
): Promise<ToolAnswer> {
  const answer = await bridge.request("tools/call", { name, arguments: args });
  const { content, isError } = ToolResultSchema.parse(answer.result);
  return {
    text: content.map(({ text }) => text).join(""),
    isError: isError === true,
  };
}

/**
 * Runs the launcher the module published, from a copy beside a credential
 * file that holds this start's token and the test API's address: the published
 * file names the configured `apiBaseUrl`, and the harness's API listens on a
 * port the OS assigned.
 */
export async function startBridge(): Promise<BridgeProcess> {
  const folder = await mkdtemp(join(tmpdir(), "dms-mcp-bridge-"));
  await copyFile(LAUNCHER, join(folder, "mcp-bridge.cjs"));
  await writeFile(
    join(folder, "mcp.json"),
    JSON.stringify({
      url: `${getBaseUrl()}/dms/mcp`,
      token: readBridgeConfig().token,
    }),
    { mode: OWNER_ONLY_MODE },
  );
  const child: ChildProcess = spawn(
    process.execPath,
    [join(folder, "mcp-bridge.cjs")],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  const waiting = new Map<number, (answer: BridgeAnswer) => void>();
  const lines = createInterface({ input: child.stdout! });
  lines.on("line", (line) => {
    const parsed = AnswerSchema.safeParse(JSON.parse(line));
    if (parsed.success) waiting.get(parsed.data.id)?.(parsed.data);
  });
  let last = 0;
  return {
    request(method, params) {
      last += 1;
      const id = last;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(`no answer to ${method} in ${ANSWER_TIMEOUT_MS} ms`),
            ),
          ANSWER_TIMEOUT_MS,
        );
        waiting.set(id, (answer) => {
          clearTimeout(timer);
          resolve(answer);
        });
        child.stdin!.write(
          `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
        );
      });
    },
    async close() {
      child.kill();
      lines.close();
      await rm(folder, { recursive: true, force: true });
    },
  };
}
