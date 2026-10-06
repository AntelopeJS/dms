import type { Component, Ref } from "vue";
import { resolveDmsComponent as resolveRegisteredComponent } from "#dms/frontend-module";

const PAGE_MODULE_STATE = "dms-page-module";

/**
 * The frontend module owning the backend page on screen, its payload's
 * `module`: the components that module registered as private resolve in the
 * page's component tree.
 */
export function usePageModule(): Ref<string | undefined> {
  return useDmsState<string | undefined>(PAGE_MODULE_STATE, () => undefined);
}

/**
 * The registered component `name` resolves to on the page on screen: a
 * private component of the module owning the page, or a public one.
 */
export function findPageComponent(name: string): Component | undefined {
  return resolveRegisteredComponent(name, usePageModule().value);
}
