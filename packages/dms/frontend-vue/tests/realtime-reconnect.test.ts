import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref, watch } from "vue";
import type { UserRealtimeApi } from "../layers/dms-core/app/composables/realtime/useUserRealtime";

const BASE_URL = "http://api";
const USER_STREAM_URL = `${BASE_URL}/api/realtime/user`;
const SUBSCRIBE_URL_PREFIX = `${BASE_URL}/api/realtime/subscribe/`;
const SESSION_HEADER = "x-realtime-session";
const PAGE_ID = "orders";
const INITIAL_DELAY_MS = 500;
const SECOND_DELAY_MS = 1000;
const LONG_WAIT_MS = 120_000;

interface FakeStream {
  signal: AbortSignal;
  end(): void;
  isOpen(): boolean;
}

interface PageSubscription {
  pageId: string;
  sessionId: string;
}

interface FakeServer {
  streams: FakeStream[];
  subscriptions: PageSubscription[];
  maxOpenStreams: number;
  isDown: boolean;
}

const encoder = new TextEncoder();

const helloFrame = (sessionId: string): Uint8Array =>
  encoder.encode(`event: hello\ndata: ${JSON.stringify({ sessionId })}\n\n`);

const openStreamCount = (server: FakeServer): number =>
  server.streams.filter((stream) => stream.isOpen()).length;

const openUserStream = (server: FakeServer, signal: AbortSignal) => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let isOpen = true;
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
    cancel() {
      isOpen = false;
    },
  });
  signal.addEventListener("abort", () => {
    isOpen = false;
  });
  server.streams.push({
    signal,
    end: () => {
      isOpen = false;
      controller.close();
    },
    isOpen: () => isOpen && !signal.aborted,
  });
  server.maxOpenStreams = Math.max(
    server.maxOpenStreams,
    openStreamCount(server),
  );
  controller.enqueue(helloFrame(`session-${server.streams.length}`));
  return { ok: true, status: 200, body };
};

const installFetch = (server: FakeServer): void => {
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === USER_STREAM_URL) {
      if (server.isDown) throw new Error("connection refused");
      return openUserStream(server, init!.signal!);
    }
    const headers = init?.headers as Record<string, string>;
    server.subscriptions.push({
      pageId: url.slice(SUBSCRIBE_URL_PREFIX.length),
      sessionId: headers[SESSION_HEADER]!,
    });
    return { ok: true, status: 200 };
  }) as unknown as typeof fetch;
};

const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
  await nextTick();
  await vi.advanceTimersByTimeAsync(0);
};

const realFetch = globalThis.fetch;
let loggedIn = ref(false);
let server: FakeServer;

const loadApi = async (): Promise<UserRealtimeApi> => {
  const module = await import(
    "../layers/dms-core/app/composables/realtime/useUserRealtime"
  );
  return module.useUserRealtime();
};

const lastStream = (): FakeStream => server.streams[server.streams.length - 1]!;

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
  vi.stubGlobal("useUserSession", () => ({ loggedIn }));
  vi.stubGlobal("useSessionRecovery", () => ({
    refreshSession: async () => true,
    redirectToAuth: async () => {},
  }));
  server = { streams: [], subscriptions: [], maxOpenStreams: 0, isDown: false };
  installFetch(server);
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
    expect(server.subscriptions).toEqual([
      { pageId: PAGE_ID, sessionId: "session-1" },
    ]);

    lastStream().end();
    await settle();
    expect(api.sessionId.value).toBeUndefined();
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS - 1);
    expect(server.streams).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(server.streams).toHaveLength(2);
    expect(api.sessionId.value).toBe("session-2");
    expect(server.subscriptions).toEqual([
      { pageId: PAGE_ID, sessionId: "session-1" },
      { pageId: PAGE_ID, sessionId: "session-2" },
    ]);
  });

  it("backs off further while the server stays unreachable", async () => {
    await loadApi();
    await settle();
    server.isDown = true;

    lastStream().end();
    await settle();
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);
    await settle();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);

    server.isDown = false;
    await vi.advanceTimersByTimeAsync(SECOND_DELAY_MS - 1);
    expect(server.streams).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(server.streams).toHaveLength(2);
    expect(lastStream().isOpen()).toBe(true);
  });

  it("does not reconnect after an intentional close", async () => {
    await loadApi();
    await settle();
    const stream = lastStream();

    loggedIn.value = false;
    await settle();
    expect(stream.signal.aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);
    await settle();
    expect(server.streams).toHaveLength(1);
  });

  it("never holds more than one stream at a time", async () => {
    await loadApi();
    await settle();

    for (let cycle = 0; cycle < 3; cycle += 1) {
      lastStream().end();
      await settle();
      await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);
      await settle();
    }
    loggedIn.value = false;
    await settle();
    loggedIn.value = true;
    await settle();

    expect(server.streams).toHaveLength(5);
    expect(server.maxOpenStreams).toBe(1);
    expect(openStreamCount(server)).toBe(1);
  });
});
