import { refreshPageReads } from "#dms-core/app/build/composables/auth/pageRefreshReads";
import {
  onLivePageBlocksRefresh,
  onPageBlocksRefresh,
} from "../../../utils/blockRefresh";
import { useLiveGate } from "../live/currentPageLive";

/**
 * Reads the `useApiData` calls declared with `refreshOnPageRefresh` again
 * with the page's blocks: at once on `refreshPageBlocks()`, through the
 * page's Live / Pause gate on `refreshLivePageBlocks()`, as one block would.
 * Browser only; installed once, by the layer's plugin.
 */
export function registerPageReadsRefresh(): void {
  if (typeof window === "undefined") return;
  const gate = useLiveGate(() => void refreshPageReads());
  onPageBlocksRefresh(() => gate.catchUp());
  onLivePageBlocksRefresh(gate.trigger);
}
