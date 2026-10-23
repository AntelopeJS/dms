import { getCurrentInstance } from "vue";

/**
 * The instant a server render reads the clock at, handed to the browser with
 * the page: the periods' bounds and the relative dates read it.
 */
const RENDER_NOW_STATE_KEY = "dms-render-now";

/**
 * The instant, in milliseconds, a component reads the clock at while its
 * text must match the server's, or `null` for the clock's.
 *
 * A server render reads every such clock of the request at one instant, which
 * it transfers; the browser hydrating that render reads the same one, so a
 * text measured from now ("3 min ago", a relative period's bounds) hydrates
 * as the server wrote it, even across a minute or midnight. Anywhere else (a
 * client navigation, a later render, a call outside a component) it is
 * `null`: the text follows the clock.
 */
export function serverRenderNow(): number | null {
  if (!getCurrentInstance()) return null;
  if (typeof window === "undefined") {
    return useDmsState<number>(RENDER_NOW_STATE_KEY, () => Date.now(), {
      transfer: true,
    }).value;
  }
  if (!isDmsHydrating()) return null;
  const transferred = useDmsState<number | null>(
    RENDER_NOW_STATE_KEY,
    () => null,
  ).value;
  return typeof transferred === "number" ? transferred : null;
}
