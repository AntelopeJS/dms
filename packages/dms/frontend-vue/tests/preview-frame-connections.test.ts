/** @vitest-environment jsdom */
/**
 * A `/dms-preview` frame opens no long-lived connection of its own: the
 * mockup Overview draws a dozen of them, and a stream each would hold the six
 * connections a browser opens per host.
 */
import { reactive, ref, watch } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { dmsAppContext, emptyApp } from "./fixtures/dmsAppContext";
import {
  BASE_URL,
  createRealtimeServer,
  type FakeRealtimeServer,
  installRealtimeFetch,
} from "./fixtures/realtimeServer";

const CREATED_STREAM = `${BASE_URL}/api/mockup/events/created`;
const SETTLE_ROUNDS = 6;

/** Counts the streams the dashboard opens: none of them ever answers. */
class FakeEventSource {
  static readonly CLOSED = 2;
  static opened: string[] = [];
  readyState = 1;

  constructor(readonly url: string) {
    FakeEventSource.opened.push(url);
  }

  addEventListener(): void {}

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }
}

/** Signs out the document the last test opened, which closes its connection. */
let loggedIn = ref(true);
const realFetch = globalThis.fetch;

async function settle(): Promise<void> {
  for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Stubs what the connection plugins read from the dashboard, on `path`. */
function stubDashboard(path: string): void {
  const session = { loggedIn, user: ref({ _id: "owner" }) };
  const route = reactive({ path });
  vi.stubEnv("SSR", false);
  vi.stubGlobal("defineDmsPlugin", <T>(setup: T) => setup);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useDmsState", <T>(_key: string, init: () => T) => ref(init()));
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { baseURL: BASE_URL } },
  }));
  vi.stubGlobal("useDmsUserSession", () => session);
  vi.stubGlobal("useSessionRecovery", () => ({
    refreshSession: async () => true,
    redirectToAuth: async () => {},
  }));
  vi.stubGlobal("useDmsApp", () => ({}));
  vi.stubGlobal("useSiteLayout", () => ({}));
  vi.stubGlobal("useDmsError", () => ref(null));
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useDmsRouter", () => ({
    currentRoute: ref(route),
    push: async () => undefined,
  }));
  vi.stubGlobal("useIsOwner", () => ref(true));
  vi.stubGlobal("getAppTranslation", () => ({ t: (key: string) => key }));
  vi.stubGlobal("EventSource", FakeEventSource);
}

/**
 * Loads a document of the dashboard on `path`, as the browser does a tab or
 * a frame: starts its realtime engine, as the menu, notification and MCP
 * plugins do, and runs the plugins that keep a stream open.
 */
async function openDocument(path: string): Promise<FakeRealtimeServer> {
  window.history.replaceState(null, "", path);
  FakeEventSource.opened = [];
  loggedIn = ref(true);
  const server = createRealtimeServer();
  server.devReloadTopic = "dms:dev-reload";
  installRealtimeFetch(server);
  stubDashboard(path);
  vi.resetModules();
  const realtime = await import(
    "../layers/dms-core/app/composables/realtime/useUserRealtime"
  );
  vi.stubGlobal("useUserRealtime", realtime.useUserRealtime);
  realtime.useUserRealtime();
  const plugins = await Promise.all([
    import("../layers/dms-layout/app/plugins/dms-dev-reload.client"),
    import("../layers/dms-layout/app/entries/mockups/created-toast"),
  ]);
  for (const { default: plugin } of plugins) {
    await plugin(dmsAppContext(emptyApp()));
  }
  await settle();
  return server;
}

afterEach(async () => {
  loggedIn.value = false;
  await settle();
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("opens no stream from a preview frame (fails when a frame opens the dev reload, created-mockups or realtime stream)", async () => {
  const server = await openDocument("/dms-preview");

  expect(FakeEventSource.opened).toEqual([]);
  expect(server.connections).toEqual([]);
});

it("opens its streams on a dashboard page (fails when the guard holds every document back)", async () => {
  const server = await openDocument("/mockups");

  expect(FakeEventSource.opened).toContain(CREATED_STREAM);
  expect(server.connections).toHaveLength(1);
});
