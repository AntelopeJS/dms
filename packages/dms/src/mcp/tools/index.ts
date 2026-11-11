import type { McpTool } from "../tool";

/**
 * Every tool the DMS MCP server serves, in the order `tools/list` returns
 * them. A module adds a tool by declaring it with `defineTool` in its own
 * file under this folder and appending it here; the access a session holds
 * filters this list by each tool's `effect`.
 */
export const MCP_TOOLS: readonly McpTool[] = [];
