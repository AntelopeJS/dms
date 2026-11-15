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
  /** The page's realtime topics, once the session is subscribed to it. */
  pageTopics: Ref<string[]>;
}

interface PageClaim {
  pageId: string | undefined;
}

/**
 * Every mounted page instance holding a page id, in the order each last set it.
 * A page remounted at the same path (only its query changed) sets up its new
 * instance before or after the old one is disposed, depending on the
 * transition; the session follows the latest live claim, so neither order
 * drops the page.
 */
const pageClaims: PageClaim[] = [];

const applyLatestClaim = (user: UserRealtimeApi): Promise<void> =>
  user.setPage(pageClaims.at(-1)?.pageId ?? null);

const raiseClaim = (claim: PageClaim): void => {
  const index = pageClaims.indexOf(claim);
  if (index !== -1) pageClaims.splice(index, 1);
  pageClaims.push(claim);
};

const dropClaim = (claim: PageClaim): void => {
  const index = pageClaims.indexOf(claim);
  if (index !== -1) pageClaims.splice(index, 1);
};

export function usePageRealtime(
  pageId: MaybeRefOrGetter<string>,
): PageRealtimeApi {
  const user: UserRealtimeApi = useUserRealtime();
  const resolvedPageId = computed(() => toValue(pageId) || undefined);

  if (import.meta.env.SSR) {
    user.setPage(resolvedPageId.value ?? null).catch(() => {});
  } else {
    const claim: PageClaim = { pageId: undefined };
    watch(
      resolvedPageId,
      async (next) => {
        claim.pageId = next;
        raiseClaim(claim);
        await applyLatestClaim(user);
      },
      { immediate: true },
    );
    onScopeDispose(async () => {
      dropClaim(claim);
      await applyLatestClaim(user);
    });
  }

  return {
    subscribe: (topic, handler) => user.subscribe(topic, handler),
    sessionId: user.sessionId,
    pageId: resolvedPageId,
    pageTopics: user.pageTopics,
  };
}

export function providePageRealtime(api: PageRealtimeApi): void {
  provide(PAGE_REALTIME_KEY, api);
}
