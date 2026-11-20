import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import { authorizedClient, registerUser } from "./auth";
import { daysAgo, savedQueryRoute } from "./builder-orders";
import type { BuilderSession } from "./builder-session";
import { callTool } from "./mcp-bridge-process";
import { parseBody } from "./parse-body";

const FLEET_SCHEMA = "builder-journeys-fleet";
const HTTP_OK = 200;

const PreviewSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    status: z.string(),
    body: z.unknown(),
    truncated: z.boolean(),
  }),
});
/** A KPI card's answer: `value` is left out rather than written as null. */
const KpiBody = z.object({
  value: z.number().optional(),
  previousValue: z.number().optional(),
  delta: z.number().optional(),
});

/** One bike per row, rented or free, last seen `ago` days back. */
const FLEET_SEEDS: JsonValue = (
  [
    ["b1", "rented", 5],
    ["b2", "free", 10],
    ["b3", "free", 15],
    ["b4", "free", 20],
    ["b5", "rented", 35],
    ["b6", "rented", 40],
    ["b7", "free", 45],
    ["b8", "free", 50],
  ] as const
).map(([_id, status, ago]) => ({ _id, status, seenAt: daysAgo(ago) }));

const FLEET_PERIOD: JsonValue[] = [
  { field: "seenAt", op: "ge", value: { $param: { name: "from" } } },
  { field: "seenAt", op: "le", value: { $param: { name: "to" } } },
];

const RENTED: JsonValue = { field: "status", op: "eq", value: "rented" };

/** What the routes and tools of the ratio journey answered. */
export interface RatioJourney {
  compared: z.infer<typeof KpiBody>;
  uncompared: z.infer<typeof KpiBody>;
  overall: z.infer<typeof KpiBody>;
  retired: z.infer<typeof KpiBody>;
  previewed: z.infer<typeof PreviewSchema>["data"];
  reconfigured: z.infer<typeof KpiBody>;
}

async function saveFleetQueries({
  shop,
  bridge,
}: BuilderSession): Promise<Record<"period" | "overall" | "retired", string>> {
  const created = await callTool(bridge, "builder_create_resource", {
    name: "bike",
    schema: FLEET_SCHEMA,
    fields: [
      { name: "status", dataType: { $dataType: "string" } },
      { name: "seenAt", dataType: { $dataType: "date" } },
    ],
    seeds: FLEET_SEEDS,
  });
  expect(created.isError, created.text).to.equal(false);
  const query = { page: shop.PAGE, resource: "bike", template: "ratio" };
  return {
    period: await savedQueryRoute(bridge, {
      ...query,
      name: "utilisationRate",
      params: {
        numerator: { where: [RENTED, ...FLEET_PERIOD] },
        denominator: { where: FLEET_PERIOD },
      },
      response: "value",
      compare: true,
    }),
    overall: await savedQueryRoute(bridge, {
      ...query,
      name: "overallRate",
      params: { numerator: { where: [RENTED] }, denominator: {} },
    }),
    retired: await savedQueryRoute(bridge, {
      ...query,
      name: "retiredRate",
      params: {
        numerator: {},
        denominator: {
          where: [{ field: "status", op: "eq", value: "retired" }],
        },
      },
    }),
  };
}

/**
 * A ratio saved through the builder tools, then served: the percentage a KpiCard with
 * `valueFormat: "percent"` shows, with its delta over the period before, and no value
 * where the denominator is 0.
 */
export async function servesARatioKpi(
  session: BuilderSession,
  runApp: () => Promise<void>,
): Promise<RatioJourney> {
  const { shop, bridge } = session;
  const routes = await saveFleetQueries(session);
  await runApp();
  await RegisterSchema(FLEET_SCHEMA);

  const owner = authorizedClient(
    (await registerUser({ owner: true })).accessToken,
  );
  const read = async (route: string, params: Record<string, string> = {}) => {
    const answer = await owner.get(route, { params });
    expect(answer.status, JSON.stringify(answer.data)).to.equal(HTTP_OK);
    return answer;
  };
  const compared = parseBody(
    KpiBody,
    await read(routes.period, {
      from: daysAgo(30),
      to: daysAgo(0),
      compareFrom: daysAgo(60),
      compareTo: daysAgo(30),
    }),
  );
  const uncompared = parseBody(
    KpiBody,
    await read(routes.period, { from: daysAgo(30), to: daysAgo(0) }),
  );
  const overall = parseBody(KpiBody, await read(routes.overall));
  const retired = parseBody(KpiBody, await read(routes.retired));

  const previewed = await callTool(bridge, "builder_preview_query", {
    name: "preview",
    resource: "bike",
    template: "ratio",
    params: { numerator: { where: [RENTED] }, denominator: {} },
  });
  expect(previewed.isError, previewed.text).to.equal(false);

  const configured = await callTool(bridge, "builder_configure_query", {
    query: `${shop.PAGE}@retiredRate`,
    patch: {
      params: {
        numerator: { where: [RENTED] },
        denominator: {
          where: [{ field: "status", op: "eq", value: "free" }],
        },
      },
    },
  });
  expect(configured.isError, configured.text).to.equal(false);
  await runApp();
  return {
    compared,
    uncompared,
    overall,
    retired,
    previewed: PreviewSchema.parse(JSON.parse(previewed.text)).data,
    reconfigured: parseBody(KpiBody, await read(routes.retired)),
  };
}
