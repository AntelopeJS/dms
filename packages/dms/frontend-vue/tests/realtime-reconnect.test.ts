import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref, watch } from "vue";
import type { UserRealtimeApi } from "../layers/dms-core/app/composables/realtime/useUserRealtime";
import { createFakeBrowser } from "./fixtures/fakeBrowser";
import {
  BASE_URL,
  createRealtimeServer,
  type FakeRealtimeServer,
  installRealtimeFetch,
} from "./fixtures/realtimeServer";

const PAGE_ID = "orders";
const INITIAL_DELAY_MS = 500;
const SECOND_DELAY_MS = 1000;
const LONG_WAIT_MS = 120_000;

const settle = async (): Promise<void> => {
  for (let round = 0; round < 3; round += 1) {
    await vi.advanceTimersByTimeAsync(0);
    await nextTick();
  }
};

const realFetch = globalThis.fetch;
let loggedIn = ref(false);
let server: FakeRealtimeServer;

const loadApi = async (): Promise<UserRealtimeApi> => {
  const module = await import(
    "../layers/dms-core/app/composables/realtime/useUserRealtime"
  );
  return module.useUserRealtime();
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubEnv("SSR", false);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useDmsState", (_key: string, init: () => unknown) =>
    ref(init()),
  );
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { baseURL: BASE_URL } },
  }));
  vi.stubGlobal("useDmsUserSession", () => ({
    loggedIn,
    user: ref({ _id: "user-1" }),
  }));
  vi.stubGlobal("useSessionRecovery", () => ({
    refreshSession: async () => true,
    redirectToAuth: async () => {},
  }));
  createFakeBrowser().openTab().activate();
  server = createRealtimeServer();
  installRealtimeFetch(server);
  // Fresh per test: the singleton of a previous test keeps watching its own.
  loggedIn = ref(true);
});

afterEach(async () => {
  loggedIn.value = false;
  await settle();
  globalThis.fetch = realFetch;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("useUserRealtime reconnection", () => {
  it("reconnects with backoff when the server ends the stream, then resubscribes the page", async () => {
    const api = await loadApi();
    await settle();
    await api.setPage(PAGE_ID);
    expect(api.sessionId.value).toBe("session-1");
    expect(server.pageCalls).toEqual([
      { pageId: PAGE_ID, sessionId: "session-1" },
    ]);

    server.lastConnection().end();
    await settle();
    expect(api.sessionId.value).toBeUndefined();
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS - 1);
    expect(server.connections).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(server.connections).toHaveLength(2);
    expect(api.sessionId.value).toBe("session-2");
    expect(server.pageCalls).toEqual([
      { pageId: PAGE_ID, sessionId: "session-1" },
      { pageId: PAGE_ID, sessionId: "session-2" },
    ]);
  });

  it("holds the page's topics its subscription answered, until the stream drops", async () => {
    const api = await loadApi();
    await settle();
    await api.setPage(PAGE_ID);
    expect(api.pageTopics.value).toEqual([`table:${PAGE_ID}`]);

    server.lastConnection().end();
    await settle();
    expect(api.pageTopics.value).toEqual([]);
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);
    await settle();
    expect(api.pageTopics.value).toEqual([`table:${PAGE_ID}`]);
  });

  it("says whether its session carries the dev reload signal, while it is open", async () => {
    server.carriesDevReload = true;
    const api = await loadApi();
    await settle();
    expect(api.carriesDevReload.value).toBe(true);

    server.lastConnection().end();
    await settle();
    expect(api.carriesDevReload.value).toBe(false);

    server.carriesDevReload = undefined;
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);
    await settle();
    expect(api.sessionId.value).toBe("session-2");
    expect(api.carriesDevReload.value).toBe(false);
  });

  it("backs off further while the server stays unreachable", async () => {
    await loadApi();
    await settle();
    server.isDown = true;

    server.lastConnection().end();
    await settle();
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);
    await settle();
    expect(server.streamAttempts).toBe(2);

    server.isDown = false;
    await vi.advanceTimersByTimeAsync(SECOND_DELAY_MS - 1);
    expect(server.connections).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(server.connections).toHaveLength(2);
    expect(server.lastConnection().isOpen()).toBe(true);
  });

  it("does not reconnect after an intentional close", async () => {
    await loadApi();
    await settle();
    const connection = server.lastConnection();

    loggedIn.value = false;
    await settle();
    expect(connection.signal.aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);
    await settle();
    expect(server.connections).toHaveLength(1);
  });

  it("never holds more than one stream at a time", async () => {
    await loadApi();
    await settle();

    for (let cycle = 0; cycle < 3; cycle += 1) {
      server.lastConnection().end();
      await settle();
      await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);
      await settle();
    }
    loggedIn.value = false;
    await settle();
    loggedIn.value = true;
    await settle();

    expect(server.connections).toHaveLength(5);
    expect(server.maxOpenConnections).toBe(1);
    expect(server.openConnections()).toHaveLength(1);
  });

  it("dispatches its session's frames, and only its own", async () => {
    const api = await loadApi();
    await settle();
    const received: unknown[] = [];
    api.subscribe("table:orders", (event) => received.push(event));
    const event = { topic: "table:orders", type: "row:updated", ts: 1 };

    server.send("session-1", "table:orders", event);
    server.lastConnection().write("session", {
      sessionId: "another-tab",
      event: "table:orders",
      data: { ...event, ts: 2 },
    });
    await settle();

    expect(received).toEqual([event]);
  });

  it("keeps the frames that come before the answer naming its session", async () => {
    const snapshot = { topic: "presence:orders", entries: [] };
    server.beforeSessionAnswer = (session) =>
      server.send(session.id, "snapshot", snapshot);
    const api = await loadApi();
    const received: unknown[] = [];
    api.subscribe("presence:orders", (event) => received.push(event));
    await settle();

    expect(api.sessionId.value).toBe("session-1");
    expect(received).toEqual([snapshot]);
  });

  it("refreshes the browser session when a session is refused with a 401", async () => {
    const refreshSession = vi.fn(async () => {
      server.sessionStatus = undefined;
      return true;
    });
    vi.stubGlobal("useSessionRecovery", () => ({
      refreshSession,
      redirectToAuth: async () => {},
    }));
    server.sessionStatus = 401;
    const api = await loadApi();
    await settle();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(api.sessionId.value).toBeUndefined();

    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);
    await settle();
    expect(api.sessionId.value).toBe("session-1");
  });
});
