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
 * Read it where the browser must draw what the server drew: a part drawn
 * in the browser only, or a value only the browser knows (local storage, the
 * clock), waits until mounted while hydrating, and shows at once anywhere
 * else. Call it before the setup's first `await`, while the component is
 * still Vue's current instance. Data needs no check: `useApiData` hands the
 * server's answer to the browser on its own.
 *
 * ```ts
 * const isDrawn = ref(!import.meta.env.SSR && !isHydratingComponent());
 * onMounted(() => (isDrawn.value = true));
 * ```
 */
export function isHydratingComponent(): boolean {
  const instance = getCurrentInstance();
  return !!instance && !instance.isMounted && !!instance.vnode.el;
}
