const SINGLE_COLUMN = 1;

/** Track floor below which a column stops being usable, as a CSS length. */
export const GRID_DEFAULT_MIN_COLUMN_WIDTH = "240px";

/**
 * The column track template a `Grid` and every `GridRow` inside it share.
 *
 * `auto-fill` drops tracks as the container narrows, which is what makes the
 * grid responsive without a breakpoint list. The track floor is the larger of
 * `minColumnWidth` and the width one column would have at `maxColumns`: once
 * the container is wide enough, that share exceeds `minColumnWidth` and leaves
 * no room for an extra track, so `auto-fill` settles on exactly `maxColumns`
 * and the wide layout stays what it was. The outer `min(100%, ...)` keeps a
 * container narrower than `minColumnWidth` from overflowing it.
 *
 * Rows resolve this same template against the same width, so they keep lining
 * up on one another — what `maxColumns` was introduced for — at every width
 * rather than only at the widest.
 */
export function gridColumnsTemplate(
  maxColumns: number,
  gap: string,
  minColumnWidth: string,
): string {
  const columns = Math.max(maxColumns, SINGLE_COLUMN);
  const columnShare = `(100% - ${columns - SINGLE_COLUMN} * ${gap}) / ${columns}`;
  return `repeat(auto-fill, minmax(min(100%, max(${minColumnWidth}, ${columnShare})), 1fr))`;
}
