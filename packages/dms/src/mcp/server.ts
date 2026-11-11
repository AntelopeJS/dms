import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { DEFAULT_API_BASE_URL, getApiBaseUrl } from "../config";
import type { McpAccess } from "./access";
import { startLogCapture } from "./log-buffer";
import { publishMcpBridge } from "./project-files";
import { MCP_ROUTE_PATH, serveMcpSession } from "./route";
import { MCP_TOOLS } from "./tools";

export interface McpSettings {
  access: McpAccess;
  writeMcpJson: boolean;
  backendUrl: string | undefined;
}

export async function serveMcp(settings: McpSettings): Promise<void> {
  const token = serveMcpSession({
    access: settings.access,
    tools: MCP_TOOLS,
  });
  startLogCapture();
  const { projectPath } = await GetRuntimeInfo();
  await publishMcpBridge({
    projectPath,
    token,
    writeMcpJson: settings.writeMcpJson,
    backendUrl: settings.backendUrl,
    apiBaseUrl: getApiBaseUrl() ?? DEFAULT_API_BASE_URL,
    routePath: MCP_ROUTE_PATH,
  });
}
