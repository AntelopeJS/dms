/**
 * A bordered row on a stage card (an account to switch to, a next step): a
 * 10px-rounded hairline box holding an icon or avatar and its text. Its
 * vertical padding is the caller's.
 */
export const TILE_ROW_CLASS =
  "border-default flex items-center gap-3 rounded-[10px] border px-3";

/** A tile row the user picks: the hover tint and the accent hairline. */
export const TILE_ROW_INTERACTIVE_CLASS = `${TILE_ROW_CLASS} hover:bg-elevated transition-colors hover:border-(--dms-accent-line)`;
