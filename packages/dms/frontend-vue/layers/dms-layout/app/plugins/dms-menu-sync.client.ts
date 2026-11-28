import { type Ref, watch } from "vue";

const MENU_CHANGED_EVENT_TYPE = "menu-changed";

/**
 * Calls `onOpen` each time the realtime stream opens: the menu events sent
 * while it was closed never arrived. `first` is true on its first opening,
 * which follows the page load that brought the current menu, and false when
 * it opens again after it was lost. A stream already open when this starts
 * counts as its first opening, at once.
 *
 * @param sessionId The stream's session id, unset while it is closed
 * @param onOpen What to run once it is open
 */
export function watchRealtimeOpenings(
  sessionId: Ref<string | undefined>,
  onOpen: (first: boolean) => void,
): void {
  let hasConnected = !!sessionId.value;
  if (hasConnected) onOpen(true);
  watch(sessionId, (next, previous) => {
    if (!next || next === previous) return;
    onOpen(!hasConnected);
    hasConnected = true;
  });
}

export default defineDmsPlugin(() => {
  const realtime = useUserRealtime();
  const siteLayout = useSiteLayout();
  const permissions = usePermissions();

  const resync = useTrailingDeduper("menu-sync");

  const refresh = (): Promise<void> =>
    resync
      .run(async () => {
        await Promise.all([
          siteLayout.resync(),
          permissions.fetchPermissions(),
        ]);
      })
      .catch((error: unknown) => {
        console.error("[dms-menu-sync] Menu resync failed:", error);
      });

  const onMenuEvent: RealtimeTopicHandler = async (event) => {
    if (!("type" in event) || event.type !== MENU_CHANGED_EVENT_TYPE) return;
    await refresh();
  };

  const refreshIfChanged = (): Promise<void> =>
    siteLayout.differsFromServer().then(
      (differs) => (differs ? refresh() : undefined),
      (error: unknown) => {
        console.error("[dms-menu-sync] Menu check failed:", error);
      },
    );

  watchRealtimeOpenings(
    realtime.sessionId,
    (first) => void (first ? refreshIfChanged() : refresh()),
  );

  const unsubscribes: Array<() => void> = [];

  watch(
    () => realtime.menuTopics.value,
    (topics) => {
      for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
      for (const topic of topics) {
        unsubscribes.push(realtime.subscribe(topic, onMenuEvent));
      }
    },
    { immediate: true },
  );
});
