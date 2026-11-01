/** @vitest-environment jsdom */
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
  type Component,
} from "vue";
import { renderToString } from "vue/server-renderer";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { router as inertiaRouter } from "@inertiajs/vue3";
import type { PeriodPreset } from "../layers/dms-core/app/composables/period/types";
import type { RememberedPeriods } from "../layers/dms-ui/app/entries/composables/period/periodQuery";

const route = reactive<{ query: Record<string, string> }>({ query: {} });
const preferences = new Map<string, RememberedPeriods>();

vi.stubGlobal("useDmsRoute", () => route);

vi.stubGlobal("isDmsHydrating", () => false);

function followInertiaPage({
  url,
}: Parameters<typeof inertiaRouter.replace>[0]): void {
  route.query = Object.fromEntries(
    new URL(url ?? window.location.href, "http://dms.local").searchParams,
  );
}
const inertiaReplace = vi.spyOn(inertiaRouter, "replace");
vi.stubGlobal("usePreferences", () => ({
  getPreference: (key: string, fallback?: RememberedPeriods) =>
    preferences.get(key) ?? fallback,
  setPreference: (key: string, value: RememberedPeriods) =>
    preferences.set(key, value),
}));

const { usePeriod } = await import(
  "../layers/dms-core/app/composables/period/usePeriod"
);
const { usePeriodLocation, PERIOD_PREFERENCE_KEY } = await import(
  "../layers/dms-ui/app/entries/composables/period/usePeriodLocation"
);

type Period = ReturnType<typeof usePeriod>;

const PAGE_ID = "dashboard";
const PAGE_PATH = "/dashboard";
const handles: Record<string, Period> = {};

const PRESETS: PeriodPreset[] = [
  "last-7-days",
  "last-30-days",
  "this-month",
  "custom",
];

/** What a test changes of a selector's setup. */
interface SelectorSetup {
  pageId?: string;
  presets?: PeriodPreset[];
  rememberKey?: string;
}

/** The selector's state wiring, as PeriodSelector.vue does it in setup. */
function selector(
  id: string,
  defaultPreset: PeriodPreset = "this-month",
  setup: SelectorSetup = {},
) {
  return defineComponent({
    setup() {
      const period = usePeriod({
        defaultPreset,
        presets: setup.presets ?? PRESETS,
      });
      usePeriodLocation(period, {
        id,
        pageId: setup.pageId ?? PAGE_ID,
        rememberKey: setup.rememberKey,
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

function mountApp(root: Component): void {
  const app = createApp(root);
  app.mount(document.createElement("div"));
  mounted.push(app);
}

function mount(...ids: string[]): void {
  mountApp({
    setup: () => () =>
      h(
        "div",
        ids.map((id) => h(selector(id))),
      ),
  });
}

const search = () => new URLSearchParams(window.location.search);

/** A navigation from outside: the browser's URL moves, then the route. */
function navigate(query: Record<string, string>): void {
  window.history.replaceState(
    null,
    "",
    `${PAGE_PATH}?${new URLSearchParams(query)}`,
  );
  route.query = query;
}

const remember = (query: Record<string, string>) =>
  preferences.set(PERIOD_PREFERENCE_KEY, { [`${PAGE_ID}#page`]: query });

beforeEach(() => {
  route.query = {};
  preferences.clear();
  inertiaReplace.mockReset();
  inertiaReplace.mockImplementation(followInertiaPage);
  window.history.replaceState(null, "", PAGE_PATH);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

afterAll(() => inertiaReplace.mockRestore());

describe("the period a selector starts from", () => {
  it("is the URL's", () => {
    route.query = {
      "page.period": "last-7-days",
      "page.compare": "previous-year",
    };
    remember({
      period: "last-30-days",
    });
    mount("page");
    expect(handles.page!.preset.value).toBe("last-7-days");
    expect(handles.page!.comparison.value).toBe("previous-year");
  });

  it("is the user's last choice when the URL names none", () => {
    remember({
      period: "last-30-days",
      compare: "previous-period",
    });
    mount("page");
    expect(handles.page!.preset.value).toBe("last-30-days");
    expect(handles.page!.comparison.value).toBe("previous-period");
  });

  it("is the default when neither names a valid one", () => {
    route.query = { "page.period": "next-century" };
    remember({
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

describe("the URL on load", () => {
  it("carries the period the selector starts from, the default included", () => {
    window.history.replaceState(null, "", `${PAGE_PATH}?requests.tab=get`);
    mount("page");
    expect(Object.fromEntries(search())).toEqual({
      "requests.tab": "get",
      "page.period": "this-month",
      "page.compare": "none",
    });
  });

  it("is left alone when it already names the period", () => {
    window.history.replaceState(
      null,
      "",
      `${PAGE_PATH}?page.period=this-month&page.compare=none`,
    );
    route.query = { "page.period": "this-month", "page.compare": "none" };
    mount("page");
    expect(inertiaReplace).not.toHaveBeenCalled();
  });
});

describe("a change of period", () => {
  it("reaches the route, so a tab written from it keeps the new period", async () => {
    mount("page");
    handles.page!.setPreset("last-7-days");
    await nextTick();

    const query = { ...route.query, tab: "2" };
    window.history.replaceState(
      null,
      "",
      `${PAGE_PATH}?${new URLSearchParams(query)}`,
    );
    expect(search().get("tab")).toBe("2");
    expect(search().get("page.period")).toBe("last-7-days");
    expect(handles.page!.preset.value).toBe("last-7-days");
  });

  it("replaces the URL in place and remembers the choice", async () => {
    mount("page");
    const entries = window.history.length;
    handles.page!.setPreset("last-7-days");
    handles.page!.setComparison("previous-period");
    await nextTick();
    expect(search().get("page.period")).toBe("last-7-days");
    expect(search().get("page.compare")).toBe("previous-period");
    expect(window.history.length).toBe(entries);
    expect(preferences.get(PERIOD_PREFERENCE_KEY)![`${PAGE_ID}#page`]).toEqual({
      period: "last-7-days",
      compare: "previous-period",
    });
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

describe("the route while Inertia catches up", () => {
  it("holds the new period at once", async () => {
    inertiaReplace.mockImplementation(() => {});
    mount("page");
    handles.page!.setPreset("last-7-days");
    await nextTick();
    expect(route.query["page.period"]).toBe("last-7-days");
    expect(search().get("page.period")).toBe("last-7-days");
  });

  it("does not move the period back when it reports the old URL late", async () => {
    inertiaReplace.mockImplementation(() => {});
    mount("page");
    await nextTick();
    const before = { ...route.query };
    handles.page!.setPreset("last-7-days");
    await nextTick();
    route.query = before;
    await nextTick();
    expect(handles.page!.preset.value).toBe("last-7-days");
    expect(search().get("page.period")).toBe("last-7-days");
  });
});

describe("a route changed from outside", () => {
  it("moves the period of the selector it names", async () => {
    mount("sales", "traffic");
    navigate({ "sales.period": "last-30-days" });
    await nextTick();
    expect(handles.sales!.preset.value).toBe("last-30-days");
    expect(handles.traffic!.preset.value).toBe("this-month");
  });

  it("keeps the period when it names an invalid one", async () => {
    mount("page");
    handles.page!.setPreset("last-7-days");
    await nextTick();
    navigate({ "page.period": "last-decade" });
    await nextTick();
    expect(handles.page!.preset.value).toBe("last-7-days");
  });
});

describe("a remembered choice shared by a rememberKey", () => {
  const onPage = (pageId: string) =>
    selector("api", "last-30-days", { pageId, rememberKey: "api" });

  it("follows the user from one page to the next", async () => {
    mountApp(onPage("overview"));
    handles.api!.setPreset("last-7-days");
    await nextTick();
    mounted.splice(0).forEach((app) => app.unmount());
    route.query = {};
    window.history.replaceState(null, "", "/logs");
    mountApp(onPage("logs"));
    expect(handles.api!.preset.value).toBe("last-7-days");
  });

  it("stays per page without one", async () => {
    mountApp(selector("api", "last-30-days", { pageId: "overview" }));
    handles.api!.setPreset("last-7-days");
    await nextTick();
    mounted.splice(0).forEach((app) => app.unmount());
    route.query = {};
    mountApp(selector("api", "last-30-days", { pageId: "logs" }));
    expect(handles.api!.preset.value).toBe("last-30-days");
  });
});

describe("a link framing a window no preset matches", () => {
  const PILLS: PeriodPreset[] = ["last-hour", "last-24h", "last-7-days"];

  it("opens on that window, no preset selected, and is not remembered", async () => {
    remember({ period: "last-7-days" });
    route.query = {
      "page.from": "2026-10-11T09:12:00.000Z",
      "page.to": "2026-10-11T09:40:00.000Z",
    };
    mountApp(selector("page", "last-24h", { presets: PILLS }));
    await nextTick();
    const period = handles.page!;
    expect(period.preset.value).toBe("custom");
    expect(PILLS).not.toContain(period.preset.value);
    expect(period.state.value.range).toEqual({
      from: new Date("2026-10-11T09:12:00.000Z"),
      to: new Date("2026-10-11T09:40:00.000Z"),
    });
    period.setComparison("previous-period");
    await nextTick();
    expect(preferences.get(PERIOD_PREFERENCE_KEY)![`${PAGE_ID}#page`]).toEqual({
      period: "last-7-days",
    });
  });
});
