import {
  AddQuery,
  ConfigureQuery,
  ListQueryTemplates,
  PreviewQuery,
  RemoveQuery,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { JsonObjectSchema } from "../json";
import { repeatConfirmation } from "../confirmation-gate";
import { defineTool } from "../tool";
import {
  containsExprSentinel,
  exprRefusal,
  note,
  opResult,
} from "./builder-shared";

const QUERY_REF = z
  .string()
  .describe(
    "A query ref `<pageRef>@<queryName>` (e.g. `/catalog/books@inStockCount`), as reported in builder_page_structure's `queries`.",
  );

const QUERY_ENDPOINT = z
  .string()
  .describe(
    'Route path relative to the page\'s slug, e.g. `/stats/in-stock`. Must start with `/` and not collide with another route the page serves. Omit for `/stats/<kebab-name>`. A `$param` bound with `in: "param"` reads a path segment, so include a matching `:name` (e.g. `/stats/by-author/:author`).',
  );

const QUERY_PARAMS = JsonObjectSchema.describe(
  "The template's parameters, keyed exactly as the `params` schema builder_query_templates reports for it — that schema documents every key and value shape, and an unrecognised key is rejected.",
);

const QUERY_RESPONSE = z
  .enum(["series", "card", "value", "items"])
  .describe(
    "How the route arranges a `series` template's points for the block that reads them: `series` (the default) one point per group, for a bare chart such as ChartLine, ChartColumn or ChartBar; `card` a figure above its series, for a ChartCard; `value` a figure and its sparkline, for a KpiCard; `items` ranked entries, for a TopListCard. A block reads only its own arrangement, so match the block. A `count` or `aggregate` query answers `{ value }` whatever you pass.",
  );

const QUERY_COMPARE = z
  .boolean()
  .describe(
    "Also answer the preceding period so a card shows a delta. Only meaningful when the query binds its period with `$param` `from` and `to`.",
  );

/** The values a query's route would receive, for a preview. */
export const QUERY_ARGS = JsonObjectSchema.describe(
  'The values the route would receive, by the name it exposes them under, e.g. `{ "from": "2026-01-01", "to": "2026-03-31" }` for a query binding `$param` `from` and `to`. With `compare`, also `compareFrom` and `compareTo`.',
);

/** The fields of one query, as builder_add_query and builder_compose_page take them. */
export const QUERY_FIELDS = {
  name: z
    .string()
    .describe(
      "camelCase identifier, unique among the page's members. Names the route; the model method it compiles into may differ, since queries wanting the identical chain share one.",
    ),
  resource: z
    .string()
    .describe("Resource ref to read, from builder_list_resources."),
  template: z.string().describe("A template id from builder_query_templates."),
  params: QUERY_PARAMS.optional(),
  response: QUERY_RESPONSE.optional(),
  compare: QUERY_COMPARE.optional(),
  endpoint: QUERY_ENDPOINT.optional(),
};

const queryTemplates = defineTool({
  name: "builder_query_templates",
  title: "Query templates",
  description: note(
    "Lists the query templates builder_add_query can compile, each with its id, what it computes, its `output` kind, and the JSON Schema for its `params`. Call this before adding a query — the schema is the reference for every parameter and value shape.",
  ),
  effect: "read",
  input: z.object({
    resourceType: z
      .string()
      .optional()
      .describe(
        "Filter to templates for one resource type (v1 has only `database-table`). Omit for all.",
      ),
  }),
  run: async ({ resourceType }) =>
    opResult(await ListQueryTemplates(resourceType)),
});

const addQuery = defineTool({
  name: "builder_add_query",
  title: "Add query",
  description: note(
    "Adds a query — a page-hosted GET route serving a computed number, or one per group, that the DataAPI cannot give you. Compiles the template into a method on the resource's model and a route on the page, atomically. Returns `{ query, route }`; `route` is the full URL to pass as the reading block's `fetchUrl`. A `count` or `aggregate` route serves `{ \"value\": <number> }`; a `series` route serves the arrangement `response` names. Add `compare: true` to a query that binds its period with `$param` `from` and `to` so a card shows a delta. Run builder_preview_query first to see what the route would answer.",
  ),
  effect: "builder",
  input: z.object({
    page: z
      .string()
      .describe(
        "PageRef the query is served from — the page that displays it, not the resource's page.",
      ),
    ...QUERY_FIELDS,
  }),
  run: async ({ page, ...input }) =>
    containsExprSentinel.parse(input)
      ? exprRefusal()
      : opResult(await AddQuery(page, input)),
});

const previewQuery = defineTool({
  name: "builder_preview_query",
  title: "Preview query",
  description: note(
    "Runs a query that is not saved and answers what its route would, as `{ body, truncated }`, writing nothing. Takes builder_add_query's query fields (no page) and `args`. An empty `series` or `items` in `body` means the block reading it renders empty: fix the query before wiring its route.",
  ),
  effect: "read",
  input: z.object({ ...QUERY_FIELDS, args: QUERY_ARGS.optional() }),
  run: async ({ args, ...query }) =>
    containsExprSentinel.parse({ query, args })
      ? exprRefusal()
      : opResult(
          await PreviewQuery(args === undefined ? { query } : { query, args }),
        ),
});

const configureQuery = defineTool({
  name: "builder_configure_query",
  title: "Configure query",
  description: note(
    "Recompiles a query, replacing both its route and its chain. Only the keys you pass change; the rest are re-read from the query. A query builder_page_structure reports as `opaque` is refused with opaque_target, leaving the hand-edit intact. Renaming is not supported — remove and re-add. Never affects another page's query, even one sharing the same model method.",
  ),
  effect: "builder",
  input: z.object({
    query: QUERY_REF,
    patch: z.object({
      resource: z.string().optional(),
      template: z.string().optional(),
      params: QUERY_PARAMS.optional(),
      response: QUERY_RESPONSE.optional(),
      compare: QUERY_COMPARE.optional(),
      endpoint: QUERY_ENDPOINT.optional(),
    }),
  }),
  run: async ({ query, patch }) =>
    containsExprSentinel.parse(patch)
      ? exprRefusal()
      : opResult(await ConfigureQuery(query, patch)),
});

const removeQuery = defineTool({
  name: "builder_remove_query",
  title: "Remove query",
  description: note(
    "Removes a query's route from the page, and its model method too once no route on any page still calls it. Works on an opaque query as well — the builder can always remove what it cannot edit. Does not detect blocks whose fetchUrl points at the removed route: fix those in the same turn.",
  ),
  effect: "builder",
  input: z.object({ query: QUERY_REF }),
  run: async (args) =>
    repeatConfirmation.hold("builder_remove_query", args) ??
    opResult(await RemoveQuery(args.query)),
});

/** The builder tools that list, add, preview, reconfigure and remove a page's queries. */
export const BUILDER_QUERY_TOOLS = [
  queryTemplates,
  addQuery,
  previewQuery,
  configureQuery,
  removeQuery,
];
