import { compiledPages, writeSpec } from "./mockups/spec.mjs";

/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 */

const POLL_MS = 500;
/** The mockup whose Overview the twelve-page journey opens. */
const SHOP_MOCKUP = "overview-shop";
/** Pages of the shop mockup: more than the Overview draws live. */
const SHOP_PAGES = 12;
/** Blocks of each shop page: three KPIs and a table. */
const SHOP_BLOCKS = 4;
/** How many frames the Overview draws live at once, `LIVE_FRAMES` of `useMockupOverview`. */
const LIVE_FRAMES = 10;
/** How long the live frames of the shop mockup have to draw every block. */
const SHOP_DRAW_TIMEOUT_MS = 90_000;


/**
 * One page of the shop mockup: three KPIs over a table of 40 generated rows.
 *
 * @param {number} index
 * @param {string} category
 */
function shopPage(index, category) {
  return {
    id: `page-${index}`,
    title: `Page ${index}`,
    category,
    fixtures: {
      orders: {
        $generate: {
          rows: 40,
          fields: { _id: "id", name: "name", email: "email", since: "date", orders: { number: [0, 60] }, spent: { money: [50, 9000] }, tier: ["free", "pro", "enterprise"] },
        },
      },
    },
    tree: [
      { type: "KpiCard", options: { title: "Revenue", staticValue: 48210 } },
      { type: "KpiCard", options: { title: "Orders", staticValue: 1204 } },
      { type: "KpiCard", options: { title: "Customers", staticValue: 311 } },
      {
        type: "TableView",
        options: {
          caption: "Orders",
          fetchUrl: "fixture:orders",
          columns: { name: { type: "string" }, email: { type: "string" }, since: { type: "date" }, orders: { type: "number" }, spent: { type: "number" }, tier: { type: "string" } },
        },
      },
    ],
  };
}

/**
 * The Overview's live frames, and how many of them show all `blocks` of their page with data.
 *
 * @param {import("playwright-core").Page} page
 * @param {number} blocks
 */
function liveFrames(page, blocks) {
  return page.evaluate((count) => {
    const frames = [...document.querySelectorAll("[data-dms-mockup-overview-preview]")];
    const drawn = frames.filter((frame) => {
      const states = [...(frame instanceof HTMLIFrameElement ? (frame.contentDocument?.querySelectorAll("[data-dms-block-state]") ?? []) : [])].map((block) =>
        block.getAttribute("data-dms-block-state"),
      );
      return states.length === count && states.every((state) => state === "ok");
    });
    return { live: frames.length, drawn: drawn.length };
  }, blocks);
}

/** The Overview of a mockup with more pages than it draws live. */
export const journeys = [
  {
    id: "mockup-overview-of-twelve-pages-stays-responsive",
    title: `the Overview of a ${SHOP_PAGES}-page mockup, in a browser without Web Locks as on a plain HTTP host, draws at most ${LIVE_FRAMES} pages live, all with data within ${SHOP_DRAW_TIMEOUT_MS / 1000} s`,
    entryPoint: `/mockup?name=${SHOP_MOCKUP}`,
    backend: "dev",
    async run(/** @type {Ctx} */ ctx) {
      const categories = ["sales", "catalog", "customers"].map((id) => ({ id, title: id }));
      writeSpec(ctx, SHOP_MOCKUP, {
        title: "Shop",
        categories,
        pages: Array.from({ length: SHOP_PAGES }, (_, index) => shopPage(index + 1, categories[index % categories.length].id)),
      });
      const compiled = await compiledPages(ctx, SHOP_MOCKUP, SHOP_PAGES);
      await ctx.verify("the mockup compiled", [ctx.equal("its pages", compiled, SHOP_PAGES)], { critical: true });
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      const { page: viewer } = admin;
      await viewer.context().addInitScript(() => {
        Object.defineProperty(Navigator.prototype, "locks", { get: () => undefined });
      });
      await admin.goto(`/mockup?name=${SHOP_MOCKUP}`);
      const deadline = Date.now() + SHOP_DRAW_TIMEOUT_MS;
      let frames = await liveFrames(viewer, SHOP_BLOCKS);
      let most = frames.live;
      while (Date.now() < deadline && frames.drawn < LIVE_FRAMES) {
        await viewer.waitForTimeout(POLL_MS);
        frames = await liveFrames(viewer, SHOP_BLOCKS);
        most = Math.max(most, frames.live);
      }
      await viewer.waitForTimeout(POLL_MS);
      const settled = await liveFrames(viewer, SHOP_BLOCKS);
      most = Math.max(most, settled.live);
      await ctx.verify("the Overview draws its live frames with data, no more than its cap", [
        ctx.holds(`no more than ${LIVE_FRAMES} frames are ever live`, most <= LIVE_FRAMES, `${most} live at most`),
        ctx.equal(`${LIVE_FRAMES} live frames show their ${SHOP_BLOCKS} blocks with data within ${SHOP_DRAW_TIMEOUT_MS / 1000} s`, settled, { live: LIVE_FRAMES, drawn: LIVE_FRAMES }),
      ]);
    },
  },
];
