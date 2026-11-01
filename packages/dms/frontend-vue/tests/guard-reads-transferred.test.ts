/** @vitest-environment jsdom */
/**
 * The two reads a server render's guards make, the onboarding status and the
 * permission set, go through the renderer's data layer: on a runtime set up
 * as the renderer's SSR entry sets it up (handler tracking, development
 * warnings), the render reads each once, warns about no read the page would
 * not carry, and the browser hydrating the page, then navigating, asks for
 * neither again.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import {
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  type App,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dmsAppContext } from "./fixtures/dmsAppContext";
import type {
  DmsAppContext,
  DmsFrontendRuntime,
  DmsPayload,
} from "#dms/frontend-module";

const engine = await import("#dms/frontend-module");
const { createTrailingDeduper } = await import(
  "../layers/dms-core/app/utils/trailingDeduper"
);
for (const name of [
  "useDmsState",
  "useDmsApp",
  "useDmsRoute",
  "useDmsAsyncData",
  "useDmsFetch",
  "useDmsData",
  "refreshDmsData",
  "defineDmsMiddleware",
  "defineDmsPlugin",
  "useDmsError",
  "abortDmsNavigation",
  "navigateDms",
] as const) {
  vi.stubGlobal(name, engine[name]);
}
vi.stubGlobal("createTrailingDeduper", createTrailingDeduper);
vi.stubGlobal("useDmsRuntimeConfig", () => ({ public: { dms: {} } }));
vi.stubGlobal("useHomepage", () => "/home");
vi.stubGlobal("useDmsUserSession", () => ({
  loggedIn: { value: true },
  user: { value: { isValidated: true } },
}));
vi.stubGlobal("useSiteLayout", () => ({
  siteLayout: { value: {} },
  findMatchingRoute: () => ({ metadata: {} }),
}));

const ONBOARDING = "/api/onboarding/informations";
const PERMISSIONS = "/dms/permissions";
const ANSWERS = {
  [ONBOARDING]: { has_onboarded: true },
  [PERMISSIONS]: ["orders.read"],
};
const asked: string[] = [];

// oxlint-disable-next-line anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- The URL-dispatched test backend cannot implement the transport's caller-selected generic response type; it returns these two raw endpoint payloads, not arbitrary T.
const backend = vi.fn(async (url: string) => {
  asked.push(url);
  return Object.entries(ANSWERS).find(([path]) => path === url)?.[1];
}) as unknown as NonNullable<DmsFrontendRuntime["serverFetch"]>;
vi.stubGlobal("useAuthFetch", () => ({ $authFetch: engine.$fetch }));

const { useTrailingDeduper } = await import(
  "../layers/dms-core/app/composables/useTrailingDeduper"
);
vi.stubGlobal("useTrailingDeduper", useTrailingDeduper);
const { useApiData } = await import(
  "../layers/dms-core/app/composables/auth/useApiData"
);
vi.stubGlobal("useApiData", useApiData);
const { usePermissions } = await import(
  "../layers/dms-core/app/composables/auth/usePermissions"
);
vi.stubGlobal("usePermissions", usePermissions);
const { useOnboarding } = await import(
  "../layers/dms-onboarding/app/composables/onboarding/useOnboarding"
);
vi.stubGlobal("useOnboarding", useOnboarding);
const { default: onboardingMiddleware } = await import(
  "../layers/dms-onboarding/app/middleware/onboarding.global"
);
const { default: authMiddleware } = await import(
  "../layers/dms-auth/app/middleware/auth"
);
const { default: onboardingPreload } = await import(
  "../layers/dms-onboarding/app/plugins/onboarding-preload"
);
const { default: permissionsPreload } = await import(
  "../layers/dms-auth/app/plugins/permissions-preload"
);

const Page = defineComponent({
  setup() {
    engine.defineDmsPageMeta({ auth: true });
    const { hasPermission } = usePermissions();
    return () =>
      h("p", hasPermission("orders.read") ? "can read" : "cannot read");
  },
});

const settle = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/** Attaches `runtime` to `app` the way the DMS app does, and runs its plugins. */
function install(app: App, runtime: DmsFrontendRuntime): void {
  const context: DmsAppContext = {
    ...dmsAppContext(app),
    runWithContext: app.runWithContext.bind(app),
  };
  app.config.globalProperties.$dms = context;
  runtime.appContext = context;
  runtime.route.path = "/orders";
  runtime.route.fullPath = "/orders";
  runtime.route.matched = [{}];
  engine.provideDmsFrontendRuntime(app, runtime);
  for (const plugin of [onboardingPreload, permissionsPreload])
    app.runWithContext(() => plugin(context));
}

/** A server render, its runtime set up as the renderer's SSR entry does. */
async function serverRender(): Promise<{ html: string; payload: DmsPayload }> {
  const handlers = new AsyncLocalStorage<boolean>();
  const runtime = engine.createDmsFrontendRuntime(backend, {}, true);
  runtime.runAsyncDataHandler = (run) => handlers.run(true, run);
  runtime.inAsyncDataHandler = () => handlers.getStore() === true;
  runtime.devWarnings = true;
  const app = createSSRApp(Page);
  install(app, runtime);
  const html = await renderToString(app);
  return {
    html,
    payload: structuredClone(engine.serializeDmsPayload(runtime)),
  };
}

const mounted: App[] = [];
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  asked.length = 0;
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  await engine.setupFrontendModules([
    {
      options: { public: {} },
      module: {
        setup(sdk) {
          sdk.registerMiddleware("auth", authMiddleware);
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
  warn.mockRestore();
});

describe("the reads of a server render's guards", () => {
  it("are read once and carried by the page, with no warning", async () => {
    const { html, payload } = await serverRender();

    expect(html).toContain("can read");
    expect(asked.sort()).toEqual([ONBOARDING, PERMISSIONS].sort());
    const warnings = warn.mock.calls.map((call) => String(call[0]));
    expect(
      warnings.filter((message) =>
        message.includes("was read during a server render"),
      ),
    ).toEqual([]);
    expect(JSON.stringify(payload.data)).toContain("orders.read");
    expect(JSON.stringify(payload.data)).toContain("hasOnboarded");
  });

  it("are not read again by the browser, hydrating then navigating", async () => {
    const { html, payload } = await serverRender();
    asked.length = 0;

    const runtime = engine.createDmsFrontendRuntime(backend);
    engine.restoreDmsPayload(runtime, payload);
    const host = document.createElement("div");
    host.innerHTML = html;
    const app = createSSRApp(Page);
    install(app, runtime);
    app.mount(host);
    mounted.push(app);
    await settle();
    expect(host.textContent).toBe("can read");
    expect(asked).toEqual([]);

    runtime.hydrating = false;
    await app.runWithContext(async () => {
      await onboardingMiddleware(runtime.route, runtime.route);
      await usePermissions().loadPermissions();
    });
    await settle();
    expect(asked).toEqual([]);
  });

  it("let a refresh read the set again, and a cleared set load anew", async () => {
    const runtime = engine.createDmsFrontendRuntime(backend);

    const app = createApp(Page);
    install(app, runtime);
    await settle();
    expect(asked.sort()).toEqual([ONBOARDING, PERMISSIONS].sort());
    asked.length = 0;

    const permissions = app.runWithContext(() => usePermissions());
    await app.runWithContext(() => permissions.fetchPermissions());
    expect(asked).toEqual([PERMISSIONS]);

    app.runWithContext(() => permissions.clear());
    expect(permissions.isLoaded.value).toBe(false);
    expect(permissions.hasPermission("orders.read")).toBe(false);
    await app.runWithContext(() => permissions.loadPermissions());
    expect(asked).toEqual([PERMISSIONS, PERMISSIONS]);
    expect(permissions.hasPermission("orders.read")).toBe(true);
  });
});
