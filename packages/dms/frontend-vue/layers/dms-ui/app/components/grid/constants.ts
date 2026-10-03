export const GRID_CONTEXT = Symbol("grid-context");

export interface GridContext {
  /**
   * A row states how many columns it holds, and says so again whenever that
   * changes: a row built by hand never moves, but one an editor fills gains and
   * loses children while the page is open.
   */
  setRowColumnCount: (row: symbol, count: number) => void;
  /** A row that unmounts stops counting, so a stale width cannot outlive it. */
  dropRow: (row: symbol) => void;
  maxColumns: ComputedRef<number>;
  gap: ComputedRef<string>;
  minColumnWidth: ComputedRef<string>;
}

export const GRID_DECLARED_COLUMNS = Symbol("grid-declared-columns");

/**
 * The column count a layout declares for the component its renderer
 * (RecursiveComponent) draws: the widest of its child rows, from the layout
 * tree itself. A Grid takes it from the first render, so the server already
 * lays every row out at the final count; the rows' own registration only
 * comes as each row sets up, and an earlier, narrower row would otherwise
 * render at the count known so far.
 */
export interface GridDeclaredColumns {
  /** The component the count was declared for (its component id). */
  componentId: string;
  columns: ComputedRef<number>;
}
