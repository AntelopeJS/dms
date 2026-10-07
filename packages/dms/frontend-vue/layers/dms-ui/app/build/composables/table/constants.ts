export const MAX_PAGE_SIZE = 50;
export const MIN_PAGE_SIZE = 1;
export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_PAGE_INDEX = 0;

export const SELECT_COLUMN_ID = "select";
export const ACTIONS_COLUMN_ID = "actions";
export const EXPAND_COLUMN_ID = "expand";

// The caret stays next to the checkbox when a data column is pinned: pinned
// columns move to the left edge, and the caret must never land after them.
export const ALWAYS_PINNED_LEFT_COLUMN_IDS: string[] = [
  SELECT_COLUMN_ID,
  EXPAND_COLUMN_ID,
];
export const ALWAYS_PINNED_RIGHT_COLUMN_IDS: string[] = [ACTIONS_COLUMN_ID];
