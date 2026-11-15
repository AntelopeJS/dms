import { z } from "zod";
import { type FixtureScope, fixtureUrl } from "./fixtures";
import type { Json, JsonObject } from "./model";
import { jsonObjectSchema } from "./model";

/**
 * The option keys whose string a block requests or loads: the keys the
 * preview reads as URLs (`*url`, `location`), an image `src` and an
 * `*Endpoint`.
 */
const REQUEST_KEY = /(?:url|^location|^src|endpoint)$/i;

/** A fixture key no spec can hold, so its route answers an error and reads nothing. */
const NO_FIXTURE = "~live-route";

/** The origin a request URL is resolved against, standing for the dashboard's own. */
const DASHBOARD = "http://dashboard.invalid";

/** A URL that carries its content and loads nothing. */
const INLINE_DATA = "data:";

const requestValueSchema = z.string().min(1);

/**
 * Whether `value`, resolved as the browser resolves it, reads nothing but
 * one of the page's fixtures: a fixture route, or a `data:` URL.
 */
function readsFixtureOnly(value: string, scope: FixtureScope): boolean {
  const prefix = fixtureUrl(scope.name, scope.pageId, "");
  try {
    const url = new URL(value, `${DASHBOARD}/`);
    if (url.protocol === INLINE_DATA) return true;
    return url.origin === DASHBOARD && url.pathname.startsWith(prefix);
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
