import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePeriod } from "../layers/dms-core/app/composables/period/usePeriod";
import { isRelativePreset } from "../layers/dms-core/app/composables/period/presetResolvers";

const REFRESH_MS = 60000;

describe("relative preset refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("classifies only the sliding presets as relative", () => {
    expect(isRelativePreset("last-hour")).toBe(true);
    expect(isRelativePreset("last-24h")).toBe(true);
    expect(isRelativePreset("last-90-days")).toBe(false);
    expect(isRelativePreset("this-month")).toBe(false);
  });

  it("slides a relative preset's range as time passes", () => {
    const period = usePeriod({ defaultPreset: "last-hour" });
    const initialTo = period.state.value.range.to.getTime();
    vi.advanceTimersByTime(REFRESH_MS);
    expect(period.state.value.range.to.getTime()).toBe(initialTo + REFRESH_MS);
  });

  it("changes the state key on each slide so consumers refetch", () => {
    const period = usePeriod({ defaultPreset: "last-24h" });
    const initialKey = period.state.value.key;
    vi.advanceTimersByTime(REFRESH_MS);
    expect(period.state.value.key).not.toBe(initialKey);
  });

  it("keeps calendar presets fixed while time passes", () => {
    const period = usePeriod({ defaultPreset: "this-month" });
    const initialKey = period.state.value.key;
    vi.advanceTimersByTime(REFRESH_MS * 3);
    expect(period.state.value.key).toBe(initialKey);
  });

  it("starts sliding after switching onto a relative preset", async () => {
    const period = usePeriod({ defaultPreset: "this-month" });
    period.setPreset("last-hour");
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(period.state.value.range.to.getTime()).toBe(Date.now());
  });

  it("stops sliding after switching back to a calendar preset", async () => {
    const period = usePeriod({ defaultPreset: "last-hour" });
    period.setPreset("this-month");
    await vi.advanceTimersByTimeAsync(0);
    const initialKey = period.state.value.key;
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 2);
    expect(period.state.value.key).toBe(initialKey);
  });
});
