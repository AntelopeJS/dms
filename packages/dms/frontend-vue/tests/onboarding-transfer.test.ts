// @vitest-environment jsdom
/**
 * The onboarding status the global middleware reads while a server renders a
 * page reaches the browser with the page, through the runtime's real async
 * data: the server reads it inside an async data handler (no
 * untransferred-read warning), and the browser's run of the middleware asks
 * nothing.
 */
import { createApp, createSSRApp, defineComponent, h, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { App } from "vue";
import type { DmsFrontendRuntime } from "#dms/frontend-module";

const engine = await import("#dms/frontend-module");
vi.stubGlobal("useDmsState", engine.useDmsState);
vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
vi.stubGlobal("useDmsFetch", engine.useDmsFetch);
vi.stubGlobal("useDmsData", engine.useDmsData);
vi.stubGlobal("defineDmsMiddleware", engine.defineDmsMiddleware);
vi.stubGlobal("navigateDms", engine.navigateDms);
vi.stubGlobal("useDmsUserSession", () => ({ loggedIn: { value: true } }));
vi.stubGlobal("useHomepage", () => "/dashboard");

// Whether the code running is an async data handler's, as the server
// renderer tracks it: what the runtime's untransferred-read warning checks.
let inHandler = false;
const readsInHandler: boolean[] = [];
const $authFetch = vi.fn(async () => {
  readsInHandler.push(inHandler);
  return { has_onboarded: true };
});
vi.stubGlobal("useAuthFetch", () => ({ $authFetch }));
const { useApiData } = await import(
  "../layers/dms-core/app/composables/auth/useApiData"
);
vi.stubGlobal("useApiData", useApiData);

const { useOnboarding } = await import(
  "../layers/dms-onboarding/app/composables/onboarding/useOnboarding"
);
vi.stubGlobal("useOnboarding", useOnboarding);
const { default: onboardingMiddleware } = await import(
  "../layers/dms-onboarding/app/middleware/onboarding.global"
);

const Page = defineComponent({
  setup() {
    engine.defineDmsPageMeta({});
    const info = engine.useDmsData<{ hasOnboarded: boolean }>(
      "dms-onboarding",
    ).data;
    return () => h("p", info.value?.hasOnboarded ? "onboarded" : "unknown");
  },
});

const mounted: App[] = [];

function attach(app: App, runtime: DmsFrontendRuntime): void {
  runtime.route.path = "/dashboard";
  runtime.route.fullPath = "/dashboard";
  engine.provideDmsFrontendRuntime(app, runtime);
}

beforeEach(async () => {
  $authFetch.mockClear();
  readsInHandler.length = 0;
  await engine.setupFrontendModules([
    {
      options: { public: {} },
      module: {
        setup(sdk) {
          sdk.registerMiddleware("onboarding", onboardingMiddleware, {
            global: true,
          });
        },
      },
    },
  ]);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

it("hands the onboarding status the server read to the browser", async () => {
  const server = engine.createDmsFrontendRuntime(undefined, {}, true);
  server.runAsyncDataHandler = (run) => {
    inHandler = true;
    try {
      return run();
    } finally {
      inHandler = false;
    }
  };
  server.inAsyncDataHandler = () => inHandler;
  const serverApp = createSSRApp(Page);
  attach(serverApp, server);
  expect(await renderToString(serverApp)).toBe("<p>onboarded</p>");
  expect($authFetch).toHaveBeenCalledTimes(1);
  expect(readsInHandler).toEqual([true]);
  const payload = structuredClone(engine.serializeDmsPayload(server));
  expect(payload.data["dms-onboarding"]).toEqual({ hasOnboarded: true });

  $authFetch.mockClear();
  const browser = engine.createDmsFrontendRuntime(undefined, {});
  engine.restoreDmsPayload(browser, payload);
  const browserApp = createApp(Page);
  attach(browserApp, browser);
  const host = document.createElement("div");
  browserApp.mount(host);
  mounted.push(browserApp);
  await nextTick();
  await new Promise((done) => setTimeout(done, 0));

  expect($authFetch).not.toHaveBeenCalled();
  expect(host.textContent).toBe("onboarded");
});
