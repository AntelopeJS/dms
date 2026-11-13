import { fieldOf, itemsOf, parseJson, textOf, toolText, withBridge } from "../mcp-bridge.mjs";

/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 * @typedef {{ ref: string, id: string, filepath: string }} ListedPage
 */

/**
 * @param {import("../mcp-bridge.mjs").Session} session
 * @returns {Promise<ListedPage[]>} The pages the builder lists
 */
async function listedPages(session) {
  const pages = itemsOf(parseJson(toolText(await session.call("builder_list_pages")).text));
  return pages.map((page) => ({
    ref: textOf(fieldOf(page, "ref")),
    id: textOf(fieldOf(page, "id")),
    filepath: textOf(fieldOf(page, "filepath")),
  }));
}

/**
 * @param {ListedPage | undefined} page
 * @returns {ListedPage} The page, refused when the builder listed none
 */
function required(page) {
  if (page === undefined) throw new Error("the builder lists no page");
  return page;
}

/** The builder engine, driven through its MCP tools as a coding agent does. */
export const journeys = [
  {
    id: "builder-lists-and-reads-pages",
    title: "builder_list_pages lists the playground's pages and builder_page_structure reads one page's block tree",
    entryPoint: "MCP tools builder_list_pages, builder_page_structure",
    async run(/** @type {Ctx} */ ctx) {
      await withBridge(ctx, async (session) => {
        const pages = await listedPages(session);
        await ctx.verify("the builder lists pages with their ref, id and file", [
          ctx.holds("at least one page", pages.length > 0, pages.length),
          ctx.holds("each page has a ref, an id and a file", pages.every((page) => page.ref && page.id && page.filepath), JSON.stringify(pages[0])),
        ]);
        const structure = toolText(await session.call("builder_page_structure", { pageRef: required(pages[0]).ref }));
        const answer = parseJson(structure.text);
        await ctx.verify("the page structure carries a version for optimistic concurrency", [
          ctx.equal("the tool reports no failure", structure.isError, false),
          ctx.holds("a version hash is present", fieldOf(answer, "ok") === true && textOf(fieldOf(fieldOf(answer, "data"), "version")) !== "", structure.text.slice(0, 200)),
        ]);
      });
    },
  },
  {
    id: "builder-delete-waits-for-a-repeat",
    title: "builder_delete_page answers what it would do and deletes nothing on the first call",
    entryPoint: "MCP tool builder_delete_page",
    async run(/** @type {Ctx} */ ctx) {
      await withBridge(ctx, async (session) => {
        const target = required((await listedPages(session))[0]);
        const refused = toolText(await session.call("builder_delete_page", { pageRef: target.ref }));
        const after = await listedPages(session);
        await ctx.verify("the first call is held for confirmation and the page is still listed", [
          ctx.equal("the call is reported as not run", refused.isError, true),
          ctx.holds("the answer says nobody confirmed it", refused.text.includes("was not run: no one has confirmed it yet"), refused.text.slice(0, 200)),
          ctx.holds("the page is still there", after.some((page) => page.ref === target.ref), after.length),
        ]);
      });
    },
  },
  {
    id: "builder-refuses-an-unknown-page",
    title: "builder_page_structure on a page that does not exist answers a failure the agent can read",
    entryPoint: "MCP tool builder_page_structure",
    async run(/** @type {Ctx} */ ctx) {
      await withBridge(ctx, async (session) => {
        const answer = toolText(await session.call("builder_page_structure", { pageRef: "no-such-page" }));
        await ctx.verify("the builder reports the missing page instead of crashing", [
          ctx.equal("the tool reports a failure", answer.isError, true),
          ctx.holds("the answer is not empty", answer.text.length > 0, answer.text.slice(0, 200)),
        ]);
      });
    },
  },
];
