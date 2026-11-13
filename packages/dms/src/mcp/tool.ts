import type { JsonValue } from "@antelopejs/interface-dms/json";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { JsonObjectSchema } from "./json";

/**
 * What a tool changes. `read` changes nothing in the project; `builder`
 * rewrites the project's pages, resources and queries through the builder
 * engine, which typechecks each edit before it writes; `project` changes the
 * project past its sources: its configuration, `.env`, installed modules.
 */
export type McpToolEffect = "read" | "builder" | "project";

/** One text block of a tool's answer. */
export interface McpTextContent {
  type: "text";
  text: string;
}

/** A tool's answer, as MCP's `tools/call` returns it. */
export interface McpToolResult {
  content: McpTextContent[];
  isError?: boolean;
}

/** The JSON Schema of a tool's arguments, as `tools/list` hands it out. */
export type McpInputSchema = { [key: string]: JsonValue };

/** One tool the DMS MCP server serves, with its arguments parsed inside `call`. */
export interface McpTool {
  /** The snake_case name the agent calls, without the client's `mcp__dms__` prefix. */
  name: string;
  /** What MCP clients display. */
  title: string;
  description: string;
  effect: McpToolEffect;
  inputSchema: McpInputSchema;
  /**
   * Parses the arguments against the tool's schema, then runs it.
   *
   * @param sessionId The MCP session that made the call, as its bridge names
   * it; `undefined` when the caller named none.
   */
  call(args: JsonValue, sessionId?: string): Promise<McpToolResult>;
}

/** The zod schema of each argument of a tool, keyed by argument name. */
export type McpInputFields = { [argument: string]: z.ZodTypeAny };

/** What a module writes to declare a tool: the arguments typed from `input`. */
export interface McpToolSpec<Fields extends McpInputFields> {
  name: string;
  title: string;
  description: string;
  effect: McpToolEffect;
  input: z.ZodObject<Fields>;
  run(
    args: z.infer<z.ZodObject<Fields>>,
    sessionId: string | undefined,
  ): Promise<McpToolResult>;
}

/** A text answer; `isError` marks a failure the agent should read and act on. */
export function textResult(text: string, isError = false): McpToolResult {
  return isError
    ? { content: [{ type: "text", text }], isError }
    : { content: [{ type: "text", text }] };
}

/** Reads why a tool's run threw from what it threw: an `Error`'s message, or the value as a string. */
export const ThrownReasonSchema = z.union([
  z.instanceof(Error).transform((error) => error.message),
  z.unknown().transform(String),
]);

/** The answer of a tool whose run threw, with the reason `ThrownReasonSchema` read. */
export function thrownResult(toolName: string, reason: string): McpToolResult {
  return textResult(`${toolName} failed: ${reason}`, true);
}

/** A JSON answer, serialized as one text block. */
export function jsonResult(value: JsonValue, isError = false): McpToolResult {
  return textResult(JSON.stringify(value), isError);
}

function issuesText(error: z.ZodError): string {
  return error.issues
    .map(
      (issue) => `${issue.path.join(".") || "(arguments)"}: ${issue.message}`,
    )
    .join("\n");
}

function inputSchemaOf<Fields extends McpInputFields>(
  input: z.ZodObject<Fields>,
): McpInputSchema {
  const { $schema: _schema, ...schema } = JsonObjectSchema.parse(
    zodToJsonSchema(input, { target: "jsonSchema7", $refStrategy: "root" }),
  );
  return schema;
}

/**
 * Declares one MCP tool. The JSON Schema `tools/list` hands out is derived
 * from `input`, and `call` refuses arguments `input` rejects, so the schema an
 * agent reads and the one the handler trusts cannot drift apart.
 */
export function defineTool<Fields extends McpInputFields>(
  spec: McpToolSpec<Fields>,
): McpTool {
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    effect: spec.effect,
    inputSchema: inputSchemaOf(spec.input),
    async call(args, sessionId) {
      const parsed = spec.input.safeParse(args ?? {});
      if (!parsed.success) return textResult(issuesText(parsed.error), true);
      return spec.run(parsed.data, sessionId);
    },
  };
}
