import type { SeriesMeasure } from "@antelopejs/interface-dms/base/query-response";
import type {
  ImportRef,
  QueryArrangement,
  QueryOutputKind,
  QueryStructure,
  ResourceFieldStructure,
} from "@antelopejs/interface-dms-builder";
import {
  AGGREGATE_OPS,
  type CompiledChain,
  getQueryTemplate,
  type MethodParam,
  type QueryParams,
} from "./query-template";
import { PLAN_BUCKETS, type PlanBucket } from "./query-plan";
import { indentationText, resolveProjectRoot } from "./project";
import type { DecoratorSymbol } from "./resource-emit";
import { decoratorImport } from "./resource-emit-types";
import { words } from "./emit";
import { isOneOf } from "./scalar-guards";

/**
 * The prefix new query endpoints default to. Only a default — `AddQueryInput.endpoint`
 * may put a query at any path, and read-back finds queries by their shape, not by
 * where they sit.
 */
const DEFAULT_ENDPOINT_PREFIX = "/stats/";
const TENANT_SCHEMA_NAME_VALUE = "dms-tenant";

/**
 * How a route hands back what the model computed.
 *
 * A calculation answers one thing; the block reading it wants that arranged its
 * own way. The arrangements that need more than a property name — a headline
 * figure, a ranked list, a variation — are built by helpers the DMS publishes,
 * so a route stays one expression and the reader can still recognize it.
 */
interface ResponseEmission {
  returnType: string;
  /** Given the call that runs the query, and the preceding period's when comparing. */
  body: (current: string, previous?: string) => string;
  /** Symbols the route has to import for that body.  */
  imports: string[];
}

/** How the helpers are reached from a generated route. */
const RESPONSE_HELPERS = new Map([
  ["card", { helper: "chartCardData", type: "ChartCardData" }],
  ["value", { helper: "kpiCardData", type: "KpiCardData" }],
  ["items", { helper: "topListData", type: "TopListData" }],
]);

/**
 * What a scalar is arranged by when it compares against the preceding period or
 * may answer no figure: the KPI card's figure with its change, which a bare
 * `{ value }` has no room for and which leaves `value` out rather than writing it
 * as null.
 */
export const KPI_VALUE_RESPONSE = {
  helper: "kpiValueData",
  type: "KpiCardData",
  arrangement: "value",
} as const;

/** What the series plan measures when no `op` was asked for. */
const COUNT_MEASURE = "count";

/** What a helper is told the series is: what was measured, and what to call it. */
export interface SeriesNaming {
  measure: SeriesMeasure;
  label: string;
  /** The period a date field is grouped into: the helper names each period for a reader. */
  bucket?: PlanBucket;
}

/**
 * How a series is named for whoever reads it, resolved once for both the route
 * and the preview of it: they hand the same helper the same options, and a name
 * each of them derived on its own would be two names to keep in step.
 *
 * A measure over a field takes that field's label, since what is being counted up
 * is the field. A count has no field, so it takes the resource whose rows are
 * being counted; the measure's own word names the arithmetic, not the data, and it
 * is what a legend would show a reader who never asked for one.
 */
export function seriesNaming(
  params: QueryParams,
  fields: ResourceFieldStructure[],
  resource: string,
  namesBuckets = false,
): SeriesNaming {
  const measure = isOneOf(AGGREGATE_OPS, params.op) ? params.op : COUNT_MEASURE;
  const period = PLAN_BUCKETS.find((option) => option === params.bucket);
  const bucket = period && namesBuckets ? { bucket: period } : {};
  if (measure === COUNT_MEASURE) {
    return { measure, label: resource, ...bucket };
  }
  const field = fields.find((candidate) => candidate.name === params.field);
  return { measure, label: field?.label ?? field?.name ?? resource, ...bucket };
}

/** The options a helper is handed: what the series is, and what came before. */
function helperOptions(naming: SeriesNaming, previous?: string): string {
  const parts = [
    `measure: ${JSON.stringify(naming.measure)}`,
    `label: ${JSON.stringify(naming.label)}`,
  ];
  if (naming.bucket) {
    parts.push(`bucket: ${JSON.stringify(naming.bucket)}`);
  }
  if (previous) {
    parts.push(previousOption(previous));
  }
  return `, { ${parts.join(", ")} }`;
}

/**
 * The option a helper reads the preceding period from. It is calculated only when the
 * request carries both of its bounds: a request without a comparison sends neither, and a
 * query over them would bind an Invalid Date, which a SQL database refuses as a malformed
 * timestamp.
 */
function previousOption(previous: string): string {
  return `previous: ${COMPARISON_PARAMETERS.join(" && ")} ? await ${previous} : undefined`;
}

function plainResponse(key: string, type: string): ResponseEmission {
  return {
    returnType: `Promise<{ ${key}: ${type} }>`,
    body: (current) => `{ ${key}: await ${current} }`,
    imports: [],
  };
}

/**
 * `y` is nullable because a group the calculation found nothing to measure in is
 * answered as such rather than as a zero; a route promising a number there would
 * be lying about the one case a reader most needs to see.
 */
const SERIES_TYPE = "{ x: number | string; y: number | null }[]";

/** How a scalar route answers, beyond that it answers a figure. */
export interface ScalarAnswer {
  /** The calculation may answer no figure, which a card reads only from a `value` left out. */
  nullable: boolean;
  /** The route also answers the preceding period, which a card reads as a variation. */
  compares: boolean;
}

/**
 * Whether a scalar route answers through `kpiValueData`: a route that compares needs
 * its change, and one that may answer no figure needs `value` left out, because a
 * card reads a null `value` as 0 and only an absent one as nothing to show. The
 * preview applies the same rule, so the two cannot disagree on a null.
 */
export function answersThroughKpiValue({
  nullable,
  compares,
}: ScalarAnswer): boolean {
  return nullable || compares;
}

function scalarResponse(answer: ScalarAnswer): ResponseEmission {
  if (!answersThroughKpiValue(answer)) {
    return plainResponse("value", "number");
  }
  const { helper, type } = KPI_VALUE_RESPONSE;
  return {
    returnType: `Promise<${type}>`,
    body: (current, previous) =>
      `${helper}(await ${current}${previous ? `, { ${previousOption(previous)} }` : ""})`,
    imports: [helper, type],
  };
}

/**
 * The arrangement a query's route emits, from what it computes and what the
 * block reading it asked for.
 *
 * A scalar calculation has one arrangement — the number itself; asking for
 * anything else of it would be asking a question the chain did not answer. The
 * exceptions are comparing against the period before and answering no figure,
 * for which the figure and its change are what a KPI card reads whatever
 * arrangement was asked for.
 */
function responseEmission(
  output: QueryOutputKind,
  response: string | undefined,
  naming: SeriesNaming,
  scalar: ScalarAnswer,
): ResponseEmission {
  if (output === "scalar") {
    return scalarResponse(scalar);
  }
  const arrangement = response ?? "series";
  if (arrangement === "series") {
    return plainResponse("series", SERIES_TYPE);
  }
  const helped = RESPONSE_HELPERS.get(arrangement);
  if (!helped) {
    return plainResponse("series", SERIES_TYPE);
  }
  const { helper, type } = helped;
  return {
    returnType: `Promise<${type}>`,
    body: (current, previous) =>
      `${helper}(await ${current}${helperOptions(naming, previous)})`,
    imports: [helper, type],
  };
}

/**
 * The property a plain response carries, for read-back. The arrangements built
 * by a helper are recognized by the helper's name instead.
 */
export const RESPONSE_KEYS: Record<QueryOutputKind, string> = {
  scalar: "value",
  series: "series",
};

/**
 * `L` when it lists every member of `T`, else `never`: a list typed with it
 * stops compiling when `T` gains a member the list lacks.
 */
type ExhaustiveList<T extends string, L extends readonly T[]> = [T] extends [
  L[number],
]
  ? L
  : never;

const OUTPUT_KIND_LIST = ["scalar", "series"] as const;

const OUTPUT_KINDS: ExhaustiveList<QueryOutputKind, typeof OUTPUT_KIND_LIST> =
  OUTPUT_KIND_LIST;

/**
 * The output kind a route's response property names, or `undefined` for a
 * property no shape emits.
 *
 * Read-back resolves the kind from what the route returns rather than from the
 * template, so a route whose calculation is no longer recognized still reports
 * what it answers — and so emission and recognition cannot drift apart.
 */
export function outputForResponseKey(key: string): QueryOutputKind | undefined {
  return OUTPUT_KINDS.find((kind) => RESPONSE_KEYS[kind] === key);
}

const HELPED_ARRANGEMENT_LIST = ["card", "value", "items"] as const;

/** The arrangements `RESPONSE_HELPERS` names a helper for, in its key order. */
const HELPED_ARRANGEMENTS: ExhaustiveList<
  Exclude<NonNullable<QueryStructure["response"]>, "series">,
  typeof HELPED_ARRANGEMENT_LIST
> = HELPED_ARRANGEMENT_LIST;

/** The arrangement a series helper name stands for, for read-back. */
function arrangementForHelper(helper: string): QueryStructure["response"] {
  return HELPED_ARRANGEMENTS.find(
    (arrangement) => RESPONSE_HELPERS.get(arrangement)?.helper === helper,
  );
}

/**
 * What a route that returns through a helper answers and how it arranges it, for
 * read-back: a series helper answers points, `kpiValueData` answers a scalar.
 */
export function responseForHelper(
  helper: string,
): { output: QueryOutputKind; response: QueryArrangement } | undefined {
  if (helper === KPI_VALUE_RESPONSE.helper) {
    return { output: "scalar", response: KPI_VALUE_RESPONSE.arrangement };
  }
  const response = arrangementForHelper(helper);
  return response === undefined ? undefined : { output: "series", response };
}

/** What a template's queries answer with, for a caller outside the emitter. */
export function outputForTemplate(
  template: string,
): QueryOutputKind | undefined {
  return getQueryTemplate(template)?.descriptor.output;
}

/** Whether a template's queries may answer no figure where none can be stated. */
export function answersNull(template: string): boolean {
  return getQueryTemplate(template)?.nullable === true;
}

export interface CompiledQuery {
  /** Query name — the route method's name. */
  name: string;
  /** The route path, e.g. `/stats/in-stock`. */
  endpoint: string;
  template: string;
  params: QueryParams;
  chain: CompiledChain;
  /** What an arrangement helper is told the series is. */
  naming: SeriesNaming;
  /** How the answer is arranged for the block reading it. */
  response?: string;
  /** Whether the route also answers the preceding period. */
  compare?: boolean;
}

/**
 * The model method a route is bound to. Distinct from {@link CompiledQuery.name}
 * because queries wanting the identical chain share one method, so the method a
 * query ends up calling is resolved against what the model already holds.
 */
export interface ModelTarget {
  name: string;
  /** The method already compiles this chain — emit the route, leave it alone. */
  reuse: boolean;
}

function kebab(value: string): string {
  return words(value).join("-");
}

export function defaultEndpoint(name: string): string {
  return `${DEFAULT_ENDPOINT_PREFIX}${kebab(name)}`;
}

export function queryRef(pageRef: string, name: string): string {
  return `${pageRef}@${name}`;
}

export function parseQueryRef(
  ref: string,
): { page: string; name: string } | undefined {
  const at = ref.lastIndexOf("@");
  if (at <= 0 || at === ref.length - 1) {
    return undefined;
  }
  return { page: ref.slice(0, at), name: ref.slice(at + 1) };
}

/**
 * The model-injection decorator for a resource's schema. `TenantScopedModel`
 * resolves the model against the request's tenant, which only makes sense for a
 * table registered in a per-tenant schema; a core-schema table must use the
 * plain `Model` provider or every query returns zero rows.
 */
function modelDecoratorFor(schema: string): DecoratorSymbol {
  return isPerTenantSchema(schema) ? "TenantScopedModel" : "Model";
}

/** Whether a schema holds one instance of its tables per tenant. */
export function isPerTenantSchema(schema: string): boolean {
  return schema === TENANT_SCHEMA_NAME_VALUE;
}

function methodParamText(param: MethodParam): string {
  return `${param.name}: ${param.type}`;
}

export function queryModelMethodText(
  spec: CompiledQuery,
  modelMethod: string,
): string {
  const parameters = spec.chain.parameters.map(methodParamText).join(", ");
  return `${modelMethod}(${parameters}) ${spec.chain.body}`;
}

/**
 * The route argument for a model parameter. The route reads the value under its
 * public `routeName`. A `@Parameter` yields text from the path and a `QueryValue`
 * from the query string, so the route coerces here rather than inside the query,
 * which keeps the model method's signature honest about what it accepts.
 */
function routeArgument(
  param: Pick<MethodParam, "routeName" | "type" | "in">,
): string {
  if (param.type === "number") {
    return `Number(${param.routeName})`;
  }
  if (param.type === "boolean") {
    return `${param.routeName} === "true"`;
  }
  const text =
    param.in === "query" ? `String(${param.routeName})` : param.routeName;
  return param.type === "Date" ? `new Date(${text})` : text;
}

/**
 * What a route declares for a query-string parameter: interface-api's `QueryValue`,
 * spelled out so the route needs no import that interface-api 0.3.0 lacks.
 */
const QUERY_VALUE_TYPE = "string | true | undefined";

/** The route parameters a comparison reads the preceding period's bounds from. */
export const COMPARISON_PARAMETERS = ["compareFrom", "compareTo"] as const;

/** Where the response helpers are published. */
const RESPONSE_MODULE = "@antelopejs/interface-dms/base";

/**
 * The two Date parameters that bound the period a chain reads, or nothing when it
 * binds no such pair: only a query whose period the route supplies can compare,
 * since there is nothing to shift for a calculation that bakes its dates in.
 */
function periodParameters(
  parameters: MethodParam[],
): MethodParam[] | undefined {
  const bounds = parameters.filter((parameter) => parameter.type === "Date");
  return bounds.length === COMPARISON_PARAMETERS.length ? bounds : undefined;
}

/**
 * Whether the route answers a scalar together with the figure of the preceding
 * period, which is where it needs a helper `@antelopejs/interface-dms` may lack.
 */
export function comparesScalar(spec: CompiledQuery): boolean {
  return (
    spec.compare === true &&
    outputForTemplate(spec.template) === "scalar" &&
    periodParameters(spec.chain.parameters) !== undefined
  );
}

/**
 * The same model call over the preceding period, or nothing when the query does
 * not compare.
 */
function comparisonCall(
  spec: CompiledQuery,
  modelMethod: string,
): string | undefined {
  const bounds =
    spec.compare === true ? periodParameters(spec.chain.parameters) : undefined;
  if (!bounds) {
    return undefined;
  }
  const args = spec.chain.parameters.map((parameter) => {
    const at = bounds.indexOf(parameter);
    return at === -1
      ? routeArgument(parameter)
      : routeArgument({
          routeName: COMPARISON_PARAMETERS[at],
          type: "Date",
          in: "query",
        });
  });
  return `model.${modelMethod}(${args.join(", ")}).run()`;
}

/** A route method's source, with the symbols its text needs imported. */
export interface RouteMethodText {
  text: string;
  symbols: ImportRef[];
}

/**
 * The text of a query's route method.
 *
 * The route carries the page's own permission through a parameter decorator, so
 * the gate applies to this route alone: a generated route would otherwise answer
 * to anyone who can reach the server, while the layout it feeds is gated.
 */
export function queryRouteMethodText(
  spec: CompiledQuery,
  modelName: string,
  schema: string,
  modelMethod: string,
  pageClass: string,
): RouteMethodText {
  const modelDecorator = modelDecoratorFor(schema);
  const indent = indentationText(resolveProjectRoot());
  const symbols = [
    decoratorImport("Get"),
    decoratorImport(modelDecorator),
    decoratorImport("AuthUserWithPermission"),
    decoratorImport("User"),
  ];
  const parameters = [
    `${indent}@AuthUserWithPermission(${pageClass}) _user: User,`,
    `${indent}@${modelDecorator}(${modelName}) model: ${modelName},`,
  ];
  const routeParameter = (param: Pick<MethodParam, "routeName" | "in">) => {
    const type = param.in === "query" ? QUERY_VALUE_TYPE : "string";
    symbols.push(decoratorImport("Parameter"));
    parameters.push(
      `${indent}@Parameter(${JSON.stringify(param.routeName)}, ${JSON.stringify(param.in)}) ${param.routeName}: ${type},`,
    );
  };
  for (const param of spec.chain.parameters) {
    routeParameter(param);
  }
  const args = spec.chain.parameters.map(routeArgument).join(", ");
  const previous = comparisonCall(spec, modelMethod);
  const response = responseEmission(
    outputForTemplate(spec.template) ?? "scalar",
    spec.response,
    spec.naming,
    { nullable: answersNull(spec.template), compares: previous !== undefined },
  );
  for (const name of response.imports) {
    symbols.push({ name, module: RESPONSE_MODULE });
  }
  const call = `model.${modelMethod}(${args}).run()`;
  if (previous) {
    for (const parameter of COMPARISON_PARAMETERS) {
      routeParameter({ routeName: parameter, in: "query" });
    }
  }
  const text = [
    `@Get(${JSON.stringify(spec.endpoint)})`,
    `async ${spec.name}(`,
    ...parameters,
    `): ${response.returnType} {`,
    `${indent}return ${response.body(call, previous)};`,
    "}",
  ].join("\n");
  return { text, symbols };
}
