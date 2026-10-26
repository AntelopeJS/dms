/** @vitest-environment jsdom */
/**
 * A relative preset (`last-24h`) in a server render and in the browser that
 * hydrates it, through the runtime's real async data: both resolve the period
 * from the instant the server rendered at, so the browser hydrates the same
 * bounds, key and card data without asking again, whatever time it is when
 * it hydrates. Anywhere else, the period follows the browser's clock.
 */
import {
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  type App,
  type Component,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  browserTimeZone,
  setReaderTimeZoneSource,
} from "../layers/dms-core/app/utils/regional";

const engine = await import("#dms/frontend-module");
vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
vi.stubGlobal("useDmsFetch", engine.useDmsFetch);
vi.stubGlobal("useDmsState", engine.useDmsState);
vi.stubGlobal("isDmsHydrating", engine.isDmsHydrating);
vi.stubGlobal("useDmsCookie", engine.useDmsCookie);

const requests: string[] = [];
vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => {
    requests.push(url);
    return {
      value: new URL(url, "http://dms.local").searchParams.get("to"),
    };
  },
}));

const { useApiData } = await import(
  "../layers/dms-core/app/composables/auth/useApiData"
);
vi.stubGlobal("useApiData", useApiData);
const { usePeriod } = await import(
  "../layers/dms-core/app/composables/period/usePeriod"
);
const { registerPeriodScope } = await import(
  "../layers/dms-core/app/composables/period/usePeriodScope"
);
const { TIME_ZONE_COOKIE, useTimeZoneCookie } = await import(
  "../layers/dms-core/app/composables/period/periodTimeZone"
);
setReaderTimeZoneSource(() => useTimeZoneCookie().value);
const ZONE_COOKIE = `${TIME_ZONE_COOKIE}=${encodeURIComponent(JSON.stringify(browserTimeZone()))}`;

document.cookie = ZONE_COOKIE;
const { useChartFetch } = await import(
  "../layers/dms-ui/app/composables/chart/useChartFetch"
);

const SCOPE = "ops";
const SERVER_NOW = new Date("2026-10-15T10:00:30.000Z");

const HYDRATION_DELAY_MS = 90_000;

const Selector = defineComponent({
  setup() {
    const period = usePeriod({ defaultPreset: "last-24h" });
    onBeforeUnmount(registerPeriodScope(SCOPE, period.state));
    return () => h("i", period.state.value.key);
  },
});

const Card = defineComponent({
  setup() {
    const { data, isLoading } = useChartFetch<{ value: string }>({
      fetchUrl: "/api/errors",
      periodScope: SCOPE,
    });
    return () =>
      h("p", isLoading.value ? "SKELETON" : `to:${data.value?.value}`);
  },
});

const Page: Component = {
  render: () => h("main", [h(Selector), h(Card)]),
};

const mounted: App[] = [];

beforeEach(() => {
  requests.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SERVER_NOW);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.useRealTimers();
});

async function serverRender() {
  const runtime = engine.createDmsFrontendRuntime(
    undefined,
    {},
    true,
    ZONE_COOKIE,
  );
  const app = createSSRApp(Page);
  engine.provideDmsFrontendRuntime(app, runtime);
  engine.setDmsServerRuntimeResolver(() => runtime);

  const browserWindow = globalThis.window;
  vi.stubGlobal("window", undefined);
  try {
    const html = await renderToString(app);
    return { html, payload: engine.serializeDmsPayload(runtime) };
  } finally {
    vi.stubGlobal("window", browserWindow);
  }
}

async function hydrate(html: string, payload: unknown) {
  const browser = engine.createDmsFrontendRuntime(undefined, {});
  engine.restoreDmsPayload(
    browser,
    structuredClone(payload) as Parameters<typeof engine.restoreDmsPayload>[1],
  );
  const container = document.createElement("div");
  container.innerHTML = html;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const app = createSSRApp(Page);
  engine.provideDmsFrontendRuntime(app, browser);
  app.mount(container);
  mounted.push(app);
  await nextTick();
  await new Promise((done) => setTimeout(done, 300));
  const mismatches = [...warn.mock.calls, ...error.mock.calls].filter((call) =>
    /hydration/i.test(String(call[0])),
  );
  warn.mockRestore();
  error.mockRestore();
  return { container, mismatches };
}

describe("a relative preset across a server render and its hydration", () => {
  it("renders the card's data with the server's instant", async () => {
    const { html } = await serverRender();

    expect(html).toContain(`to:${SERVER_NOW.toISOString()}`);
    expect(html).toContain(`|${SERVER_NOW.toISOString()}|`);
    expect(requests).toHaveLength(1);
  });

  it("hydrates the same bounds later on: no request, no mismatch", async () => {
    const { html, payload } = await serverRender();
    requests.length = 0;
    vi.setSystemTime(SERVER_NOW.getTime() + HYDRATION_DELAY_MS);

    const { container, mismatches } = await hydrate(html, payload);

    expect(mismatches).toEqual([]);
    expect(requests).toEqual([]);
    expect(container.innerHTML).toBe(html);
  });

  it("follows the browser's clock on a client mount", async () => {
    const later = SERVER_NOW.getTime() + HYDRATION_DELAY_MS;
    vi.setSystemTime(later);
    const app = createApp(Selector);
    engine.provideDmsFrontendRuntime(
      app,
      engine.createDmsFrontendRuntime(undefined, {}),
    );
    const root = document.createElement("div");
    app.mount(root);
    mounted.push(app);

    expect(root.textContent).toContain(`|${new Date(later).toISOString()}|`);
  });
});
