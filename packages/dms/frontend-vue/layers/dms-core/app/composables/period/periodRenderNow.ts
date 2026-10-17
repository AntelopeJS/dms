import { serverRenderNow } from "../../build/composables/renderNow";

/**
 * The instant a period set up now resolves from, or `null` for the clock's.
 *
 * A server render resolves every period of the request from one instant,
 * which it transfers; the browser hydrating that render resolves from the
 * same one, so a relative preset (`last-24h`) or a calendar one read across
 * midnight keeps the bounds, key and labels the server rendered, and nothing
 * reads again on hydration. Anywhere else (a client navigation, a call
 * outside a component) it is `null`: the period follows the clock.
 */
export function periodRenderNow(): Date | null {
  const now = serverRenderNow();
  return now === null ? null : new Date(now);
}
