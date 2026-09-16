const MENU_CHANGED_EVENT_TYPE = "menu-changed";

// A module signalled that the data behind the menu changed (a project created,
// an access scope edited). The event carries no data: the site layout and the
// permission set are re-fetched, each resolved server-side against this user.
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
          siteLayout.refresh({ fatal: false }),
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
