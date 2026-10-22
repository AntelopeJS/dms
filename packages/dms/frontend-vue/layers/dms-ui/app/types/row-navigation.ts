/**
 * What a drawer or modal opened on a row receives to step through the rows
 * of the table (`navigation` prop, a `useDrawer` row header's
 * `navigation`): J and K do the same.
 */
export interface RowNavigation {
  /** Position of the row among the rows it steps through, from 0. */
  index: number;
  /** How many rows it steps through. */
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  prev: () => void;
  next: () => void;
}
