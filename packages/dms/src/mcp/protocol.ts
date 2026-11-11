import type { JsonValue } from "@antelopejs/interface-dms/json";
import { z } from "zod";
import { isToolAllowed, type McpAccess } from "./access";
import { JsonObjectSchema, JsonValueSchema } from "./json";
import { type McpTool, type McpToolResult, textResult } from "./tool";

/** The protocol revisions this server speaks, newest first. */
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const SERVER_INFO = { name: "dms", title: "AntelopeJS DMS", version: "1" };

const JSON_RPC_INVALID_REQUEST = -32600;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;

const JsonRpcIdSchema = z.union([z.string(), z.number()]);

const JsonRpcMessageSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  id: JsonRpcIdSchema.optional(),
  params: JsonObjectSchema.optional(),
});

const JsonRpcResponseSchema = z.union([
  z.object({ id: JsonRpcIdSchema.nullable(), result: JsonValueSchema }),
  z.object({ id: JsonRpcIdSchema.nullable(), error: JsonObjectSchema }),
]);

const RequestIdSchema = z.object({ id: JsonRpcIdSchema });

const InitializeParamsSchema = z.object({ protocolVersion: z.string() });
const CallParamsSchema = z.object({
  name: z.string(),
  arguments: JsonObjectSchema.optional(),
});

type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;

/** One MCP session's view: the tools it may list and call. */
export interface McpSession {
  access: McpAccess;
  tools: readonly McpTool[];
}

class MethodError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

function negotiatedVersion(params: JsonValue | undefined): string {
  const requested =
    InitializeParamsSchema.safeParse(params).data?.protocolVersion;
  const known = PROTOCOL_VERSIONS.find((version) => version === requested);
  return known ?? PROTOCOL_VERSIONS[0];
}

function listTools(session: McpSession): JsonValue {
  return {
    tools: session.tools
      .filter((tool) => isToolAllowed(tool, session.access))
      .map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          title: tool.title,
          readOnlyHint: tool.effect === "read",
        },
      })),
  };
}

async function callTool(
  session: McpSession,
  params: JsonValue | undefined,
): Promise<JsonValue> {
  const parsed = CallParamsSchema.safeParse(params);
  if (!parsed.success) {
    throw new MethodError(JSON_RPC_INVALID_PARAMS, "tools/call needs a name");
  }
  const tool = session.tools.find(({ name }) => name === parsed.data.name);
  if (tool === undefined) {
    throw new MethodError(
      JSON_RPC_INVALID_PARAMS,
      `Unknown tool: ${parsed.data.name}`,
    );
  }
  if (!isToolAllowed(tool, session.access)) {
    throw new MethodError(
      JSON_RPC_INVALID_PARAMS,
      `${tool.name} is not available in Safe mode: it changes the project past what the builder edits.`,
    );
  }
  const result = await runTool(tool, parsed.data.arguments ?? {});
  const content = result.content.map(({ type, text }) => ({ type, text }));
  return result.isError === true ? { content, isError: true } : { content };
}

/** A tool that throws answers its failure as a result the agent reads, as MCP asks. */
async function runTool(tool: McpTool, args: JsonValue): Promise<McpToolResult> {
  try {
    return await tool.call(args);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return textResult(`${tool.name} failed: ${reason}`, true);
  }
}

async function dispatch(
  session: McpSession,
  method: string,
  params: JsonValue | undefined,
): Promise<JsonValue> {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: negotiatedVersion(params),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      };
    case "ping":
      return {};
    case "tools/list":
      return listTools(session);
    case "tools/call":
      return callTool(session, params);
    default:
      throw new MethodError(
        JSON_RPC_METHOD_NOT_FOUND,
        `Method not found: ${method}`,
      );
  }
}

function errorAnswer(
  id: JsonRpcId | null,
  code: number,
  message: string,
): JsonValue {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Answers one JSON-RPC message of the MCP protocol, stateless: initialize,
 * ping, tools/list and tools/call. A notification (no id) and a response the
 * client sends get no answer. The session's access is enforced here, on the
 * server, so it holds for every client whatever its own permission settings.
 */
export async function answerMcpMessage(
  session: McpSession,
  message: JsonValue,
): Promise<JsonValue | undefined> {
  const parsed = JsonRpcMessageSchema.safeParse(message);
  if (!parsed.success) {
    if (JsonRpcResponseSchema.safeParse(message).success) return undefined;
    const id = RequestIdSchema.safeParse(message).data?.id ?? null;
    return errorAnswer(id, JSON_RPC_INVALID_REQUEST, "Invalid request");
  }
  const { id, method } = parsed.data;
  if (id === undefined) return undefined;
  const { params } = parsed.data;
  try {
    return {
      jsonrpc: "2.0",
      id,
      result: await dispatch(session, method, params),
    };
  } catch (error) {
    if (error instanceof MethodError) {
      return errorAnswer(id, error.code, error.message);
    }
    throw error;
  }
}
