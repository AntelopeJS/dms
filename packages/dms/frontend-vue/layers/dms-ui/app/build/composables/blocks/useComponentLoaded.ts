import { getCurrentInstance, ref, watch, type Ref } from "vue";

/** What a lazily loaded component (`defineAsyncComponent`) carries. */
interface AsyncComponent {
  __asyncLoader?: () => Promise<unknown>;
  __asyncResolved?: unknown;
}

function isPendingAsync(component: unknown): component is AsyncComponent {
  if (!component || typeof component !== "object") return false;
  const lazy = component as AsyncComponent;
  return !!lazy.__asyncLoader && !lazy.__asyncResolved;
}

/**
 * Whether the code of a component is there to render, fetching it when it is
 * not: a lazily loaded component draws nothing until its chunk lands, so a
 * caller drawing it in place of a skeleton keeps the skeleton until then
 * instead of showing an empty box a beat (a custom card of the cards display).
 * A server render resolves the component as it renders, and a hydration
 * waits for it over the server's HTML: both count it as loaded.
 *
 * @param component The component to draw, as `resolveDmsComponent` returns it
 *
 * @internal
 */
export function useComponentLoaded(component: () => unknown): Ref<boolean> {
  const isHydrating = !!getCurrentInstance()?.vnode.el;
  const isLoaded = ref(true);
  if (typeof window === "undefined") return isLoaded;
  watch(
    component,
    (next) => {
      if (isHydrating || !isPendingAsync(next)) {
        isLoaded.value = true;
        return;
      }
      isLoaded.value = false;
      // A chunk that fails to load leaves its component to report it.
      const settle = () => {
        if (component() === next) isLoaded.value = true;
      };
      next.__asyncLoader!().then(settle, settle);
    },
    { immediate: true },
  );
  return isLoaded;
}
