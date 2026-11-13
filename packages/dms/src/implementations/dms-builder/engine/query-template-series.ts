/**
 * The `series` template: one measure per group, which is what a chart, a top N
 * and any other multi-point block reads.
 */

import type {
  ConfigSchema,
  ConfigValue,
  ResourceFieldStructure,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import {
  PLAN_BUCKETS,
  type PlanGroup,
  type PlanMeasure,
  type PlanOrder,
  planFilters,
} from "./query-plan";
import {
  AGGREGATE_OPS,
  aggregateMeasure,
  checkField,
  issue,
  type ParsedParams,
  type QueryParams,
  type QueryTemplate,
  scanForExpr,
  unvalidatedParam,
} from "./query-template";
import { isNumber, isOneOf, isString } from "./scalar-guards";
import { checkFilters, whereSchema } from "./query-where";
import { readSeriesChain, type SeriesChain } from "./query-chain-series";
import { whereParams } from "./query-chain";
import { describeValue } from "./describe-value";

const ORDER_KEYS = ["group", "measure"] as const;
const ORDER_DIRECTIONS = ["asc", "desc"] as const;
const MAX_LIMIT = 1000;

interface SeriesParams {
  op?: ConfigValue;
  field?: ConfigValue;
  groupBy?: ConfigValue;
  bucket?: ConfigValue;
  timezone?: ConfigValue;
  orderBy?: ConfigValue;
  direction?: ConfigValue;
  limit?: ConfigValue;
  where?: ConfigValue;
}

function measureOf(params: SeriesParams): PlanMeasure {
  return params.op === "count" || params.op === undefined
    ? { kind: "count" }
    : aggregateMeasure(params);
}

function groupOf(params: SeriesParams): PlanGroup {
  if (!isString(params.groupBy)) {
    throw unvalidatedParam("groupBy");
  }
  return {
    field: params.groupBy,
    bucket: isOneOf(PLAN_BUCKETS, params.bucket) ? params.bucket : undefined,
    timezone: isString(params.timezone) ? params.timezone : undefined,
  };
}

/**
 * The order a series is read in. With none requested it is the group ascending:
 * a grouped result comes back in the database's order, which for MongoDB is
 * unordered, and a timeline wants its points in sequence.
 */
function orderOf(params: SeriesParams): PlanOrder | undefined {
  if (params.orderBy === undefined && params.direction === undefined) {
    return { by: "group", direction: "asc" };
  }
  return {
    by: isOneOf(ORDER_KEYS, params.orderBy) ? params.orderBy : "group",
    direction: isOneOf(ORDER_DIRECTIONS, params.direction)
      ? params.direction
      : "asc",
  };
}

/** The measure half: `count`, or an aggregate over a numeric field. */
function checkMeasure(
  params: SeriesParams,
  fields: ResourceFieldStructure[],
): ValidationIssue[] {
  if (params.op === undefined || params.op === "count") {
    return [];
  }
  if (!isOneOf(AGGREGATE_OPS, params.op)) {
    return [
      issue(
        "/op",
        `op must be count or one of ${[...AGGREGATE_OPS].join(", ")}`,
      ),
    ];
  }
  const resolved = checkField(fields, params.field, "/field");
  if ("pointer" in resolved) {
    return [resolved];
  }
  return resolved.ts === "number"
    ? []
    : [
        issue(
          "/field",
          `field ${describeValue(params.field)} is not numeric; ${params.op} needs a number field`,
        ),
      ];
}

/**
 * The grouping half: a field, and the period a date field is bucketed into.
 *
 * Without a bucket the group must be a string or a number, since a point's group
 * reaches the response as `number | string`.
 */
function checkGroup(
  params: SeriesParams,
  fields: ResourceFieldStructure[],
): ValidationIssue[] {
  const resolved = checkField(fields, params.groupBy, "/groupBy");
  if ("pointer" in resolved) {
    return [resolved];
  }
  if (params.bucket === undefined) {
    return resolved.ts === "string" || resolved.ts === "number"
      ? []
      : [
          issue(
            "/groupBy",
            `field ${describeValue(params.groupBy)} is a ${resolved.ts}; group by a text or numeric field, or bucket a date field into periods`,
          ),
        ];
  }
  if (!isOneOf(PLAN_BUCKETS, params.bucket)) {
    return [
      issue("/bucket", `bucket must be one of ${PLAN_BUCKETS.join(", ")}`),
    ];
  }
  if (resolved.ts !== "Date") {
    return [
      issue(
        "/bucket",
        `field ${describeValue(params.groupBy)} is not a date; only a date field can be bucketed into periods`,
      ),
    ];
  }
  return params.timezone === undefined || isString(params.timezone)
    ? []
    : [
        issue(
          "/timezone",
          "timezone must be an IANA zone name, e.g. Europe/Brussels",
        ),
      ];
}

function checkOrderAndLimit(params: SeriesParams): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (params.orderBy !== undefined && !isOneOf(ORDER_KEYS, params.orderBy)) {
    issues.push(
      issue("/orderBy", `orderBy must be ${ORDER_KEYS.join(" or ")}`),
    );
  }
  if (
    params.direction !== undefined &&
    !isOneOf(ORDER_DIRECTIONS, params.direction)
  ) {
    issues.push(
      issue("/direction", `direction must be ${ORDER_DIRECTIONS.join(" or ")}`),
    );
  }
  if (params.limit !== undefined) {
    const limit = params.limit;
    if (
      !isNumber(limit) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_LIMIT
    ) {
      issues.push(
        issue(
          "/limit",
          `limit must be a whole number between 1 and ${MAX_LIMIT}`,
        ),
      );
    }
  }
  return issues;
}

function seriesParamsSchema(): ConfigSchema {
  return {
    op: {
      type: "string",
      enum: ["count", ...AGGREGATE_OPS],
      optional: true,
      description: "What to measure in each group. Defaults to count.",
    },
    field: {
      type: "string",
      optional: true,
      description:
        "The numeric field the measure reads. Required for every op but count.",
    },
    groupBy: {
      type: "string",
      description: "The field the rows are grouped by.",
    },
    bucket: {
      type: "string",
      enum: [...PLAN_BUCKETS],
      optional: true,
      description:
        "Groups a date field by period instead of by exact value. Only for a date field.",
    },
    timezone: {
      type: "string",
      optional: true,
      description:
        "IANA zone the period is computed in, e.g. Europe/Brussels. Omit to bucket in UTC, which shifts rows near a period boundary.",
    },
    orderBy: {
      type: "string",
      enum: [...ORDER_KEYS],
      optional: true,
      description:
        "Order the points by their group (a timeline) or by what was measured (a ranking). Defaults to group.",
    },
    direction: {
      type: "string",
      enum: [...ORDER_DIRECTIONS],
      optional: true,
      description: "Defaults to ascending.",
    },
    limit: {
      type: "number",
      optional: true,
      description: `Keep only the first N points after ordering — a top N. At most ${MAX_LIMIT}.`,
    },
    where: { ...whereSchema(), optional: true },
  };
}

/**
 * A read chain as the parameters that would produce it. Only what was written is
 * reported: a default the emitter always applies — the ordering every series
 * carries — comes back explicitly, since a caller editing these params and
 * sending them again must get the same chain.
 */
function seriesParams(chain: SeriesChain): ParsedParams {
  const params: QueryParams = { groupBy: chain.group.field };
  if (chain.measure.kind === "aggregate") {
    params.op = chain.measure.op;
    params.field = chain.measure.field;
  }
  if (chain.group.bucket) {
    params.bucket = chain.group.bucket;
  }
  if (chain.group.timezone) {
    params.timezone = chain.group.timezone;
  }
  if (chain.order) {
    params.orderBy = chain.order.by;
    params.direction = chain.order.direction;
  }
  if (chain.limit !== undefined) {
    params.limit = chain.limit;
  }
  return { ...params, ...whereParams(chain.filters) };
}

export function seriesTemplate(): QueryTemplate {
  return {
    descriptor: {
      id: "series",
      resourceType: "database-table",
      title: "Series",
      description:
        "Measures rows per group — by a field's value, or by day, week (Monday to Sunday), month, quarter or year of a date field — and answers one point per group.",
      output: "series",
      params: seriesParamsSchema(),
    },
    validate: (params, fields) => [
      ...scanForExpr(params, "query params"),
      ...checkFilters(params.where, fields),
      ...checkMeasure(params, fields),
      ...checkGroup(params, fields),
      ...checkOrderAndLimit(params),
    ],
    plan: (params) => ({
      filters: planFilters(params.where),
      measure: measureOf(params),
      group: groupOf(params),
      order: orderOf(params),
      limit: isNumber(params.limit) ? params.limit : undefined,
    }),
    parse: (method) => {
      const chain = readSeriesChain(method);
      return chain ? seriesParams(chain) : undefined;
    },
  };
}
