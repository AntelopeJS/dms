import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fieldOf, itemsOf, parseJson } from "../mcp-bridge.mjs";
import { createRole, joinedMember } from "./settings-members/steps.mjs";

/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

const ROUTES = ["/api/mockup", "/api/mockup/schema", "/api/mockup/orders/annotations"];
const NOTE = { page: "home", path: "/pages/0/tree/0", text: "Not mine" };
const SAMPLE_MOCKUP = "sample-live-routes";
/** Live routes of the playground, each named directly by a block of the sample mockup. */
const LIVE = { kpi: "/api/dashboard/kpi/revenue", chart: "/api/dashboard/sales", table: "/api/user/list" };
const ROWS_FIXTURE = "users";
const SAMPLE_ROWS = [{ _id: "s1", name: "Sample row" }];
const PREVIEW_PATH = "/dms-preview";
const DRAW_TIMEOUT_MS = 30_000;
const POLL_MS = 500;
const SETTLE_MS = 3_000;
/**
 * The dashboard's own API requests on any page, which read no block's data: its icons, its realtime session and
 * the page topics it subscribes to, and the onboarding and system state its shell checks.
 */
const SHELL_ROUTES = [
  /^GET \/api\/_dms\//,
  /^GET \/api\/realtime\/connection$/,
  /^POST \/api\/realtime\/session$/,
  /^POST \/api\/realtime\/subscribe\/pages\.[\w.-]+$/,
  /^GET \/api\/onboarding\/informations$/,
  /^GET \/api\/system-state$/,
];
/**
 * The request of the playground's command palette plugin, which every page of the dashboard runs, the preview frame
 * included: it reads the playground's feature index and draws nothing in the preview.
 */
const PLUGIN_ROUTES = [/^GET \/api\/playground-features$/];

/**
 * Writes the sample mockup's spec under the run's `mockups/`, which the development backend watches.
 *
 * @param {Ctx} ctx
 * @param {unknown[]} tree
 */
function writeSampleSpec(ctx, tree) {
  const folder = join(ctx.state.runPlayground ?? ctx.state.playground, "mockups", SAMPLE_MOCKUP);
  mkdirSync(folder, { recursive: true });
  const page = { id: "live", title: "Live", fixtures: { [ROWS_FIXTURE]: SAMPLE_ROWS }, tree };
  writeFileSync(join(folder, "spec.json"), JSON.stringify({ version: 1, title: "Sample on live routes", pages: [page] }));
}

/**
 * The compiled sample tree of the mockup once it holds `count` nodes, polled while the backend recompiles.
 *
 * @param {Ctx} ctx
 * @param {number} count
 */
async function compiledTree(ctx, count) {
  const deadline = Date.now() + DRAW_TIMEOUT_MS;
  for (;;) {
    const state = await ctx.api("GET the sample mockup", { method: "GET", path: `/api/mockup/${SAMPLE_MOCKUP}` });
    const tree = itemsOf(fieldOf(itemsOf(fieldOf(state.body, "pages"))[0], "tree"));
    if (tree.length === count || Date.now() > deadline) return { tree, issues: fieldOf(state.body, "issues") };
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}


/**
 * The data state each block of the preview frame reports, once none is loading.
 *
 * @param {import("playwright-core").Page} page
 */
async function previewStates(page) {
  const deadline = Date.now() + DRAW_TIMEOUT_MS;
  /** @type {string[]} */
  let states = [];
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) => candidate.url().includes(PREVIEW_PATH));
    states = frame
      ? await frame
          .evaluate(() => [...document.querySelectorAll("[data-dms-block-state]")].map((element) => element.getAttribute("data-dms-block-state") ?? ""))
          .catch(() => [])
      : [];
    if (states.length >= Object.keys(LIVE).length && !states.includes("loading")) break;
    await page.waitForTimeout(POLL_MS);
  }
  await page.waitForTimeout(SETTLE_MS);
  return states;
}

/**
 * Sends every mockup route's request as `as`, a read for each route and a
 * comment on the `orders` mockup.
 *
 * @param {Ctx} ctx
 * @param {string} as The account, or `anon`
 */
async function everyRoute(ctx, as) {
  const answers = [];
  for (const path of ROUTES) {
    answers.push(await ctx.api(`GET ${path} as ${as}`, { method: "GET", path, as }));
  }
  answers.push(
    await ctx.api(`POST a comment as ${as}`, { method: "POST", path: ROUTES[2], body: NOTE, as }),
  );
  return answers;
}

/** The development-only mockup engine, seen from a run's backend. */
export const journeys = [
  {
    id: "mockup-absent-outside-dev",
    title: "a backend started from a build serves no mockup route",
    entryPoint: "/api/mockup",
    backend: "production",
    async run(/** @type {Ctx} */ ctx) {
      const answers = [];
      for (const path of ROUTES) {
        answers.push(await ctx.api(`GET ${path} as the admin`, { method: "GET", path }));
      }
      await ctx.verify(
        "every mockup route answers 404",
        answers.map((answer) => ctx.status(answer, 404)),
      );
    },
  },
  {
    id: "mockup-owner-only-in-dev",
    title: "in development, the mockup routes serve the platform owner and refuse anyone else",
    entryPoint: "/api/mockup",
    backend: "dev",
    async run(/** @type {Ctx} */ ctx) {
      const owner = await ctx.api("GET /api/mockup as the owner", { method: "GET", path: ROUTES[0] });
      const schema = await ctx.api("GET /api/mockup/schema as the owner", { method: "GET", path: ROUTES[1] });
      await ctx.verify("the owner reads the mockup list and the spec schema", [
        ctx.status(owner, 200),
        ctx.status(schema, 200),
      ]);

      const visitor = await everyRoute(ctx, "anon");
      await ctx.verify(
        "a caller with no session gets 401 on every route",
        visitor.map((answer) => ctx.status(answer, 401)),
      );

      const roleName = ctx.unique("Designer");
      await createRole(ctx, roleName);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      await joinedMember(ctx, admin, { firstName: "Mia", roleName });
      const member = await everyRoute(ctx, "mia");
      await ctx.verify(
        "a signed-in member who is not the owner gets 403 on every route",
        member.map((answer) => ctx.status(answer, 403)),
      );
    },
  },
  {
    id: "mockup-sample-reads-no-live-route",
    title: "with Real data off, the /mockup viewer requests no live route, even for a KPI, a chart and a serialized table that name one directly",
    entryPoint: "/mockup?data=sample",
    backend: "dev",
    async run(/** @type {Ctx} */ ctx) {
      writeSampleSpec(ctx, [
        { type: "TableView", options: { caption: "Users", fetchUrl: `fixture:${ROWS_FIXTURE}`, rowIdKey: "_id", columns: { name: { name: "Name", type: "string" } } } },
      ]);
      const built = await compiledTree(ctx, 1);
      const rowsRoute = `/api/mockup/${SAMPLE_MOCKUP}/pages/live/fixtures/${ROWS_FIXTURE}/rows`;
      const serialized = parseJson(JSON.stringify(fieldOf(built.tree[0], "options") ?? {}).replaceAll(rowsRoute, LIVE.table));
      await ctx.verify("the table serializes to options that read a route", [
        ctx.holds("the serialized table reads the live route", JSON.stringify(serialized).includes(LIVE.table), JSON.stringify(serialized).slice(0, 300)),
      ], { critical: true });
      writeSampleSpec(ctx, [
        { type: "KpiCard", options: { title: "Revenue", fetchUrl: LIVE.kpi, valueFormat: "currency" } },
        { type: "ChartCard", options: { title: "Sales", fetchUrl: LIVE.chart, valueFormat: "currency" }, children: [{ id: "chart", type: "ChartArea" }] },
        { type: "TableView", options: serialized },
      ]);
      const compiled = await compiledTree(ctx, 3);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      /** @type {{ entry: string, inPreview: boolean }[]} */
      const requests = [];
      const viewer = await admin.page.context().newPage();
      viewer.on("request", (request) =>
        requests.push({ entry: `${request.method()} ${new URL(request.url()).pathname}`, inPreview: request.frame().url().includes(PREVIEW_PATH) }),
      );
      await viewer.goto(new URL(`/mockup?name=${SAMPLE_MOCKUP}&page=live&data=sample`, admin.page.url()).href);
      const states = await previewStates(viewer);
      await viewer.close();
      const apiOf = (/** @type {boolean} */ inPreview) =>
        [...new Set(requests.filter((request) => request.inPreview === inPreview).map((request) => request.entry))].filter((entry) => entry.includes(" /api/"));
      const live = requests.filter(({ entry }) => Object.values(LIVE).some((route) => entry.endsWith(` ${route}`))).map(({ entry }) => entry);
      const previewOutsideMockup = apiOf(true).filter((entry) => !entry.includes(" /api/mockup/") && ![...SHELL_ROUTES, ...PLUGIN_ROUTES].some((route) => route.test(entry)));
      await ctx.verify("the viewer reads only the mockup's own routes in sample mode", [
        ctx.holds("the preview drew the data blocks", states.length >= Object.keys(LIVE).length, JSON.stringify(states)),
        ctx.equal("no request of the page or its frames reads a live route a block names", live, []),
        ctx.equal("every API request of the preview frame is a mockup route or the dashboard's own", previewOutsideMockup, []),
        ctx.holds("what each block shows", true, JSON.stringify({ states, issues: compiled.issues })),
        ctx.holds("the API requests of the preview frame", requests.length > 0, JSON.stringify(apiOf(true))),
        ctx.holds("the API requests of the page around it", true, JSON.stringify(apiOf(false))),
      ]);
    },
  },
];
