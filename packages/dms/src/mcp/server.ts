import { Logging } from "@antelopejs/interface-core/logging";
import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { DEFAULT_API_BASE_URL, getApiBaseUrl } from "../config";
import type { McpAccess } from "./access";
import { startLogCapture } from "./log-buffer";
import { publishBridge } from "./project-files";
import { MCP_ROUTE_PATH, serveMcpSession } from "./route";
import { MCP_TOOLS } from "./tools";

export interface McpSettings {
  access: McpAccess;
  writeMcpJson: boolean;
}

export async function serveMcp(settings: McpSettings): Promise<void> {
  const token = serveMcpSession({
    access: settings.access,
    tools: MCP_TOOLS,
  });
  startLogCapture();
  const { projectPath } = await GetRuntimeInfo();
  const origin = (getApiBaseUrl() ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  try {
    await publishBridge({
      projectPath,
      url: `${origin}${MCP_ROUTE_PATH}`,
      token,
      writeMcpJson: settings.writeMcpJson,
    });
  } catch (error) {
    Logging.Error(
      "[DMS] The MCP bridge files could not be written, so coding agents cannot reach the MCP server:",
      error,
    );
  }
}
