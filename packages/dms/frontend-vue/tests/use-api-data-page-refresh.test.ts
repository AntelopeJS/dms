// @vitest-environment jsdom
/**
 * `useApiData(…, { refreshOnPageRefresh: true })`, through the runtime's real
 * async data: a page refresh reads it again, once for every caller of one
 * request, at once on an action of the user and through the Live / Pause
 * gate otherwise; a read without the option, or unmounted, stays as it is.
 */
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  refreshLivePageBlocks,
  refreshPageBlocks,
} from "../layers/dms-ui/app/utils/blockRefresh";
import { createPageLiveController } from "../layers/dms-ui/app/build/composables/live/pageLiveController";
import { setCurrentPageLive } from "../layers/dms-ui/app/build/composables/live/currentPageLive";
import { registerPageReadsRefresh } from "../layers/dms-ui/app/build/composables/blocks/refreshPageReads";

const engine = await import("#dms/frontend-module");
vi.stubGlobal("useDmsFetch", engine.useDmsFetch);
vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
const requests: string[] = [];
vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => {
    requests.push(url);
    await new Promise((done) => setTimeout(done, 5));
    return { url, read: requests.length };
  },
}));
const { useApiData } = await import(
  "../layers/dms-core/app/composables/auth/useApiData"
);

// What dms-ui's plugin installs once per application.
registerPageReadsRefresh();

const settle = () => new Promise((done) => setTimeout(done, 30));
const apps: App[] = [];

function mount(setup: () => void): App {
  const runtime = engine.createDmsFrontendRuntime(undefined, {});
  const app = createApp(
    defineComponent({
      setup() {
        setup();
        return () => h("div");
      },
    }),
  );
  engine.provideDmsFrontendRuntime(app, runtime);
  app.mount(document.createElement("div"));
  apps.push(app);
  return app;
}

const count = (url: string) => requests.filter((sent) => sent === url).length;

beforeEach(() => {
  requests.length = 0;
});

afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  setCurrentPageLive(null);
  window.localStorage.clear();
});

afterAll(() => vi.unstubAllGlobals());

describe("useApiData with refreshOnPageRefresh", () => {
  it("reads again on a page refresh, once for the callers of one request", async () => {
    mount(() => {
      useApiData("/api/overview", { refreshOnPageRefresh: true });
      useApiData("/api/overview", { refreshOnPageRefresh: true });
      useApiData("/api/settings");
    });
    await settle();
    expect(requests.sort()).toEqual(["/api/overview", "/api/settings"]);

    refreshPageBlocks();
    await settle();
    expect(count("/api/overview")).toBe(2);
    expect(count("/api/settings")).toBe(1);
  });

  it("follows the page in the handler form too", async () => {
    let data: { value: unknown } | undefined;
    mount(() => {
      ({ data } = useApiData(
        "board",
        ({ $authFetch, signal }) => $authFetch("/api/board", { signal }),
        { refreshOnPageRefresh: true },
      ));
    });
    await settle();
    expect(data?.value).toEqual({ url: "/api/board", read: 1 });

    refreshPageBlocks();
    await settle();
    expect(data?.value).toEqual({ url: "/api/board", read: 2 });
  });

  it("leaves a read that never ran as it is", async () => {
    let execute: (() => Promise<void>) | undefined;
    mount(() => {
      ({ execute } = useApiData("/api/details", {
        immediate: false,
        refreshOnPageRefresh: true,
      }));
    });
    await settle();
    refreshPageBlocks();
    await settle();
    expect(count("/api/details")).toBe(0);

    await execute?.();
    refreshPageBlocks();
    await settle();
    expect(count("/api/details")).toBe(2);
  });

  it("stops following the page once its component unmounts", async () => {
    const app = mount(() => {
      useApiData("/api/health", { refreshOnPageRefresh: true });
    });
    await settle();
    app.unmount();
    apps.splice(apps.indexOf(app), 1);
    await nextTick();

    refreshPageBlocks();
    await settle();
    expect(count("/api/health")).toBe(1);
  });

  it("goes through the Live / Pause gate on a refresh nobody asked for", async () => {
    const live = createPageLiveController("saas.workspace", {});
    setCurrentPageLive(live);
    mount(() => {
      useApiData("/api/traffic", { refreshOnPageRefresh: true });
    });
    await settle();

    live.pause();
    refreshLivePageBlocks();
    refreshLivePageBlocks();
    await settle();
    expect(count("/api/traffic")).toBe(1);

    live.resume();
    await settle();
    expect(count("/api/traffic")).toBe(2);

    // An action of the user reads at once, paused or not.
    live.pause();
    refreshPageBlocks();
    await settle();
    expect(count("/api/traffic")).toBe(3);
    live.dispose();
  });
});
