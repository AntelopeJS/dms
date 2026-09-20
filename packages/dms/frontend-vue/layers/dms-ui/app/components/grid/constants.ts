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
}
