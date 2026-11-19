import { z } from "zod";

/**
 * A path of the site the dashboard runs on, as a built page's link holds
 * it: one leading `/`, no host (`//host`, `/\host`), no whitespace, and no
 * control character (Unicode `Cc`), which a URL parser drops: `/<tab>/host`
 * reads `//host`. A scheme never starts with `/`. A `u` pattern, as JSON
 * Schema validators compile it.
 */
export const RELATIVE_ROUTE_PATTERN = /^\/(?![/\\])[^\s\p{Cc}]*$/u;
/** How long a relative route is at most. */
export const MAX_RELATIVE_ROUTE = 2048;

/**
 * Decodes a built page's path: {@link RELATIVE_ROUTE_PATTERN}, at most
 * {@link MAX_RELATIVE_ROUTE} characters.
 */
export const relativeRouteSchema = z
  .string()
  .max(MAX_RELATIVE_ROUTE)
  .regex(RELATIVE_ROUTE_PATTERN);

/**
 * A live route a block fetches: a {@link RELATIVE_ROUTE_PATTERN} path whose
 * `{{ params.id }}` tokens may pad their key with spaces, as the dashboard
 * resolves them. A `{` is a plain character only where no such token
 * starts, so the pattern never backtracks over a run of tokens.
 */
export const LIVE_ROUTE_PATTERN =
  /^\/(?![/\\])(?:[^\s\p{Cc}{]|\{(?!\{ *[^\s\p{Cc}{}]+ *\}\})|\{\{ *[^\s\p{Cc}{}]+ *\}\})*$/u;

/**
 * Decodes a live route: {@link LIVE_ROUTE_PATTERN}, at most
 * {@link MAX_RELATIVE_ROUTE} characters.
 */
export const liveRouteSchema = z
  .string()
  .max(MAX_RELATIVE_ROUTE)
  .regex(LIVE_ROUTE_PATTERN);
