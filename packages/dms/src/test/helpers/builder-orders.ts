import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import { type BridgeProcess, callTool } from "./mcp-bridge-process";

const DAY_MS = 24 * 60 * 60 * 1000;

const SavedSchema = z.object({
  ok: z.literal(true),
  data: z.object({ route: z.string() }),
});

/** The body of a series route. */
export const SeriesBody = z.object({
  series: z.array(z.object({ x: z.string(), y: z.number() })),
});

const PointsSchema = z.array(
  z.object({ data: z.array(z.object({ y: z.number() })) }),
);

/** The body of a card route. */
export const CardBody = z.object({
  value: z.number(),
  previousValue: z.number(),
  delta: z.number(),
  series: PointsSchema,
  comparisonSeries: PointsSchema,
});

/** The moment `ago` days before now, as the ISO text a query string carries. */
export function daysAgo(ago: number): string {
  return new Date(Date.now() - ago * DAY_MS).toISOString();
}

/** A `where` that keeps the orders created between the route's `from` and `to`. */
export const PERIOD_BOUNDS: JsonValue = [
  { field: "createdAt", op: "ge", value: { $param: { name: "from" } } },
  { field: "createdAt", op: "le", value: { $param: { name: "to" } } },
];

/** One paid, refunded or pending order per row, placed `ago` days back. */
export const ORDER_SEEDS: JsonValue = (
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

/** The fields of the `order` resource the seeds above fill. */
export const ORDER_FIELDS: JsonValue = [
  { name: "status", dataType: { $dataType: "string" } },
  { name: "amount", dataType: { $dataType: "number" } },
  { name: "createdAt", dataType: { $dataType: "date" } },
];

/** The route of the query the builder saved for the page. */
export async function savedQueryRoute(
  bridge: BridgeProcess,
  args: Record<string, JsonValue>,
): Promise<string> {
  const saved = await callTool(bridge, "builder_add_query", args);
  expect(saved.isError, saved.text).to.equal(false);
  return SavedSchema.parse(JSON.parse(saved.text)).data.route;
}

/**
 * Compiles the app the builder wrote to CommonJS, which the core loads, and gives it the manifest
 * a module needs, with the `dependencies` it declares: the interfaces a module imports are the
 * ones it declares, and only a declared one can be bound to another provider.
 */
export function compileApp(
  root: string,
  name: string,
  dependencies: Record<string, string> = {},
): void {
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
      name,
      version: "0.0.0",
      main: "dist/index.js",
      dependencies,
    }),
  );
}

/** The points of a series answer as `x=y`, sorted. */
export function pointsOf(body: z.infer<typeof SeriesBody>): string {
  return body.series
    .map(({ x, y }) => `${x}=${y}`)
    .sort()
    .join(",");
}

/** The sum of every point a card's series holds. */
export function totalOf(series: z.infer<typeof CardBody>["series"]): number {
  return series.flatMap(({ data }) => data).reduce((sum, { y }) => sum + y, 0);
}
