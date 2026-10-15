/**
 * The renderer's real data layer for a test: its async data, state and cookie
 * composables, and dms-core's `useApiData` over the test's `useAuthFetch`
 * stub, as the auto-imports a layer reaches. Each call starts a fresh runtime
 * — a browser one under jsdom, a server one otherwise — so no data a test
 * loaded leaks into the next.
 */
import { createApp } from "vue";
import { vi } from "vitest";

const engine = await import("#dms/frontend-module");
const { useApiData } = await import(
  "../../layers/dms-core/app/composables/auth/useApiData"
);

const ENGINE_GLOBALS = {
  useDmsAsyncData: engine.useDmsAsyncData,
  useDmsLazyAsyncData: engine.useDmsLazyAsyncData,
  useDmsFetch: engine.useDmsFetch,
  useDmsState: engine.useDmsState,
  useDmsCookie: engine.useDmsCookie,
  useApiData,
};

export function useRealDataEngine(): void {
  for (const [name, composable] of Object.entries(ENGINE_GLOBALS))
    vi.stubGlobal(name, composable);
  const isServer = typeof window === "undefined";
  const runtime = engine.createDmsFrontendRuntime(
    undefined,
    undefined,
    isServer,
  );
  if (isServer) engine.setDmsServerRuntimeResolver(() => runtime);
  else
    engine.provideDmsFrontendRuntime(
      createApp({ render: () => null }),
      runtime,
    );
}
