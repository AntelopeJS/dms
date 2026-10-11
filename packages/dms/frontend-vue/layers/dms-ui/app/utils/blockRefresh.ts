/**
 * The window event a data block (StatGroup, KeyValueList, NavCardGrid,
 * ActivityFeed, KPI, top list, meter, chart, a tab set's badges, table view)
 * re-fetches on, keeping its values on screen until the new answer lands.
 */
export const BLOCK_REFRESH_EVENT = "DmsComponent.Block.Refresh";

/** The watch functions every block can name (see interface-dms). */
export const BlockFunctions = {
  REFRESH_PAGE: "DmsComponent.Block.RefreshPage",
} as const;

/**
 * Asks every data block mounted on the page to read its data again: what a
 * component calls once an action of its own changed the record the page
 * shows. The page header calls it after a button changed something. On a page
 * declared with `live`, it goes through the page's Direct / Pause gate like a
 * realtime event: a paused page counts it and reads on resume.
 */
export function refreshPageBlocks(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BLOCK_REFRESH_EVENT));
}

/**
 * Calls `handler` on each `refreshPageBlocks()`; returns the unsubscribe. Every
 * handler receives the same event for one call, which tells one refresh
 * reaching several blocks from several refreshes.
 */
export function onPageBlocksRefresh(
  handler: (event: Event) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(BLOCK_REFRESH_EVENT, handler);
  return () => window.removeEventListener(BLOCK_REFRESH_EVENT, handler);
}
