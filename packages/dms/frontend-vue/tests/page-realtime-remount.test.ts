import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed,
  effectScope,
  nextTick,
  onScopeDispose,
  ref,
  toValue,
  watch,
  type EffectScope,
} from "vue";
import type { UserRealtimeApi } from "../layers/dms-core/app/composables/realtime/useUserRealtime";

const BASE_URL = "http://api";
const USER_STREAM_URL = `${BASE_URL}/api/realtime/user`;
const SUBSCRIBE_URL_PREFIX = `${BASE_URL}/api/realtime/subscribe/`;
const UNSUBSCRIBE_URL = `${BASE_URL}/api/realtime/unsubscribe`;
const PAGE_ID = "lang.translations";
const OTHER_PAGE_ID = "lang.overview";
const SESSION_ID = "session-1";

type PageCall = () => void;

interface FakeServer {
  /** The page the server holds the session's topics for. */
  page: string | null;
  isHoldingCalls: boolean;
  heldCalls: PageCall[];
}

const encoder = new TextEncoder();

const openUserStream = () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: hello\ndata: ${JSON.stringify({ sessionId: SESSION_ID })}\n\n`,
        ),
      );
    },
  });
  return { ok: true, status: 200, body };
};

const applyPageCall = (server: FakeServer, url: string): void => {
  server.page =
    url === UNSUBSCRIBE_URL ? null : url.slice(SUBSCRIBE_URL_PREFIX.length);
};

const installFetch = (server: FakeServer): void => {
  globalThis.fetch = vi.fn(async (url: string) => {
    if (url === USER_STREAM_URL) return openUserStream();
    if (!server.isHoldingCalls) {
      applyPageCall(server, url);
      return { ok: true, status: 200 };
    }
    await new Promise<void>((resolve) =>
      server.heldCalls.push(() => {
        applyPageCall(server, url);
        resolve();
      }),
    );
    return { ok: true, status: 200 };
  }) as unknown as typeof fetch;
};

const settle = async (): Promise<void> => {
  for (let round = 0; round < 5; round += 1) {
    await vi.advanceTimersByTimeAsync(0);
    await nextTick();
  }
};

const realFetch = globalThis.fetch;
let loggedIn = ref(false);
let server: FakeServer;
let user: UserRealtimeApi;
let mountPage: (pageId: string) => EffectScope;

const releaseHeldCalls = async (): Promise<void> => {
  server.isHoldingCalls = false;
  while (server.heldCalls.length) {
    server.heldCalls.shift()!();
    await settle();
  }
};

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubEnv("SSR", false);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("toValue", toValue);
  vi.stubGlobal("onScopeDispose", onScopeDispose);
  vi.stubGlobal("useDmsState", (_key: string, init: () => unknown) =>
    ref(init()),
  );
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { baseURL: BASE_URL } },
  }));
  vi.stubGlobal("useDmsUserSession", () => ({ loggedIn }));
  vi.stubGlobal("useSessionRecovery", () => ({
    refreshSession: async () => true,
    redirectToAuth: async () => {},
  }));
  server = { page: null, isHoldingCalls: false, heldCalls: [] };
  installFetch(server);
  loggedIn = ref(true);
  const userModule = await import(
    "../layers/dms-core/app/composables/realtime/useUserRealtime"
  );
  vi.stubGlobal("useUserRealtime", userModule.useUserRealtime);
  const pageModule = await import(
    "../layers/dms-core/app/composables/realtime/usePageRealtime"
  );
  user = userModule.useUserRealtime();
  mountPage = (pageId) => {
    const scope = effectScope(true);
    scope.run(() => pageModule.usePageRealtime(pageId));
    return scope;
  };
  await settle();
});

afterEach(async () => {
  loggedIn.value = false;
  await settle();
  globalThis.fetch = realFetch;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("usePageRealtime remount at the same path", () => {
  it("keeps the page when the new instance mounts before the old one unmounts", async () => {
    const previous = mountPage(PAGE_ID);
    await settle();
    expect(server.page).toBe(PAGE_ID);

    const next = mountPage(PAGE_ID);
    previous.stop();
    await settle();

    expect(user.pageId.value).toBe(PAGE_ID);
    expect(server.page).toBe(PAGE_ID);
    next.stop();
    await settle();
    expect(server.page).toBeNull();
  });

  it("re-subscribes when the new instance mounts while the old unsubscribe is in flight", async () => {
    const previous = mountPage(PAGE_ID);
    await settle();

    server.isHoldingCalls = true;
    previous.stop();
    await settle();
    const next = mountPage(PAGE_ID);
    await settle();
    await releaseHeldCalls();

    expect(user.pageId.value).toBe(PAGE_ID);
    expect(server.page).toBe(PAGE_ID);
    next.stop();
    await settle();
  });

  it("keeps the new page when navigating away unmounts the old one last", async () => {
    const previous = mountPage(OTHER_PAGE_ID);
    await settle();

    const next = mountPage(PAGE_ID);
    await settle();
    previous.stop();
    await settle();

    expect(user.pageId.value).toBe(PAGE_ID);
    expect(server.page).toBe(PAGE_ID);
    next.stop();
    await settle();
  });
});
