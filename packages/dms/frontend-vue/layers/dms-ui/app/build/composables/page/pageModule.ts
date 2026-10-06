import type { Ref } from "vue";

const PAGE_MODULE_STATE = "dms-page-module";

/**
 * The frontend module owning the backend page on screen, its payload's
 * `module`: the components that module registered as private resolve in the
 * page's component tree.
 */
export function usePageModule(): Ref<string | undefined> {
  return useDmsState<string | undefined>(PAGE_MODULE_STATE, () => undefined);
}
