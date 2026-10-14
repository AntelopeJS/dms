// @vitest-environment jsdom
/**
 * `maxDays` caps the custom range a PeriodSelector lets the user pick: the
 * calendar disables the days past it once a start day is picked, and a range
 * from the date fields or a long preset is cut to it.
 */
import { CalendarDate } from "@internationalized/date";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import PeriodRangeCalendar from "../layers/dms-ui/app/build/components/period/PeriodRangeCalendar.vue";
import {
  calendarRangeDays,
  isBeyondMaxDays,
  limitCalendarRange,
} from "../layers/dms-ui/app/build/composables/period/periodDisplay";

const OCTOBER_FIRST = new CalendarDate(2026, 10, 1);
const OCTOBER_LAST = new CalendarDate(2026, 10, 31);

describe("limitCalendarRange", () => {
  const october = { start: OCTOBER_FIRST, end: OCTOBER_LAST };

  it("keeps a range within the limit", () => {
    expect(limitCalendarRange(october, 31, "start")).toBe(october);
    expect(limitCalendarRange(october, undefined, "start")).toBe(october);
  });

  it("moves the end when the start is kept", () => {
    const limited = limitCalendarRange(october, 7, "start");
    expect(limited.start.toString()).toBe("2026-10-01");
    expect(limited.end.toString()).toBe("2026-10-07");
    expect(calendarRangeDays(limited)).toBe(7);
  });

  it("moves the start when the end is kept", () => {
    const limited = limitCalendarRange(october, 7, "end");
    expect(limited.start.toString()).toBe("2026-10-25");
    expect(limited.end.toString()).toBe("2026-10-31");
  });
});

describe("isBeyondMaxDays", () => {
  it("allows exactly maxDays days on either side of the picked day", () => {
    const picked = new CalendarDate(2026, 10, 10);
    expect(isBeyondMaxDays(picked.add({ days: 6 }), picked, 7)).toBe(false);
    expect(isBeyondMaxDays(picked.add({ days: 7 }), picked, 7)).toBe(true);
    expect(isBeyondMaxDays(picked.subtract({ days: 6 }), picked, 7)).toBe(
      false,
    );
    expect(isBeyondMaxDays(picked.subtract({ days: 7 }), picked, 7)).toBe(true);
    expect(isBeyondMaxDays(picked.add({ days: 400 }), picked, undefined)).toBe(
      false,
    );
  });
});

describe("the range calendar with maxDays", () => {
  let app: App | undefined;

  afterEach(() => {
    app?.unmount();
    app = undefined;
  });

  function mountCalendar(maxDays?: number): HTMLElement {
    const host = document.createElement("div");
    document.body.appendChild(host);
    app = createApp(
      defineComponent({
        setup: () => () =>
          h(PeriodRangeCalendar, {
            modelValue: {
              start: new CalendarDate(2026, 9, 1),
              end: new CalendarDate(2026, 9, 2),
            },
            locale: "en-US",
            numberOfMonths: 1,
            maxDays,
          }),
      }),
    );
    app.config.globalProperties.$t = (_key: string, fallback: string) =>
      fallback;
    app.component(
      "UButton",
      defineComponent({ setup: () => () => h("button") }),
    );
    app.mount(host);
    return host;
  }

  function day(host: HTMLElement, value: string): HTMLElement {
    const cell = host.querySelector<HTMLElement>(`[data-value="${value}"]`);
    if (!cell) throw new Error(`No day ${value}`);
    return cell;
  }

  it("disables the days past the limit once a start day is picked", async () => {
    const host = mountCalendar(7);
    expect(day(host, "2026-09-20").hasAttribute("data-disabled")).toBe(false);
    day(host, "2026-09-10").click();
    await nextTick();
    expect(day(host, "2026-09-16").hasAttribute("data-disabled")).toBe(false);
    expect(day(host, "2026-09-17").hasAttribute("data-disabled")).toBe(true);
    expect(day(host, "2026-09-03").hasAttribute("data-disabled")).toBe(true);
  });

  it("leaves every day enabled without a limit", async () => {
    const host = mountCalendar();
    day(host, "2026-09-10").click();
    await nextTick();
    expect(day(host, "2026-09-30").hasAttribute("data-disabled")).toBe(false);
  });
});
