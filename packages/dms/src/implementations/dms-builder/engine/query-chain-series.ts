/**
 * Reading a grouped chain back into the plan that produced it.
 *
 * The inverse of the grouped half of query-plan.ts, and deliberately strict: a
 * chain that does not decompose exactly into the hops the emitter writes reads as
 * nothing at all, which is what keeps the builder from rewriting a chain a human
 * has taken over.
 */

import { type CallExpression, type MethodDeclaration, Node } from "ts-morph";
import { stringLiteralValue } from "./literals";
import {
  isThisTable,
  propName,
  type RawFilter,
  readFilter,
  receiver,
  returnedCall,
} from "./query-chain";
import {
  type PlanBucket,
  type PlanGroup,
  type PlanMeasure,
  type PlanOrder,
  readBucketExpression,
} from "./query-plan";

/** A grouped chain decomposed back into the plan's parts. */
export interface SeriesChain {
  filters: RawFilter[];
  group: PlanGroup;
  measure: PlanMeasure;
  order?: PlanOrder;
  limit?: number;
}

interface Hop {
  name: string;
  call: CallExpression;
}

/**
 * The chain as hops in the order they were applied, or `undefined` when it does
 * not start at `this.table`.
 */
function readHops(outer: CallExpression): Hop[] | undefined {
  const hops: Hop[] = [];
  let node: Node | undefined = outer;
  while (node && Node.isCallExpression(node)) {
    const name = propName(node);
    if (name === undefined) {
      return undefined;
    }
    hops.unshift({ name, call: node });
    node = receiver(node);
  }
  return node && isThisTable(node) ? hops : undefined;
}

/** The `(rows, group) => ({ x: …, y: … })` mapper a group folds each group with. */
interface GroupMapper {
  groupParam: string;
  streamParam: string;
  x: Node;
  y: Node;
}

function readGroupMapper(node: Node | undefined): GroupMapper | undefined {
  if (!node || !Node.isArrowFunction(node)) {
    return undefined;
  }
  const params = node.getParameters();
  if (params.length !== 2) {
    return undefined;
  }
  const body = node.getBody();
  const object = Node.isParenthesizedExpression(body)
    ? body.getExpression()
    : body;
  if (!Node.isObjectLiteralExpression(object)) {
    return undefined;
  }
  const properties = object.getProperties();
  if (properties.length !== 2) {
    return undefined;
  }
  const byName = new Map<string, Node>();
  for (const property of properties) {
    if (!Node.isPropertyAssignment(property)) {
      return undefined;
    }
    const initializer = property.getInitializer();
    if (!initializer) {
      return undefined;
    }
    byName.set(property.getName(), initializer);
  }
  const x = byName.get("x");
  const y = byName.get("y");
  if (!x || !y) {
    return undefined;
  }
  return {
    streamParam: params[0].getName(),
    groupParam: params[1].getName(),
    x,
    y,
  };
}

/** `rows.count()` or `rows.sum("field")`, taken over the group being folded. */
function readMeasure(
  node: Node,
  streamParam: string,
): { measure: PlanMeasure; over?: string } | undefined {
  if (!Node.isCallExpression(node)) {
    return undefined;
  }
  const name = propName(node);
  const target = receiver(node);
  if (
    !name ||
    !target ||
    !Node.isIdentifier(target) ||
    target.getText() !== streamParam
  ) {
    return undefined;
  }
  const args = node.getArguments();
  if (name === "count") {
    return args.length === 0 ? { measure: { kind: "count" } } : undefined;
  }
  if (args.length !== 1) {
    return undefined;
  }
  const over = stringLiteralValue(args[0]);
  return over === undefined
    ? undefined
    : { measure: { kind: "aggregate", op: name, field: over }, over };
}

/** The projection a bucketed group is grouped through. */
interface Projection {
  field: string;
  bucket: PlanBucket;
  timezone?: string;
  /** The field the measure reads after the projection replaced the row. */
  measured?: string;
}

/**
 * Reads `.map((row) => ({ bucket: <period>, value: row.key("amount") }))`.
 *
 * The period is identified by asking the emitter to rebuild each candidate
 * rather than by taking the expression apart, so the two cannot disagree about
 * what a month looks like.
 */
function readProjection(node: Node | undefined): Projection | undefined {
  if (!node || !Node.isArrowFunction(node)) {
    return undefined;
  }
  const params = node.getParameters();
  if (params.length !== 1) {
    return undefined;
  }
  const row = params[0].getName();
  const body = node.getBody();
  const object = Node.isParenthesizedExpression(body)
    ? body.getExpression()
    : body;
  if (!Node.isObjectLiteralExpression(object)) {
    return undefined;
  }
  let periodText: string | undefined;
  let measured: string | undefined;
  for (const property of object.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      return undefined;
    }
    const initializer = property.getInitializer();
    if (!initializer) {
      return undefined;
    }
    if (property.getName() === "bucket") {
      periodText = initializer.getText();
      continue;
    }
    if (property.getName() !== "value") {
      return undefined;
    }
    measured = readProjectedField(initializer, row);
    if (measured === undefined) {
      return undefined;
    }
  }
  if (periodText === undefined) {
    return undefined;
  }
  const source = readPeriodSource(periodText);
  if (!source) {
    return undefined;
  }
  const bucket = readBucketExpression(
    periodText,
    row,
    source.field,
    source.timezone,
  );
  return bucket ? { ...source, bucket, measured } : undefined;
}

/** `row.key("amount")`, the field carried through a projection. */
function readProjectedField(node: Node, row: string): string | undefined {
  if (!Node.isCallExpression(node) || propName(node) !== "key") {
    return undefined;
  }
  const target = receiver(node);
  if (!target || !Node.isIdentifier(target) || target.getText() !== row) {
    return undefined;
  }
  return stringLiteralValue(node.getArguments()[0]);
}

/**
 * The field and zone a period expression reads, as written. Only a candidate:
 * what settles it is rebuilding the whole expression from them.
 */
function readPeriodSource(
  text: string,
): { field: string; timezone?: string } | undefined {
  const match =
    /\.key\(\s*"([^"]+)"\s*\)\s*\.(?:year|month|day)\(([^)]*)\)/.exec(text);
  if (!match) {
    return undefined;
  }
  const zone = match[2].trim();
  if (zone.length === 0) {
    return { field: match[1] };
  }
  const timezone = /^"([^"]*)"$/.exec(zone);
  return timezone ? { field: match[1], timezone: timezone[1] } : undefined;
}

function readOrder(call: CallExpression): PlanOrder | undefined {
  const args = call.getArguments();
  if (args.length !== 2) {
    return undefined;
  }
  const key = stringLiteralValue(args[0]);
  const direction = stringLiteralValue(args[1]);
  if (direction !== "asc" && direction !== "desc") {
    return undefined;
  }
  if (key !== "x" && key !== "y") {
    return undefined;
  }
  return { by: key === "x" ? "group" : "measure", direction };
}

function readLimit(call: CallExpression): number | undefined {
  const args = call.getArguments();
  if (args.length !== 2) {
    return undefined;
  }
  const [offset, count] = args.map((argument) =>
    Node.isNumericLiteral(argument) ? argument.getLiteralValue() : undefined,
  );
  return offset === 0 && count !== undefined ? count : undefined;
}

/** The `.group("key", (rows, group) => ({ x, y }))` hop, read as key and measure. */
function readGroupHop(
  hop: Hop,
):
  | { groupKey: string; measured: { measure: PlanMeasure; over?: string } }
  | undefined {
  if (hop.name !== "group") {
    return undefined;
  }
  const args = hop.call.getArguments();
  const groupKey = stringLiteralValue(args[0]);
  const mapper = readGroupMapper(args[1]);
  if (groupKey === undefined || !mapper) {
    return undefined;
  }
  if (
    !Node.isIdentifier(mapper.x) ||
    mapper.x.getText() !== mapper.groupParam
  ) {
    return undefined;
  }
  const measured = readMeasure(mapper.y, mapper.streamParam);
  return measured ? { groupKey, measured } : undefined;
}

/**
 * The group and measure a chain computes, once its projection is accounted for.
 *
 * A projected chain groups on the projected field and measures the one carried
 * alongside it, so the names in the chain (`bucket`, `value`) are translated back
 * to the resource's own fields. Anything that does not line up is a chain the
 * emitter never wrote, including a projection carried through a count, which the
 * emitter never writes.
 */
function resolveGroup(
  projection: Projection | undefined,
  groupKey: string,
  measured: { measure: PlanMeasure; over?: string },
): { group: PlanGroup; measure: PlanMeasure } | undefined {
  if (!projection) {
    return { group: { field: groupKey }, measure: measured.measure };
  }
  if (groupKey !== "bucket") {
    return undefined;
  }
  if (measured.over !== undefined && measured.over !== "value") {
    return undefined;
  }
  const group: PlanGroup = {
    field: projection.field,
    bucket: projection.bucket,
    timezone: projection.timezone,
  };
  if (measured.measure.kind !== "aggregate") {
    return projection.measured === undefined
      ? { group, measure: measured.measure }
      : undefined;
  }
  return projection.measured === undefined
    ? undefined
    : {
        group,
        measure: {
          kind: "aggregate",
          op: measured.measure.op,
          field: projection.measured,
        },
      };
}

/**
 * Reads a model method as a grouped chain: `this.table`, filters, an optional
 * bucket projection, the group, and an optional ordering and limit.
 *
 * Returns `undefined` for anything else — a hop out of order, an extra hop, a
 * mapper that is not the emitted shape — which the template reports as a chain it
 * did not write.
 */
export function readSeriesChain(
  method: MethodDeclaration,
): SeriesChain | undefined {
  const outer = returnedCall(method);
  const hops = outer ? readHops(outer) : undefined;
  if (!hops) {
    return undefined;
  }
  const params = new Set(
    method.getParameters().map((param) => param.getName()),
  );

  const filters: RawFilter[] = [];
  let index = 0;
  while (index < hops.length && hops[index].name === "filter") {
    const filter = readFilter(hops[index].call.getArguments()[0], params);
    if (!filter) {
      return undefined;
    }
    filters.push(filter);
    index += 1;
  }

  let projection: Projection | undefined;
  if (hops[index]?.name === "map") {
    projection = readProjection(hops[index].call.getArguments()[0]);
    if (!projection) {
      return undefined;
    }
    index += 1;
  }

  const grouped = hops[index] ? readGroupHop(hops[index]) : undefined;
  if (!grouped) {
    return undefined;
  }
  index += 1;

  const resolved = resolveGroup(projection, grouped.groupKey, grouped.measured);
  if (!resolved) {
    return undefined;
  }

  let order: PlanOrder | undefined;
  if (hops[index]?.name === "orderBy") {
    order = readOrder(hops[index].call);
    if (!order) {
      return undefined;
    }
    index += 1;
  }

  let limit: number | undefined;
  if (hops[index]?.name === "slice") {
    limit = readLimit(hops[index].call);
    if (limit === undefined) {
      return undefined;
    }
    index += 1;
  }

  return index === hops.length
    ? {
        filters,
        group: resolved.group,
        measure: resolved.measure,
        order,
        limit,
      }
    : undefined;
}
