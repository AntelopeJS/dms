/** @vitest-environment jsdom */
/**
 * Replays of the formal-realtime-tabs counterexamples against the real
 * browser code: useUserRealtime over the shared connection, and the page
 * renderer's usePageRealtime + usePageDataRefresh + useApiData on the real
 * data engine. The backend is the realtimeServer fixture; a write bumps the
 * record and publishes its event to the sessions subscribed to the page, as
 * routes/realtime.ts does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onScopeDispose,
  ref,
  toValue,
  watch,
  type App,
  type Ref,
} from "vue";
import {
  createFakeBrowser,
  type FakeBrowser,
  type FakeTab,
} from "./fixtures/fakeBrowser";
import {
  BASE_URL,
  createRealtimeServer,
  type FakeRealtimeServer,
  installRealtimeFetch,
} from "./fixtures/realtimeServer";
import type { UserRealtimeApi } from "../layers/dms-core/app/composables/realtime/useUserRealtime";

const USER_ID = "user-1";
const PAGE_ID = "shop.orders";
const LOCATION = "/api/orders";
const ROW_TOPIC = `tableview:row:${LOCATION}`;
const SUBSCRIBE_PREFIX = `${BASE_URL}/api/realtime/subscribe/`;

interface Tab {
  api: UserRealtimeApi;
  loggedIn: Ref<boolean>;
  browserTab: FakeTab;
  shown: () => number | undefined;
  app?: App;
}

let browser: FakeBrowser;
let server: FakeRealtimeServer;
let stored = 0;
let pageReads: number[] = [];
let holdSubscribes = false;
let heldSubscribes: Array<() => void> = [];
let tabs: Tab[] = [];
const realFetch = globalThis.fetch;

const settle = async (): Promise<void> => {
  for (let round = 0; round < 10; round += 1) {
    await vi.advanceTimersByTimeAsync(20);
    await nextTick();
  }
};

/** The page each session is on, as the backend holds it. */
const pageOf = (sessionId: string): string | null =>
  server.pageCalls.filter((call) => call.sessionId === sessionId).at(-1)
    ?.pageId ?? null;

/** A write commits, then withRealtimeMutation publishes its event. */
const write = (): void => {
  stored += 1;
  for (const session of server.sessions) {
    if (server.closedSessions.includes(session.id)) continue;
    if (pageOf(session.id) !== PAGE_ID) continue;
    server.send(session.id, ROW_TOPIC, {
      topic: ROW_TOPIC,
      type: "updated",
      payload: { ids: ["r1"] },
      ts: stored,
    });
  }
};

const releaseSubscribes = async (): Promise<void> => {
  holdSubscribes = false;
  for (const release of heldSubscribes.splice(0)) release();
  await settle();
};

const sessionUser = (loggedIn: Ref<boolean>) => () => ({
  loggedIn,
  user: ref({ _id: USER_ID }),
});

/** A tab that only holds the realtime connection (it shows nothing of P). */
const openBareTab = async (): Promise<Tab> => {
  const browserTab = browser.openTab();
  browserTab.activate();
  const loggedIn = ref(true);
  vi.stubGlobal("useDmsUserSession", sessionUser(loggedIn));
  vi.resetModules();
  const module = await import(
    "../layers/dms-core/app/composables/realtime/useUserRealtime"
  );
  const api = module.useUserRealtime();
  const tab: Tab = { api, loggedIn, browserTab, shown: () => undefined };
  tabs.push(tab);
  await settle();
  return tab;
};

/** A tab on page P whose page shows the record through `useApiData`. */
const openPageTab = async (): Promise<Tab> => {
  const browserTab = browser.openTab();
  browserTab.activate();
  const loggedIn = ref(true);
  vi.stubGlobal("useDmsUserSession", sessionUser(loggedIn));
  vi.resetModules();
  const { useRealDataEngine } = await import("./fixtures/dataEngine");
  useRealDataEngine();
  vi.stubGlobal("useDmsState", <T>(_key: string, init: () => T) => ref(init()));
  const realtime = await import(
    "../layers/dms-core/app/composables/realtime/useUserRealtime"
  );
  const api = realtime.useUserRealtime();
  const { usePageRealtime } = await import(
    "../layers/dms-core/app/composables/realtime/usePageRealtime"
  );
  const { usePageDataRefresh } = await import(
    "../layers/dms-ui/app/entries/composables/live/usePageDataRefresh"
  );
  const { useApiData } = await import(
    "../layers/dms-core/app/composables/auth/useApiData"
  );
  let data!: Ref<{ version: number } | null>;
  const Page = defineComponent({
    setup() {
      const page = usePageRealtime(PAGE_ID);
      usePageDataRefresh(page);
      data = useApiData<{ version: number }>("/api/record").data;
      return () => h("div");
    },
  });
  const app = createApp(Page);
  app.mount(document.createElement("div"));
  const tab: Tab = {
    api,
    loggedIn,
    browserTab,
    shown: () => data.value?.version,
    app,
  };
  tabs.push(tab);
  await settle();
  return tab;
};

/** The browser closes the tab: its channel goes quiet, its locks and stream go. */
const closeTab = async (tab: Tab): Promise<void> => {
  tab.browserTab.cut();
  tab.loggedIn.value = false;
  tabs = tabs.filter((candidate) => candidate !== tab);
  await settle();
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubEnv("SSR", false);
  for (const [name, value] of Object.entries({
    ref,
    watch,
    computed,
    toValue,
    onScopeDispose,
  }))
    vi.stubGlobal(name, value);
  vi.stubGlobal("useDmsState", <T>(_key: string, init: () => T) => ref(init()));
  vi.stubGlobal("isDmsHydrating", () => false);
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { baseURL: BASE_URL } },
  }));
  vi.stubGlobal("useSessionRecovery", () => ({
    refreshSession: async () => true,
    redirectToAuth: async () => {},
  }));
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: async () => {
      pageReads.push(stored);
      return { version: stored };
    },
  }));
  stored = 0;
  pageReads = [];
  holdSubscribes = false;
  heldSubscribes = [];
  tabs = [];
  browser = createFakeBrowser();
  server = createRealtimeServer();
  installRealtimeFetch(server);
  const backend = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (!url.startsWith(SUBSCRIBE_PREFIX)) return backend(url, init);
    if (holdSubscribes) {
      await new Promise<void>((resolve) => heldSubscribes.push(resolve));
    }
    await backend(url, init);
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, topics: [ROW_TOPIC] }),
    };
  }) as typeof fetch;
});

afterEach(async () => {
  for (const tab of tabs) {
    tab.loggedIn.value = false;
    tab.app?.unmount();
  }
  await settle();
  globalThis.fetch = realFetch;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("a save made while the page's subscription is not in place", () => {
  it("reaches a page that subscribed after its first read", async () => {
    holdSubscribes = true;
    const tab = await openPageTab();
    expect(tab.shown()).toBe(0);

    write();
    await releaseSubscribes();

    expect(tab.api.pageTopics.value).toEqual([ROW_TOPIC]);
    expect(tab.shown()).toBe(1);
  });

  it("reaches a page whose stream dropped and came back", async () => {
    const tab = await openPageTab();
    server.lastConnection().end();
    await settle();

    write();
    await vi.advanceTimersByTimeAsync(500);
    await settle();

    expect(pageOf(tab.api.sessionId.value!)).toBe(PAGE_ID);
    expect(tab.shown()).toBe(1);
  });

  it("reaches a page in the other tab when the leader tab closes", async () => {
    const leader = await openBareTab();
    const tab = await openPageTab();
    expect(tab.api.pageTopics.value).toEqual([ROW_TOPIC]);

    write();
    await closeTab(leader);

    expect(pageOf(tab.api.sessionId.value!)).toBe(PAGE_ID);
    expect(tab.shown()).toBe(1);
  });
});
