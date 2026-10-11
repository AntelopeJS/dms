/**
 * The window event a data block (StatGroup, KeyValueList, NavCardGrid,
 * ActivityFeed, KPI, top list, meter, chart, a tab set's badges, table view)
 * re-fetches on, keeping its values on screen until the new answer lands.
 */
export const BLOCK_REFRESH_EVENT = "DmsComponent.Block.Refresh";

/**
 * The window event of a refresh nobody asked for (a timer, a feed): on a page
 * declared with `live` it goes through the Direct / Pause gate.
 */
export const LIVE_BLOCK_REFRESH_EVENT = "DmsComponent.Block.LiveRefresh";

/** The watch functions every block can name (see interface-dms). */
export const BlockFunctions = {
  REFRESH_PAGE: "DmsComponent.Block.RefreshPage",
} as const;

/**
 * Asks every data block mounted on the page to read its data again: what a
 * component calls once an action of the user changed the record the page
 * shows. The page header calls it after a button changed something, a form
 * through `BlockFunctions.REFRESH_PAGE` once it saved. A user action always
 * refreshes: on a page declared with `live` it reads even while paused, and
 * the blocks it reads no longer count what they had missed.
 */
export function refreshPageBlocks(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BLOCK_REFRESH_EVENT));
}

/**
 * Asks every data block mounted on the page to read its data again because
 * time passed or a feed moved, not because the user did something: on a page
 * declared with `live` it goes through the page's Direct / Pause gate like a
 * realtime event — capped by `maxRate` in Direct, counted while paused and
 * read once on resume. Without `live`, it is `refreshPageBlocks()`.
 */
export function refreshLivePageBlocks(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LIVE_BLOCK_REFRESH_EVENT));
}

/**
 * Calls `handler` on each `refreshPageBlocks()`; returns the unsubscribe. Every
 * handler receives the same event for one call, which tells one refresh
 * reaching several blocks from several refreshes.
 */
export function onPageBlocksRefresh(
  handler: (event: Event) => void,
): () => void {
  return listen(BLOCK_REFRESH_EVENT, handler);
}

/** Calls `handler` on each `refreshLivePageBlocks()`; returns the unsubscribe. */
export function onLivePageBlocksRefresh(
  handler: (event: Event) => void,
): () => void {
  return listen(LIVE_BLOCK_REFRESH_EVENT, handler);
}

function listen(name: string, handler: (event: Event) => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
}
