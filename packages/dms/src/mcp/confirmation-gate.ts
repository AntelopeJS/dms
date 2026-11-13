import type { JsonValue } from "@antelopejs/interface-dms/json";
import { JsonObjectSchema, JsonValueSchema } from "./json";
import { type McpToolResult, textResult } from "./tool";

const MILLISECONDS_PER_MINUTE = 60_000;
export const REPEAT_CONFIRMATION_WINDOW_MS = 10 * MILLISECONDS_PER_MINUTE;

export type ToolCallValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly ToolCallValue[]
  | { readonly [key: string]: ToolCallValue };

function sortKeys(_key: string, inner: JsonValue): JsonValue {
  if (Array.isArray(inner)) return inner;
  const object = JsonObjectSchema.safeParse(inner);
  if (!object.success) return inner;
  return Object.fromEntries(
    Object.entries(object.data).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function canonical(call: ToolCallValue): string {
  const json = JsonValueSchema.parse(
    JSON.parse(JSON.stringify(call) ?? "null"),
  );
  return JSON.stringify(json, sortKeys);
}

/**
 * The `code` of the JSON text block a hold refusal ends with, so a client
 * tells it apart from any other failure without reading the prose before it.
 */
export const CONFIRMATION_REQUIRED_CODE = "confirmation_required";

function refusal(toolName: string, details: string): McpToolResult {
  const explained = textResult(
    [
      `${toolName} was not run: no one has confirmed it yet.`,
      `Its arguments, with what the builder previewed: ${details}`,
      `Show this to the person you work for and ask them. Only if they confirm, call the tool again with exactly the same arguments within ${REPEAT_CONFIRMATION_WINDOW_MS / MILLISECONDS_PER_MINUTE} minutes; that call runs it.`,
    ].join("\n"),
    true,
  );
  return {
    ...explained,
    content: [
      ...explained.content,
      {
        type: "text",
        text: JSON.stringify({ code: CONFIRMATION_REQUIRED_CODE }),
      },
    ],
  };
}

function sessionlessRefusal(toolName: string): McpToolResult {
  return textResult(
    `${toolName} was not run: the MCP client sent no session, so no repeat of this call can confirm it. Restart the MCP client so it starts the current DMS bridge, then call it again.`,
    true,
  );
}

/** Stands in for a confirmation prompt the route cannot send: a call is refused once and runs when its MCP session repeats it unchanged within the window. */
export interface RepeatConfirmationGate {
  /**
   * The refusal to answer for `call`, or `undefined` when `sessionId` made the
   * same call and was refused within the window; that repeat runs once. A
   * hold belongs to the session it refused, so another session's identical
   * call is refused in turn, and a call with no session, or a blank one, is
   * always refused.
   */
  hold(
    sessionId: string | undefined,
    toolName: string,
    call: ToolCallValue,
  ): McpToolResult | undefined;
}

export function createRepeatConfirmationGate(
  now: () => number = Date.now,
): RepeatConfirmationGate {
  const pending = new Map<string, number>();
  return {
    hold(sessionId, toolName, call) {
      if (sessionId === undefined || sessionId.trim() === "") {
        return sessionlessRefusal(toolName);
      }
      const details = canonical(call);
      const key = JSON.stringify([sessionId, toolName, details]);
      const at = now();
      for (const [held, expiresAt] of pending) {
        if (expiresAt < at) pending.delete(held);
      }
      const isConfirmation = pending.delete(key);
      if (isConfirmation) return undefined;
      pending.set(key, at + REPEAT_CONFIRMATION_WINDOW_MS);
      return refusal(toolName, details);
    },
  };
}

export const repeatConfirmation = createRepeatConfirmationGate();
