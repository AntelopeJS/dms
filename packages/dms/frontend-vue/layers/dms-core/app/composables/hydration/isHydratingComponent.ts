import { getCurrentInstance } from "vue";

/**
 * Whether the component setting up or rendering now is hydrating the
 * server's HTML.
 *
 * Vue binds a hydrating component's vnode to its server-rendered node before
 * its setup runs, where a fresh mount has no node until it is mounted; once
 * mounted, the component no longer hydrates. So this is true from the setup
 * to the first render of a component the browser takes over from the server,
 * and false in a client navigation, on a later re-render, on the server, and
 * outside a component.
 *
 * Read it where the browser must draw what the server drew: a value only the
 * browser knows (local storage, the clock) waits until mounted, and a setup
 * that would await data the runtime already transferred skips the await.
 * Call it before the setup's first `await`, while the component is still
 * Vue's current instance.
 *
 * ```ts
 * const isHydrating = isHydratingComponent();
 * if (!isHydrating) await listing.load();
 * ```
 */
export function isHydratingComponent(): boolean {
  const instance = getCurrentInstance();
  return !!instance && !instance.isMounted && !!instance.vnode.el;
}
