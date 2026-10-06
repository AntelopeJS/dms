import type { InjectionKey } from "vue";

/**
 * Provided by a framed DmsSection to its content. A block that brings its own
 * card (a Form) reads it to drop that card and lay its rows out like the
 * section's field rows instead of nesting a second frame.
 */
export const DMS_SECTION_SURFACE_KEY: InjectionKey<boolean> = Symbol(
  "dms:section-surface",
);
