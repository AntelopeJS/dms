export function usePageLeaveGuard() {
  const route = useDmsRoute();
  const { addGuard, clearGuards } = useLeaveGuard();

  const pageKey = computed(() => `${PAGE_GUARD_PREFIX}-${route.path}`);

  function registerGuard(callback: LeaveGuardCallback): () => void {
    return addGuard(pageKey.value, callback);
  }

  onBeforeUnmount(() => clearGuards(pageKey.value));

  return { registerGuard };
}
