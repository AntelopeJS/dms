// @vitest-environment jsdom
/**
 * The onboarding status the global middleware reads while a server renders a
 * page reaches the browser with the page, through the runtime's real state
 * transfer: the browser's run of the middleware asks nothing.
 */
import { createApp, createSSRApp, defineComponent, h, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { App } from "vue";
import type { DmsFrontendRuntime } from "#dms/frontend-module";

const engine = await import("#dms/frontend-module");
vi.stubGlobal("useDmsState", engine.useDmsState);
vi.stubGlobal("defineDmsMiddleware", engine.defineDmsMiddleware);
vi.stubGlobal("navigateDms", engine.navigateDms);
vi.stubGlobal("useUserSession", () => ({ loggedIn: { value: true } }));
vi.stubGlobal("useHomepage", () => "/dashboard");

const $authFetch = vi.fn(async () => ({ has_onboarded: true }));
vi.stubGlobal("useAuthFetch", () => ({ $authFetch }));
// The status is read once per app however many callers ask (the preload
// started with the app, the middleware).
// No DMS app runs here: each runtime holds the deduper on a state of its own.
vi.stubGlobal(
  "useDmsApp",
  () => engine.useDmsState("onboarding-test-app", () => ({})).value,
);
const { createTrailingDeduper } = await import(
  "../layers/dms-core/app/utils/trailingDeduper"
);
vi.stubGlobal("createTrailingDeduper", createTrailingDeduper);
const { useTrailingDeduper } = await import(
  "../layers/dms-core/app/composables/useTrailingDeduper"
);
vi.stubGlobal("useTrailingDeduper", useTrailingDeduper);

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
    const info = engine.useDmsState<{ hasOnboarded: boolean } | null>(
      "dms-onboarding-info",
    );
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
  const serverApp = createSSRApp(Page);
  attach(serverApp, server);
  expect(await renderToString(serverApp)).toBe("<p>onboarded</p>");
  expect($authFetch).toHaveBeenCalledTimes(1);
  const payload = structuredClone(engine.serializeDmsPayload(server));
  expect(payload.state["dms-onboarding-info"]).toEqual({ hasOnboarded: true });

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
