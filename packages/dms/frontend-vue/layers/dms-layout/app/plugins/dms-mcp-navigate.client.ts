import { isString } from "#dms-core/app/utils/type-check";

const NAVIGATE_TOPIC = "dms:navigate";

/**
 * Moves this tab to the page a `navigate_to_page` MCP call names. The backend
 * sends it to the tab that holds the browser's realtime stream only.
 */
export default defineDmsPlugin(() => {
  const router = useDmsRouter();
  useUserRealtime().subscribe(NAVIGATE_TOPIC, async (event) => {
    const path = "payload" in event ? event.payload?.path : undefined;
    if (isString(path)) await router.push(path);
  });
});
