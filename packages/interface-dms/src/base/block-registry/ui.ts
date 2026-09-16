import type { ZodTypeAny } from "zod";
import type { BlockOptionUi } from "./types";

/**
 * Hints live in a side table rather than in the schema, so validation and type
 * inference are untouched. `ui()`, the declaration side, lives in `./helpers`
 * with the other authoring helpers; reading them stays here.
 */
export const UI_HINTS = new WeakMap<ZodTypeAny, BlockOptionUi>();

/** The hints attached to a schema node, if any. */
export function getUiHints(schema: ZodTypeAny): BlockOptionUi | undefined {
  return UI_HINTS.get(schema);
}

/**
 * Merge hints collected while unwrapping a schema. Outer wrappers
 * (`optional`, `default`) are visited first, so an inner hint wins.
 */
export function mergeUiHints(
  hints: Array<BlockOptionUi | undefined>,
): BlockOptionUi | undefined {
  const defined = hints.filter((hint): hint is BlockOptionUi => !!hint);
  if (defined.length === 0) {
    return undefined;
  }
  return Object.assign({}, ...defined);
}
