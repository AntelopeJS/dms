// @vitest-environment jsdom
/**
 * The start and end fields of a PeriodSelector's popover. A date field
 * reports every complete date while the user types, so a day on its way to
 * the one the user means (`2` before `20`, year `202` before `2027`) must not
 * move the other bound: the field keeps it, and the range takes it once focus
 * leaves the field.
 *
 * @packageDocumentation
 */
import { CalendarDate } from "@internationalized/date";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
  type SetupContext,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { router as inertiaRouter } from "@inertiajs/vue3";
import type { PeriodPreset } from "@antelopejs/interface-dms/base/period-selector";
import PeriodSelector from "../layers/dms-ui/app/components/period/PeriodSelector.vue";
import { defined } from "./helpers/defined";

const NOW = new Date(2026, 10, 18, 13, 57);

interface DateField {
  element: HTMLInputElement;
  type: (day: CalendarDate) => Promise<void>;
}

let app: App | undefined;
let host: HTMLDivElement;
let fields: DateField[] = [];

const DateFieldStub = defineComponent(
  (
    props: { modelValue: CalendarDate; disabled?: boolean },
    { emit }: SetupContext<["update:modelValue"]>,
  ) => {
    const element = ref<HTMLInputElement>();
    fields.push({
      get element() {
        if (!element.value) throw new Error("the field is not mounted");
        return element.value;
      },
      type: async (day) => {
        emit("update:modelValue", day);
        await nextTick();
      },
    });
    return () =>
      h("input", {
        ref: element,
        "data-date-field": "",
        value: props.modelValue.toString(),
        disabled: props.disabled,
      });
  },
  {
    props: { modelValue: { type: null }, disabled: { type: null } },
    emits: ["update:modelValue"],
  },
);

async function mountSelector(
  options: { presets?: PeriodPreset[]; maxDays?: number } = {},
) {
  app = createApp({
    render: () =>
      h(PeriodSelector, {
        componentId: "period",
        pageId: "sales",
        id: "sales",
        defaultPreset: "this-month",
        defaultComparison: "previous-period",
        presets: ["this-month", "last-month", "custom"],
        comparisons: ["none", "previous-period"],
        ...options,
      }),
  });
  app.config.globalProperties.$t = (key: string) => key;
  app.component("UIcon", () => h("i"));
  app.component("UInputDate", DateFieldStub);
  app.component("USelect", () => h("select"));
  app.component("UPopover", (_, { slots }) => [
    slots.default?.(),
    slots.content?.(),
  ]);
  app.component("UButton", (_, { attrs, slots }) =>
    h("button", { ...attrs, type: "button" }, [
      slots.leading?.(),
      slots.default?.(),
    ]),
  );
  app.mount(host);
  await nextTick();
}

const [START, END] = [0, 1];
const fieldValue = (index: number) => defined(fields[index]).element.value;
const range = () => `${fieldValue(START)} → ${fieldValue(END)}`;
const selectedPreset = () =>
  host
    .querySelector('[role="option"][aria-selected="true"]')
    ?.textContent?.trim();

async function leave(index: number, to: Element | null = null) {
  defined(fields[index]).element.dispatchEvent(
    new FocusEvent("focusout", { bubbles: true, relatedTarget: to }),
  );
  await nextTick();
}

async function typeDays(index: number, days: CalendarDate[]) {
  const seen: string[] = [];
  for (const day of days) {
    await defined(fields[index]).type(day);
    seen.push(range());
  }
  return seen;
}

const nov = (day: number, year = 2026) => new CalendarDate(year, 11, day);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(inertiaRouter, "replace").mockImplementation(() => {});
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useDmsUserSession", () => ({ user: ref({ weekStart: 1 }) }));
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    locale: ref("en-GB"),
  }));
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useWatch", () => ({}));
  vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
  vi.stubGlobal("isDmsHydrating", () => false);
  vi.stubGlobal("usePreferences", () => ({
    getPreference: <T>(_key: string, fallback?: T) => fallback,
    setPreference: () => undefined,
  }));
  fields = [];
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("typing in the date fields", () => {
  it("keeps the start while the end is typed digit by digit", async () => {
    await mountSelector();
    expect(range()).toBe("2026-11-01 → 2026-11-30");

    await defined(fields[START]).type(nov(5));
    await leave(START, defined(fields[END]).element);
    expect(await typeDays(END, [nov(2), nov(20)])).toEqual([
      "2026-11-05 → 2026-11-02",
      "2026-11-05 → 2026-11-20",
    ]);
    await leave(END);
    expect(range()).toBe("2026-11-05 → 2026-11-20");
  });

  it("keeps the start while the end's year is typed digit by digit", async () => {
    await mountSelector();
    await typeDays(END, [nov(30, 2), nov(30, 20), nov(30, 202)]);
    expect(range()).toBe("2026-11-01 → 0202-11-30");
    await defined(fields[END]).type(nov(30, 2027));
    await leave(END);
    expect(range()).toBe("2026-11-01 → 2027-11-30");
  });

  it("keeps a start year below 100 as typed, on its way to four digits", async () => {
    await mountSelector();
    expect(await typeDays(START, [nov(5, 2), nov(5, 20), nov(5, 202)])).toEqual(
      [
        "0002-11-05 → 2026-11-30",
        "0020-11-05 → 2026-11-30",
        "0202-11-05 → 2026-11-30",
      ],
    );
    await defined(fields[START]).type(nov(5, 2026));
    await leave(START);
    expect(range()).toBe("2026-11-05 → 2026-11-30");
  });

  it("switches the preset to the custom range on the first typed day", async () => {
    await mountSelector();
    expect(selectedPreset()).toContain("this-month");
    await defined(fields[END]).type(nov(2));
    expect(selectedPreset()).toBe("dms.period.popover.custom_range");
  });

  it("collapses the range onto a day typed past the other bound once the field is left", async () => {
    await mountSelector();
    await defined(fields[START]).type(nov(5));
    await defined(fields[END]).type(new CalendarDate(2026, 10, 20));
    expect(range()).toBe("2026-11-05 → 2026-10-20");
    await leave(END);
    expect(range()).toBe("2026-10-20 → 2026-10-20");
  });

  it("cuts a range to maxDays once the field is left, keeping the typed day", async () => {
    await mountSelector({ maxDays: 31 });
    await defined(fields[START]).type(new CalendarDate(2026, 9, 1));
    expect(range()).toBe("2026-09-01 → 2026-11-30");
    await leave(START);
    expect(range()).toBe("2026-09-01 → 2026-10-01");
  });

  it("keeps a move between the segments of one field from settling the range", async () => {
    await mountSelector();
    await defined(fields[END]).type(nov(2, 2025));
    const segment = document.createElement("span");
    defined(fields[END]).element.after(segment);
    await leave(END, segment);
    expect(range()).toBe("2026-11-01 → 2025-11-02");
  });

  it("applies the range the fields show", async () => {
    await mountSelector();
    await defined(fields[START]).type(nov(5));
    await defined(fields[END]).type(nov(2));
    host.querySelectorAll("button").forEach((button) => {
      if (button.textContent?.trim() === "dms.period.popover.apply")
        button.click();
    });
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve));
    const url = new URL(window.location.href);
    expect(url.searchParams.get("sales.from")).toBe("2026-11-02");
    expect(url.searchParams.get("sales.to")).toBe("2026-11-02");
  });

  it("leaves both fields disabled when the selector offers no custom range", async () => {
    await mountSelector({ presets: ["this-month", "last-month"] });
    expect(fields.map((field) => field.element.disabled)).toEqual([true, true]);
  });
});
