import { useUserRealtime, type RealtimeTopicHandler } from "./useUserRealtime";

export function useRealtimeTopic(
  topic: MaybeRefOrGetter<string | undefined>,
  handler: RealtimeTopicHandler,
): void {
  const api = useUserRealtime();

  let unsubscribe: (() => void) | undefined;

  watch(
    () => toValue(topic),
    (next) => {
      unsubscribe?.();
      unsubscribe = undefined;
      if (!next) return;
      unsubscribe = api.subscribe(next, handler);
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    unsubscribe?.();
  });
}
