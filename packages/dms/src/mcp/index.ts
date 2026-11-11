import { Logging } from "@antelopejs/interface-core/logging";
import { z } from "zod";
import { getConfig } from "../config";
import type { McpSettings } from "./server";

const McpConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    access: z.enum(["safe", "full"]).optional(),
    mcpJson: z.boolean().optional(),
  })
  .strict()
  .optional();

/**
 * The settings of this start, or nothing when MCP is off. A config the schema
 * refuses turns MCP off rather than guessing an access the integrator did not
 * write.
 */
function settingsOf(dev: boolean): McpSettings | undefined {
  const parsed = McpConfigSchema.safeParse(getConfig().mcp);
  if (!parsed.success) {
    Logging.Error(
      `[DMS] The mcp config is invalid, so the MCP server is off: ${parsed.error.message}`,
    );
    return undefined;
  }
  const config = parsed.data ?? {};
  if (!(config.enabled ?? dev)) return undefined;
  return {
    access: config.access ?? "full",
    writeMcpJson: config.mcpJson ?? true,
  };
}

/**
 * Serves the MCP server for coding agents when it is enabled: in development
 * (`ajs project dev`), or wherever `mcp.enabled` is `true`. Off, it loads
 * nothing of the server: no route, no tool, no file written.
 */
export async function startMcp(dev: boolean): Promise<void> {
  const settings = settingsOf(dev);
  if (settings === undefined) return;
  const { serveMcp } = await import("./server");
  await serveMcp(settings);
}
