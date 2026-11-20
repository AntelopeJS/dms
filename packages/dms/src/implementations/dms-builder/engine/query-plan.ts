/**
 * The calculation a query performs, separated from how it is written and how it
 * is run.
 *
 * A template turns its parameters into a `QueryPlan`; the plan is then the single
 * description three consumers share: the emitter below, the reader that
 * recognizes an emitted chain, and the executor that runs a draft's calculation
 * for a preview without writing a file.
 */

import type {
  ConfigValue,
  FilterOp,
  ImportRef,
  OpWarning,
  QueryParamBinding,
  ResourceFieldStructure,
} from "@antelopejs/interface-dms-builder";
import { indentationText, resolveProjectRoot } from "./project";
import { filterOpNamed } from "./query-chain";
import {
  type CompiledChain,
  checkField,
  fallbackTypeWarning,
  isParamBinding,
  type MethodParam,
  unvalidatedParam,
} from "./query-template";
import { isString } from "./scalar-guards";
import { isPlainObject } from "./plain-object";

/** One conjunct of the plan's row selection. Filters combine with AND. */
export interface PlanFilter {
  field: string;
  op: FilterOp;
  /** A literal baked into the chain, or a value the route supplies per request. */
  value: ConfigValue;
}

/** What the plan computes over the rows it selected. */
export type PlanMeasure =
  | { kind: "count" }
  | { kind: "aggregate"; op: string; field: string };

/**
 * The periods a date field is bucketed into before grouping. A week runs Monday to
 * Sunday, as an ISO week does, and is named by its Monday.
 */
export const PLAN_BUCKETS = [
  "day",
  "week",
  "month",
  "quarter",
  "year",
] as const;
export type PlanBucket = (typeof PLAN_BUCKETS)[number];

/** How the rows are grouped: by a field's value, or by a period of a date field. */
export interface PlanGroup {
  field: string;
  /** Absent for a plain field; set to bucket a date field into periods. */
  bucket?: PlanBucket;
  /**
   * IANA zone the bucket is computed in. The database extracts in UTC when this
   * is absent, which shifts every row near a period boundary into its neighbour.
   */
  timezone?: string;
}

/** Ordering of the groups: by the group itself, or by what was measured. */
export interface PlanOrder {
  by: "group" | "measure";
  direction: "asc" | "desc";
}

/** The rows a calculation selects, and the one measure taken over all of them at once. */
export interface ScalarPlan {
  filters: PlanFilter[];
  measure: PlanMeasure;
}

/**
 * A calculation over one resource: which rows, how they are grouped, what is
 * computed from them, and which of the results are kept.
 *
 * Deliberately says nothing about `this.table`, method bodies or streams — that
 * is each backend's business.
 */
export interface MeasurePlan extends ScalarPlan {
  /** Absent, which is what tells a measure from a {@link RatioPlan}. */
  kind?: undefined;
  /** Absent for a scalar: the measure is taken over every selected row at once. */
  group?: PlanGroup;
  order?: PlanOrder;
  /** Keeps the first N groups after ordering — a top N. */
  limit?: number;
}

/**
 * One scalar calculation over another, as a fraction. Each side selects its own
 * rows of the same resource; a value a route supplies per request is one value
 * for both.
 */
export interface RatioPlan {
  kind: "ratio";
  numerator: ScalarPlan;
  denominator: ScalarPlan;
}

export type QueryPlan = MeasurePlan | RatioPlan;

export function isRatioPlan(plan: QueryPlan): plan is RatioPlan {
  return plan.kind === "ratio";
}

/** The filters of every calculation a plan makes, in the order they are written. */
export function allPlanFilters(plan: QueryPlan): PlanFilter[] {
  return isRatioPlan(plan)
    ? [...plan.numerator.filters, ...plan.denominator.filters]
    : plan.filters;
}

/** The helper a ratio's body wraps its two sides in, and where the model imports it from. */
export const RATIO_HELPER = "ratioOf";
const RATIO_IMPORT: ImportRef = {
  name: RATIO_HELPER,
  module: "@antelopejs/interface-dms/base/query-response",
};

/**
 * The symbols a chain's text may need imported, so the pruning that follows a
 * removed method knows which imports it may have left unused.
 */
export const CHAIN_IMPORT_NAMES = [RATIO_IMPORT.name];

/**
 * Read a template's `where` parameter as the plan's filters. A template plans
 * only after its `validate` passed, so an entry that is not a filter is a plan
 * asked for before that, and refuses like the other plan readers do.
 */
export function planFilters(where: ConfigValue): PlanFilter[] {
  if (!Array.isArray(where)) {
    return [];
  }
  const entries: ConfigValue[] = where;
  return entries.map((raw) => {
    if (!isPlainObject(raw) || !isString(raw.field) || !("value" in raw)) {
      throw unvalidatedParam("where");
    }
    const op = isString(raw.op) ? filterOpNamed(raw.op) : undefined;
    if (op === undefined) {
      throw unvalidatedParam("where");
    }
    return { field: raw.field, op, value: raw.value };
  });
}

const IDENTIFIER_START = /^[A-Za-z_$]/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * A field name usable inside a parameter name: as it is when it is an identifier, its words in
 * camelCase otherwise — a column named `Order Date` reads `minOrderDate`.
 */
function parameterStem(field: string): string {
  if (IDENTIFIER.test(field)) {
    return field;
  }
  const words = field.split(/[^A-Za-z0-9]+/).filter((word) => word.length > 0);
  const stem = words
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join("");
  return IDENTIFIER_START.test(stem) ? stem : `field${stem}`;
}

/**
 * A model parameter name from the field it filters — `minPrice`, `maxPrice`,
 * `priceNot`, or just `price` — never the route's public name. The two names are
 * independent: the route exposes its own, the model reads a meaningful one. On a
 * name clash (two ops on one field), fall back to a numeric suffix.
 */
function deriveName(column: string, op: FilterOp, taken: Set<string>): string {
  const field = parameterStem(column);
  const capital = field.charAt(0).toUpperCase() + field.slice(1);
  const base =
    op === "ge" || op === "gt"
      ? `min${capital}`
      : op === "le" || op === "lt"
        ? `max${capital}`
        : op === "ne"
          ? `${field}Not`
          : field;
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}${suffix}`)) {
    suffix++;
  }
  return `${base}${suffix}`;
}

/** What a filter needs to bind one route parameter. */
interface ParamArgument {
  value: QueryParamBinding;
  field: string;
  op: FilterOp;
  ts: string;
  parameters: Map<string, MethodParam>;
  taken: Set<string>;
}

/**
 * Binds the parameter, or reuses the binding a previous filter already made for
 * this public name — `checkParamConflicts` has established they agree. The model
 * parameter is named from this filter's field/op; the body references that name,
 * while the binding's `$param.name` rides along only for the route to expose.
 */
function paramArgument({
  value,
  field,
  op,
  ts,
  parameters,
  taken,
}: ParamArgument): string {
  const routeName = value.$param.name;
  let param = parameters.get(routeName);
  if (!param) {
    const name = deriveName(field, op, taken);
    taken.add(name);
    param = { name, routeName, type: ts, in: value.$param.in ?? "query" };
    parameters.set(routeName, param);
  }
  return param.name;
}

/**
 * What every chain of one method body binds and warns about. A ratio's two sides
 * share it, so a period bound on both is two model parameters, not four.
 */
interface FilterScope {
  parameters: Map<string, MethodParam>;
  taken: Set<string>;
  warnings: OpWarning[];
}

function newFilterScope(): FilterScope {
  return { parameters: new Map(), taken: new Set(), warnings: [] };
}

/** One `.filter(...)` hop each, kept apart so the chain can be broken on them. */
function emitFilters(
  filters: PlanFilter[],
  fields: ResourceFieldStructure[],
  { parameters, taken, warnings }: FilterScope,
): string[] {
  return filters.map((filter) => {
    const resolved = checkField(fields, filter.field, "");
    const ts = "ts" in resolved ? resolved.ts : "string";
    if ("ts" in resolved) {
      warnings.push(...fallbackTypeWarning(filter.field, resolved));
    }
    const argument = isParamBinding(filter.value)
      ? paramArgument({
          value: filter.value,
          field: filter.field,
          op: filter.op,
          ts,
          parameters,
          taken,
        })
      : ts === "Date"
        ? `new Date(${JSON.stringify(filter.value)})`
        : JSON.stringify(filter.value);
    return `.filter((row) => row.key(${JSON.stringify(filter.field)}).${filter.op}(${argument}))`;
  });
}

function measureCall(measure: PlanMeasure, over: string): string {
  if (measure.kind === "count") {
    return "count()";
  }
  return `${measure.op}(${JSON.stringify(over)})`;
}

/** The zone argument the date extractors take, or nothing when none was asked for. */
function zoneArgument(group: PlanGroup): string {
  return group.timezone ? JSON.stringify(group.timezone) : "";
}

/** The days from 0001-01-01 to the Unix epoch, in the proleptic Gregorian calendar. */
export const DAYS_TO_UNIX_EPOCH = 719162;
export const DAYS_PER_YEAR = 365;
export const LEAP_CYCLES = [4, 100, 400] as const;

/**
 * The Monday of a row's ISO week as a count of days since 1970-01-01. The count comes
 * from the year, the day of the year and the day of the week alone, so it needs no
 * condition and a week that straddles New Year stays one week: the stamp is that
 * Monday's, whichever year the row falls in.
 */
function weekExpression(
  year: string,
  dayOfYear: string,
  dayOfWeek: string,
): string {
  const before = `${year}.sub(1)`;
  const leapDays = LEAP_CYCLES.map((cycle, index) => {
    const whole = `${before}.div(${cycle}).floor()`;
    return `.${index === 1 ? "sub" : "add"}(${whole})`;
  }).join("");
  return `${before}.mul(${DAYS_PER_YEAR})${leapDays}.add(${dayOfYear}).sub(${dayOfWeek}).sub(${DAYS_TO_UNIX_EPOCH})`;
}

/**
 * A date field reduced to one ordered number per period: `2026` for a year,
 * `202601` for a month, `20260114` for a day, and for a week the days since 1970-01-01
 * of its Monday.
 *
 * A number rather than a label, because the group is also what the series is
 * ordered by — and because a label belongs to the response, which knows the
 * viewer's locale, not to a chain compiled into the source. The response envelope
 * turns it back into a date.
 */
export function bucketExpression(group: PlanGroup, row: string): string {
  const zone = zoneArgument(group);
  const part = (name: string) =>
    `${row}.key(${JSON.stringify(group.field)}).${name}(${zone})`;
  const year = part("year");
  if (group.bucket === "year") {
    return year;
  }
  if (group.bucket === "week") {
    return weekExpression(year, part("dayofyear"), part("dayofweek"));
  }
  if (group.bucket === "quarter") {
    return `${year}.mul(10).add(${part("month")}.sub(1).div(3).floor().add(1))`;
  }
  const month = `${year}.mul(100).add(${part("month")})`;
  if (group.bucket === "month") {
    return month;
  }
  return `${month}.mul(100).add(${part("day")})`;
}

/** The projected field a bucketed group is grouped on. */
/**
 * Which period an emitted bucket expression computes, by rebuilding each
 * candidate and comparing — the emitter is the grammar, so a reader asking it
 * cannot drift from what was written.
 *
 * Whitespace is ignored on both sides: the expression is read out of a file a
 * formatter may have rewrapped since it was emitted.
 */
export function readBucketExpression(
  text: string,
  row: string,
  field: string,
  timezone?: string,
): PlanBucket | undefined {
  const squeeze = (value: string) => value.replace(/\s+/g, "");
  const target = squeeze(text);
  return PLAN_BUCKETS.find(
    (bucket) =>
      squeeze(bucketExpression({ field, bucket, timezone }, row)) === target,
  );
}

const GROUP_KEY = "bucket";
/** The projected field a bucketed aggregate measures, the row being replaced. */
const VALUE_KEY = "value";
/** The mapper's parameter: the group being folded, whatever it was grouped by. */
const GROUP_PARAM = "group";

/** Past this, a formatter breaks a line; so does the builder. */
const INLINE_CHAIN_LIMIT = 80;

/**
 * The depths the parts of a model method's body read at, counting the class and
 * the method itself.
 */
const RETURN_DEPTH = 2;
const HOP_DEPTH = RETURN_DEPTH + 1;
const MEMBER_DEPTH = HOP_DEPTH + 1;

/**
 * The prefix a line of the emitted body carries, one level short of the depth it
 * will read at: the method is inserted into its class, and the insertion indents
 * every line it was handed.
 */
function bodyIndent(indent: string, depth: number): string {
  return indent.repeat(depth - 1);
}

/** Whether a line of that depth still fits, so it can stay on one. */
function fitsOneLine(indent: string, depth: number, text: string): boolean {
  return indent.length * depth + text.length <= INLINE_CHAIN_LIMIT;
}

/**
 * Projects what the grouping needs before grouping on it.
 *
 * Only a bucketed group needs this: `group` takes a field name, not an
 * expression, so the period has to become a field of its own first. The measured
 * field rides along, since the projection replaces the row.
 *
 * A bucket expression is long enough on its own that the mapped object rarely
 * fits beside it, so the members break out the way a formatter would break them.
 */
function bucketProjection(
  plan: MeasurePlan,
  group: PlanGroup,
  indent: string,
): string {
  const members = [`${GROUP_KEY}: ${bucketExpression(group, "row")}`];
  if (plan.measure.kind === "aggregate") {
    members.push(
      `${VALUE_KEY}: row.key(${JSON.stringify(plan.measure.field)})`,
    );
  }
  const inline = `.map((row) => ({ ${members.join(", ")} }))`;
  if (fitsOneLine(indent, HOP_DEPTH, inline)) {
    return inline;
  }
  const lines = members
    .map((member) => `${bodyIndent(indent, MEMBER_DEPTH)}${member},`)
    .join("\n");
  return `.map((row) => ({\n${lines}\n${bodyIndent(indent, HOP_DEPTH)}}))`;
}

function orderCall(order: PlanOrder | undefined): string {
  if (!order) {
    return "";
  }
  const key = order.by === "group" ? "x" : "y";
  return `.orderBy(${JSON.stringify(key)}, ${JSON.stringify(order.direction)})`;
}

function limitCall(limit: number | undefined): string {
  return limit === undefined ? "" : `.slice(0, ${limit})`;
}

/**
 * The grouped form: one row per group, shaped as the points a series is made of.
 *
 * `x`/`y` rather than the field's own names because every consumer of a grouped
 * result reads points, and naming them here keeps the response envelope from
 * having to know which field was grouped on.
 */
function emitGrouped(
  plan: MeasurePlan,
  group: PlanGroup,
  filterHops: string[],
  indent: string,
): string[] {
  const bucketed = group.bucket !== undefined;
  const projection = bucketed ? bucketProjection(plan, group, indent) : "";
  const key = bucketed ? GROUP_KEY : group.field;
  const measuredField =
    bucketed && plan.measure.kind === "aggregate" ? VALUE_KEY : "";
  const over =
    plan.measure.kind === "aggregate"
      ? measuredField || plan.measure.field
      : "";
  const mapper = `(rows, ${GROUP_PARAM}) => ({ x: ${GROUP_PARAM}, y: rows.${measureCall(plan.measure, over)} })`;
  return [
    "this.table",
    ...filterHops,
    projection,
    `.group(${JSON.stringify(key)}, ${mapper})`,
    orderCall(plan.order),
    limitCall(plan.limit),
  ];
}

/** The line a chain starts on, which decides whether it still fits there. */
interface ChainLine {
  /** The depth of the line the receiver sits on. */
  depth: number;
  /** What precedes the chain on that line, and what follows it. */
  lead: string;
  trail: string;
}

const RETURN_LINE: ChainLine = {
  depth: RETURN_DEPTH,
  lead: "return ",
  trail: ";",
};
const ARGUMENT_LINE: ChainLine = { depth: HOP_DEPTH, lead: "", trail: "," };

/** The chain on one line, whatever its length. */
function inlineChain(hops: string[]): string {
  return hops.filter((hop) => hop !== "").join("");
}

/**
 * The chain as it reads in the method: on one line while it fits, one hop per
 * line once it does not — which is what the project's formatter would do with
 * it, and what stops a grouped calculation coming out as a 300-character line.
 *
 * The receiver stays on its line either way: a chain whose first line is a bare
 * `this.table` reads as if something were missing.
 */
function chainText(hops: string[], indent: string, line: ChainLine): string {
  const inline = inlineChain(hops);
  if (
    !inline.includes("\n") &&
    fitsOneLine(indent, line.depth, `${line.lead}${inline}${line.trail}`)
  ) {
    return inline;
  }
  const [receiver, ...rest] = hops.filter((hop) => hop !== "");
  const broken = bodyIndent(indent, line.depth + 1);
  return `${receiver}${rest.map((hop) => `\n${broken}${hop}`).join("")}`;
}

function scalarHops(plan: ScalarPlan, filterHops: string[]): string[] {
  const over = plan.measure.kind === "aggregate" ? plan.measure.field : "";
  return ["this.table", ...filterHops, `.${measureCall(plan.measure, over)}`];
}

function measureText(
  plan: MeasurePlan,
  fields: ResourceFieldStructure[],
  scope: FilterScope,
  indent: string,
): string {
  const filterHops = emitFilters(plan.filters, fields, scope);
  const hops = plan.group
    ? emitGrouped(plan, plan.group, filterHops, indent)
    : scalarHops(plan, filterHops);
  return chainText(hops, indent, RETURN_LINE);
}

/** Both sides as the arguments of `ratioOf`, on the line they fit on or one to a line. */
function ratioText(
  plan: RatioPlan,
  fields: ResourceFieldStructure[],
  scope: FilterScope,
  indent: string,
): string {
  const sides = [plan.numerator, plan.denominator].map((side) =>
    scalarHops(side, emitFilters(side.filters, fields, scope)),
  );
  const inline = `${RATIO_HELPER}(${sides.map(inlineChain).join(", ")})`;
  if (fitsOneLine(indent, RETURN_DEPTH, `return ${inline};`)) {
    return inline;
  }
  const lines = sides.map(
    (hops) =>
      `${bodyIndent(indent, HOP_DEPTH)}${chainText(hops, indent, ARGUMENT_LINE)},`,
  );
  return `${RATIO_HELPER}(\n${lines.join("\n")}\n${bodyIndent(indent, RETURN_DEPTH)})`;
}

/**
 * The plan as the body of a model method. The one place a chain's text is
 * decided: a template contributes a plan, never a string.
 */
export function emitPlan(
  plan: QueryPlan,
  fields: ResourceFieldStructure[],
): CompiledChain {
  const indent = indentationText(resolveProjectRoot());
  const scope = newFilterScope();
  const text = isRatioPlan(plan)
    ? ratioText(plan, fields, scope, indent)
    : measureText(plan, fields, scope, indent);
  const chain: CompiledChain = {
    body: `{\n${bodyIndent(indent, RETURN_DEPTH)}return ${text};\n}`,
    parameters: [...scope.parameters.values()],
    warnings: scope.warnings,
  };
  if (isRatioPlan(plan)) {
    chain.imports = [RATIO_IMPORT];
  }
  return chain;
}
