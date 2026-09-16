import { describe, expect, it } from "vitest";
import { resolvePresetRange } from "../layers/dms-core/app/composables/period/presetResolvers";
import { resolveComparisonRange } from "../layers/dms-core/app/composables/period/compareResolvers";
import {
  MS_PER_DAY,
  MS_PER_HOUR,
  type PeriodRange,
} from "../layers/dms-core/app/composables/period/types";

const NOW = new Date(2026, 6, 28, 14, 37, 12, 500);
const FALLBACK: PeriodRange = {
  from: new Date(2026, 0, 1),
  to: new Date(2026, 0, 31),
};

function durationOf(range: PeriodRange): number {
  return range.to.getTime() - range.from.getTime();
}

function isStartOfDay(date: Date): boolean {
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
}

describe("relative presets", () => {
  it("keeps last-hour on instant bounds ending now", () => {
    const range = resolvePresetRange("last-hour", NOW, FALLBACK);
    expect(range.to).toEqual(NOW);
    expect(durationOf(range)).toBe(MS_PER_HOUR);
    expect(isStartOfDay(range.from)).toBe(false);
  });

  it("keeps last-24h on instant bounds ending now", () => {
    const range = resolvePresetRange("last-24h", NOW, FALLBACK);
    expect(range.to).toEqual(NOW);
    expect(durationOf(range)).toBe(MS_PER_DAY);
  });

  it("snaps last-90-days to calendar day boundaries, today included", () => {
    const range = resolvePresetRange("last-90-days", NOW, FALLBACK);
    expect(isStartOfDay(range.from)).toBe(true);
    expect(range.to.getDate()).toBe(NOW.getDate());
    expect(range.to.getHours()).toBe(23);
    expect(Math.round(durationOf(range) / MS_PER_DAY)).toBe(90);
  });

  it("resolves the same day-count family consistently", () => {
    const lengths = (
      ["last-7-days", "last-30-days", "last-90-days"] as const
    ).map((preset) =>
      Math.round(
        durationOf(resolvePresetRange(preset, NOW, FALLBACK)) / MS_PER_DAY,
      ),
    );
    expect(lengths).toEqual([7, 30, 90]);
  });
});

describe("previous-period comparison", () => {
  it("returns the equal-length span immediately before a day range", () => {
    const range = resolvePresetRange("last-7-days", NOW, FALLBACK);
    const compare = resolveComparisonRange("previous-period", range, null);
    expect(compare).not.toBeNull();
    expect(durationOf(compare!)).toBe(durationOf(range));
    expect(compare!.to.getTime()).toBe(range.from.getTime() - 1);
  });

  it("does not overlap the primary range", () => {
    const range = resolvePresetRange("this-month", NOW, FALLBACK);
    const compare = resolveComparisonRange("previous-period", range, null);
    expect(compare!.to.getTime()).toBeLessThan(range.from.getTime());
  });

  it("compares an intraday range to the hour right before it", () => {
    const range = resolvePresetRange("last-hour", NOW, FALLBACK);
    const compare = resolveComparisonRange("previous-period", range, null);
    expect(durationOf(compare!)).toBe(MS_PER_HOUR);
    expect(range.from.getTime() - compare!.to.getTime()).toBe(1);
  });

  it("keeps previous-year on the same calendar dates", () => {
    const range = resolvePresetRange("last-30-days", NOW, FALLBACK);
    const compare = resolveComparisonRange("previous-year", range, null);
    expect(compare!.from.getFullYear()).toBe(range.from.getFullYear() - 1);
    expect(compare!.from.getDate()).toBe(range.from.getDate());
  });

  it("returns null when comparison is none", () => {
    const range = resolvePresetRange("today", NOW, FALLBACK);
    expect(resolveComparisonRange("none", range, null)).toBeNull();
  });
});
