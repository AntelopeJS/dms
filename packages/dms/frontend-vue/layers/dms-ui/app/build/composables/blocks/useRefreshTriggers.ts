import { onBeforeUnmount, onMounted } from "vue";
import { useRealtimeTopic } from "../../../../../dms-core/app/composables/realtime/useRealtimeTopic";
import { onPageBlocksRefresh } from "../../../utils/blockRefresh";

/**
 * Calls `onRefresh` whenever the data behind a block moved without its inputs
 * changing: on each event of one of its realtime topics, and each time the
 * page asks its blocks to refresh (refreshPageBlocks).
 */
export function useRefreshTriggers(
  realtimeTopic: string | string[] | undefined,
  onRefresh: () => void,
): void {
  subscribeRealtimeTopics(realtimeTopic, onRefresh);
  subscribePageRefresh(onRefresh);
}

function subscribeRealtimeTopics(
  topic: string | string[] | undefined,
  onEvent: () => void,
): void {
  if (!topic) return;
  const topics = Array.isArray(topic) ? topic : [topic];
  for (const entry of topics) {
    useRealtimeTopic(entry, (event) => {
      if (!("type" in event)) return;
      onEvent();
    });
  }
}

// Mounted only: the page refresh is a browser event, and a block the server
// renders has nothing to refetch.
function subscribePageRefresh(onRefresh: () => void): void {
  let unsubscribe: (() => void) | undefined;
  onMounted(() => {
    unsubscribe = onPageBlocksRefresh(onRefresh);
  });
  onBeforeUnmount(() => unsubscribe?.());
}
