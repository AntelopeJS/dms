import { getCurrentInstance } from "vue";

/**
 * Whether the component setting up is hydrating the server's HTML: Vue binds
 * a hydrating component's vnode to its server-rendered node before its setup
 * runs, where a fresh mount has no node yet. Call it before the setup's first
 * `await`, while the component is still Vue's current instance.
 */
export function isHydratingSetup(): boolean {
  return !!getCurrentInstance()?.vnode.el;
}
