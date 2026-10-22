/**
 * What a drawer or modal opened on a row receives to step through the rows
 * of the table (`navigation` prop): J and K do the same. The steps follow the
 * open row's neighbours in the table's current order, past the rows loaded:
 * rows arriving or leaving meanwhile (a live table) never make a step skip
 * or revisit one.
 */
export interface RowNavigation {
  /** Position of the row among all the rows the table lists, from 0. */
  index: number;
  /** The rows the table lists: its count, beyond the page loaded. */
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  prev: () => void;
  next: () => void;
}
