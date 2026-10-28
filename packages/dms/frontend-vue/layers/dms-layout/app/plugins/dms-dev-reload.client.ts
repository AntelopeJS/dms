import { useDevReloadHolder } from "../build/composables/dev-reload/useDevReloadHolder";
import { followDevReload } from "../build/utils/dev-reload-stream";

const RELOAD_ENDPOINT_PATH = "/dms/dev/reload";

function resolveBackendBase(): string | null {
  const config = useDmsRuntimeConfig();
  const dmsConfig = (config.public as { dms?: { baseURL?: string } }).dms;
  const baseURL = dmsConfig?.baseURL?.replace(/\/+$/, "");
  return baseURL || null;
}

/**
 * Dev-only: turn the backend's reload signal into a soft refresh.
 *
 * All the waiting lives in the dev-reload coordinator (see `useDevReloadHolder`), so
 * this plugin and the `useDevReload().awaitRoute` module frontends call
 * share one route-readiness loop and one in-flight refresh.
 */
export default defineDmsPlugin(() => {
  if (!import.meta.env.DEV) return;

  const backendBase = resolveBackendBase();
  if (!backendBase) return;

  const endpoint = `${backendBase}${RELOAD_ENDPOINT_PATH}`;
  const { coordinator } = useDevReloadHolder();

  const stream = followDevReload(
    {
      endpoint,
      onReload: () => {
        void coordinator.requestRefresh().catch((err: unknown) => {
          console.error("[dms-dev-reload] Reload handler failed:", err);
        });
      },
    },
    useUserRealtime(),
  );

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      stream.close();
    });
  }
});
