import type { z } from "zod";
import type { BlockOptionUi } from "../types";

/**
 * Hints live in a side table rather than in the schema, so validation and type
 * inference are untouched. `ui()`, the declaration side, lives in `./helpers`
 * with the other authoring helpers; reading them stays here.
 *
 * @internal
 */
export const UI_HINTS = new WeakMap<z.core.$ZodType, BlockOptionUi>();

/**
 * The hints attached to a schema node or to a schema it was cloned from, as
 * `.refine()`, `.describe()` and every check clone it. The clone's own hints
 * win.
 *
 * @internal
 */
export function getUiHints(schema: z.core.$ZodType): BlockOptionUi | undefined {
  const parent = schema._zod.parent;
  const own = UI_HINTS.get(schema);
  return parent ? mergeUiHints([getUiHints(parent), own]) : own;
}

/**
 * Merge hints collected while unwrapping a schema. Outer wrappers
 * (`optional`, `default`) are visited first, so an inner hint wins.
 *
 * @internal
 */
export function mergeUiHints(
  hints: Array<BlockOptionUi | undefined>,
): BlockOptionUi | undefined {
  const defined = hints.filter((hint): hint is BlockOptionUi => !!hint);
  if (defined.length === 0) {
    return undefined;
  }
  return defined.reduce<BlockOptionUi>(
    (merged, hint) => ({ ...merged, ...hint }),
    {},
  );
}
