import type { McpTool, McpToolEffect } from "./tool";

/**
 * The tool scope of an MCP session. `safe` serves only the tools that read
 * the project or edit it through the builder engine; `full` serves every tool.
 */
export type McpAccess = "safe" | "full";

const EFFECTS_BY_ACCESS: Readonly<
  Record<McpAccess, ReadonlySet<McpToolEffect>>
> = {
  safe: new Set<McpToolEffect>(["read", "builder"]),
  full: new Set<McpToolEffect>(["read", "builder", "project"]),
};

/** Whether a session with this access may list and call the tool. */
export function isToolAllowed(tool: McpTool, access: McpAccess): boolean {
  return EFFECTS_BY_ACCESS[access].has(tool.effect);
}
