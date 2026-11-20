import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import {
  DestroyModule,
  LoadModule,
  ReloadModule,
  StopModule,
} from "@antelopejs/interface-core/modules";
import { expect } from "chai";
import { z } from "zod";
import { authorizedClient, registerUser } from "../helpers/auth";
import {
  CardBody,
  compileApp,
  daysAgo,
  ORDER_FIELDS,
  ORDER_SEEDS,
  PERIOD_BOUNDS,
  pointsOf,
  savedQueryRoute,
  SeriesBody,
  totalOf,
} from "../helpers/builder-orders";
import { servesARatioKpi } from "../helpers/builder-fleet";
import { useBuilderSession } from "../helpers/builder-session";
import { type BridgeProcess, callTool } from "../helpers/mcp-bridge-process";
import { parseBody } from "../helpers/parse-body";

const OP_TIMEOUT = 120_000;
const HELD = /^builder_delete_page was not run: no one has confirmed it yet\./;
const APP_MODULE = "builder-journeys-app";
const ORDER_SCHEMA = "builder-journeys";
const HTTP_OK = 200;

const ListedPagesSchema = z.object({
  pages: z.array(
    z.object({
      ref: z.string().min(1),
      id: z.string().min(1),
      filepath: z.string().min(1),
    }),
  ),
});
const StructureSchema = z.object({
  ok: z.literal(true),
  data: z.object({ version: z.string().min(1) }),
});
const RefusalSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string() }),
});
const CreatedPageSchema = z.object({
  ok: z.literal(true),
  data: z.object({ ref: z.string() }),
});
const RegisteredPagesSchema = z.array(z.object({ path: z.string() }));

async function listedRefs(bridge: BridgeProcess): Promise<string[]> {
  const listed = await callTool(bridge, "builder_list_pages");
  expect(listed.isError, listed.text).to.equal(false);
  return ListedPagesSchema.parse(JSON.parse(listed.text)).pages.map(
    ({ ref }) => ref,
  );
}

/** The routes the runtime's page registry serves, which only a load of the module declaring a page changes. */
async function registeredPaths(bridge: BridgeProcess): Promise<string[]> {
  const listed = await callTool(bridge, "list_pages");
  return RegisteredPagesSchema.parse(JSON.parse(listed.text)).map(
    ({ path }) => path,
  );
}

/**
 * - `builder-lists-and-reads-pages` fails when builder_list_pages loses a page or a page's ref,
 *   id or file, or when builder_page_structure answers no version.
 * - `builder-delete-waits-for-a-repeat` fails when builder_delete_page deletes on the first call.
 * - `builder-refuses-an-unknown-page` fails when builder_page_structure answers a missing page
 *   with anything but the `not_found` failure an agent reads.
 */
describe("[integration] builder journeys: pages through the bridge", function () {
  this.timeout(OP_TIMEOUT);
  const session = useBuilderSession();

  it("builder-lists-and-reads-pages", async () => {
    const { shop, bridge } = session();
    expect(await listedRefs(bridge)).to.deep.equal([
      shop.PAGE,
      shop.DRIFT_PAGE,
    ]);

    const structure = await callTool(bridge, "builder_page_structure", {
      pageRef: shop.PAGE,
    });
    expect(structure.isError, structure.text).to.equal(false);
    StructureSchema.parse(JSON.parse(structure.text));
  });

  it("builder-delete-waits-for-a-repeat", async () => {
    const { shop, bridge } = session();
    const refused = await callTool(bridge, "builder_delete_page", {
      pageRef: shop.DRIFT_PAGE,
    });

    expect(refused.isError).to.equal(true);
    expect(refused.text).to.match(HELD);
    expect(await listedRefs(bridge)).to.include(shop.DRIFT_PAGE);
    expect(shop.readShop(shop.DRIFT_FILE)).to.not.equal("");
  });

  it("builder-refuses-an-unknown-page", async () => {
    const { bridge } = session();
    const answer = await callTool(bridge, "builder_page_structure", {
      pageRef: "/shop/no-such-page",
    });

    expect(answer.isError).to.equal(true);
    expect(RefusalSchema.parse(JSON.parse(answer.text)).error.code).to.equal(
      "not_found",
    );
  });
});

/**
 * Stops the app module after the suite that calls this.
 *
 * @returns A function that compiles the app and starts it as a module the first time, then
 * reloads that module
 */
function useServedApp(root: () => string): () => Promise<void> {
  let appLoaded = false;
  after(async () => {
    if (!appLoaded) return;
    await StopModule(APP_MODULE);
    await DestroyModule(APP_MODULE);
  });
  return async () => {
    compileApp(root(), APP_MODULE);
    if (appLoaded) {
      await ReloadModule(APP_MODULE);
      return;
    }
    await LoadModule(
      APP_MODULE,
      { source: { type: "local", path: root() }, config: {} },
      true,
    );
    appLoaded = true;
  };
}

/**
 * The playground compiles the app the builder wrote and restarts its backend on it, or reloads
 * the module a write changed under `ajs project dev -w`. The harness compiles the app and loads
 * it as a module of its own, then reloads that module after each write.
 *
 * - `builder-period-bound-series-and-comparison-card-answer-over-http` fails when the app does
 *   not compile, or when its routes answer other orders than those of the period the query
 *   string bounds and, for the card, of the period before it. The order resource names a schema
 *   of its own, which the test registers once the app is loaded, since the DMS registers its
 *   core schema once, at its start. The page's declaration of its bounds is
 *   `unit/builder/query-response.test.ts`'s to check.
 * - `builder-ratio-kpi-answers-fraction-with-its-delta-and-null-over-http` fails when a ratio
 *   route answers 25 for 1 bike rented of 4 instead of 0.25, carries no delta over the period
 *   before, answers more than the bare fraction when the request carries no comparison bounds,
 *   answers 0
 *   instead of null for a denominator of 0, or when builder_configure_query leaves the route on
 *   its old sides. The fleet resource names a schema of its own for the same reason as the
 *   order one.
 * - `builder-survives-the-reload-its-write-triggers` fails when a reload of the app leaves the
 *   builder interface without its provider, which happens when the DMS does not declare it in
 *   `antelopeJs.implements`, or when the reload does not register the page the write added.
 */
describe("[integration] builder journeys: the app the builder writes, served", function () {
  this.timeout(OP_TIMEOUT);
  const session = useBuilderSession();
  const runApp = useServedApp(() => session().shop.shopRoot());

  it("builder-period-bound-series-and-comparison-card-answer-over-http", async () => {
    const { shop, bridge } = session();
    const created = await callTool(bridge, "builder_create_resource", {
      name: "order",
      schema: ORDER_SCHEMA,
      fields: ORDER_FIELDS,
      seeds: ORDER_SEEDS,
    });
    expect(created.isError, created.text).to.equal(false);
    const query = { page: shop.PAGE, resource: "order", template: "series" };
    const seriesRoute = await savedQueryRoute(bridge, {
      ...query,
      name: "periodOrders",
      params: { groupBy: "status", where: PERIOD_BOUNDS },
    });
    const cardRoute = await savedQueryRoute(bridge, {
      ...query,
      name: "periodRevenue",
      params: {
        op: "sum",
        field: "amount",
        groupBy: "createdAt",
        bucket: "month",
        where: PERIOD_BOUNDS,
      },
      response: "card",
      compare: true,
    });
    await runApp();
    await RegisterSchema(ORDER_SCHEMA);

    const owner = authorizedClient(
      (await registerUser({ owner: true })).accessToken,
    );
    const read = async (route: string, params: Record<string, string>) => {
      const answer = await owner.get(route, { params });
      expect(answer.status, JSON.stringify(answer.data)).to.equal(HTTP_OK);
      return answer;
    };
    const ranged = await read(seriesRoute, {
      from: daysAgo(50),
      to: daysAgo(20),
    });
    const recent = await read(seriesRoute, {
      from: daysAgo(20),
      to: daysAgo(0),
    });
    const compared = await read(cardRoute, {
      from: daysAgo(50),
      to: daysAgo(20),
      compareFrom: daysAgo(80),
      compareTo: daysAgo(50),
    });

    expect(pointsOf(parseBody(SeriesBody, ranged))).to.equal(
      "paid=2,refunded=1",
    );
    expect(pointsOf(parseBody(SeriesBody, recent))).to.equal(
      "paid=2,pending=1",
    );
    const card = parseBody(CardBody, compared);
    expect([card.value, totalOf(card.series)]).to.deep.equal([705, 705]);
    expect([card.previousValue, totalOf(card.comparisonSeries)]).to.deep.equal([
      530, 530,
    ]);
    expect(card.delta).to.be.closeTo(((705 - 530) / 530) * 100, 0.001);
  });

  it("builder-ratio-kpi-answers-fraction-with-its-delta-and-null-over-http", async () => {
    const answered = await servesARatioKpi(session(), runApp);

    expect(
      answered.compared,
      "1 bike rented of 4, against 2 of 4 the period before",
    ).to.deep.equal({ value: 0.25, previousValue: 0.5, delta: -50 });
    expect(answered.uncompared, "no comparison bounds sent").to.deep.equal({
      value: 0.25,
    });
    expect(answered.overall, "3 bikes rented of 8").to.deep.equal({
      value: 0.375,
    });
    expect(answered.retired, "no retired bike to divide by").to.deep.equal({
      value: null,
    });
    expect(
      answered.previewed,
      "the shape of 0.375, never the figure",
    ).to.deep.equal({
      status: "ok",
      body: { value: "number" },
      truncated: false,
    });
    expect(
      answered.reconfigured,
      "3 bikes rented over 5 free, after configure_query",
    ).to.deep.equal({ value: 0.6 });
  });

  it("builder-survives-the-reload-its-write-triggers", async () => {
    const { bridge } = session();
    await runApp();
    const created = await callTool(bridge, "builder_create_page", {
      name: "reload-probe",
      displayName: "Reload probe",
      category: "pages.shop",
    });
    expect(created.isError, created.text).to.equal(false);
    const route = CreatedPageSchema.parse(JSON.parse(created.text)).data.ref;

    await runApp();
    expect(await registeredPaths(bridge)).to.include(route);

    await callTool(bridge, "builder_delete_page", { pageRef: route });
    const deleted = await callTool(bridge, "builder_delete_page", {
      pageRef: route,
    });
    expect(deleted.isError, deleted.text).to.equal(false);

    await runApp();
    expect(await registeredPaths(bridge)).to.not.include(route);
  });
});
