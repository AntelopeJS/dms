import { onScopeDispose, type Ref, watch } from "vue";
import { refreshDmsPageData } from "#dms/frontend-module";
import type { RealtimeTopicHandler } from "../../../../../dms-core/app/composables/realtime/useUserRealtime";
import { useRefreshTriggers } from "../blocks/useRefreshTriggers";

// One frame: the events of one burst (a bulk edit) read the data once.
const BURST_WINDOW_MS = 16;

/** What the page's data refresh listens to. */
export interface PageDataRefreshSource {
  /** The page's realtime topics, once its session is subscribed to it. */
  pageTopics: Ref<string[]>;
  subscribe(topic: string, handler: RealtimeTopicHandler): () => void;
}

/**
 * Reads again the data the page's components show through `useApiData` (and
 * `useDmsAsyncData`), with `refreshDmsPageData()`: on each
 * `refreshPageBlocks()`, an action of the user, at once; on each event of one
 * of the page's realtime topics and each `refreshLivePageBlocks()`, through
 * the page's live gate, like a built-in block. A read opts out with
 * `refreshOnPageRefresh: false`, as the built-in blocks that refresh on their
 * own triggers do. The page renderer calls it once, from its setup.
 */
export function usePageDataRefresh(source: PageDataRefreshSource): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void refreshDmsPageData(), BURST_WINDOW_MS);
  };
  const gate = useRefreshTriggers(undefined, refresh);
  // Presence snapshots ride the same topics: they carry no `type`.
  const onEvent: RealtimeTopicHandler = (event) => {
    if ("type" in event) gate.trigger(event);
  };
  let unsubscribes: Array<() => void> = [];
  const unsubscribeAll = () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
    unsubscribes = [];
  };
  watch(
    source.pageTopics,
    (topics) => {
      unsubscribeAll();
      unsubscribes = topics.map((topic) => source.subscribe(topic, onEvent));
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    unsubscribeAll();
    clearTimeout(timer);
  });
}
