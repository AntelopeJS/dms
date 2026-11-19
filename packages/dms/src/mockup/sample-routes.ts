import { z } from "zod";
import { type FixtureScope, fixtureUrl, MOCKUP_API } from "./fixtures";
import type { Json, JsonObject } from "./model";
import { jsonObjectSchema } from "./model";
import { MOCKUP_VIEWER_PATH } from "./page-links";

/**
 * The option keys whose string a block requests or loads: the keys the
 * preview reads as URLs (`*url`, `location`), an image `src` and an
 * `*Endpoint`.
 */
const REQUEST_KEY = /(?:url|^location|^src|endpoint)$/i;

/** A fixture key no spec can hold, so its route answers an error and reads nothing. */
const NO_FIXTURE = "~live-route";

/** Where every page of a mockup reads its fixtures from. */
const pagesPrefix = (scope: FixtureScope) =>
  `${MOCKUP_API}/${scope.name}/pages/`;

/** The origin a request URL is resolved against, standing for the dashboard's own. */
const DASHBOARD = "http://dashboard.invalid";

/** A URL that carries its content and loads nothing. */
const INLINE_DATA = "data:";

const requestValueSchema = z.string().min(1);

/**
 * Whether `value`, resolved as the browser resolves it, reads nothing but
 * the mockup's fixtures: a fixture route of one of its pages, a `data:` URL,
 * or a link to one of its pages, which the viewer opens itself.
 */
function readsFixtureOnly(value: string, scope: FixtureScope): boolean {
  try {
    const url = new URL(value, `${DASHBOARD}/`);
    if (url.protocol === INLINE_DATA) return true;
    if (url.origin !== DASHBOARD) return false;
    if (url.pathname === MOCKUP_VIEWER_PATH) {
      return url.searchParams.get("name") === scope.name;
    }
    return url.pathname.startsWith(pagesPrefix(scope));
  } catch {
    return false;
  }
}

/** A value under a key a block requests: each string of it, alone or in a list, confined. */
function confineRequest(entry: Json, scope: FixtureScope): Json {
  if (Array.isArray(entry)) {
    return entry.map((item) => confineRequest(item, scope));
  }
  const request = requestValueSchema.safeParse(entry);
  if (!request.success) return confineValue(entry, scope);
  return readsFixtureOnly(request.data, scope)
    ? request.data
    : fixtureUrl(scope.name, scope.pageId, NO_FIXTURE);
}

function confineEntry(key: string, entry: Json, scope: FixtureScope): Json {
  return REQUEST_KEY.test(key)
    ? confineRequest(entry, scope)
    : confineValue(entry, scope);
}

function confineValue(value: Json, scope: FixtureScope): Json {
  if (Array.isArray(value)) {
    return value.map((entry) => confineValue(entry, scope));
  }
  const object = jsonObjectSchema.safeParse(value);
  return object.success ? confineToFixtures(object.data, scope) : value;
}

/**
 * The options of a node of a page drawn on its fixtures, with nothing left
 * that reaches a live route: every string the block would request or load
 * from anywhere but the page's fixture routes points at a fixture route that
 * answers an error.
 */
export function confineToFixtures(
  options: JsonObject,
  scope: FixtureScope,
): JsonObject {
  return Object.fromEntries(
    Object.entries(options).map(([key, entry]) => [
      key,
      confineEntry(key, entry, scope),
    ]),
  );
}
