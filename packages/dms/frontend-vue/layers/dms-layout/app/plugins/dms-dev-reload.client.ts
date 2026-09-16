const RELOAD_EVENT_NAME = "reload";
const RELOAD_ENDPOINT_PATH = "/dms/dev/reload";

function resolveBackendBase(): string | null {
  const config = useDmsRuntimeConfig();
  const dmsConfig = (config.public as { dms?: { baseURL?: string } }).dms;
  const baseURL = dmsConfig?.baseURL?.replace(/\/+$/, "");
  return baseURL || null;
}

/**
 * Dev-only: turn the backend's `reload` stream into a soft refresh.
 *
 * All the waiting lives in the dev-reload coordinator (see `useDevReload`), so
 * this plugin and the `useDmsDevReload().awaitRoute` module frontends call
 * share one route-readiness loop and one in-flight refresh.
 */
export default defineDmsPlugin(() => {
  if (!import.meta.env.DEV) return;

  const backendBase = resolveBackendBase();
  if (!backendBase) return;

  const endpoint = `${backendBase}${RELOAD_ENDPOINT_PATH}`;
  const { coordinator } = useDevReloadHolder();
  const source = new EventSource(endpoint);

  source.addEventListener("error", () => {
    console.warn(
      "[dms-dev-reload] SSE connection lost, waiting for backend...",
    );
  });

  source.addEventListener(RELOAD_EVENT_NAME, () => {
    void coordinator.requestRefresh().catch((err: unknown) => {
      console.error("[dms-dev-reload] Reload handler failed:", err);
    });
  });

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      source.close();
    });
  }
});
