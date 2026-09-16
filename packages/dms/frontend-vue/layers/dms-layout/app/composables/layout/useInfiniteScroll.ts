const INTERSECTION_THRESHOLD = 0.1;

export function useInfiniteScroll(
  sentinelRef: Ref<HTMLElement | null>,
  loadMore: () => Promise<void>,
  hasMore: Ref<boolean>,
) {
  const isLoadingMore = ref(false);
  let observer: IntersectionObserver | null = null;

  const setupObserver = () => {
    disconnectObserver();

    if (!sentinelRef.value) return;

    observer = new IntersectionObserver(
      async (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore.value && !isLoadingMore.value) {
          isLoadingMore.value = true;
          await loadMore();
          isLoadingMore.value = false;
        }
      },
      { threshold: INTERSECTION_THRESHOLD },
    );

    observer.observe(sentinelRef.value);
  };

  const disconnectObserver = () => {
    observer?.disconnect();
    observer = null;
  };

  onUnmounted(() => {
    disconnectObserver();
  });

  return {
    isLoadingMore,
    setupObserver,
    disconnectObserver,
  };
}
