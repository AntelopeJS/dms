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

export async function startMcp(dev: boolean): Promise<void> {
  const settings = settingsOf(dev);
  if (settings === undefined) return;
  const { serveMcp } = await import("./server");
  await serveMcp(settings);
}
