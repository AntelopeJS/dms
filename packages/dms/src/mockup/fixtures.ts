import { z } from "zod";
import type { Json, JsonObject, MockupName, MockupNode } from "./model";
import { jsonObjectSchema } from "./model";
import { type LinkScope, linkTo, pageLinkTarget } from "./page-links";
import { archiveSide } from "./table-archive";
import {
  type ColumnFilter,
  parseColumnFilters,
  passesFilters,
} from "./row-filters";

/** Where the mockup API is served. */
export const MOCKUP_API = "/api/mockup";

const FIXTURE_PREFIX = "fixture:";

/** The route answering the fixture `key` of a page. */
export function fixtureUrl(
  name: MockupName,
  pageId: string,
  key: string,
): string {
  return `${MOCKUP_API}/${name}/pages/${pageId}/fixtures/${key}`;
}

/** The fixture key `value` names, when it is a `fixture:<key>` reference. */
export function fixtureKeyOf(value: Json | undefined): string | undefined {
  const parsed = z.string().startsWith(FIXTURE_PREFIX).safeParse(value);
  return parsed.success ? parsed.data.slice(FIXTURE_PREFIX.length) : undefined;
}

/** A page whose fixtures a sub-page reads: its id and its fixtures. */
export interface AncestorFixtures {
  id: string;
  fixtures: JsonObject;
}

/**
 * A page the mockup draws for a table that opens its forms on generated
 * pages, as the real `TableView` registers them: a sub-page of the table's
 * page, holding the generated form.
 */
export interface GeneratedPage {
  id: string;
  title: string;
  description: string;
  /** The row it shows, when it opens on one: the parameter of its route, and the id of the row it shows while no link names one. */
  route?: { param: string; sample?: string };
  tree: MockupNode[];
}

/** The page a node is compiled on: where its fixture references and its links point. */
export interface FixtureScope extends LinkScope {
  fixtures: JsonObject;
  /** The generated form pages the page's tables open, filled as its nodes compile. */
  generatedPages: GeneratedPage[];
  /**
   * The page's ancestors, nearest first: a fixture key the page lacks is read
   * from the first one holding it.
   */
  ancestors: readonly AncestorFixtures[];
  /**
   * The page's route, when it has one: its parameter, without the colon, and
   * `sample`, the id of the first row of the first ancestor's rows it reads.
   * An ancestor's rows are read one row at a time.
   */
  route?: { param: string; sample?: string };
  /**
   * The live route each fixture key stands for, when the page is compiled
   * with Real data; undefined compiles it on its fixtures alone.
   */
  routes?: Readonly<Record<string, string>>;
}

export type DataKind = "fixture" | "rows";

const ROWS_SUFFIX = "/rows";

/** The route answering one row of a fixture's rows, by `?id=`. */
const RECORD_SUFFIX = "/record";

/** The keys a row's id is read from, in order. */
const ROW_ID_KEYS = ["_id", "id"] as const;

const rowIdSchema = z.union([z.string(), z.number()]);

/** The id of `row`: its `_id`, else its `id`, as text. */
function rowIdOf(row: JsonObject | undefined): string | undefined {
  for (const key of ROW_ID_KEYS) {
    const id = rowIdSchema.safeParse(row?.[key]);
    if (id.success) return String(id.data);
  }
  return undefined;
}

/** The id of `row`, read at `key` when given, else as {@link rowIdOf} reads it. */
export function rowIdAt(
  row: JsonObject | undefined,
  key?: string,
): string | undefined {
  if (key === undefined) return rowIdOf(row);
  const value = rowIdSchema.safeParse(row?.[key]);
  return value.success ? String(value.data) : undefined;
}

/** The row of `rows` whose id is `id`, read as {@link rowIdAt} reads it. */
export function findRow(
  rows: readonly JsonObject[],
  id: string,
  key?: string,
): JsonObject | undefined {
  return rows.find((row) => rowIdAt(row, key) === id);
}

/** The route answering the row of the fixture `key` of a page whose id is `{{params.<param>}}`. */
export function recordUrl(
  name: MockupName,
  pageId: string,
  key: string,
  param: string,
): string {
  return `${fixtureUrl(name, pageId, key)}${RECORD_SUFFIX}?id={{params.${param}}}`;
}

/** The fixture `key` a page reads, and the page holding it: its own, else its nearest ancestor holding it. */
export interface FixtureSource {
  pageId: string;
  value: Json;
}

/** Where the fixture `key` a page names is held, or undefined when neither it nor an ancestor holds it. */
export function fixtureSource(
  scope: FixtureScope,
  key: string,
): FixtureSource | undefined {
  if (Object.hasOwn(scope.fixtures, key)) {
    return { pageId: scope.pageId, value: scope.fixtures[key] };
  }
  const holder = scope.ancestors.find((page) =>
    Object.hasOwn(page.fixtures, key),
  );
  return holder && { pageId: holder.id, value: holder.fixtures[key] };
}

/**
 * The URL a block reads the fixture `key` from: its live route under Real
 * data, the mockup's fixture route otherwise. The only place the two meet.
 */
export function dataUrl(
  scope: FixtureScope,
  key: string,
  kind: DataKind,
): string {
  const { routes } = scope;
  if (routes && Object.hasOwn(routes, key)) return routes[key];
  const pageId = fixtureSource(scope, key)?.pageId ?? scope.pageId;
  const url = fixtureUrl(scope.name, pageId, key);
  return kind === "rows" ? `${url}${ROWS_SUFFIX}` : url;
}

/**
 * The fixture `key` the page reads, its own or an ancestor's, reporting it at
 * `pointer` when neither holds it.
 */
export function checkFixture(
  scope: FixtureScope,
  key: string,
  pointer: string,
): FixtureSource | undefined {
  const source = fixtureSource(scope, key);
  if (source) return source;
  scope.issues.push({
    path: pointer,
    message: scope.ancestors.length
      ? `neither the page nor its parents have a fixture named "${key}"`
      : `the page has no fixture named "${key}"`,
  });
  return undefined;
}

/**
 * The route a `fixture:<key>` option reads: an ancestor's rows read on a page
 * with a route answer the one row its parameter names, the first of them
 * being the row the page shows while no link names one.
 */
function fixtureRoute(
  scope: FixtureScope,
  key: string,
  pointer: string,
): string {
  const source = checkFixture(scope, key, pointer);
  const rows =
    source && source.pageId !== scope.pageId && scope.route
      ? parseRows(source.value)
      : undefined;
  if (!source || !rows || !scope.route) return dataUrl(scope, key, "fixture");
  scope.route.sample ??= rowIdOf(rows[0]);
  return recordUrl(scope.name, source.pageId, key, scope.route.param);
}

/**
 * `value` with every `fixture:<key>` string, at any depth, rewritten to the
 * route answering that fixture ({@link dataUrl}), and every `page:<id>` string
 * to the viewer's URL of that page. A key the page lacks is reported and still
 * rewritten, so the block shows the error a missing route gives it.
 */
export function rewriteFixtures(
  value: Json,
  pointer: string,
  scope: FixtureScope,
): Json {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      rewriteFixtures(entry, `${pointer}/${index}`, scope),
    );
  }
  const object = jsonObjectSchema.safeParse(value);
  if (object.success) return rewriteObject(object.data, pointer, scope);
  const key = fixtureKeyOf(value);
  if (key !== undefined) return fixtureRoute(scope, key, pointer);
  const target = pageLinkTarget(value);
  return target === undefined ? value : linkTo(scope, target, pointer);
}

/** {@link rewriteFixtures} over the values of an object. */
export function rewriteObject(
  object: JsonObject,
  pointer: string,
  scope: FixtureScope,
): JsonObject {
  const pointerOf = (key: string) =>
    `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
  return Object.fromEntries(
    Object.entries(object).map(([key, entry]) => [
      key,
      rewriteFixtures(entry, pointerOf(key), scope),
    ]),
  );
}

const rowsQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).catch(0),
  limit: z.coerce.number().int().min(1).optional().catch(undefined),
  search: z.string().trim().toLowerCase().catch(""),
  sortKey: z.string().optional().catch(undefined),
  sortDirection: z.enum(["asc", "desc"]).catch("asc"),
  showArchived: z
    .enum(["true", "false"])
    .transform((side) => side === "true")
    .optional()
    .catch(undefined),
});

/** The list query a table sends its `fetchUrl`. */
export type RowsQuery = z.infer<typeof rowsQuerySchema> & {
  /** Its `filter_<field>=<mode>:<value>` parameters. */
  filters: ColumnFilter[];
};

/** Reads a list query; a malformed parameter falls back to its default. */
export function parseRowsQuery(params: URLSearchParams): RowsQuery {
  return {
    ...rowsQuerySchema.parse({
      offset: params.get("offset") ?? undefined,
      limit: params.get("limit") ?? undefined,
      search: params.get("search") ?? undefined,
      sortKey: params.get("sortKey") ?? undefined,
      sortDirection: params.get("sortDirection") ?? undefined,
      showArchived: params.get("showArchived") ?? undefined,
    }),
    filters: parseColumnFilters(params),
  };
}

/** One page of rows, as `TableView.fromSource` reads it. */
export interface RowsPage {
  results: JsonObject[];
  total: number;
}

const rowsSchema = z.array(jsonObjectSchema);

/** The rows of a fixture, or undefined when it is not an array of objects. */
export function parseRows(fixture: Json): JsonObject[] | undefined {
  const parsed = rowsSchema.safeParse(fixture);
  return parsed.success ? parsed.data : undefined;
}

const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);

function matches(row: JsonObject, search: string): boolean {
  return Object.values(row).some((value) => {
    const scalar = scalarSchema.safeParse(value);
    return scalar.success && String(scalar.data).toLowerCase().includes(search);
  });
}

const numberSchema = z.number();

const stringSchema = z.string();

/**
 * Where a value sorts: numbers, and text that reads as one, by value; other
 * text as people read it; anything else by its JSON text. Each class sorts
 * before the next, so the order is total over mixed values.
 */
type SortKey =
  | { rank: 0; value: number }
  | { rank: 1; text: string }
  | { rank: 2; text: string };

function sortKeyOf(value: Json): SortKey {
  const number = numberSchema.safeParse(value);
  if (number.success) return { rank: 0, value: number.data };
  const text = stringSchema.safeParse(value);
  if (!text.success) return { rank: 2, text: JSON.stringify(value) };
  const numeric = Number(text.data);
  return text.data.trim() !== "" && Number.isFinite(numeric)
    ? { rank: 0, value: numeric }
    : { rank: 1, text: text.data };
}

const TEXT_ORDER = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareValues(left: Json, right: Json): number {
  const a = sortKeyOf(left);
  const b = sortKeyOf(right);
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.rank === 0 && b.rank === 0) return a.value - b.value;
  if (a.rank !== 0 && b.rank !== 0) return TEXT_ORDER.compare(a.text, b.text);
  return 0;
}

/** Sorts in `direction`, rows missing the value last either way. */
function compareRows(
  left: Json | undefined,
  right: Json | undefined,
  direction: number,
): number {
  const leftMissing = left === undefined || left === null;
  const rightMissing = right === undefined || right === null;
  if (leftMissing || rightMissing) {
    return Number(leftMissing) - Number(rightMissing);
  }
  return compareValues(left, right) * direction;
}

/**
 * Filters, searches, sorts and pages `rows` as the list query asks. A table in
 * archive mode sends `showArchived`: it lists the archived rows, or the others,
 * each row carrying its archived state.
 */
export function listRows(rows: JsonObject[], query: RowsQuery): RowsPage {
  const sided =
    query.showArchived === undefined
      ? rows
      : archiveSide(rows, query.showArchived);
  const found = sided.filter(
    (row) =>
      passesFilters(row, query.filters) &&
      (!query.search || matches(row, query.search)),
  );
  const { sortKey } = query;
  if (sortKey) {
    const direction = query.sortDirection === "desc" ? -1 : 1;
    const valueOf = (row: JsonObject) =>
      Object.hasOwn(row, sortKey) ? row[sortKey] : undefined;
    found.sort((a, b) => compareRows(valueOf(a), valueOf(b), direction));
  }
  const end =
    query.limit === undefined ? undefined : query.offset + query.limit;
  return { results: found.slice(query.offset, end), total: found.length };
}
