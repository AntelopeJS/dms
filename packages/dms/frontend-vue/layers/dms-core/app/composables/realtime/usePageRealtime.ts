import {
  useUserRealtime,
  type RealtimeTopicHandler,
  type UserRealtimeApi,
} from "./useUserRealtime";

const PAGE_REALTIME_KEY = "dms.realtime.page";

export interface PageRealtimeApi {
  subscribe(topic: string, handler: RealtimeTopicHandler): () => void;
  sessionId: Ref<string | undefined>;
  pageId: Ref<string | undefined>;
}

export function usePageRealtime(
  pageId: MaybeRefOrGetter<string>,
): PageRealtimeApi {
  const user: UserRealtimeApi = useUserRealtime();
  const resolvedPageId = computed(() => toValue(pageId) || undefined);
  let lastSet: string | undefined;

  watch(
    resolvedPageId,
    (next) => {
      lastSet = next;
      void user.setPage(next ?? null);
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    if (user.pageId.value === lastSet) {
      void user.setPage(null);
    }
  });

  return {
    subscribe: user.subscribe,
    sessionId: user.sessionId,
    pageId: resolvedPageId,
  };
}

export function providePageRealtime(api: PageRealtimeApi): void {
  provide(PAGE_REALTIME_KEY, api);
}
