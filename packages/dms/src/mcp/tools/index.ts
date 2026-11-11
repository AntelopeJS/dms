import type { McpTool } from "../tool";
import { mockupAnnotationsTool } from "./mockup-annotations";
import { mockupPatchSpecTool } from "./mockup-patch-spec";
import { mockupResolveAnnotationTool } from "./mockup-resolve-annotation";
import { mockupWriteSpecTool } from "./mockup-write-spec";

/**
 * Every tool the DMS MCP server serves, in the order `tools/list` returns
 * them. A module adds a tool by declaring it with `defineTool` in its own
 * file under this folder and appending it here; the access a session holds
 * filters this list by each tool's `effect`.
 */
export const MCP_TOOLS: readonly McpTool[] = [
  mockupAnnotationsTool(),
  mockupResolveAnnotationTool(),
  mockupWriteSpecTool(),
  mockupPatchSpecTool(),
];
