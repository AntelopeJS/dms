import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { usePeriod } from "../layers/dms-core/app/composables/period/usePeriod";
import {
  isCalendarPreset,
  msUntilNextMidnight,
} from "../layers/dms-core/app/composables/period/presetResolvers";

const MS_PER_MINUTE = 60000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const LATE_EVENING = new Date(2026, 9, 12, 23, 58);
const NEXT_DAY = new Date(2026, 9, 13);

describe("calendar presets at midnight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(LATE_EVENING);
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("classifies the day-bound presets as calendar presets", () => {
    expect(isCalendarPreset("today")).toBe(true);
    expect(isCalendarPreset("last-7-days")).toBe(true);
    expect(isCalendarPreset("this-month")).toBe(true);
    expect(isCalendarPreset("last-hour")).toBe(false);
    expect(isCalendarPreset("custom")).toBe(false);
    expect(isCalendarPreset("all")).toBe(false);
  });

  it("measures the time left until the next local midnight", () => {
    expect(msUntilNextMidnight(LATE_EVENING)).toBe(2 * MS_PER_MINUTE);
  });

  it("moves `today` onto the new day once midnight passes", () => {
    const period = usePeriod({ defaultPreset: "today" });
    const initialKey = period.state.value.key;
    vi.advanceTimersByTime(MS_PER_MINUTE);
    expect(period.state.value.key).toBe(initialKey);
    vi.advanceTimersByTime(MS_PER_MINUTE);
    expect(period.state.value.range?.from).toEqual(NEXT_DAY);
  });

  it("keeps moving on the following midnights", () => {
    const period = usePeriod({ defaultPreset: "last-7-days" });
    vi.advanceTimersByTime(2 * MS_PER_MINUTE);
    expect(period.state.value.range?.to.getDate()).toBe(13);
    vi.advanceTimersByTime(MS_PER_DAY);
    expect(period.state.value.range?.to.getDate()).toBe(14);
  });

  it("waits for the hold to end before moving", async () => {
    const isHeld = ref(true);
    const period = usePeriod({
      defaultPreset: "today",
      holdClock: () => isHeld.value,
    });
    const initialKey = period.state.value.key;
    await vi.advanceTimersByTimeAsync(3 * MS_PER_MINUTE);
    expect(period.state.value.key).toBe(initialKey);
    isHeld.value = false;
    await vi.advanceTimersByTimeAsync(0);
    expect(period.state.value.range?.from).toEqual(NEXT_DAY);
  });

  it("leaves a custom range alone", async () => {
    const period = usePeriod({ defaultPreset: "today" });
    period.setCustomRange({
      from: new Date(2026, 9, 1),
      to: new Date(2026, 9, 2),
    });
    const initialKey = period.state.value.key;
    await vi.advanceTimersByTimeAsync(3 * MS_PER_MINUTE);
    expect(period.state.value.key).toBe(initialKey);
  });
});
