import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import {
  DestroyModule,
  LoadModule,
  ReloadModule,
  StopModule,
} from "@antelopejs/interface-core/modules";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import { authorizedClient, registerUser } from "../helpers/auth";
import { useBuilderSession } from "../helpers/builder-session";
import { type BridgeProcess, callTool } from "../helpers/mcp-bridge-process";
import { parseBody } from "../helpers/parse-body";

const OP_TIMEOUT = 120_000;
const HELD = /^builder_delete_page was not run: no one has confirmed it yet\./;
const APP_MODULE = "builder-journeys-app";
const ORDER_SCHEMA = "builder-journeys";
const DAY_MS = 24 * 60 * 60 * 1000;
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
const SavedSchema = z.object({
  ok: z.literal(true),
  data: z.object({ route: z.string() }),
});
const CreatedPageSchema = z.object({
  ok: z.literal(true),
  data: z.object({ ref: z.string() }),
});
const RegisteredPagesSchema = z.array(z.object({ path: z.string() }));
const SeriesBody = z.object({
  series: z.array(z.object({ x: z.string(), y: z.number() })),
});
const PointsSchema = z.array(
  z.object({ data: z.array(z.object({ y: z.number() })) }),
);
const CardBody = z.object({
  value: z.number(),
  previousValue: z.number(),
  delta: z.number(),
  series: PointsSchema,
  comparisonSeries: PointsSchema,
});

function daysAgo(ago: number): string {
  return new Date(Date.now() - ago * DAY_MS).toISOString();
}

const PERIOD_BOUNDS: JsonValue = [
  { field: "createdAt", op: "ge", value: { $param: { name: "from" } } },
  { field: "createdAt", op: "le", value: { $param: { name: "to" } } },
];

/** One paid, refunded or pending order per row, placed `ago` days back. */
const ORDER_SEEDS: JsonValue = (
  [
    ["o1", "paid", 420, 35],
    ["o2", "paid", 230, 30],
    ["o3", "refunded", 55, 25],
    ["o4", "paid", 380, 15],
    ["o5", "paid", 195, 5],
    ["o6", "pending", 110, 3],
    ["o7", "paid", 260, 70],
    ["o8", "paid", 180, 65],
    ["o9", "refunded", 90, 60],
  ] as const
).map(([_id, status, amount, ago]) => ({
  _id,
  status,
  amount,
  createdAt: daysAgo(ago),
}));

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

/** The route of the query the builder saved for the page. */
async function savedQueryRoute(
  bridge: BridgeProcess,
  args: Record<string, JsonValue>,
): Promise<string> {
  const saved = await callTool(bridge, "builder_add_query", args);
  expect(saved.isError, saved.text).to.equal(false);
  return SavedSchema.parse(JSON.parse(saved.text)).data.route;
}

/**
 * Compiles the app the builder wrote to CommonJS, which the core loads, and gives it the manifest
 * a module needs.
 */
function compileApp(root: string): void {
  const compiled = spawnSync(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "-p",
      join(root, "tsconfig.json"),
      "--module",
      "commonjs",
      "--outDir",
      join(root, "dist"),
    ],
    { encoding: "utf8" },
  );
  expect(compiled.status, `${compiled.stdout}${compiled.stderr}`).to.equal(0);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: APP_MODULE,
      version: "0.0.0",
      main: "dist/index.js",
    }),
  );
}

/** The points of a series answer as `x=y`, sorted. */
function pointsOf(body: z.infer<typeof SeriesBody>): string {
  return body.series
    .map(({ x, y }) => `${x}=${y}`)
    .sort()
    .join(",");
}

function totalOf(series: z.infer<typeof PointsSchema>): number {
  return series.flatMap(({ data }) => data).reduce((sum, { y }) => sum + y, 0);
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
 * - `builder-survives-the-reload-its-write-triggers` fails when a reload of the app leaves the
 *   builder interface without its provider, which happens when the DMS does not declare it in
 *   `antelopeJs.implements`, or when the reload does not register the page the write added.
 */
describe("[integration] builder journeys: the app the builder writes, served", function () {
  this.timeout(OP_TIMEOUT);
  let appLoaded = false;
  after(async () => {
    if (!appLoaded) return;
    await StopModule(APP_MODULE);
    await DestroyModule(APP_MODULE);
  });
  const session = useBuilderSession();

  /** Compiles the app and starts it as a module the first time, then reloads that module. */
  async function runApp(): Promise<void> {
    const root = session().shop.shopRoot();
    compileApp(root);
    if (appLoaded) {
      await ReloadModule(APP_MODULE);
      return;
    }
    await LoadModule(
      APP_MODULE,
      { source: { type: "local", path: root }, config: {} },
      true,
    );
    appLoaded = true;
  }

  it("builder-period-bound-series-and-comparison-card-answer-over-http", async () => {
    const { shop, bridge } = session();
    const created = await callTool(bridge, "builder_create_resource", {
      name: "order",
      schema: ORDER_SCHEMA,
      fields: [
        { name: "status", dataType: { $dataType: "string" } },
        { name: "amount", dataType: { $dataType: "number" } },
        { name: "createdAt", dataType: { $dataType: "date" } },
      ],
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
