/** @vitest-environment jsdom */
/**
 * The permission set the `auth` middleware preloads while a server renders a
 * page reaches the browser with the page, through the runtime's real async
 * data: the browser's run of the middleware finds it and asks nothing.
 * A caller that only needs a set joins a load in flight.
 */
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
import type { DmsFrontendRuntime } from "#dms/frontend-module";

const engine = await import("#dms/frontend-module");
vi.stubGlobal("useDmsState", engine.useDmsState);
vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
vi.stubGlobal("useDmsFetch", engine.useDmsFetch);
vi.stubGlobal("useDmsData", engine.useDmsData);
vi.stubGlobal("refreshDmsData", engine.refreshDmsData);
vi.stubGlobal("useDmsApp", engine.useDmsApp);
vi.stubGlobal("defineDmsMiddleware", engine.defineDmsMiddleware);
vi.stubGlobal("useDmsError", engine.useDmsError);
vi.stubGlobal("abortDmsNavigation", engine.abortDmsNavigation);
vi.stubGlobal("navigateDms", engine.navigateDms);
vi.stubGlobal("useDmsRuntimeConfig", () => ({ public: { dms: {} } }));
vi.stubGlobal("useSiteLayout", () => ({
  siteLayout: { value: {} },
  findMatchingRoute: () => ({ metadata: {} }),
}));
vi.stubGlobal("useDmsUserSession", () => ({
  loggedIn: { value: true },
  user: { value: { isValidated: true } },
}));

const { useApiData } = await import(
  "../layers/dms-core/app/composables/auth/useApiData"
);
vi.stubGlobal("useApiData", useApiData);
const { usePermissions } = await import(
  "../layers/dms-core/app/composables/auth/usePermissions"
);
vi.stubGlobal("usePermissions", usePermissions);
const { default: authMiddleware } = await import(
  "../layers/dms-auth/app/middleware/auth"
);

const PERMISSION = "orders.read";

interface PendingRequest {
  resolve: (ids: string[]) => void;
  reject: (reason: Error) => void;
}

const requests: PendingRequest[] = [];

const $authFetch = vi.fn(
  () =>
    new Promise<string[]>((resolve, reject) => {
      requests.push({ resolve, reject });
    }),
);
vi.stubGlobal("useAuthFetch", () => ({ $authFetch }));

const mounted: App[] = [];

const settle = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

async function answerRequests(): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await settle();
    for (const request of requests.splice(0)) request.resolve([PERMISSION]);
  }
}

const Page = defineComponent({
  setup() {
    defineDmsPageMeta({ auth: true });
    const { hasPermission } = usePermissions();
    return () => h("p", hasPermission(PERMISSION) ? "can read" : "cannot read");
  },
});
const { defineDmsPageMeta } = engine;

/** A runtime whose app carries the DMS app context, as the real app's does. */
function attach(app: App, runtime: DmsFrontendRuntime): void {
  const context = dmsAppContext(app);
  app.config.globalProperties.$dms = context;
  runtime.appContext = context;
  runtime.route.matched = [{}];
  engine.provideDmsFrontendRuntime(app, runtime);
}

beforeEach(async () => {
  requests.length = 0;
  $authFetch.mockClear();
  await engine.setupFrontendModules([
    {
      options: { public: {} },
      module: {
        setup(sdk) {
          sdk.registerMiddleware("auth", authMiddleware);
        },
      },
    },
  ]);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

describe("permissions handed to the browser", () => {
  it("renders the page with the set the server loaded, and the browser asks nothing", async () => {
    const server = engine.createDmsFrontendRuntime(undefined, {}, true);
    const serverApp = createSSRApp(Page);
    attach(serverApp, server);
    const rendering = renderToString(serverApp);
    await answerRequests();
    expect(await rendering).toContain("can read");
    expect($authFetch).toHaveBeenCalledTimes(1);

    const payload = structuredClone(engine.serializeDmsPayload(server));
    expect(payload.data["dms-permissions"]).toMatchObject({
      ids: [PERMISSION],
    });

    $authFetch.mockClear();
    const browser = engine.createDmsFrontendRuntime(undefined, {});
    engine.restoreDmsPayload(browser, payload);
    const browserApp = createApp(Page);
    attach(browserApp, browser);
    const host = document.createElement("div");
    browserApp.mount(host);
    mounted.push(browserApp);
    await answerRequests();

    expect($authFetch).not.toHaveBeenCalled();
    expect(host.textContent).toBe("can read");
  });
});

describe("loading the permission set", () => {
  function browserPermissions() {
    const runtime = engine.createDmsFrontendRuntime();
    const app = createApp({ render: () => null });
    attach(app, runtime);
    return app.runWithContext(() => usePermissions());
  }

  it("joins a first load in flight instead of loading twice", async () => {
    const permissions = browserPermissions();
    const loads = Promise.all([
      permissions.loadPermissions(),
      permissions.loadPermissions(),
    ]);
    await answerRequests();
    await loads;

    expect($authFetch).toHaveBeenCalledTimes(1);
    expect(permissions.hasPermission(PERMISSION)).toBe(true);
  });

  it("still gives a refresh asked during a load its own pass", async () => {
    const permissions = browserPermissions();
    const runs = Promise.all([
      permissions.loadPermissions(),
      permissions.fetchPermissions(),
    ]);
    await answerRequests();
    await runs;

    expect($authFetch).toHaveBeenCalledTimes(2);
  });

  it("rejects a refresh that fails, and keeps the last set", async () => {
    const permissions = browserPermissions();
    const load = permissions.loadPermissions();
    await answerRequests();
    await load;

    const refresh = permissions.fetchPermissions();
    const outcome = refresh.then(
      () => "resolved",
      (reason: Error) => reason.message,
    );
    await settle();
    for (const request of requests.splice(0))
      request.reject(new Error("backend down"));

    expect(await outcome).toBe("backend down");
    expect(permissions.hasPermission(PERMISSION)).toBe(true);
  });

  it("loads again when the load it joined was cleared meanwhile", async () => {
    const permissions = browserPermissions();
    const first = permissions.loadPermissions();
    permissions.clear();
    const second = permissions.loadPermissions();
    await answerRequests();
    await Promise.all([first, second]);

    expect($authFetch).toHaveBeenCalledTimes(2);
    expect(permissions.isLoaded.value).toBe(true);
  });
});
