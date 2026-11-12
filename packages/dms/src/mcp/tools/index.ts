import type { McpTool } from "../tool";
import { builderCatalogTool } from "./builder-catalog";
import { builderComposeTool } from "./builder-compose";
import { BUILDER_PAGE_TOOLS } from "./builder-pages";
import { BUILDER_PROJECT_TOOLS } from "./builder-project";
import { BUILDER_QUERY_TOOLS } from "./builder-queries";
import { BUILDER_RESOURCE_TOOLS } from "./builder-resources";
import { builderTableViewTool } from "./builder-table-view";
import { BUILDER_THEME_TOOLS } from "./builder-theme";
import { DATABASE_TOOLS } from "./database";
import { PAGE_VERIFY_TOOLS } from "./page-verify";
import { PAGE_TOOLS } from "./pages";
import { previewBlocksTool } from "./preview-blocks";
import { queryLogsTool } from "./query-logs";
import { typecheckTool } from "./typecheck";

/** Every tool the DMS MCP server serves, in the order `tools/list` returns them. */
export const MCP_TOOLS: readonly McpTool[] = [
  builderCatalogTool,
  ...BUILDER_PAGE_TOOLS,
  builderTableViewTool,
  builderComposeTool,
  ...BUILDER_RESOURCE_TOOLS,
  ...BUILDER_QUERY_TOOLS,
  ...BUILDER_PROJECT_TOOLS,
  ...BUILDER_THEME_TOOLS,
  ...PAGE_TOOLS,
  ...PAGE_VERIFY_TOOLS,
  previewBlocksTool,
  typecheckTool,
  queryLogsTool,
  ...DATABASE_TOOLS,
];
