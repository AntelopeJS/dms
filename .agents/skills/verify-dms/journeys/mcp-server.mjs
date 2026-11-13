import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BRIDGE_LAUNCHER, fieldOf, itemsOf, parseJson, textOf, toolText, withBridge } from "../mcp-bridge.mjs";

/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

const ROUTE = "/dms/mcp";
const OWNER_ONLY_MODE = 0o600;
const PERMISSION_BITS = 0o777;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const USERS_PAGE = "/table-view/table-view-users";

/** The MCP server the DMS serves in development, reached through its stdio bridge. */
export const journeys = [
  {
    id: "bridge-initializes-and-lists-tools",
    title: "the stdio bridge answers initialize and lists every tool of the full scope, with the read tools marked read-only",
    entryPoint: `node ${BRIDGE_LAUNCHER}`,
    async run(/** @type {Ctx} */ ctx) {
      await withBridge(ctx, async (session) => {
        const init = await session.request("initialize", { protocolVersion: "2025-06-18" });
        const tools = itemsOf(fieldOf((await session.request("tools/list")).result, "tools"));
        const named = (/** @type {string} */ name) => tools.find((tool) => fieldOf(tool, "name") === name);
        const readOnly = (/** @type {string} */ name) => fieldOf(fieldOf(named(name), "annotations"), "readOnlyHint");
        await ctx.verify("initialize names the server and offers tools", [
          ctx.equal("server name", fieldOf(fieldOf(init.result, "serverInfo"), "name"), "dms"),
          ctx.equal("protocol version", fieldOf(init.result, "protocolVersion"), "2025-06-18"),
          ctx.holds("tools capability", fieldOf(fieldOf(init.result, "capabilities"), "tools") !== undefined, JSON.stringify(init.result)),
        ]);
        await ctx.verify("tools/list serves the read, builder and project tools", [
          ctx.holds("builder_catalog is listed", named("builder_catalog"), tools.length),
          ctx.holds("builder_create_page is listed", named("builder_create_page"), tools.length),
          ctx.holds("builder_delete_resource is listed in the full scope", named("builder_delete_resource"), tools.length),
          ctx.holds("database_connections is listed", named("database_connections"), tools.length),
          ctx.holds("typecheck is listed", named("typecheck"), tools.length),
          ctx.equal("builder_catalog is read-only", readOnly("builder_catalog"), true),
          ctx.equal("builder_create_page is not read-only", readOnly("builder_create_page"), false),
        ]);
      });
    },
  },
  {
    id: "bridge-calls-a-read-tool",
    title: "tools/call through the bridge runs builder_catalog and answers the block catalog as text",
    entryPoint: `node ${BRIDGE_LAUNCHER}, tools/call builder_catalog`,
    async run(/** @type {Ctx} */ ctx) {
      await withBridge(ctx, async (session) => {
        const { text, isError } = toolText(await session.call("builder_catalog"));
        const catalog = parseJson(text);
        await ctx.verify("the catalog lists block types, DataTypes and the reserved field names", [
          ctx.equal("the tool reports no failure", isError, false),
          ctx.holds("a block type is indexed", itemsOf(fieldOf(catalog, "blocks")).length > 0, text.slice(0, 200)),
          ctx.holds("a DataType is indexed", itemsOf(fieldOf(catalog, "dataTypes")).length > 0, text.slice(0, 200)),
          ctx.holds("reservedFieldNames is present", itemsOf(fieldOf(catalog, "reservedFieldNames")).length > 0, text.slice(0, 200)),
        ]);
      });
    },
  },
  {
    id: "bridge-refuses-unknown-tool-and-method",
    title: "an unknown tool and an unknown method answer a JSON-RPC error",
    entryPoint: `node ${BRIDGE_LAUNCHER}, tools/call no_such_tool, resources/list`,
    async run(/** @type {Ctx} */ ctx) {
      await withBridge(ctx, async (session) => {
        const tool = await session.call("no_such_tool");
        const method = await session.request("resources/list");
        await ctx.verify("each refusal carries its JSON-RPC code", [
          ctx.equal("unknown tool code", fieldOf(tool.error, "code"), INVALID_PARAMS),
          ctx.holds("unknown tool message", textOf(fieldOf(tool.error, "message")).includes("Unknown tool: no_such_tool"), textOf(fieldOf(tool.error, "message"))),
          ctx.equal("unknown method code", fieldOf(method.error, "code"), METHOD_NOT_FOUND),
        ]);
      });
    },
  },
  {
    id: "route-refuses-uncredentialled-callers",
    title: "POST /dms/mcp answers 401 to a caller with no credential and to one with a wrong one",
    entryPoint: `POST ${ROUTE}`,
    async run(/** @type {Ctx} */ ctx) {
      const body = { jsonrpc: "2.0", id: 1, method: "tools/list" };
      const anonymous = await ctx.api("call the MCP route with no credential", { method: "POST", path: ROUTE, as: "anon", body });
      const wrong = await ctx.api("call the MCP route with a wrong credential", { method: "POST", path: ROUTE, token: "not-the-credential", body });
      await ctx.verify("the route lists no tools to either", [
        ctx.status(anonymous, 401),
        ctx.equal("anonymous error", anonymous.body, { error: "unauthorized" }),
        ctx.status(wrong, 401),
        ctx.equal("wrong credential error", wrong.body, { error: "unauthorized" }),
      ]);
    },
  },
  {
    id: "page-verify-reports-a-page",
    title: "page_verify opens a page in a headless Chromium as the owner and reports its blocks, data, form validation and screenshots, and fails a route no page serves",
    entryPoint: `node ${BRIDGE_LAUNCHER}, tools/call page_verify`,
    async run(/** @type {Ctx} */ ctx) {
      const root = ctx.state.runPlayground ?? ctx.state.playground;
      await withBridge(ctx, async (session) => {
        const { text, isError } = toolText(
          await session.call("page_verify", { page: [USERS_PAGE, "/no-such-page"], viewports: ["desktop"] }),
        );
        const report = parseJson(text);
        const [users, missing] = itemsOf(fieldOf(report, "pages"));
        const [desktop] = itemsOf(fieldOf(fieldOf(users, "render"), "viewports"));
        const table = itemsOf(fieldOf(users, "data")).find((block) => fieldOf(block, "type") === "TableView");
        const form = itemsOf(fieldOf(users, "interactions")).find((entry) => fieldOf(entry, "kind") === "form");
        const screenshot = textOf(fieldOf(desktop, "screenshot"));
        await ctx.verify("the users page passes and the unknown route fails", [
          ctx.equal("the answer flags the failing page", isError, true),
          ctx.equal("signed in as the owner", fieldOf(fieldOf(report, "account"), "kind"), "owner"),
          ctx.holds("users page passes", fieldOf(users, "ok") === true, JSON.stringify(fieldOf(users, "failures"))),
          ctx.equal("the table loaded rows", fieldOf(table, "state"), "ok"),
          ctx.holds("the New entry form showed validation", fieldOf(form, "ok") === true, JSON.stringify(form)),
          ctx.holds("the page screenshot is written under the project", screenshot.startsWith(".antelope/page-verify/") && statSync(join(root, screenshot)).size > 0, screenshot),
          ctx.holds("the unknown route names its failure", textOf(itemsOf(fieldOf(missing, "failures"))[0]).startsWith("not a registered page route"), JSON.stringify(missing)),
        ]);
      });
    },
  },
  {
    id: "bridge-files-published",
    title: "the backend writes the bridge credential with owner-only mode and adds the dms server to .mcp.json",
    entryPoint: "node_modules/.cache/dms/mcp.json, .mcp.json",
    async run(/** @type {Ctx} */ ctx) {
      const root = ctx.state.runPlayground ?? ctx.state.playground;
      const credential = join(root, "node_modules", ".cache", "dms", "mcp.json");
      const published = parseJson(readFileSync(credential, "utf8"));
      const config = parseJson(readFileSync(join(root, ".mcp.json"), "utf8"));
      await ctx.verify("the credential file points at the route and only its owner can read it", [
        ctx.holds("route URL", textOf(fieldOf(published, "url")).endsWith(ROUTE), textOf(fieldOf(published, "url"))),
        ctx.holds("a credential is present", textOf(fieldOf(published, "token")) !== "", "token present"),
        ctx.equal("file mode", statSync(credential).mode & PERMISSION_BITS, OWNER_ONLY_MODE),
      ]);
      await ctx.verify(".mcp.json launches the bridge", [
        ctx.equal("dms server", fieldOf(fieldOf(config, "mcpServers"), "dms"), { command: "node", args: [BRIDGE_LAUNCHER] }),
      ]);
    },
  },
];
