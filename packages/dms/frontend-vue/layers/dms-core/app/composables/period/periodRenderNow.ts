import { getCurrentInstance } from "vue";

/**
 * The instant a server render resolves its periods from, handed to the
 * browser with the page.
 */
const RENDER_NOW_STATE_KEY = "dms-period-render-now";

/**
 * Whether the component setting up is hydrating the server's HTML: Vue binds
 * a hydrating component's vnode to its server-rendered node before its setup
 * runs, where a fresh mount has no node yet.
 */
function isHydratingSetup(): boolean {
  return !!getCurrentInstance()?.vnode.el;
}

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
  if (!getCurrentInstance()) return null;
  if (typeof window === "undefined") {
    const now = useDmsState<number>(RENDER_NOW_STATE_KEY, () => Date.now(), {
      transfer: true,
    });
    return new Date(now.value);
  }
  if (!isHydratingSetup()) return null;
  const transferred = useDmsState<number | null>(
    RENDER_NOW_STATE_KEY,
    () => null,
  ).value;
  return typeof transferred === "number" ? new Date(transferred) : null;
}
