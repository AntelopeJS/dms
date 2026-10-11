// @vitest-environment jsdom
/**
 * A PeriodSelector keeps its period in the page URL: the period it starts
 * from (the URL, then the user's last choice, then its default), the server
 * render (no flash of the default), the in-place write on a change (no new
 * history entry), and the period following a route changed from outside.
 */
import {
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  type App,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeriodPreset } from "../layers/dms-core/app/composables/period/types";

const route = reactive<{ query: Record<string, string> }>({ query: {} });
const preferences = new Map<string, unknown>();

vi.stubGlobal("useDmsRoute", () => route);
vi.stubGlobal("usePreferences", () => ({
  getPreference: <T>(key: string, fallback?: T) =>
    (preferences.get(key) as T | undefined) ?? fallback,
  setPreference: (key: string, value: unknown) => preferences.set(key, value),
}));

const { usePeriod } = await import(
  "../layers/dms-core/app/composables/period/usePeriod"
);
const { usePeriodLocation, PERIOD_PREFERENCE_PREFIX } = await import(
  "../layers/dms-ui/app/build/composables/period/usePeriodLocation"
);

type Period = ReturnType<typeof usePeriod>;

const PAGE_ID = "dashboard";
const PAGE_PATH = "/dashboard";
const handles: Record<string, Period> = {};

/** The selector's state wiring, as PeriodSelector.vue does it in setup. */
function selector(id: string, defaultPreset: PeriodPreset = "this-month") {
  return defineComponent({
    setup() {
      const period = usePeriod({
        defaultPreset,
        presets: ["last-7-days", "last-30-days", "this-month", "custom"],
      });
      usePeriodLocation(period, {
        id,
        pageId: PAGE_ID,
        fallback: {
          preset: period.preset.value,
          comparison: period.comparison.value,
          customRange: null,
          customCompareRange: null,
        },
      });
      handles[id] = period;
      return () =>
        h("span", `${period.preset.value}|${period.comparison.value}`);
    },
  });
}

const mounted: App[] = [];

function mount(...ids: string[]): void {
  const app = createApp({
    setup: () => () =>
      h(
        "div",
        ids.map((id) => h(selector(id))),
      ),
  });
  app.mount(document.createElement("div"));
  mounted.push(app);
}

const search = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  route.query = {};
  preferences.clear();
  window.history.replaceState(null, "", PAGE_PATH);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

describe("the period a selector starts from", () => {
  it("is the URL's", () => {
    route.query = {
      "page.period": "last-7-days",
      "page.compare": "previous-year",
    };
    preferences.set(`${PERIOD_PREFERENCE_PREFIX}.${PAGE_ID}.page`, {
      period: "last-30-days",
    });
    mount("page");
    expect(handles.page!.preset.value).toBe("last-7-days");
    expect(handles.page!.comparison.value).toBe("previous-year");
  });

  it("is the user's last choice when the URL names none", () => {
    preferences.set(`${PERIOD_PREFERENCE_PREFIX}.${PAGE_ID}.page`, {
      period: "last-30-days",
      compare: "previous-period",
    });
    mount("page");
    expect(handles.page!.preset.value).toBe("last-30-days");
    expect(handles.page!.comparison.value).toBe("previous-period");
  });

  it("is the default when neither names a valid one", () => {
    route.query = { "page.period": "next-century" };
    preferences.set(`${PERIOD_PREFERENCE_PREFIX}.${PAGE_ID}.page`, {
      period: "ytd",
    });
    mount("page");
    expect(handles.page!.preset.value).toBe("this-month");
    expect(handles.page!.comparison.value).toBe("none");
  });

  it("is a custom range read from the URL", () => {
    route.query = { "page.from": "2026-10-01", "page.to": "2026-10-15" };
    mount("page");
    expect(handles.page!.preset.value).toBe("custom");
    expect(handles.page!.state.value.range).toEqual({
      from: new Date(2026, 9, 1),
      to: new Date(2026, 9, 15, 23, 59, 59, 999),
    });
  });

  it("is rendered by the server, so the default never flashes", async () => {
    route.query = { "page.period": "last-7-days" };
    const html = await renderToString(createSSRApp(selector("page")));
    expect(html).toContain("last-7-days|none");
  });
});

describe("a change of period", () => {
  it("replaces the URL in place and remembers the choice", async () => {
    mount("page");
    const entries = window.history.length;
    handles.page!.setPreset("last-7-days");
    handles.page!.setComparison("previous-period");
    await nextTick();
    expect(search().get("page.period")).toBe("last-7-days");
    expect(search().get("page.compare")).toBe("previous-period");
    expect(window.history.length).toBe(entries);
    expect(
      preferences.get(`${PERIOD_PREFERENCE_PREFIX}.${PAGE_ID}.page`),
    ).toEqual({ period: "last-7-days", compare: "previous-period" });
  });

  it("swaps the preset key for the custom range keys", async () => {
    window.history.replaceState(
      null,
      "",
      `${PAGE_PATH}?page.period=last-7-days`,
    );
    mount("page");
    handles.page!.setCustomRange({
      from: new Date(2026, 9, 1),
      to: new Date(2026, 9, 2, 23, 59, 59, 999),
    });
    await nextTick();
    expect(search().get("page.period")).toBeNull();
    expect(search().get("page.from")).toBe("2026-10-01");
    expect(search().get("page.to")).toBe("2026-10-02");
  });

  it("leaves another selector's keys and the other parameters alone", async () => {
    window.history.replaceState(null, "", `${PAGE_PATH}?requests.tab=get`);
    mount("sales", "traffic");
    handles.sales!.setPreset("last-7-days");
    await nextTick();
    handles.traffic!.setPreset("last-30-days");
    await nextTick();
    expect(Object.fromEntries(search())).toEqual({
      "requests.tab": "get",
      "sales.period": "last-7-days",
      "sales.compare": "none",
      "traffic.period": "last-30-days",
      "traffic.compare": "none",
    });
    expect(handles.sales!.preset.value).toBe("last-7-days");
  });
});

describe("a route changed from outside", () => {
  it("moves the period of the selector it names", async () => {
    mount("sales", "traffic");
    route.query = { "sales.period": "last-30-days" };
    await nextTick();
    expect(handles.sales!.preset.value).toBe("last-30-days");
    expect(handles.traffic!.preset.value).toBe("this-month");
  });

  it("keeps the period when it names an invalid one", async () => {
    mount("page");
    handles.page!.setPreset("last-7-days");
    await nextTick();
    route.query = { "page.period": "last-decade" };
    await nextTick();
    expect(handles.page!.preset.value).toBe("last-7-days");
  });
});
