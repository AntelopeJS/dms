import type { JsonValue } from "@antelopejs/interface-dms/json";
import { JsonObjectSchema, JsonValueSchema } from "./json";
import { type McpToolResult, textResult } from "./tool";

/** How long a refused call stays confirmable by an identical second call. */
export const REPEAT_CONFIRMATION_WINDOW_MS = 10 * 60_000;

/** A tool call's arguments as zod parsed them: JSON, with `undefined` where an optional argument is left out. */
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

/** The JSON text of a call with every object's keys sorted, so two equal calls compare equal. */
function canonical(call: ToolCallValue): string {
  const json = JsonValueSchema.parse(
    JSON.parse(JSON.stringify(call) ?? "null"),
  );
  return JSON.stringify(json, sortKeys);
}

function refusal(toolName: string, details: string): McpToolResult {
  return textResult(
    [
      `${toolName} was not run: no one has confirmed it yet.`,
      `Its arguments, with what the builder previewed: ${details}`,
      "Show this to the person you work for and ask them. Only if they confirm, call the tool again with exactly the same arguments within 10 minutes; that call runs it.",
    ].join("\n"),
    true,
  );
}

/**
 * Holds a call that no one confirmed: a deletion, a project configuration
 * change, a mapping that removes pages. An MCP client has no confirmation
 * card, so the first call answers what it would do and runs nothing.
 */
export interface RepeatConfirmationGate {
  /**
   * The refusal to answer for `call`, or `undefined` when the same call was
   * refused within the window: that repeat runs, once. The details the
   * builder previewed belong in `call`, so a repeat whose preview changed is
   * a new call and is refused again.
   */
  hold(toolName: string, call: ToolCallValue): McpToolResult | undefined;
}

/** A gate that keeps its pending calls in memory, timed by `now`. */
export function createRepeatConfirmationGate(
  now: () => number = Date.now,
): RepeatConfirmationGate {
  const pending = new Map<string, number>();
  return {
    hold(toolName, call) {
      const details = canonical(call);
      const key = `${toolName}\u0000${details}`;
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

/** The gate every MCP session shares: the server keeps no session of its own. */
export const repeatConfirmation = createRepeatConfirmationGate();
