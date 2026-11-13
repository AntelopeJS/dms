import { z } from "zod";
import type { Json, JsonObject, MockupIssue, MockupName } from "./model";
import { jsonObjectSchema } from "./model";

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

/** The page a node is compiled on: where its fixture references point. */
export interface FixtureScope {
  name: MockupName;
  pageId: string;
  fixtures: JsonObject;
  issues: MockupIssue[];
  /**
   * The live route each fixture key stands for, when the page is compiled
   * with Real data; undefined compiles it on its fixtures alone.
   */
  routes?: Readonly<Record<string, string>>;
}

/** What a fixture is read as: its value, or the rows a table lists from it. */
export type DataKind = "fixture" | "rows";

/** The suffix of the route listing a fixture's rows as a table reads them. */
const ROWS_SUFFIX = "/rows";

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
  const url = fixtureUrl(scope.name, scope.pageId, key);
  return kind === "rows" ? `${url}${ROWS_SUFFIX}` : url;
}

/**
 * Whether the page holds the fixture `key`, reporting it at `pointer` when it
 * does not.
 */
export function checkFixture(
  scope: FixtureScope,
  key: string,
  pointer: string,
): boolean {
  if (Object.hasOwn(scope.fixtures, key)) return true;
  scope.issues.push({
    path: pointer,
    message: `the page has no fixture named "${key}"`,
  });
  return false;
}

/**
 * `value` with every `fixture:<key>` string, at any depth, rewritten to the
 * route answering that fixture ({@link dataUrl}). A key the page lacks is
 * reported and still rewritten, so the block shows the error a missing route
 * gives it.
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
  if (key === undefined) return value;
  checkFixture(scope, key, pointer);
  return dataUrl(scope, key, "fixture");
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
});

/** The list query a table sends its `fetchUrl`. */
export type RowsQuery = z.infer<typeof rowsQuerySchema>;

/** Reads a list query; a malformed parameter falls back to its default. */
export function parseRowsQuery(params: URLSearchParams): RowsQuery {
  return rowsQuerySchema.parse({
    offset: params.get("offset") ?? undefined,
    limit: params.get("limit") ?? undefined,
    search: params.get("search") ?? undefined,
    sortKey: params.get("sortKey") ?? undefined,
    sortDirection: params.get("sortDirection") ?? undefined,
  });
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

/** Searches, sorts and pages `rows` as the list query asks. */
export function listRows(rows: JsonObject[], query: RowsQuery): RowsPage {
  const found = query.search
    ? rows.filter((row) => matches(row, query.search))
    : [...rows];
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
