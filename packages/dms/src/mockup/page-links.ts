import { z } from "zod";
import type { Json, JsonObject, MockupIssue, MockupName } from "./model";
import { jsonObjectSchema, pageIdSchema } from "./model";
import type { SketchLinks } from "./sketch";

const PAGE_PREFIX = "page:";

/** Where the viewer draws a mockup: `?name=` the mockup, `?page=` the page. */
export const MOCKUP_VIEWER_PATH = "/mockup";

/** The viewer's query naming the row a page with a route shows. */
const RECORD_QUERY = "record";

/** The id of the spec page `value` names, when it is a `page:<id>` link. */
export function pageLinkTarget(value: Json | undefined): string | undefined {
  const parsed = z.string().startsWith(PAGE_PREFIX).safeParse(value);
  return parsed.success ? parsed.data.slice(PAGE_PREFIX.length) : undefined;
}

/**
 * The viewer's URL of a page of the mockup, with the row it shows when
 * `record` is given. `record` may be a route token (`{{row._id}}`) the block
 * fills, so it is written as it stands; a mockup name and a page id never
 * need encoding.
 */
export function pageLinkUrl(
  name: MockupName,
  pageId: string,
  record?: string,
): string {
  const url = `${MOCKUP_VIEWER_PATH}?name=${name}&page=${pageId}`;
  return record === undefined ? url : `${url}&${RECORD_QUERY}=${record}`;
}

/** A page a link may name: its parent, and its route parameter without the colon. */
export interface LinkedPage {
  parent?: string;
  param?: string;
}

/** The page a node is compiled on, as far as its links go. */
export interface LinkScope {
  name: MockupName;
  pageId: string;
  issues: MockupIssue[];
  /** Every page of the spec, keyed by id. */
  pages: ReadonlyMap<string, LinkedPage>;
  /** The ids of the pages the page links to, filled as its nodes compile. */
  links: Set<string>;
}

/**
 * The row a link to `target` passes: the row's own id from a row of a table
 * (`row`), when the target has a route to take it. The viewer opens a page's
 * sub-page on the page's own row itself.
 */
function recordFor(
  scope: LinkScope,
  target: string,
  row: string | undefined,
): string | undefined {
  return scope.pages.get(target)?.param === undefined ? undefined : row;
}

/**
 * The viewer's URL of the page `target` names, written at `pointer`. A page
 * the spec lacks is reported there, and the link still points at it, so the
 * viewer opens its first page.
 */
export function linkTo(
  scope: LinkScope,
  target: string,
  pointer: string,
  row?: string,
): string {
  if (scope.pages.has(target)) scope.links.add(target);
  else {
    scope.issues.push({
      path: pointer,
      message: `no page has the id "${target}": the pages are ${[...scope.pages.keys()].join(", ")}`,
    });
  }
  return pageLinkUrl(scope.name, target, recordFor(scope, target, row));
}

/**
 * The row a sketch's link to `target` passes: the row the page shows, as the
 * route token the preview fills, when `target` is a sub-page of the page that
 * takes a row too, as a detail page's link to its own edit page. Else none.
 */
function sameRow(scope: LinkScope, target: string): string | undefined {
  const param = scope.pages.get(scope.pageId)?.param;
  const page = scope.pages.get(target);
  return param !== undefined &&
    page?.param !== undefined &&
    page.parent === scope.pageId
    ? `{{params.${param}}}`
    : undefined;
}

/**
 * The links of the sketches of the page `scope` compiles: a page id goes to
 * the viewer's URL of that page ({@link linkTo}), passing the row the page
 * shows to its own sub-pages; any other id is none.
 */
export function sketchLinks(scope: LinkScope): SketchLinks {
  return (id, pointer) =>
    pageIdSchema.safeParse(id).success
      ? linkTo(scope, id, pointer, sameRow(scope, id))
      : undefined;
}

const pointerOf = (base: string, key: string) =>
  `${base}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;

/**
 * `value` with every `page:<id>` string, at any depth, rewritten to the
 * viewer's URL of that page ({@link linkTo}); `row` is the token of the row's
 * id a link of a table row passes.
 */
export function rewriteLinks(
  value: Json,
  pointer: string,
  scope: LinkScope,
  row?: string,
): Json {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      rewriteLinks(entry, `${pointer}/${index}`, scope, row),
    );
  }
  const object = jsonObjectSchema.safeParse(value);
  if (object.success)
    return rewriteLinkObject(object.data, pointer, scope, row);
  const target = pageLinkTarget(value);
  return target === undefined ? value : linkTo(scope, target, pointer, row);
}

/** {@link rewriteLinks} over the values of an object. */
export function rewriteLinkObject(
  object: JsonObject,
  pointer: string,
  scope: LinkScope,
  row?: string,
): JsonObject {
  return Object.fromEntries(
    Object.entries(object).map(([key, entry]) => [
      key,
      rewriteLinks(entry, pointerOf(pointer, key), scope, row),
    ]),
  );
}
