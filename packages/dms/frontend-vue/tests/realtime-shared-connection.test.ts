import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref, watch, type Ref } from "vue";
import type {
  RealtimeEvent,
  UserRealtimeApi,
} from "../layers/dms-core/app/composables/realtime/useUserRealtime";
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

const TAB_COUNT = 8;
const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const TOPIC = "table:orders";

interface Tab {
  api: UserRealtimeApi;
  loggedIn: Ref<boolean>;
  browserTab: FakeTab;
  received: RealtimeEvent[];
}

const settle = async (): Promise<void> => {
  for (let round = 0; round < 6; round += 1) {
    await vi.advanceTimersByTimeAsync(0);
    await nextTick();
  }
};

const realFetch = globalThis.fetch;
let browser: FakeBrowser;
let server: FakeRealtimeServer;
let tabs: Tab[];

/** A tab of its own: its own module instance, so its own engine singleton. */
const openTab = async (userId = USER_ID): Promise<Tab> => {
  const browserTab = browser.openTab();
  browserTab.activate();
  const loggedIn = ref(true);
  vi.stubGlobal("useDmsUserSession", () => ({
    loggedIn,
    user: ref({ _id: userId }),
  }));
  vi.resetModules();
  const module = await import(
    "../layers/dms-core/app/composables/realtime/useUserRealtime"
  );
  const api = module.useUserRealtime();
  const received: RealtimeEvent[] = [];
  api.subscribe(TOPIC, (event) => received.push(event as RealtimeEvent));
  const tab = { api, loggedIn, browserTab, received };
  tabs.push(tab);
  await settle();
  return tab;
};

const openTabs = async (count: number): Promise<Tab[]> => {
  const opened: Tab[] = [];
  for (let index = 0; index < count; index += 1) opened.push(await openTab());
  return opened;
};

/** The browser closes the tab: no goodbye, its locks and stream go with it. */
const closeTab = async (tab: Tab): Promise<void> => {
  tab.browserTab.cut();
  tab.loggedIn.value = false;
  tabs = tabs.filter((candidate) => candidate !== tab);
  await settle();
};

const sessionOf = (tab: Tab): string => tab.api.sessionId.value!;

const eventFor = (ts: number): RealtimeEvent => ({
  topic: TOPIC,
  type: "row:updated",
  ts,
});

beforeEach(() => {
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
  vi.stubGlobal("useSessionRecovery", () => ({
    refreshSession: async () => true,
    redirectToAuth: async () => {},
  }));
  browser = createFakeBrowser();
  server = createRealtimeServer();
  installRealtimeFetch(server);
  tabs = [];
});

afterEach(async () => {
  for (const tab of tabs) tab.loggedIn.value = false;
  await settle();
  globalThis.fetch = realFetch;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("useUserRealtime across tabs", () => {
  it("shares one connection between every tab, each with a session of its own", async () => {
    const opened = await openTabs(TAB_COUNT);

    expect(server.maxOpenConnections).toBe(1);
    expect(server.streamAttempts).toBe(1);
    const sessionIds = opened.map(sessionOf);
    expect(new Set(sessionIds).size).toBe(TAB_COUNT);
    expect(
      server.sessions.every((s) => s.connectionId === "connection-1"),
    ).toBe(true);
  });

  it("keeps each tab's page apart", async () => {
    const [first, second] = await openTabs(2);

    await first!.api.setPage("orders");
    await second!.api.setPage("invoices");
    await settle();

    expect(server.pageCalls).toEqual([
      { sessionId: sessionOf(first!), pageId: "orders" },
      { sessionId: sessionOf(second!), pageId: "invoices" },
    ]);
    expect(first!.api.pageTopics.value).toEqual(["table:orders"]);
    expect(second!.api.pageTopics.value).toEqual(["table:invoices"]);
  });

  it("delivers a session's frames to its own tab only", async () => {
    const opened = await openTabs(3);
    const target = opened[2]!;

    server.send(sessionOf(target), TOPIC, eventFor(1));
    await settle();

    expect(target.received).toEqual([eventFor(1)]);
    expect(opened[0]!.received).toEqual([]);
    expect(opened[1]!.received).toEqual([]);
  });

  it("hands the connection's own frames to every tab once", async () => {
    const opened = await openTabs(3);
    const reloads = opened.map((tab) => {
      const received: unknown[] = [];
      tab.api.subscribe("dms:dev-reload", (event) => received.push(event));
      return received;
    });
    const reload = { topic: "dms:dev-reload", type: "resync", ts: 3 };

    server.lastConnection().write("dms:dev-reload", reload);
    await settle();

    for (const received of reloads) expect(received).toEqual([reload]);
  });

  it("ends the session of a tab that goes, and nothing else", async () => {
    const [leader, follower, other] = await openTabs(3);
    const followerSession = sessionOf(follower!);

    await closeTab(follower!);

    expect(server.closedSessions).toEqual([followerSession]);
    expect(server.openConnections()).toHaveLength(1);
    expect(leader!.api.sessionId.value).toBeDefined();
    expect(other!.api.sessionId.value).toBeDefined();
  });

  it("sends only headers the renderer's backend proxy relays", async () => {
    const [first, second] = await openTabs(2);
    await first!.api.setPage("orders");
    await closeTab(second!);

    expect(server.droppedHeaders).toEqual([]);
    expect(first!.api.sessionId.value).toBeDefined();
    expect(server.closedSessions).toHaveLength(1);
  });

  it("hands the connection to another tab when the leader goes", async () => {
    const [leader, ...followers] = await openTabs(4);
    await followers[0]!.api.setPage("orders");
    await followers[1]!.api.setPage("invoices");
    const before = followers.map(sessionOf);

    await closeTab(leader!);

    expect(server.connections[0]!.isOpen()).toBe(false);
    expect(server.openConnections()).toHaveLength(1);
    expect(server.maxOpenConnections).toBe(1);
    const after = followers.map(sessionOf);
    for (const [index, sessionId] of after.entries()) {
      expect(sessionId).toBeDefined();
      expect(sessionId).not.toBe(before[index]);
    }

    expect(server.pageCalls.slice(-2)).toEqual(
      expect.arrayContaining([
        { sessionId: after[0], pageId: "orders" },
        { sessionId: after[1], pageId: "invoices" },
      ]),
    );

    server.send(after[2]!, TOPIC, eventFor(2));
    await settle();
    expect(followers[2]!.received).toEqual([eventFor(2)]);
  });

  it("keeps the connection when the leader's stream drops, on the next one", async () => {
    const opened = await openTabs(3);

    server.lastConnection().end();
    await settle();
    await vi.advanceTimersByTimeAsync(500);
    await settle();

    expect(server.openConnections()).toHaveLength(1);
    expect(server.connections).toHaveLength(2);
    for (const tab of opened) {
      const session = server.sessions.find((s) => s.id === sessionOf(tab));
      expect(session?.connectionId).toBe("connection-2");
    }
  });

  it("reopens the connection when the backend answers it does not know it", async () => {
    server.unknownConnectionAnswers = 1;
    const tab = await openTab();
    expect(tab.api.sessionId.value).toBeUndefined();

    await vi.advanceTimersByTimeAsync(500);
    await settle();
    await vi.advanceTimersByTimeAsync(500);
    await settle();

    expect(server.connections).toHaveLength(2);
    expect(server.openConnections()).toHaveLength(1);
    const session = server.sessions.find((s) => s.id === sessionOf(tab));
    expect(session?.connectionId).toBe("connection-2");
  });

  it("opens a new session for a tab whose session the backend ended alone", async () => {
    const [ended, kept] = await openTabs(2);
    await ended!.api.setPage("orders");
    const endedSession = sessionOf(ended!);
    const keptSession = sessionOf(kept!);

    server.send(endedSession, "session-ended", { sessionId: endedSession });
    await settle();

    expect(sessionOf(ended!)).toBeDefined();
    expect(sessionOf(ended!)).not.toBe(endedSession);
    expect(sessionOf(kept!)).toBe(keptSession);
    expect(server.connections).toHaveLength(1);
    expect(server.pageCalls.at(-1)).toEqual({
      sessionId: sessionOf(ended!),
      pageId: "orders",
    });
  });

  it("never shares a connection between two users", async () => {
    const mine = await openTab(USER_ID);
    const theirs = await openTab(OTHER_USER_ID);

    expect(server.openConnections()).toHaveLength(2);
    const connectionOf = (tab: Tab) =>
      server.sessions.find((s) => s.id === sessionOf(tab))?.connectionId;
    expect(connectionOf(mine)).not.toBe(connectionOf(theirs));
  });

  it("falls back to a connection per tab without Web Locks", async () => {
    const first = await openTab();
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.stubGlobal("useDmsUserSession", () => ({
      loggedIn: ref(true),
      user: ref({ _id: USER_ID }),
    }));
    vi.resetModules();
    const module = await import(
      "../layers/dms-core/app/composables/realtime/useUserRealtime"
    );
    const isolated = module.useUserRealtime();
    await settle();

    expect(server.openConnections()).toHaveLength(2);
    expect(isolated.sessionId.value).toBeDefined();
    expect(isolated.sessionId.value).not.toBe(sessionOf(first));
  });
});
