import { MAX_PAGE_SIZE } from "../constants";

/** Page sizes every table offers in its footer picker. */
export const STANDARD_PAGE_SIZES = [10, 25, MAX_PAGE_SIZE];

/**
 * The page sizes a table's footer picker lists: the standard ones, the
 * table's own default when it is none of them, and the size on show (a
 * stored preference may hold another).
 */
export function pageSizeOptions(
  tableDefault: number | undefined,
  current: number,
): number[] {
  const sizes = [...STANDARD_PAGE_SIZES, current];
  if (tableDefault !== undefined) sizes.push(tableDefault);
  return [...new Set(sizes)].sort((a, b) => a - b);
}
