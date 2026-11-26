import { z } from "zod";
import type { McpConfig } from "../config";
import { ownValue } from "../utils/own-value";
import type { McpTool, McpToolEffect } from "./tool";

export type McpAccess = NonNullable<McpConfig["access"]>;

/** The access levels of an MCP session, from the narrowest to the widest. */
export const McpAccessSchema = z.enum([
  "safe",
  "full",
]) satisfies z.ZodType<McpAccess>;

const EFFECTS_BY_ACCESS: Readonly<
  Record<McpAccess, ReadonlySet<McpToolEffect>>
> = {
  safe: new Set<McpToolEffect>(["read", "builder"]),
  full: new Set<McpToolEffect>(["read", "builder", "project"]),
};

/** Whether a session with this access may list and call the tool. */
export function isToolAllowed(tool: McpTool, access: McpAccess): boolean {
  return ownValue(EFFECTS_BY_ACCESS, access)?.has(tool.effect) ?? false;
}

/**
 * The access one request runs with: the stricter of the project's configured
 * `mcp.access` and the access its client asked for. A client can narrow its
 * access, never widen it; a missing or unknown request keeps the configured one.
 *
 * @param requested The access the client's bridge relayed, as it came.
 */
export function narrowedAccess(
  configured: McpAccess,
  requested: string | undefined,
): McpAccess {
  const asked = McpAccessSchema.safeParse(requested).data;
  if (asked === undefined) return configured;
  const levels = McpAccessSchema.options;
  return levels.indexOf(asked) < levels.indexOf(configured)
    ? asked
    : configured;
}
