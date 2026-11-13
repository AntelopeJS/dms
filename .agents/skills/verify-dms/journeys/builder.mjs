import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fieldOf, isRecord, itemsOf, parseJson, textOf, toolText, withBridge } from "../mcp-bridge.mjs";

/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 * @typedef {{ ref: string, id: string, filepath: string, category: string }} ListedPage
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
    category: textOf(fieldOf(page, "category")),
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

const RELOAD_TIMEOUT_MS = 180_000;
const OWN_RELOAD_TIMEOUT_MS = 30_000;
const RELOAD_POLL_MS = 1_000;

/**
 * Polls `list_pages`, which reads the runtime's page registry and not the
 * builder, until the page at `route` is registered or not, as `registered`
 * asks. Only a reload of the module that declares it changes that.
 *
 * @param {import("../mcp-bridge.mjs").Session} session
 * @param {string} route The page's route
 * @param {boolean} registered Whether to wait for it to be registered or to be gone
 * @param {number} [timeoutMs] How long to wait
 * @returns {Promise<boolean>} Whether the registry reached that state in time
 */
async function untilRegistered(session, route, registered, timeoutMs = RELOAD_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pages = itemsOf(parseJson(toolText(await session.call("list_pages")).text));
    if (pages.some((page) => fieldOf(page, "path") === route) === registered) return true;
    await sleep(RELOAD_POLL_MS);
  }
  return false;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_BOUNDS = [
  { field: "createdAt", op: "ge", value: { $param: { name: "from" } } },
  { field: "createdAt", op: "le", value: { $param: { name: "to" } } },
];

/**
 * @param {number} ago Days before now
 * @returns {string} That instant as an ISO date
 */
function daysAgo(ago) {
  return new Date(Date.now() - ago * DAY_MS).toISOString();
}

/**
 * @param {import("../mcp-bridge.mjs").Session} session
 * @param {string} name The builder tool
 * @param {Record<string, unknown>} args Its arguments
 * @returns {Promise<{ ok: boolean, data: unknown, raw: string }>} Whether the operation succeeded, and what it answered
 */
async function operation(session, name, args) {
  const answer = toolText(await session.call(name, args));
  const body = parseJson(answer.text);
  return { ok: !answer.isError && fieldOf(body, "ok") === true, data: fieldOf(body, "data"), raw: answer.text };
}

/**
 * Compiles the run's playground and restarts the backend on it, as `ajs project dev` does after the builder writes a file.
 *
 * @param {Ctx} ctx
 * @returns {Promise<{ passed: boolean, output: string }>} Whether the project compiled, and what the compiler said
 */
async function rebuild(ctx) {
  const root = ctx.state.runPlayground ?? ctx.state.playground;
  const compiled = spawnSync(join(root, "node_modules", ".bin", "tsc"), [], { cwd: root, encoding: "utf8" });
  const output = `${compiled.stdout}${compiled.stderr}`;
  writeFileSync(join(ctx.step("compile the project"), "tsc.txt"), output);
  await ctx.restartBackend();
  return { passed: compiled.status === 0, output: output.slice(0, 400) };
}

/**
 * @param {unknown} body A route's answer
 * @param {string} key The array field
 * @returns {unknown[]} Its objects
 */
function rowsOf(body, key) {
  return itemsOf(fieldOf(body, key)).filter(isRecord);
}

/**
 * @param {unknown} body A series answer
 * @returns {string} Its points as `x=y`, sorted
 */
function pointsOf(body) {
  return rowsOf(body, "series")
    .map((point) => `${String(fieldOf(point, "x"))}=${String(fieldOf(point, "y"))}`)
    .sort()
    .join(",");
}

/**
 * @param {unknown} body A card answer
 * @param {string} key `series` or `comparisonSeries`
 * @returns {number} The sum of the points of the first series
 */
function seriesTotal(body, key) {
  return itemsOf(fieldOf(rowsOf(body, key)[0], "data")).reduce((sum, point) => sum + Number(fieldOf(point, "y")), 0);
}

const ORDER_FIELDS = [
  { name: "status", dataType: { $dataType: "string" } },
  { name: "amount", dataType: { $dataType: "number" } },
  { name: "createdAt", dataType: { $dataType: "date" } },
];

/** One paid, refunded or pending order per row, placed `ago` days back. */
const ORDER_SEEDS = [
  ["o1", "paid", 420, 35],
  ["o2", "paid", 230, 30],
  ["o3", "refunded", 55, 25],
  ["o4", "paid", 380, 15],
  ["o5", "paid", 195, 5],
  ["o6", "pending", 110, 3],
  ["o7", "paid", 260, 70],
  ["o8", "paid", 180, 65],
  ["o9", "refunded", 90, 60],
].map(([_id, status, amount, ago]) => ({ _id, status, amount, createdAt: daysAgo(Number(ago)) }));

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
  {
    id: "builder-period-bound-series-and-comparison-card-answer-over-http",
    title: "builder_add_query saves a series bound by from and to and a card that compares, the page declares its bounds as string | true | undefined, and after a rebuild the owner's GETs answer the seeded orders of the period and of the one before it",
    entryPoint: "MCP tools builder_create_resource, builder_add_query, then the generated routes",
    async run(/** @type {Ctx} */ ctx) {
      const route = await withBridge(ctx, async (session) => {
        const resource = await operation(session, "builder_create_resource", { name: "order", fields: ORDER_FIELDS, seeds: ORDER_SEEDS });
        const target = required((await listedPages(session))[0]);
        await ctx.verify("the order resource is created", [ctx.holds("the resource is created", resource.ok, resource.raw.slice(0, 300))], { critical: true });
        const pageRef = target.ref;
        const series = await operation(session, "builder_add_query", {
          page: pageRef,
          name: "periodOrders",
          resource: textOf(fieldOf(resource.data, "ref")),
          template: "series",
          params: { groupBy: "status", where: PERIOD_BOUNDS },
        });
        const card = await operation(session, "builder_add_query", {
          page: pageRef,
          name: "periodRevenue",
          resource: textOf(fieldOf(resource.data, "ref")),
          template: "series",
          params: { op: "sum", field: "amount", groupBy: "createdAt", bucket: "month", where: PERIOD_BOUNDS },
          response: "card",
          compare: true,
        });
        await ctx.verify("the engine typechecks and saves both queries", [
          ctx.holds("the series bound by from and to is saved", series.ok, series.raw.slice(0, 400)),
          ctx.holds("the comparison card is saved", card.ok, card.raw.slice(0, 400)),
        ], { critical: true });
        const routeOf = (/** @type {{ data: unknown }} */ saved) => textOf(fieldOf(saved.data, "route"));
        const source = readFileSync(target.filepath, "utf8");
        const admits = (/** @type {string[]} */ names) => names.every((name) => source.includes(`@Parameter("${name}", "query") ${name}: string | true | undefined,`));
        await ctx.verify("the page declares its bounds as a query value and parses them as dates", [
          ctx.holds("from and to admit string | true | undefined", admits(["from", "to"]), source),
          ctx.holds("the comparison bounds admit string | true | undefined", admits(["compareFrom", "compareTo"]), source),
          ctx.holds("each bound becomes a Date through String", /new Date\(String\(from\)\)/.test(source) && /new Date\(String\(compareTo\)\)/.test(source), source),
        ]);
        return { series: routeOf(series), card: routeOf(card) };
      });
      const built = await rebuild(ctx);
      await ctx.verify("the project compiles and the backend restarts on it", [ctx.holds("tsc exits 0", built.passed, built.output)], { critical: true });
      const read = (/** @type {string} */ path, /** @type {Record<string, string>} */ query) => ctx.api(`GET ${path}`, { method: "GET", path: `${path}?${new URLSearchParams(query)}` });
      const ranged = await read(route.series, { from: daysAgo(50), to: daysAgo(20) });
      const recent = await read(route.series, { from: daysAgo(20), to: daysAgo(0) });
      const compared = await read(route.card, { from: daysAgo(50), to: daysAgo(20), compareFrom: daysAgo(80), compareTo: daysAgo(50) });
      await ctx.verify("the owner reads the seeded orders of each period", [
        ctx.holds("the three routes answer 200", ranged.status === 200 && recent.status === 200 && compared.status === 200, [ranged.status, recent.status, compared.status]),
        ctx.equal("50 to 20 days ago holds two paid orders and one refunded", pointsOf(ranged.body), "paid=2,refunded=1"),
        ctx.equal("the last 20 days hold two paid orders and one pending", pointsOf(recent.body), "paid=2,pending=1"),
        ctx.equal("the card value is 420 + 230 + 55", [fieldOf(compared.body, "value"), seriesTotal(compared.body, "series")], [705, 705]),
        ctx.equal("the previous value is 260 + 180 + 90", [fieldOf(compared.body, "previousValue"), seriesTotal(compared.body, "comparisonSeries")], [530, 530]),
        ctx.holds("the delta is the change in percent", Math.abs(Number(fieldOf(compared.body, "delta")) - 33.0189) < 0.001, JSON.stringify(compared.body).slice(0, 400)),
      ]);
    },
  },
  {
    id: "builder-survives-the-reload-its-write-triggers",
    title: "under ajs project dev -w, the page builder_create_page writes reloads the playground, and builder_delete_page still reaches the builder after that reload",
    entryPoint: "MCP tools builder_create_page, list_pages, builder_delete_page",
    backend: "watch",
    async run(/** @type {Ctx} */ ctx) {
      await withBridge(ctx, async (session) => {
        const name = `reload-${randomBytes(4).toString("hex")}`;
        const { category } = required((await listedPages(session))[0]);
        const created = toolText(await session.call("builder_create_page", { name, displayName: "Reload probe", category }));
        const written = fieldOf(parseJson(created.text), "data");
        const route = textOf(fieldOf(written, "ref"));
        await ctx.verify("the first write creates the page", [
          ctx.equal("the tool reports no failure", created.isError, false),
          ctx.holds("the builder names the new page", route !== "", created.text.slice(0, 300)),
        ], { critical: true });
        const reloaded = await untilRegistered(session, route, true, OWN_RELOAD_TIMEOUT_MS);
        if (!reloaded) appendFileSync(textOf(fieldOf(written, "filepath")), "\n");
        const registered = reloaded || (await untilRegistered(session, route, true));
        await ctx.verify("the reload the write triggers registers the page", [
          ctx.holds("list_pages serves the new page", registered, reloaded ? route : `${route}, after the page file was saved again: the write's own reload did not register it in ${OWN_RELOAD_TIMEOUT_MS} ms`),
        ], { critical: true });
        await session.call("builder_delete_page", { pageRef: route });
        const deleted = toolText(await session.call("builder_delete_page", { pageRef: route }));
        await ctx.verify("the second write, after the reload, still reaches the builder", [
          ctx.equal("the tool reports no failure", deleted.isError, false),
          ctx.holds("the builder interface has its provider", !deleted.text.includes("has no provider"), deleted.text.slice(0, 300)),
        ], { critical: true });
        await ctx.verify("the reload the delete triggers unregisters the page", [
          ctx.holds("list_pages no longer serves it", await untilRegistered(session, route, false), route),
        ]);
      });
    },
  },
];
