/**
 * Running one of a draft's queries against the real database, so a block can be
 * shown its own data before anything is written.
 *
 * The calculation is the plan the template describes, the same one the emitter
 * would have written into a model method, so what a preview shows is what the
 * saved page will answer.
 */

import {
  chartCardData,
  kpiCardData,
  type SeriesOptions,
  topListData,
} from "@antelopejs/interface-dms/base/query-response";
import type {
  AddQueryInput,
  ConfigObject,
  OpResult,
  QueryOutputKind,
  QueryPoint,
  QueryPreview,
  QueryArrangement,
  ResourceFieldStructure,
} from "@antelopejs/interface-dms-builder";
import { isCallable, isIndexable } from "./guards";
import { invalidConfig, notFound, unsupported } from "./ops";
import {
  COMPARISON_PARAMETERS,
  isPerTenantSchema,
  outputForTemplate,
  RESPONSE_KEYS,
  seriesNaming,
  type SeriesNaming,
} from "./query-emit";
import { executePlan, type PlanStream } from "./query-plan-execute";
import type { QueryPlan } from "./query-plan";
import {
  getQueryTemplate,
  isParamBinding,
  templateParamIssues,
} from "./query-template";
import { findResourceRecord, type ResourceRecord } from "./resource-index";
import { resourceSchema } from "./resource-schema";
import { buildResourceStructure } from "./resource-structure";
import { isPlainObject } from "./value";

/** How many points a preview will return before it says it stopped early. */
const PREVIEW_LIMIT = 500;

export interface PreviewRequest {
  query: Omit<AddQueryInput, "name">;
  /** Values the route would receive, by the name it exposes them under. */
  args?: ConfigObject;
  /**
   * The tenant whose rows to read. A resource in a per-tenant schema has one
   * table per tenant, and reading the wrong one is worse than reading none.
   */
  tenant?: string;
}

/**
 * The instance a preview reads: the one the saved route's model resolves to.
 *
 * Only a per-tenant schema is read at the request's tenant. A table in any
 * other has a single, shared instance, and asking it for the tenant's instance
 * reads an empty one — every preview then answered "no rows" over a table full
 * of them.
 */
export function previewInstance(
  schema: string,
  tenant: string | undefined,
): string | undefined {
  return isPerTenantSchema(schema) ? tenant : undefined;
}

const PLAN_STREAM_METHODS = [
  "filter",
  "map",
  "group",
  "count",
  "sum",
  "avg",
  "min",
  "max",
];

/** Whether a table answers every call the executor makes on a {@link PlanStream}. */
function isPlanStream(value: unknown): value is PlanStream {
  return (
    isIndexable(value) &&
    PLAN_STREAM_METHODS.every((method) => isCallable(value[method]))
  );
}

/**
 * The table a resource's rows live in, through the schema its own module
 * resolves, the one the generated model registers in. No model class is
 * involved, because the class a draft describes does not exist on disk yet.
 */
function openTable(
  record: ResourceRecord,
  tenant: string | undefined,
): PlanStream | undefined {
  const schema = resourceSchema(record);
  if (!schema) {
    return undefined;
  }
  const instance = tenant ? schema.instance(tenant) : schema.instance();
  const table: unknown = instance.table(record.tableName);
  return isPlanStream(table) ? table : undefined;
}

/**
 * The helpers the generated route calls, so the preview and the page cannot
 * diverge on a rounding, a label or a missing group.
 */
const RESPONSE_ARRANGERS = new Map<
  QueryArrangement,
  (points: QueryPoint[], options: SeriesOptions) => object
>([
  ["card", chartCardData],
  ["value", kpiCardData],
  ["items", topListData],
]);

/** What the table answered: a figure, or the points, capped where it stopped. */
interface ReadRows {
  points?: QueryPoint[];
  value?: number;
  truncated: boolean;
}

function readRows(rows: number | QueryPoint[]): ReadRows {
  if (!Array.isArray(rows)) {
    return { value: Number(rows), truncated: false };
  }
  return {
    points: rows.slice(0, PREVIEW_LIMIT),
    truncated: rows.length > PREVIEW_LIMIT,
  };
}

/**
 * The envelope the query's route would serve, built from what the table answered.
 *
 * Mirrors the emitter's own decision: a scalar calculation answers the figure
 * itself whatever arrangement was asked for — there is nothing else in it to
 * arrange — a grouped one defaults to its points, and the three arrangements are
 * built by the helper the route would have called, so the preview and the page
 * cannot diverge on a rounding, a label or a missing group.
 */
function arrange(
  read: ReadRows,
  output: QueryOutputKind,
  requested: QueryArrangement | undefined,
  naming: SeriesNaming,
  previous?: QueryPoint[],
): OpResult<QueryPreview> {
  const points = read.points;
  if (output === "scalar" || !points) {
    return preview({
      output,
      body: { [RESPONSE_KEYS.scalar]: read.value },
      truncated: false,
    });
  }
  const arrangement = requested ?? "series";
  const arranged = RESPONSE_ARRANGERS.get(arrangement);
  if (!arranged) {
    return preview({
      output,
      body: { [RESPONSE_KEYS.series]: points },
      truncated: read.truncated,
    });
  }
  const options: SeriesOptions = { ...naming };
  if (previous) {
    options.previous = previous;
  }
  return preview({
    output,
    response: arrangement,
    body: arranged(points, options),
    truncated: read.truncated,
  });
}

/**
 * The arguments the route hands the calculation for the preceding period: the
 * comparison's bounds, in the place of the two date bounds the query binds — the
 * same substitution the emitted route makes. None when the query binds no such
 * pair, or the caller sent no comparison bounds.
 */
function precedingArguments(
  plan: QueryPlan,
  fields: ResourceFieldStructure[],
  args: ConfigObject,
): ConfigObject | undefined {
  const dates = new Set(
    fields
      .filter((field) => field.dataType?.$dataType === "date")
      .map((field) => field.name),
  );
  const bounds = [
    ...new Set(
      plan.filters.flatMap((filter) =>
        dates.has(filter.field) && isParamBinding(filter.value)
          ? [filter.value.$param.name]
          : [],
      ),
    ),
  ];
  if (bounds.length !== COMPARISON_PARAMETERS.length) {
    return undefined;
  }
  const preceding: ConfigObject = { ...args };
  for (const [at, name] of bounds.entries()) {
    const value = args[COMPARISON_PARAMETERS[at]];
    if (value === undefined) {
      return undefined;
    }
    preceding[name] = value;
  }
  return preceding;
}

/** A preview writes nothing, so there is nothing for a caller to diff. */
function preview(data: QueryPreview): OpResult<QueryPreview> {
  return { ok: true, data, changes: [] };
}

/**
 * Run a query against a table already opened.
 *
 * Split from resolving the schema so the part that decides what a preview says —
 * validation, the shape of the answer, where it stops reading — can be driven
 * without a database behind it.
 */
export async function runPlanPreview(
  table: PlanStream,
  request: PreviewRequest,
  fields: ResourceFieldStructure[],
): Promise<OpResult<QueryPreview>> {
  const { query } = request;
  const template = getQueryTemplate(query.template);
  if (!template) {
    return invalidConfig<QueryPreview>(
      `unknown query template "${query.template}"; call ListQueryTemplates for valid ids`,
    );
  }
  const params = query.params ?? {};
  const issues = templateParamIssues(template, params, fields);
  if (issues.length > 0) {
    return { ok: false, error: { code: "invalid_config", issues } };
  }
  try {
    const plan = template.plan(params, fields);
    const args = request.args ?? {};
    const rows = await executePlan(table, plan, fields, args).run();
    const preceding = query.compare
      ? precedingArguments(plan, fields, args)
      : undefined;
    const previous = preceding
      ? readRows(await executePlan(table, plan, fields, preceding).run()).points
      : undefined;
    return arrange(
      readRows(rows),
      outputForTemplate(query.template) ??
        (Array.isArray(rows) ? "series" : "scalar"),
      query.response,
      seriesNaming(params, fields, query.resource),
      previous,
    );
  } catch (error) {
    return unsupported<QueryPreview>(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function namesResourceAndTemplate(
  value: unknown,
): value is Pick<AddQueryInput, "resource" | "template"> {
  return (
    isPlainObject(value) &&
    typeof value.resource === "string" &&
    typeof value.template === "string"
  );
}

/**
 * A preview asked for on a GET: the query as JSON in one parameter, and every
 * other parameter what the route would receive — the period a card appends to
 * the address it reads among them.
 *
 * What a card on the builder's canvas reads its unsaved source from: it fetches
 * an address, and has no body to send.
 */
export function previewRequestFromSearch(
  search: URLSearchParams,
  queryParameter: string,
  tenant: string | undefined,
): OpResult<PreviewRequest> {
  const encoded = search.get(queryParameter);
  let query: unknown;
  try {
    query = encoded ? JSON.parse(encoded) : undefined;
  } catch {
    query = undefined;
  }
  if (!namesResourceAndTemplate(query)) {
    return invalidConfig<PreviewRequest>(
      `"${queryParameter}" must be a query as JSON, naming its resource and template`,
    );
  }
  const args: ConfigObject = Object.fromEntries(
    [...search].filter(([name]) => name !== queryParameter),
  );
  return {
    ok: true,
    data: { query, args, tenant },
    changes: [],
  };
}

/**
 * Run a query the caller has not saved, and answer what its route would.
 *
 * Read-only by construction: a plan describes filters, a grouping and a measure,
 * and there is no way to express a write in one.
 */
export async function runQueryPreview(
  request: PreviewRequest,
): Promise<OpResult<QueryPreview>> {
  const { query } = request;
  const record = findResourceRecord(query.resource);
  if (!record) {
    return notFound<QueryPreview>(query.resource);
  }
  const template = getQueryTemplate(query.template);
  if (!template) {
    return invalidConfig<QueryPreview>(
      `unknown query template "${query.template}"; call ListQueryTemplates for valid ids`,
    );
  }
  const structure = buildResourceStructure(query.resource);
  if (!structure.ok) {
    return structure;
  }
  const table = openTable(
    record,
    previewInstance(record.schema, request.tenant),
  );
  if (!table) {
    return unsupported<QueryPreview>(
      `schema "${record.schema}" is not registered, so there is no table to read`,
    );
  }
  return runPlanPreview(table, request, structure.data.fields);
}
