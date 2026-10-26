import { type Ref, watch } from "vue";

const MENU_CHANGED_EVENT_TYPE = "menu-changed";

/**
 * Calls `onReconnect` each time the realtime stream opens again after it was
 * lost: the events sent meanwhile never arrived. Not on its first opening,
 * which follows the page load that brought the current menu.
 *
 * @param sessionId The stream's session id, unset while it is closed
 * @param onReconnect What to run once it is back
 */
export function watchRealtimeReconnects(
  sessionId: Ref<string | undefined>,
  onReconnect: () => void,
): void {
  let hasConnected = !!sessionId.value;
  watch(sessionId, (next, previous) => {
    if (!next || next === previous) return;
    if (hasConnected) onReconnect();
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

  const onMenuEvent: RealtimeTopicHandler = (event) => {
    if (!("type" in event) || event.type !== MENU_CHANGED_EVENT_TYPE) return;
    void refresh();
  };

  watchRealtimeReconnects(realtime.sessionId, () => void refresh());

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
