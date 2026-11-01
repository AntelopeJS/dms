/** @vitest-environment jsdom */
import { computed, createApp, createSSRApp, h, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KpiCard from "../layers/dms-ui/app/components/kpi/KpiCard.vue";
import {
  extraRuntime,
  provideExtraRuntime,
  registerTextBoundaries,
} from "./helpers/chart-extra-runtime";
import { registerPeriodScope } from "../layers/dms-core/app/composables/period/usePeriodScope";
import { engine } from "./helpers/api-data-runtime";
import { useUserRealtime } from "../layers/dms-core/app/composables/realtime/useUserRealtime";
import { createFakeBrowser } from "./fixtures/fakeBrowser";
import {
  BASE_URL,
  createRealtimeServer,
  installRealtimeFetch,
} from "./fixtures/realtimeServer";

type CardResponse =
  import("../layers/dms-ui/app/composables/chart/types").KpiCardResponse;
const response = ref<CardResponse | null>(null);
const requests: string[] = [];
const TREND = /\d[.,]\d\s?%/;

async function render(
  props: Partial<InstanceType<typeof KpiCard>["$props"]> = {},
) {
  const app = createSSRApp({
    render: () =>
      h(KpiCard, {
        title: "Revenue",
        componentId: "kpi",
        pageId: "page",
        compareLabel: "vs previous month",
        fetchUrl: "/revenue",
        ...props,
      }),
  });
  provideExtraRuntime(app, true);
  registerTextBoundaries(app);
  return renderToString(app);
}

beforeEach(async () => {
  requests.length = 0;
  await extraRuntime(async (url: string) => {
    requests.push(url);
    return response.value;
  });
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("a KPI card with no comparison period", () => {
  it("shows no change at all, not a 0% stand-in", async () => {
    response.value = { value: 1535, sparkline: [1, 2, 3] };
    const html = await render();
    expect(html).not.toMatch(TREND);
    expect(html).not.toContain("●");
  });

  it("drops the comparison label, which names a period it does not compare", async () => {
    response.value = { value: 1535 };
    const html = await render();
    expect(html).not.toContain("vs previous month");
  });

  it("shows the description in its place", async () => {
    response.value = { value: 1535 };
    const html = await render({ description: "Paid orders" });
    expect(html).not.toContain("vs previous month");
    expect(html).toContain("Paid orders");
  });

  it("keeps the comparison label while comparing", async () => {
    response.value = { value: 1535, previousValue: 1616, delta: -5 };
    const html = await render({ description: "Paid orders" });
    expect(html).toContain("vs previous month");
  });

  it("shows a negative change only when the route answers one", async () => {
    response.value = { value: 1535 };
    const without = await render();
    response.value = { value: 1535, previousValue: 1616, delta: -5 };
    const withDelta = await render();
    expect(without).not.toMatch(TREND);
    expect(withDelta).toMatch(/-5[.,]0\s?%/);
  });

  it("still shows a real flat change while comparing", async () => {
    response.value = { value: 1535, previousValue: 1535, delta: 0 };
    expect(await render()).toContain("●");
  });

  it("shows no change in the stat variant either", async () => {
    response.value = { value: 1535, sparkline: [1, 2, 3] };
    const html = await render({ variant: "stat", showSparkline: true });
    expect(html).not.toMatch(TREND);
    expect(html).not.toContain("●");
  });

  it("hides a returned change when the card shows no change by design", async () => {
    response.value = { value: 1535, previousValue: 1616, delta: -5 };
    const html = await render({ showDelta: false, compareLabel: undefined });
    expect(html).not.toMatch(TREND);
  });
});

describe("a live KPI card", () => {
  it("reads on its realtimeTopic and follows its period scope at once", async () => {
    vi.stubEnv("SSR", false);
    createFakeBrowser().openTab().activate();
    const server = createRealtimeServer();
    installRealtimeFetch(server);
    vi.stubGlobal("useDmsRuntimeConfig", () => ({
      public: { dms: { baseURL: BASE_URL } },
    }));
    response.value = { value: 1535 };
    let unregister = () => {};
    let logout = () => {};
    const app = createApp({
      setup() {
        const session = engine.useDmsUserSession<{ _id: string }>();
        session.user.value = { _id: "kpi-reader" };
        useUserRealtime();
        logout = () => {
          session.user.value = null;
        };
        unregister = registerPeriodScope(
          "api",
          computed(() => ({
            preset: "this-month",
            comparison: "none",
            range: { from: new Date("2026-10-01"), to: new Date("2026-10-31") },
            compareRange: null,
            key: "october",
          })),
        );
        return () =>
          h(KpiCard, {
            title: "Revenue",
            componentId: "kpi",
            pageId: "page",
            fetchUrl: "/revenue",
            periodScope: "api",
            realtimeTopic: "api:requests",
          });
      },
    });
    provideExtraRuntime(app);
    registerTextBoundaries(app);
    const root = document.createElement("div");
    app.mount(root);
    try {
      await vi.waitFor(() => expect(root.textContent).toContain("1.5k"));
      await vi.waitFor(() => expect(server.sessions).toHaveLength(1));
      expect(requests).toHaveLength(1);
      expect(requests[0]).toContain("preset=this-month");
      response.value = { value: 2500 };
      server.send(server.sessions[0]!.id, "event", {
        topic: "api:requests",
        type: "request",
        ts: 1,
      });
      await vi.waitFor(() => expect(root.textContent).toContain("2.5"));
      expect(requests).toHaveLength(2);
      expect(requests[1]).toContain("preset=this-month");
    } finally {
      logout();
      await nextTick();
      app.unmount();
      unregister();
    }
  });
});
