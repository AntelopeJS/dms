import { InterfaceFunction } from "@antelopejs/interface-core";
import type { PageRef } from "./addressing";
import type { ConfigSchema } from "./catalog";
import type { ResourceRef } from "./resources";
import type { MutationOpts, OpResult } from "./results";
import type { ConfigValue } from "./values";

/**
 * A query's address: `<pageRef>@<name>`, e.g. `/books@inStockCount`. The page is
 * where the route lives; the resource it reads is recorded in the query itself.
 */
export type QueryRef = string;

/**
 * The shape a query's route responds with: one number as `{ value }`, or one
 * point per group as `{ series }`, each point carrying its group as `x` and what
 * was measured as `y`.
 */
export type QueryOutputKind = "scalar" | "series";

/**
 * How a query's answer is arranged for the block that reads it.
 *
 * The calculation is the same either way — a measure, possibly per group. This
 * says what the route wraps it in: the points themselves, a headline figure above
 * them, that figure alone, or the points as a ranked list.
 */
export type QueryArrangement = "series" | "card" | "value" | "items";

/** The comparison operators a filter may use. */
export type FilterOp = "eq" | "ne" | "gt" | "ge" | "lt" | "le";

/**
 * A filter value supplied per request rather than baked into the chain. It
 * becomes a parameter of the model method and a `@Parameter` on the route.
 *
 * `name` and `in` describe the *route*, not the model: the route reads the value
 * from that source, coerces it (`Number(...)` / `new Date(...)`), and passes it
 * positionally to the model method. The model method neither knows nor cares
 * where the value came from — its own parameter is named from the template, so
 * `name`/`in` here only shape the route and are recovered from it on read-back.
 */
export type QueryParamBinding = {
  $param: {
    /** A camelCase identifier; the route exposes the value under this name. */
    name: string;
    /** Where the route reads the value from; defaults to `"query"`. */
    in?: "query" | "param";
  };
};

/**
 * A filter value: either a plain scalar baked into the chain, or a
 * {@link QueryParamBinding}. `$expr` is refused — a query's values are data.
 *
 * The alias is deliberate: it documents that a parameter value is data, never an
 * expression, which `QueryParamBinding` relies on.
 */
export type QueryParamValue = ConfigValue;

/** One conjunct of a query's `where`. Filters combine with AND. */
export type QueryFilter = {
  field: string;
  op: FilterOp;
  value: QueryParamValue;
};

/** A query template the builder can compile into a model method. */
export interface QueryTemplateDescriptor {
  /** The template id, e.g. `"count"` | `"aggregate"`. */
  id: string;
  resourceType: "database-table";
  title: string;
  description?: string;
  output: QueryOutputKind;
  /** The template's parameter schema, in the same vocabulary as the block catalog. */
  params: ConfigSchema;
}

/** One measured group, as a route answers it and a chart reads it. */
export interface QueryPoint {
  x: number | string;
  y: number;
}

/**
 * The body a query's route returns.
 *
 * `{ value }` for a scalar and `{ series }` for a plain grouped route; for an
 * arranged one, whatever the DMS helper built — `ChartCardData`, `KpiCardData`,
 * `TopListData`. Those types belong to `@antelopejs/interface-dms`, which this
 * package deliberately does not depend on, so the body travels as the JSON the
 * route serves it as.
 */
export type QueryResponseBody = object;

/**
 * What a draft query answers when run without being written.
 *
 * `body` is what the route would return, built by the same helper the route would
 * call, so a block can be handed it directly; `output` and `response` report it
 * the way {@link QueryStructure} reports the saved query, so a preview and the
 * page it previews cannot disagree about what they show.
 *
 * `truncated` is the one thing the route has no equivalent of: a preview stops
 * reading at some point, and a chart that silently lost its tail is worse than one
 * that says so.
 */
export interface QueryPreview {
  output: QueryOutputKind;
  /**
   * How the body is arranged, set only when a helper arranged it — the same
   * condition under which read-back reports it.
   */
  response?: QueryArrangement;
  body: QueryResponseBody;
  truncated: boolean;
}

/** Input for `AddQuery`. */
export interface AddQueryInput {
  /**
   * Query name — a camelCase identifier. Names the route method, and the model
   * method too unless one of that name already exists compiling a *different*
   * chain, in which case the model method is emitted under a free suffixed name
   * so the queries already sharing the original keep their behaviour.
   */
  name: string;
  /** The resource the query reads. */
  resource: ResourceRef;
  /** A `QueryTemplateDescriptor.id`. */
  template: string;
  /** The template's parameters. */
  params?: Record<string, QueryParamValue>;
  /**
   * How the answer is arranged for the block reading it. Defaults to what the
   * template computes: a number for a scalar, its points for a series.
   *
   * A grouped calculation feeds a bare chart, a card with a headline figure, or
   * a ranked list without being described three times.
   */
  response?: QueryArrangement;
  /**
   * Answer the preceding period alongside the current one, so a card can show a
   * variation. Only meaningful when the query binds a period.
   */
  compare?: boolean;
  /**
   * The route path, relative to the page: the DMS serves it at
   * `/dms/pages<pageRef><endpoint>` (`pageRoutePath` of interface-dms). Defaults to
   * `/stats/<kebab-name>`; any path is allowed, since read-back identifies a
   * query by its shape rather than its URL. Must not collide with another route
   * on the page.
   */
  endpoint?: string;
}

/**
 * A query as read back off disk. Read-back is purely structural: a route reads
 * as a query when its shape and the chain it calls both parse, so a hand-written
 * route matching the grammar is as editable as a generated one, and any edit
 * that keeps the chain in-grammar is simply re-read. A query that no longer
 * parses still reports `route`, `resource` and `modelMethod` — only
 * `template`/`params` go missing — so the builder can always see and remove what
 * it cannot edit.
 */
export interface QueryStructure {
  name: string;
  /** How the answer is arranged, when the route wraps the calculation. */
  response?: QueryArrangement;
  /** The route path relative to the page's slug, as {@link AddQueryInput.endpoint} takes it. */
  endpoint: string;
  resource?: ResourceRef;
  /**
   * The model method the route calls. Several queries may share one method, but
   * only while they want the exact same chain — see {@link AddQueryInput.name}.
   */
  modelMethod?: string;
  output?: QueryOutputKind;
  template?: string;
  params?: Record<string, QueryParamValue>;
  /**
   * The route's declared parameters — the source of truth for a bound value's
   * `name` and `in`. `header` appears only on hand-written routes; a generated
   * one binds `$param` to `query` or `param`.
   */
  routeParams?: { name: string; in: "query" | "param" | "header" }[];
  /**
   * True when the route answers the preceding period beside the current one,
   * as {@link AddQueryInput.compare} asked it to.
   */
  compare?: boolean;
  /** True when the query could not be reversed to an editable template. */
  opaque?: boolean;
  /**
   * Set when `opaque === true`. `unparseable_route` — the GET wrapper is not the
   * recognized `return { value: await model.m(...) }` shape. `unparseable_chain`
   * — the model method it calls is not a chain any registered template accepts
   * (hand-written, edited out of grammar, or from a newer builder).
   */
  opaqueReason?: "unparseable_route" | "unparseable_chain";
}

export const ListQueryTemplates =
  InterfaceFunction<
    (resourceType?: string) => Promise<QueryTemplateDescriptor[]>
  >();

export const AddQuery =
  InterfaceFunction<
    (
      page: PageRef,
      input: AddQueryInput,
      opts?: MutationOpts,
    ) => Promise<OpResult<{ query: QueryRef; route: string }>>
  >();

export const ConfigureQuery =
  InterfaceFunction<
    (
      query: QueryRef,
      patch: Partial<AddQueryInput>,
      opts?: MutationOpts,
    ) => Promise<OpResult>
  >();

export const RemoveQuery =
  InterfaceFunction<
    (query: QueryRef, opts?: MutationOpts) => Promise<OpResult>
  >();
