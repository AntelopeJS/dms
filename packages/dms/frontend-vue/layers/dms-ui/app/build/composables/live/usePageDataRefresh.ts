import { onScopeDispose, type Ref, watch } from "vue";
import { refreshDmsPageData } from "#dms/frontend-module";
import type { RealtimeTopicHandler } from "../../../../../dms-core/app/composables/realtime/useUserRealtime";
import {
  onPageBlocksRefresh,
  waitForPageBlocksRefresh,
} from "../../../utils/blockRefresh";
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
 * own triggers do. The page renderer calls it once, from its setup;
 * `refreshPageBlocks()` resolves once the refresh it asked for is done.
 */
export function usePageDataRefresh(source: PageDataRefreshSource): void {
  const { refresh, cancel } = burstRefresh();
  const gate = useRefreshTriggers(undefined, () => void refresh());
  // The gate's own listener reads at once on the same event: this call joins
  // the same burst, and hands its promise to the caller.
  const stopWaiting = onPageBlocksRefresh((event) =>
    waitForPageBlocksRefresh(event, refresh()),
  );
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
    stopWaiting();
    cancel();
  });
}

interface BurstRefresh {
  /** Joins the burst under way, or starts one; resolves once it is read. */
  refresh(): Promise<void>;
  cancel(): void;
}

interface Burst {
  promise: Promise<void>;
  done(): void;
}

function startBurst(): Burst {
  let done!: () => void;
  const promise = new Promise<void>((resolve) => {
    done = resolve;
  });
  return { promise, done };
}

/** `refreshDmsPageData()`, once for the calls of one burst. */
function burstRefresh(): BurstRefresh {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let burst: Burst | undefined;
  return {
    refresh() {
      clearTimeout(timer);
      const current = (burst ??= startBurst());
      timer = setTimeout(() => {
        burst = undefined;
        refreshDmsPageData().then(current.done, current.done);
      }, BURST_WINDOW_MS);
      return current.promise;
    },
    cancel() {
      clearTimeout(timer);
      burst?.done();
      burst = undefined;
    },
  };
}
