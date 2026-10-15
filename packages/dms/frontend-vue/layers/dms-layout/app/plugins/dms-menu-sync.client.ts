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

// A module signalled that the data behind the menu changed (a project created,
// an access scope edited, a role or a membership changed): on the workspace's
// topic, or on this member's own when only their access changed. The event
// carries no data: the site layout, the page on screen and the permission set
// are re-fetched, each resolved server-side against this user. The layout
// comes back through Inertia, so the copy each visit carries over is the new
// one. A stream that reconnects resyncs too: it missed what was sent meanwhile.
export default defineDmsPlugin(() => {
  const realtime = useUserRealtime();
  const siteLayout = useSiteLayout();
  const permissions = usePermissions();
  // A burst of changes (a batch of projects) collapses into one trailing pass.
  const resync = useTrailingDeduper("menu-sync");

  const refresh = (): Promise<void> =>
    resync
      .run(async () => {
        await Promise.all([
          // Background resync: a transient failure is logged below, never
          // escalated to the fatal error page over a working session.
          siteLayout.resync(),
          permissions.fetchPermissions(),
        ]);
      })
      .catch((error: unknown) => {
        console.error("[dms-menu-sync] Menu resync failed:", error);
      });

  // The topic also carries presence snapshots, which have no `type`.
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
