/**
 * Running a plan instead of writing it.
 *
 * The second backend over `QueryPlan`: the same calculation built as real calls
 * on a table handle rather than as source text, so a draft's data can be shown
 * before anything reaches disk. It mirrors the emitter branch for branch on
 * purpose: the two are checked against each other by transcribing this one back
 * into the text the other produces.
 */

import type {
  ConfigValue,
  QueryPoint,
  ResourceFieldStructure,
} from "@antelopejs/interface-dms-builder";
import {
  DAYS_PER_YEAR,
  DAYS_TO_UNIX_EPOCH,
  LEAP_CYCLES,
  type PlanFilter,
  type PlanGroup,
  type PlanMeasure,
  type QueryPlan,
} from "./query-plan";
import { checkField, isParamBinding } from "./query-template";

/** What a comparison takes: a filter literal, a request argument, or the Date one is coerced to. */
export type PlanOperand = ConfigValue | Date;

/** A value in a query, as the database's proxy exposes it. */
export interface PlanValue {
  eq(value: PlanOperand): PlanValue;
  ne(value: PlanOperand): PlanValue;
  gt(value: PlanOperand): PlanValue;
  ge(value: PlanOperand): PlanValue;
  lt(value: PlanOperand): PlanValue;
  le(value: PlanOperand): PlanValue;
  year(timezone?: string): PlanValue;
  month(timezone?: string): PlanValue;
  day(timezone?: string): PlanValue;
  dayofyear(timezone?: string): PlanValue;
  dayofweek(timezone?: string): PlanValue;
  mul(value: number | PlanValue): PlanValue;
  div(value: number | PlanValue): PlanValue;
  add(value: number | PlanValue): PlanValue;
  sub(value: number | PlanValue): PlanValue;
  floor(): PlanValue;
}

export interface PlanRow {
  key(field: string): PlanValue;
}

/** One point per group once awaited, in the order the stream holds them. */
export interface PlanPoints extends PromiseLike<QueryPoint[]> {
  orderBy(index: string, direction?: "asc" | "desc"): PlanPoints;
  slice(offset: number, count?: number): PlanPoints;
}

/** The stream surface the executor drives, named for what the plan needs of it. */
export interface PlanStream {
  filter(predicate: (row: PlanRow) => PlanValue): PlanStream;
  map(mapper: (row: PlanRow) => BucketMembers): PlanStream;
  group(
    index: string,
    mapper: (rows: PlanStream, group: PlanValue) => GroupedPoint,
  ): PlanPoints;
  count(field?: string): PromiseLike<number>;
  sum(field?: string): PromiseLike<number>;
  avg(field?: string): PromiseLike<number>;
  min(field?: string): PromiseLike<number>;
  max(field?: string): PromiseLike<number>;
}

/** Values the route would supply per request, by the name the route exposes. */
export type PlanArguments = Record<string, PlanOperand>;

class MissingArgument extends Error {
  constructor(name: string) {
    super(`no value supplied for the "${name}" parameter`);
  }
}

/**
 * A supplied value in the field's own type.
 *
 * The generated route coerces what arrives as text before handing it to the
 * model — `Number(x)`, `new Date(x)`, `x === "true"` — and a preview reading the
 * same query string has to do the same, or it compares a string where the route
 * compares a number and answers something else entirely.
 */
function coerce(value: PlanOperand, ts: string): PlanOperand {
  if (ts === "number") {
    return Number(value);
  }
  if (ts === "Date") {
    if (value instanceof Date) {
      return value;
    }
    const made: unknown = Reflect.construct(Date, [value]);
    return made instanceof Date ? made : value;
  }
  if (ts === "boolean") {
    return value === true || value === "true";
  }
  return value;
}

interface ResolvedFilter {
  field: string;
  op: PlanFilter["op"];
  value: PlanOperand;
}

/**
 * Every filter with its value settled, before a single call is built.
 *
 * Resolved up front rather than inside each predicate: a missing argument has to
 * stop the query from being dispatched at all, and a `throw` from inside a
 * predicate only reaches the caller if the adapter happens to evaluate it eagerly.
 */
function resolveFilters(
  plan: QueryPlan,
  fields: ResourceFieldStructure[],
  args: PlanArguments,
): ResolvedFilter[] {
  return plan.filters.map((filter) => {
    const resolved = checkField(fields, filter.field, "");
    const ts = "ts" in resolved ? resolved.ts : "string";
    if (!isParamBinding(filter.value)) {
      return {
        field: filter.field,
        op: filter.op,
        value: ts === "Date" ? coerce(filter.value, ts) : filter.value,
      };
    }
    const name = filter.value.$param.name;
    if (!Object.hasOwn(args, name)) {
      throw new MissingArgument(name);
    }
    return {
      field: filter.field,
      op: filter.op,
      value: coerce(args[name], ts),
    };
  });
}

function applyFilters(
  stream: PlanStream,
  filters: ResolvedFilter[],
): PlanStream {
  return filters.reduce(
    (narrowed, filter) =>
      narrowed.filter((row) => row.key(filter.field)[filter.op](filter.value)),
    stream,
  );
}

/** The same period arithmetic the emitter writes, as calls. */
function bucketValue(row: PlanRow, group: PlanGroup): PlanValue {
  const zone = group.timezone;
  const part = (name: "year" | "month" | "day" | "dayofyear" | "dayofweek") =>
    row.key(group.field)[name](zone);
  const year = part("year");
  if (group.bucket === "year") {
    return year;
  }
  if (group.bucket === "week") {
    const before = year.sub(1);
    const leapDays = LEAP_CYCLES.map((cycle) => before.div(cycle).floor());
    return before
      .mul(DAYS_PER_YEAR)
      .add(leapDays[0])
      .sub(leapDays[1])
      .add(leapDays[2])
      .add(part("dayofyear"))
      .sub(part("dayofweek"))
      .sub(DAYS_TO_UNIX_EPOCH);
  }
  if (group.bucket === "quarter") {
    return year.mul(10).add(part("month").sub(1).div(3).floor().add(1));
  }
  const month = year.mul(100).add(part("month"));
  return group.bucket === "month" ? month : month.mul(100).add(part("day"));
}

function measureOver(
  rows: PlanStream,
  measure: PlanMeasure,
  over: string,
): PromiseLike<number> {
  if (measure.kind === "count") {
    return rows.count();
  }
  switch (measure.op) {
    case "sum":
      return rows.sum(over);
    case "avg":
      return rows.avg(over);
    case "min":
      return rows.min(over);
    case "max":
      return rows.max(over);
    default:
      throw new TypeError(`no aggregate named "${measure.op}"`);
  }
}

/** What a bucketed plan projects each row to before grouping on it. */
export interface BucketMembers {
  bucket: PlanValue;
  value?: PlanValue;
}

/** One group as the mapper hands it back: the group itself and what was measured over its rows. */
export interface GroupedPoint {
  x: PlanValue;
  y: PromiseLike<number>;
}

function applyGroup(
  stream: PlanStream,
  plan: QueryPlan,
  group: PlanGroup,
): PlanPoints {
  const bucketed = group.bucket !== undefined;
  const projected = bucketed
    ? stream.map((row) => {
        const members: BucketMembers = {
          bucket: bucketValue(row, group),
        };
        if (plan.measure.kind === "aggregate") {
          members.value = row.key(plan.measure.field);
        }
        return members;
      })
    : stream;
  const key = bucketed ? "bucket" : group.field;
  const over =
    plan.measure.kind === "aggregate"
      ? bucketed
        ? "value"
        : plan.measure.field
      : "";
  const grouped = projected.group(key, (rows, current) => ({
    x: current,
    y: measureOver(rows, plan.measure, over),
  }));
  const ordered = plan.order
    ? grouped.orderBy(
        plan.order.by === "group" ? "x" : "y",
        plan.order.direction,
      )
    : grouped;
  return plan.limit === undefined ? ordered : ordered.slice(0, plan.limit);
}

/**
 * Build the plan against a table handle. The result is what the database's own
 * chain answers — awaitable, a number for a scalar plan and one point per group
 * for a grouped one — so a caller awaits it as it would any query.
 *
 * Throws when an argument a filter binds was not supplied, rather than running a
 * query with a missing bound value in it.
 */
export function executePlan(
  table: PlanStream,
  plan: QueryPlan,
  fields: ResourceFieldStructure[],
  args: PlanArguments = {},
): PromiseLike<number | QueryPoint[]> {
  const narrowed = applyFilters(table, resolveFilters(plan, fields, args));
  if (plan.group) {
    return applyGroup(narrowed, plan, plan.group);
  }
  return measureOver(
    narrowed,
    plan.measure,
    plan.measure.kind === "aggregate" ? plan.measure.field : "",
  );
}
