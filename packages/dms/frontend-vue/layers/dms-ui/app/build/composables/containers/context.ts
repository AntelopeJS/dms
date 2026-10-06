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
