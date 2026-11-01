/**
 * `useApiData` on the runtime's real async data, over a fake `$authFetch`:
 * what a layer component reads, a server render of it, and the browser
 * hydrating its HTML.
 */
import { createApp, createSSRApp, type App, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { vi } from "vitest";
import type { DmsFrontendRuntime, DmsPayload } from "#dms/frontend-module";

export const engine = await import("#dms/frontend-module");
const { useApiData } = await import(
  "../../layers/dms-core/app/composables/auth/useApiData"
);

/** Stubs the globals `useApiData` reads, `$authFetch` being `authFetch`. */
export function stubApiData<Result>(
  authFetch: (...args: never[]) => Result,
): void {
  vi.stubGlobal("useDmsFetch", engine.useDmsFetch);
  vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
  vi.stubGlobal("useDmsState", engine.useDmsState);
  vi.stubGlobal("isDmsHydrating", engine.isDmsHydrating);
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useApiData", useApiData);
}

/** A browser runtime: `useApiData` outside a component reads through it. */
export function browserRuntime(app: App = createApp({})): DmsFrontendRuntime {
  const runtime = engine.createDmsFrontendRuntime();
  engine.provideDmsFrontendRuntime(app, runtime);
  return runtime;
}

/** Renders `root` as a server would: its HTML and the payload it hands over. */
export async function serverRender(
  root: Component,
  setup?: (app: App) => void,
): Promise<{ html: string; payload: DmsPayload }> {
  const runtime = engine.createDmsFrontendRuntime(undefined, {}, true);
  const app = createSSRApp(root);
  engine.provideDmsFrontendRuntime(app, runtime);
  setup?.(app);
  const html = await renderToString(app);
  return {
    html,
    payload: structuredClone(engine.serializeDmsPayload(runtime)),
  };
}

/** Hydrates the server's `html` with its `payload`, as the browser does. */
export function hydrate(
  root: Component,
  html: string,
  payload: DmsPayload,
  setup?: (app: App) => void,
) {
  const runtime = engine.createDmsFrontendRuntime();
  engine.restoreDmsPayload(runtime, payload);
  const container = document.createElement("div");
  container.innerHTML = html;
  const app = createSSRApp(root);
  engine.provideDmsFrontendRuntime(app, runtime);
  setup?.(app);
  app.mount(container);
  return { app, container };
}

/** Mounts `root` in the browser, past the hydration (a client navigation). */
export function mountInBrowser(root: Component, setup?: (app: App) => void) {
  const container = document.createElement("div");
  const app = createApp(root);
  browserRuntime(app);
  setup?.(app);
  app.mount(container);
  return { app, container };
}
