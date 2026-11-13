/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

import { readFileSync } from "node:fs";
import { fieldOf, isRecord, parseJson } from "../mcp-bridge.mjs";

const STARTERS = new URL("../../../../packages/dms/frontend-vue/tests/fixtures/mockup-starters/nodes.json", import.meta.url);
const CRASH_TEXT = /Server error|is not iterable|Cannot read properties/;

/** The nodes the /mockup Add tab starts each block as, but those reading a mockup fixture, which only the dev mockup engine serves. */
function starterNodes() {
  const starters = parseJson(readFileSync(STARTERS, "utf8"));
  const types = isRecord(starters) ? Object.keys(starters) : [];
  return types
    .map((type) => ({ type, node: fieldOf(fieldOf(starters, type), "node") }))
    .filter(({ node }) => node !== undefined && !JSON.stringify(node).includes('"fixture:'));
}

const CHANNEL = "dms-preview";
const KPI = { type: "KpiCard", options: { title: "Revenue", staticValue: 48200, staticDelta: 12.4, showDelta: true } };

function stateParam(state) {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

async function previewTab(/** @type {Ctx} */ ctx) {
  return ctx.tab("stranger", "preview");
}

function embedderHtml(webUrl) {
  const record = "window.received = []; window.addEventListener('message', (event) => window.received.push(event.data));";
  return `<!doctype html><html><body><script>${record}</script><iframe id="preview" src="${webUrl}/dms-preview" style="width:800px;height:400px"></iframe></body></html>`;
}

/**
 * The page-side expression that is true once the embedding page has recorded a message of `type` on the preview channel.
 * @param {string} type
 */
function recordedMessage(type) {
  return `window.received.some((data) => data?.channel === ${JSON.stringify(CHANNEL)} && data.type === ${JSON.stringify(type)})`;
}

/** The public /dms-preview page and the block types API behind it. */
export const journeys = [
  {
    id: "preview-renders-state",
    title: "a KpiCard tree in ?state= renders without the dashboard chrome, also after a reload",
    entryPoint: "/dms-preview?state=<base64url JSON>",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const tab = await previewTab(ctx);
      await tab.goto(`/dms-preview?state=${stateParam({ tree: KPI })}`);
      await ctx.verify("the card shows its title, value and delta", [
        tab.shows(/Revenue/i),
        tab.shows(/48\.2K/),
        tab.shows(/\+12\.4%/),
        tab.visible({ role: "navigation" }, { hidden: true }),
      ]);
      await tab.reload();
      await ctx.verify("the state in the URL draws the same card after a reload", [tab.shows(/48\.2K/)]);
    },
  },
  {
    id: "preview-refuses-unknown-and-remote",
    title: "an unregistered block type and an off-site fetchUrl render inline notices instead of blocks",
    entryPoint: "/dms-preview?state=",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const tab = await previewTab(ctx);
      const tree = [{ type: "NoSuchBlock" }, { type: "KpiCard", options: { title: "Remote", fetchUrl: "https://example.com/data" } }];
      const requests = [];
      tab.page.on("request", (request) => requests.push(request.url()));
      await tab.goto(`/dms-preview?state=${stateParam({ tree })}`);
      await ctx.verify("each refused node says why", [
        tab.shows(/“NoSuchBlock” is not a registered block type/),
        tab.shows(/KpiCard was not drawn: “https:\/\/example\.com\/data” is not a path of this site/),
      ]);
      await ctx.verify("the page never called the off-site URL", [
        ctx.holds("no request to example.com", !requests.some((url) => url.startsWith("https://example.com")), requests.filter((url) => !url.startsWith(ctx.state.webUrl)).join(", ") || "none off-site"),
      ]);
    },
  },
  {
    id: "preview-empty-and-unreadable",
    title: "no state says there is nothing to preview, and an unreadable state says so",
    entryPoint: "/dms-preview with no or a malformed ?state=",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const tab = await previewTab(ctx);
      await tab.goto("/dms-preview");
      await ctx.verify("the empty page says there is nothing to preview", [tab.shows(/Nothing to preview yet/)]);
      await tab.goto("/dms-preview?state=not-base64-json");
      await ctx.verify("a malformed state is reported", [tab.shows(/The preview state could not be read/)]);
    },
  },
  {
    id: "preview-postmessage-render",
    title: "an embedding page draws a tree through postMessage after the frame says it is ready",
    entryPoint: "/dms-preview in an iframe, postMessage channel dms-preview",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const tab = await previewTab(ctx);
      await tab.page.setContent(embedderHtml(ctx.state.webUrl));
      const ready = await tab.page
        .waitForFunction(recordedMessage("ready"), undefined, { timeout: 30_000 })
        .then(() => true, () => false);
      await tab.page.evaluate(
        ({ channel, tree, origin }) => {
          const frame = document.getElementById("preview");
          if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow) throw new Error("the preview frame is missing");
          frame.contentWindow.postMessage({ channel, type: "render", tree }, origin);
        },
        { channel: CHANNEL, tree: KPI, origin: ctx.state.webUrl },
      );
      const frame = tab.page.frameLocator("#preview");
      const drawn = await frame
        .getByText("48.2K")
        .waitFor({ timeout: 15_000 })
        .then(() => true, () => false);
      await tab.snapshot("the embedding page after render");
      await ctx.verify("the frame announces ready and draws the posted tree", [
        ctx.holds("the frame posted ready", ready, ready),
        ctx.holds("the posted KpiCard is drawn", drawn, drawn),
        ctx.holds("the frame reported its height", await tab.page.evaluate(recordedMessage("resize")), "resize message"),
      ]);
    },
  },
  {
    id: "preview-renders-every-starter",
    title: "every block the /mockup Add tab places draws in the preview without crashing it",
    entryPoint: "/dms-preview?state=<one starter node>",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const tab = await previewTab(ctx);
      /** @type {string[]} */
      const errors = [];
      tab.page.on("pageerror", (error) => errors.push(error.message));
      /** @type {string[]} */
      const crashed = [];
      const starters = starterNodes();
      for (const { type, node } of starters) {
        const before = errors.length;
        await tab.goto(`/dms-preview?state=${stateParam({ tree: [node] })}`);
        await tab.page.locator("[data-dms-block-preview]").waitFor({ state: "attached", timeout: 30_000 });
        await tab.page.waitForTimeout(500);
        const text = await tab.page.evaluate(() => document.body.innerText);
        if (errors.length > before || CRASH_TEXT.test(text)) crashed.push(`${type}: ${errors.slice(before).join("; ") || text.match(CRASH_TEXT)?.[0]}`);
      }
      await ctx.verify("no starter crashes the preview", [
        ctx.holds(`${starters.length} starters drawn`, starters.length > 30, starters.length),
        ctx.holds("none threw or showed an error page", crashed.length === 0, crashed.join(" | ") || "none"),
      ]);
    },
  },
  {
    id: "block-types-api-members-only",
    title: "GET /api/block-preview/types lists the registered blocks to a member and refuses a visitor",
    entryPoint: "GET /api/block-preview/types",
    async run(/** @type {Ctx} */ ctx) {
      const member = await ctx.api("list the block types as the admin", { method: "GET", path: "/api/block-preview/types" });
      const visitor = await ctx.api("list the block types anonymously", { method: "GET", path: "/api/block-preview/types", as: "anon" });
      const text = JSON.stringify(member.body ?? "");
      await ctx.verify("members read the catalog, visitors do not", [
        ctx.status(member, 200),
        ctx.holds("KpiCard is listed", text.includes("KpiCard"), text.slice(0, 300)),
        ctx.holds("a visitor is refused", [401, 403].includes(visitor.status), visitor.status),
      ]);
    },
  },
];
