const NAVIGATE_TOPIC = "dms:navigate";

/**
 * Moves this tab to the page a `navigate_to_page` MCP call names. The backend
 * sends it to the tab that holds the browser's realtime stream only.
 */
export default defineDmsPlugin(() => {
  const router = useDmsRouter();
  useUserRealtime().subscribe(NAVIGATE_TOPIC, (event) => {
    const path = "payload" in event ? event.payload?.path : undefined;
    if (typeof path === "string") void router.push(path);
  });
});
