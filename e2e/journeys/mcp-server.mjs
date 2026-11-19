import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BRIDGE_LAUNCHER, fieldOf, itemsOf, parseJson, textOf, toolText, withBridge } from "../mcp-bridge.mjs";
import { createRole, joinedMember } from "./settings-members/steps.mjs";

/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 */

const USERS_PAGE = "/table-view/table-view-users";
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

/** The command-line journeys of the feature, which `e2e/integration/journeys.test.mjs` runs. */
export const commandLineJourneys = [
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
];

/** The MCP server the DMS serves in development, reached through its stdio bridge. */
export const journeys = [
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
];
