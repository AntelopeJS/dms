// @vitest-environment jsdom
/**
 * The PeriodSelector of a `pageToolbar()`, mounted from the options the
 * interface gives it: every segment named in full whatever it shows (a short
 * code, the custom preset's calendar icon alone), and the comparison menu
 * drawn as soon as the period offers more than one choice, as tall as the
 * other controls.
 */
import { createApp, h, nextTick, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pageToolbar,
  type PageToolbarOptions,
} from "@antelopejs/interface-dms/base/page-toolbar";
import type { PeriodSelectorProps } from "@antelopejs/interface-dms/base/period-selector";
import PageToolbarBlock from "../layers/dms-ui/app/components/blocks/PageToolbarBlock.vue";
import PeriodSelector from "../layers/dms-ui/app/components/period/PeriodSelector.vue";
import DmsSegmented from "../layers/dms-ui/app/components/segmented/Segmented.vue";

vi.mock("@inertiajs/vue3", () => ({ router: { replace: vi.fn() } }));
vi.mock(
  "#dms-core/app/composables/user/useUserRegionalPreferences",
  async () => {
    const { ref: vueRef } = await import("vue");
    return { useUserRegionalPreferences: () => ({ weekStartsOn: vueRef(1) }) };
  },
);

let app: App | undefined;
let host: HTMLDivElement;

const t = (key: string) => key;

/** The period child's options, as `pageToolbar()` serializes them. */
function toolbarPeriod(
  period: PageToolbarOptions["period"],
): PeriodSelectorProps {
  const serialized = pageToolbar({ live: false, period }).serializeSync();
  const child = serialized.children?.find((entry) => entry.id === "period");
  return child?.component.options as PeriodSelectorProps;
}

async function mountPeriod(period: PageToolbarOptions["period"]) {
  const options = toolbarPeriod(period);
  app = createApp({
    render: () =>
      h(PageToolbarBlock, { componentId: "toolbar", pageId: "sales" }, () => [
        h(PeriodSelector, {
          componentId: "toolbar.period",
          pageId: "sales",
          ...options,
        }),
      ]),
  });
  app.config.globalProperties.$t = t;
  app.component("UIcon", () => h("i"));
  app.component("DmsSegmented", DmsSegmented);
  app.component("UPopover", (_, { slots }) => [
    slots.default?.(),
    slots.anchor?.(),
  ]);
  app.component("UDropdownMenu", (props: { items?: unknown[][] }, { slots }) =>
    h(
      "div",
      { "data-menu": (props.items?.[0] ?? []).length },
      slots.default?.(),
    ),
  );
  app.component("UButton", (props: { size?: string }, { attrs, slots }) =>
    h("button", { ...attrs, type: "button", "data-size": props.size }, [
      slots.leading?.(),
      slots.default?.(),
    ]),
  );
  app.mount(host);
  await nextTick();
  return options;
}

const segments = () => [
  ...host.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
];
const comparisonMenu = () => host.querySelector("[data-menu]");

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t, locale: ref("en-GB") }));
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useWatch", () => ({}));
  vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
  vi.stubGlobal("usePreferences", () => ({
    getPreference: <T>(_key: string, fallback?: T) => fallback,
    setPreference: () => undefined,
  }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

describe("its segments", () => {
  it("name every preset in full, a short code or an icon alone", async () => {
    await mountPeriod({
      id: "sales",
      presets: ["last-24h", "last-7-days", "custom"],
    });
    expect(segments().map((segment) => segment.textContent?.trim())).toEqual([
      "24H",
      "7D",
      "",
    ]);
    expect(
      segments().map((segment) => segment.getAttribute("aria-label")),
    ).toEqual([
      "dms.period.presets.last-24h",
      "dms.period.presets.last-7-days",
      "dms.period.presets.custom",
    ]);
  });
});

describe("its comparison", () => {
  it("is a menu when the period offers more than one choice", async () => {
    const options = await mountPeriod({
      id: "sales",
      comparisons: ["previous-period", "previous-year", "none"],
    });
    expect(options).toMatchObject({
      comparisonControl: "menu",
      defaultComparison: "previous-period",
    });
    expect(comparisonMenu()?.getAttribute("data-menu")).toBe("3");
    const trigger = comparisonMenu()?.querySelector("button");
    expect(trigger?.className).toContain("h-7");
    expect(trigger?.getAttribute("data-size")).toBe("sm");
  });

  it("keeps the page's own choice of comparison", async () => {
    const options = await mountPeriod({
      id: "sales",
      comparisons: ["none", "previous-period", "previous-year"],
      defaultComparison: "previous-year",
    });
    expect(options).toMatchObject({
      comparisonControl: "menu",
      defaultComparison: "previous-year",
    });
  });

  it("is hidden for a single comparison, which stays on", async () => {
    const options = await mountPeriod({
      id: "sales",
      comparisons: ["previous-period"],
    });
    expect(options.comparisonControl).toBe("hidden");
    expect(comparisonMenu()).toBeNull();
    expect(host.textContent).toContain("dms.period.popover.vs");
  });
});
