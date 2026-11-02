import type { ColumnDisplay, ColumnDisplaySerialized } from "../column-display";

/** @internal */
export const displayIds = new WeakMap<object, string>();

/**
 * The id a display instance is registered under, if any.
 *
 * @internal
 */
export function getColumnDisplayId(
  display: ColumnDisplay<object>,
): string | undefined {
  const prototype = Reflect.getPrototypeOf(display);
  return prototype ? displayIds.get(prototype.constructor) : undefined;
}

/**
 * A column display as the column metadata carries it. Throws for a display
 * whose class was never registered: its cells would fall back to the column's
 * type without a word.
 *
 * @internal
 */
export function serializeColumnDisplay(
  display: ColumnDisplay<object> | undefined,
): ColumnDisplaySerialized | undefined {
  if (!display) return undefined;
  const type = getColumnDisplayId(display);
  if (!type) {
    throw new Error(
      `Column display ${Reflect.getPrototypeOf(display)?.constructor.name} is not registered: decorate its class with @RegisterDisplay("<module>:<id>")`,
    );
  }
  const { options } = display;
  return options
    ? {
        type,
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The published display envelope requires a dictionary, but ColumnDisplay<object> does not prove an index signature; module-owned options pass through unchanged.
        options: options as NonNullable<ColumnDisplaySerialized["options"]>,
      }
    : { type };
}
