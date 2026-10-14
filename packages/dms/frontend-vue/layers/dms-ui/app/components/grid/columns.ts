import { h, type FunctionalComponent } from "vue";

const SINGLE_COLUMN = 1;

/** Track floor below which a column stops being usable, as a CSS length. */
export const GRID_DEFAULT_MIN_COLUMN_WIDTH = "240px";

const UNITLESS_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/**
 * A length usable inside `calc()`. A bare `0` is a valid `gap` but not a
 * length in a calculation, where it would void the whole template and leave
 * the grid on a single column; a unitless number reads as pixels.
 */
function calcLength(value: string): string {
  const trimmed = value.trim();
  return UNITLESS_NUMBER.test(trimmed) ? `${trimmed}px` : trimmed;
}

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
  const columnShare = `(100% - ${columns - SINGLE_COLUMN} * ${calcLength(gap)}) / ${columns}`;
  return `repeat(auto-fill, minmax(min(100%, max(${calcLength(minColumnWidth)}, ${columnShare})), 1fr))`;
}

/** Custom property a `Grid` / `GridRow` hands its cells: the tracks left. */
export const GRID_TRACKS_VAR = "--dms-grid-tracks";

/**
 * Narrowest width at which the shared template still lays out `columns`
 * tracks: `columns` floors plus the gaps between them. Below it, `auto-fill`
 * drops a track (see `gridColumnsTemplate`).
 */
function trackBreakpoint(
  columns: number,
  gap: string,
  minColumnWidth: string,
): string {
  return `calc(${columns} * ${calcLength(minColumnWidth)} + ${columns - SINGLE_COLUMN} * ${calcLength(gap)})`;
}

/** A container name / attribute value built from any id. */
export function gridScopeId(id: string): string {
  return `dms-grid-${id.replace(/[^\w-]/g, "_")}`;
}

/**
 * The responsive rules of one grid element, as a stylesheet: pure CSS, so the
 * server render and the browser agree from the first paint, before any
 * script has measured anything.
 *
 * The element is an inline-size container named `scope` and carries
 * `data-dms-grid="<scope>"`. Its width alone decides how many tracks the
 * template keeps, and so:
 *
 * - below the width of `maxColumns` tracks the grid has reflowed, and a
 *   spacer stops holding a cell (it would only take a row of its own and a
 *   second gap); while every column shows it keeps lining the next cells up;
 * - at each narrower track count, the cells get that count as
 *   `--dms-grid-tracks`, which a spanned cell clamps its span to
 *   (`span min(3, var(--dms-grid-tracks, 3))`, see RecursiveComponent), so a
 *   span never adds implicit columns past a phone screen.
 *
 * A single-column grid never reflows and gets no rules.
 */
export function gridResponsiveStyles(
  scope: string,
  maxColumns: number,
  gap: string,
  minColumnWidth: string,
): string {
  const columns = Math.max(maxColumns, SINGLE_COLUMN);
  if (columns <= SINGLE_COLUMN) return "";
  const cells = `[data-dms-grid="${scope}"] > `;
  const below = (tracks: number) =>
    `@container ${scope} (width < ${trackBreakpoint(tracks, gap, minColumnWidth)})`;
  const hideSpacers = `${cells}.dms-spacer, ${cells}:has(> .dms-spacer) { display: none; }`;
  const rules: string[] = [];
  // Widest first: at a given width the narrowest matching rule comes last and
  // wins. The first one (one track short of every column) also hides spacers.
  for (
    let tracks = columns - SINGLE_COLUMN;
    tracks >= SINGLE_COLUMN;
    tracks--
  ) {
    const clampSpans = `${cells}* { ${GRID_TRACKS_VAR}: ${tracks}; }`;
    const body =
      tracks === columns - SINGLE_COLUMN
        ? `${hideSpacers} ${clampSpans}`
        : clampSpans;
    rules.push(`${below(tracks + SINGLE_COLUMN)} { ${body} }`);
  }
  return rules.join("\n");
}

/**
 * A cell whose block renders nothing (an element holding only comments):
 * a block hidden by its own condition, not a spacer, which is empty on
 * purpose to line the next cells up.
 */
const COLLAPSED_CELL = ":empty:not(.dms-spacer)";

/**
 * The rules that let a row close over the cells its blocks leave empty, as a
 * stylesheet: an empty cell takes no track, and the last filled cell before a
 * run of trailing empty ones spans their tracks too, so a block whose
 * neighbour turned itself off fills the row instead of leaving a hole beside
 * it. The span is clamped to the tracks left like any other (see
 * `gridResponsiveStyles`). The row's own stylesheet is its last child, which
 * is what closes the trailing run.
 */
export function gridCollapsedCellStyles(
  scope: string,
  maxColumns: number,
): string {
  const columns = Math.max(maxColumns, SINGLE_COLUMN);
  if (columns <= SINGLE_COLUMN) return "";
  const cells = `[data-dms-grid="${scope}"] > `;
  const rules = [`${cells}${COLLAPSED_CELL} { display: none; }`];
  for (let trailing = SINGLE_COLUMN; trailing < columns; trailing++) {
    const run = Array.from(
      { length: trailing },
      () => `+ ${COLLAPSED_CELL} `,
    ).join("");
    const span = trailing + SINGLE_COLUMN;
    rules.push(
      `${cells}:not(${COLLAPSED_CELL}):has(${run}+ style:last-child) { grid-column: span min(${span}, var(${GRID_TRACKS_VAR}, ${span})); }`,
    );
  }
  return rules.join("\n");
}

/**
 * Prints a grid's responsive stylesheet inside the grid element. A render
 * function rather than template text: the server escapes interpolated text,
 * and entities are not decoded inside a <style> element, so the CSS has to go
 * out as raw markup. Always an element, even empty, so the server render and
 * the hydration pass agree on the node.
 */
export const GridResponsiveStyle: FunctionalComponent<{ css: string }> = (
  props,
) => h("style", { innerHTML: props.css });
GridResponsiveStyle.props = ["css"];
