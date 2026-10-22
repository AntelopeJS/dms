import type { InjectionKey } from "vue";

/** What a DynamicDrawer or DynamicModal tells the content it renders. */
export interface DmsContainerContext {
  /** The id its leave guards are registered under. */
  id: string;
  /**
   * Closes it the way its X does: its guards run first (unsaved changes ask),
   * so a form's Cancel button never skips them.
   */
  close: () => Promise<void>;
}

/** Provided by DynamicDrawer and DynamicModal to their body. */
export const DMS_CONTAINER_KEY: InjectionKey<DmsContainerContext> =
  Symbol("dms:container");

/**
 * Marks the options of a drawer the DMS opens itself (a row action's, a
 * relation's, a table form's): it keeps the app's provides only, as before
 * `useDrawer()` handed a module's drawer its caller's. A table or a form
 * around the trigger must not reach the drawer's own form.
 * @internal
 */
export const DMS_OWN_DRAWER = Symbol("dms:own-drawer");

/** Options of a drawer the DMS opens itself (see {@link DMS_OWN_DRAWER}). @internal */
export function dmsOwnDrawer<T extends object>(options: T): T {
  return Object.assign(options, { [DMS_OWN_DRAWER]: true });
}
