/**
 * A server render of a dashboard, through the runtime's real async data: a
 * card bound to a period scope renders its data when the server resolves the
 * period as the browser will (in the browser's time zone, read in its cookie;
 * a selector set up before the card), and its placeholder
 * otherwise, requesting nothing. Each request has its scopes.
 */
import { createSSRApp, defineComponent, h, ref, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PeriodPreset } from "../layers/dms-core/app/composables/period/types";
import {
  browserTimeZone,
  setReaderTimeZoneSource,
} from "../layers/dms-core/app/utils/regional";

const engine = await import("#dms/frontend-module");
vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
vi.stubGlobal("useDmsFetch", engine.useDmsFetch);
vi.stubGlobal("useDmsState", engine.useDmsState);
vi.stubGlobal("useDmsCookie", engine.useDmsCookie);

const requests: string[] = [];
vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => {
    requests.push(url);
    await new Promise((done) => setTimeout(done, 5));
    return {
      value: new URL(url, "http://dms.local").searchParams.get("preset"),
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
const { zonedClock } = await import(
  "../layers/dms-core/app/composables/period/periodClock"
);

setReaderTimeZoneSource(() => useTimeZoneCookie().value);
const { useChartFetch } = await import(
  "../layers/dms-ui/app/composables/chart/useChartFetch"
);

const SCOPE = "dashboard";

function selector(preset: PeriodPreset): Component {
  return defineComponent({
    setup() {
      const period = usePeriod({ defaultPreset: preset });
      registerPeriodScope(SCOPE, period.state);
      return () => h("i");
    },
  });
}

const Card = defineComponent({
  setup() {
    const { data, isLoading } = useChartFetch<{ value: string }>({
      fetchUrl: "/api/kpi",
      periodScope: SCOPE,
    });
    return () =>
      h("p", isLoading.value ? "SKELETON" : `value:${data.value?.value}`);
  },
});

function zoneCookie(zone: string): string {
  return `${TIME_ZONE_COOKIE}=${encodeURIComponent(JSON.stringify(zone))}`;
}

async function serverRender(children: Component[], cookies?: string) {
  const runtime = engine.createDmsFrontendRuntime(undefined, {}, true, cookies);
  const app = createSSRApp({
    render: () =>
      h(
        "main",
        children.map((c) => h(c)),
      ),
  });
  engine.provideDmsFrontendRuntime(app, runtime);
  engine.setDmsServerRuntimeResolver(() => runtime);
  const html = await renderToString(app);
  return { html, payload: engine.serializeDmsPayload(runtime) };
}

beforeEach(() => {
  requests.length = 0;
});

describe("a period-scoped card in a server render", () => {
  it("renders its data with the period the browser resolves, and hands it over", async () => {
    const { html, payload } = await serverRender(
      [selector("this-month"), Card],
      zoneCookie(browserTimeZone()),
    );

    expect(html).toContain("value:this-month");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatch(
      /^\/api\/kpi\?from=.*&preset=this-month&comparison=none$/,
    );
    expect(Object.values(payload.data)).toEqual([{ value: "this-month" }]);
  });

  it("leaves it to the browser without the browser's time zone", async () => {
    const { html } = await serverRender([selector("this-month"), Card]);

    expect(html).toContain("SKELETON");
    expect(requests).toEqual([]);
  });

  it("resolves the period in the browser's zone when it is not the server's", async () => {
    const elsewhere =
      browserTimeZone() === "Pacific/Kiritimati"
        ? "Etc/GMT+12"
        : "Pacific/Kiritimati";
    const { html } = await serverRender(
      [selector("this-month"), Card],
      zoneCookie(elsewhere),
    );

    expect(html).toContain("value:this-month");
    const query = new URL(requests[0]!, "http://dms.local").searchParams;
    const from = zonedClock(elsewhere).wall(new Date(query.get("from")!));
    const to = zonedClock(elsewhere).wall(new Date(query.get("to")!));
    expect([from.day, from.hours, from.minutes]).toEqual([1, 0, 0]);
    expect([to.hours, to.minutes, to.milliseconds]).toEqual([23, 59, 999]);
    expect(to.month).toBe(from.month);
  });

  it("renders a relative preset too, from the instant it hands the browser", async () => {
    const { html, payload } = await serverRender(
      [selector("last-24h"), Card],
      zoneCookie(browserTimeZone()),
    );

    expect(html).toContain("value:last-24h");
    expect(requests).toHaveLength(1);
    const query = new URL(requests[0]!, "http://dms.local").searchParams;
    expect(payload.state["dms-render-now"]).toBe(
      new Date(query.get("to")!).getTime(),
    );
  });

  it("leaves it to the browser when its selector sets up after it", async () => {
    const { html } = await serverRender(
      [Card, selector("this-month")],
      zoneCookie(browserTimeZone()),
    );

    expect(html).toContain("SKELETON");
    expect(requests).toEqual([]);
  });

  it("keeps the scopes of concurrent requests apart", async () => {
    const cookie = zoneCookie(browserTimeZone());
    const [month, year] = await Promise.all([
      serverRender([selector("this-month"), Card], cookie),
      serverRender([selector("last-year"), Card], cookie),
    ]);

    expect(month.html).toContain("value:this-month");
    expect(year.html).toContain("value:last-year");
  });
});

describe("a card without a period in a server render", () => {
  it("renders its data", async () => {
    const Plain = defineComponent({
      setup() {
        const { data } = useChartFetch<{ value: string | null }>({
          fetchUrl: "/api/plain",
          watchSource: () => ref(1).value,
        });
        return () => h("p", `plain:${data.value ? "loaded" : "none"}`);
      },
    });
    const { html } = await serverRender([Plain]);

    expect(html).toContain("plain:loaded");
    expect(requests).toEqual(["/api/plain"]);
  });
});
