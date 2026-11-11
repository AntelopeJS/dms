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
 * route answering that fixture. A key the page lacks is reported and still
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
  if (key === undefined) return value;
  checkFixture(scope, key, pointer);
  return fixtureUrl(scope.name, scope.pageId, key);
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

/** Numbers by value, everything else by its text; missing values last. */
function compareValues(left: Json | undefined, right: Json | undefined) {
  if (left === undefined || left === null) return right == null ? 0 : 1;
  if (right === undefined || right === null) return -1;
  const leftNumber = numberSchema.safeParse(left);
  const rightNumber = numberSchema.safeParse(right);
  if (leftNumber.success && rightNumber.success) {
    return leftNumber.data - rightNumber.data;
  }
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
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
    found.sort((a, b) => compareValues(valueOf(a), valueOf(b)) * direction);
  }
  const end =
    query.limit === undefined ? undefined : query.offset + query.limit;
  return { results: found.slice(query.offset, end), total: found.length };
}
