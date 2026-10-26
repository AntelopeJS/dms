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
let session = ref<{ accountId?: string; activeTenantId?: string } | null>(null);
let user = ref<{ _id: string }>({ _id: "user-1" });
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
  vi.stubGlobal("useDmsState", <State>(_key: string, init: () => State) =>
    ref(init()),
  );
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { baseURL: BASE_URL } },
  }));
  vi.stubGlobal("useDmsUserSession", () => ({ loggedIn, user, session }));
  vi.stubGlobal("useSessionRecovery", () => ({
    refreshSession: async () => true,
    redirectToAuth: async () => {},
  }));
  createFakeBrowser().openTab().activate();
  server = createRealtimeServer();
  installRealtimeFetch(server);

  loggedIn = ref(true);
  session = ref({ accountId: "account-1", activeTenantId: "tenant-1" });
  user = ref({ _id: "user-1" });
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
  it("opens a new session on the same connection in the workspace the session switched to, and resubscribes the page", async () => {
    const api = await loadApi();
    await settle();
    await api.setPage(PAGE_ID);

    session.value = { accountId: "account-1", activeTenantId: "tenant-2" };
    await settle();

    expect(server.connections).toHaveLength(1);
    expect(server.lastConnection().isOpen()).toBe(true);
    expect(server.closedSessions).toEqual(["session-1"]);
    expect(api.sessionId.value).toBe("session-2");
    expect(server.pageCalls).toEqual([
      { pageId: PAGE_ID, sessionId: "session-1" },
      { pageId: PAGE_ID, sessionId: "session-2" },
    ]);
  });

  it("keeps its session when the browser session is read again unchanged", async () => {
    const api = await loadApi();
    await settle();

    session.value = { accountId: "account-1", activeTenantId: "tenant-1" };
    await settle();

    expect(server.sessions).toHaveLength(1);
    expect(api.sessionId.value).toBe("session-1");
  });

  it("opens a new session for the account the browser switched to", async () => {
    const api = await loadApi();
    await settle();

    session.value = { accountId: "account-2", activeTenantId: "tenant-1" };
    await settle();

    expect(server.closedSessions).toEqual(["session-1"]);
    expect(api.sessionId.value).toBe("session-2");
  });

  it("opens a connection of its own for the user an account switch brought", async () => {
    await loadApi();
    await settle();

    user.value = { _id: "user-2" };
    session.value = { accountId: "account-2", activeTenantId: "tenant-1" };
    await settle();

    expect(server.connections).toHaveLength(2);
    expect(server.maxOpenConnections).toBe(1);
  });

  it("opens a new session when the server ends its own, leaving the connection open", async () => {
    const api = await loadApi();
    await settle();
    await api.setPage(PAGE_ID);

    server.send("session-1", "session-ended", { sessionId: "session-1" });
    await settle();

    expect(server.connections).toHaveLength(1);
    expect(api.sessionId.value).toBe("session-2");
    expect(server.pageCalls).toEqual([
      { pageId: PAGE_ID, sessionId: "session-1" },
      { pageId: PAGE_ID, sessionId: "session-2" },
    ]);
  });

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

  it("names the dev reload topic its session carries, while it is open", async () => {
    server.devReloadTopic = "dms:dev-reload";
    const api = await loadApi();
    await settle();
    expect(api.devReloadTopic.value).toBe("dms:dev-reload");

    server.lastConnection().end();
    await settle();
    expect(api.devReloadTopic.value).toBeUndefined();

    server.devReloadTopic = undefined;
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);
    await settle();
    expect(api.sessionId.value).toBe("session-2");
    expect(api.devReloadTopic.value).toBeUndefined();
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

  it("ends a session answered after it stopped waiting for one", async () => {
    server.beforeSessionAnswer = () => {
      server.beforeSessionAnswer = undefined;
      loggedIn.value = false;
    };
    await loadApi();
    await settle();

    expect(server.closedSessions).toEqual(["session-1"]);
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
