import { randomBytes } from "node:crypto";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { DEFAULT_API_BASE_URL, getApiBaseUrl } from "../config";
import type { McpAccess } from "./access";
import { startLogCapture } from "./log-buffer";
import { publishBridge } from "./project-files";
import { MCP_ROUTE_PATH, serveMcpSession } from "./route";
import { MCP_TOOLS } from "./tools";

const TOKEN_BYTES = 32;

/** What one start of the MCP server serves, read from the `mcp` config key. */
export interface McpSettings {
  access: McpAccess;
  writeMcpJson: boolean;
}

/**
 * Serves the tools on the MCP route under a credential drawn for this start,
 * then hands the route and the credential to the bridge. The route knows the
 * credential before the bridge can read it. A file that cannot be written is
 * logged: the DMS itself still starts.
 */
export async function serveMcp(settings: McpSettings): Promise<void> {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  serveMcpSession({ access: settings.access, tools: MCP_TOOLS }, token);
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
