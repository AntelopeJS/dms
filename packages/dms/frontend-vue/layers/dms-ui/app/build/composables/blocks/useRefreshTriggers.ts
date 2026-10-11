import { onBeforeUnmount, onMounted } from "vue";
import { useRealtimeTopic } from "../../../../../dms-core/app/composables/realtime/useRealtimeTopic";
import {
  onLivePageBlocksRefresh,
  onPageBlocksRefresh,
} from "../../../utils/blockRefresh";
import { type LiveGate, useLiveGate } from "../live/currentPageLive";

/**
 * Calls `onRefresh` whenever the data behind a block moved without its inputs
 * changing: on each event of one of its realtime topics, and each time the
 * page asks its blocks to refresh (refreshPageBlocks, refreshLivePageBlocks).
 *
 * On a page declared with `live`, the realtime events and the live refreshes
 * go through the page's gate: in Direct at most once per `maxRate`, in Pause
 * not at all — the block counts what it missed and refetches once on resume.
 * A refresh the user asked for (refreshPageBlocks) reads at once, paused or
 * not. The returned gate says what was missed.
 */
export function useRefreshTriggers(
  realtimeTopic: string | string[] | undefined,
  onRefresh: () => void,
): LiveGate {
  const gate = useLiveGate(onRefresh);
  subscribeRealtimeTopics(realtimeTopic, gate.trigger);
  subscribePageRefresh(gate);
  return gate;
}

function subscribeRealtimeTopics(
  topic: string | string[] | undefined,
  onEvent: (event: object) => void,
): void {
  if (!topic) return;
  const topics = Array.isArray(topic) ? topic : [topic];
  for (const entry of topics) {
    useRealtimeTopic(entry, (event) => {
      if (!("type" in event)) return;
      onEvent(event);
    });
  }
}

// Mounted only: the page refresh is a browser event, and a block the server
// renders has nothing to refetch.
function subscribePageRefresh(gate: LiveGate): void {
  const unsubscribes: Array<() => void> = [];
  onMounted(() => {
    unsubscribes.push(
      onPageBlocksRefresh(() => gate.catchUp()),
      onLivePageBlocksRefresh(gate.trigger),
    );
  });
  onBeforeUnmount(() => unsubscribes.splice(0).forEach((stop) => stop()));
}
