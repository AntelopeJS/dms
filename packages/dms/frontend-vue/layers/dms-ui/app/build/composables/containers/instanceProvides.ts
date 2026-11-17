import { getCurrentInstance, type AppContext } from "vue";

/**
 * The component instance running now, as the holder of what it and its
 * ancestors provide, or null outside a component.
 */
export function currentInstanceProvides(): {
  provides: AppContext["provides"];
} | null {
  // SAFETY: Holds for every instance Vue 3's runtime-core creates, which is what getCurrentInstance returns when it returns one: createComponentInstance sets its provides to its parent's provides object or, for a root, to one created from appContext.provides, and provide() and a child's inject() read that member; Vue's published ComponentInternalInstance type leaves this @internal member out.
  return getCurrentInstance() as {
    provides: AppContext["provides"];
  } | null;
}
