import { Logging } from "@antelopejs/interface-core/logging";
import { z } from "zod";
import { getConfig, type McpConfig } from "../config";
import type { McpSettings } from "./server";

const McpConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    access: z.enum(["safe", "full"]).optional(),
    mcpJson: z.boolean().optional(),
    backendUrl: z.string().optional(),
  })
  .strict()
  .optional() satisfies z.ZodType<McpConfig | undefined>;

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
    backendUrl: config.backendUrl,
  };
}

/**
 * Serves the MCP route when the config turns it on. It loads the builder engine first, in the
 * DMS's own context: the engine reads its module's connections from the module that loads it, and a
 * tool runs in the context of the module serving HTTP.
 *
 * @param dev Whether the runtime is in development mode.
 */
export async function startMcp(dev: boolean): Promise<void> {
  const settings = settingsOf(dev);
  if (settings === undefined) return;
  await import("../implementations/dms-builder/engine");
  const { serveMcp } = await import("./server");
  await serveMcp(settings);
}
