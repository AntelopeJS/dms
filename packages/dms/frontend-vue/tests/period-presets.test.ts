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

  it("keeps whole-day comparisons on midnight across a DST change", () => {
    const range = {
      from: new Date(2026, 9, 5),
      to: new Date(new Date(2026, 10, 5).getTime() - 1),
    };
    const compare = resolveComparisonRange("previous-period", range, null);
    expect(compare!.from).toEqual(new Date(2026, 8, 4));
    expect(compare!.to.getTime()).toBe(range.from.getTime() - 1);
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

describe("calendar comparisons", () => {
  const TODAY = new Date(2026, 9, 18, 10, 30);
  const endOf = (year: number, month: number, day: number) =>
    new Date(new Date(year, month, day + 1).getTime() - 1);
  const compare = (
    preset: Parameters<typeof resolvePresetRange>[0],
    comparison: "previous-period" | "previous-year" = "previous-period",
  ) =>
    resolveComparisonRange(
      comparison,
      resolvePresetRange(preset, TODAY, FALLBACK),
      null,
      { preset, now: TODAY },
    );

  it("compares a month to the month before, not to as many days", () => {
    expect(compare("last-month")).toEqual({
      from: new Date(2026, 7, 1),
      to: endOf(2026, 7, 31),
    });

    expect(compare("last-quarter")).toEqual({
      from: new Date(2026, 3, 1),
      to: endOf(2026, 5, 30),
    });
    expect(compare("last-year")).toEqual({
      from: new Date(2024, 0, 1),
      to: endOf(2024, 11, 31),
    });
  });

  it("compares what has elapsed of a period under way", () => {
    expect(compare("this-month")).toEqual({
      from: new Date(2026, 8, 1),
      to: endOf(2026, 8, 18),
    });
    expect(compare("this-quarter")).toEqual({
      from: new Date(2026, 6, 1),
      to: endOf(2026, 6, 18),
    });
    expect(compare("ytd")).toEqual({
      from: new Date(2025, 0, 1),
      to: endOf(2025, 9, 18),
    });
    expect(compare("this-month", "previous-year")).toEqual({
      from: new Date(2025, 9, 1),
      to: endOf(2025, 9, 18),
    });
  });

  it("keeps the day within a shorter month", () => {
    const lastOfMarch = new Date(2026, 2, 31, 9);
    const range = resolvePresetRange("this-month", lastOfMarch, FALLBACK);
    expect(
      resolveComparisonRange("previous-period", range, null, {
        preset: "this-month",
        now: lastOfMarch,
      }),
    ).toEqual({ from: new Date(2026, 1, 1), to: endOf(2026, 1, 28) });
  });

  it("compares a custom range of whole months to the months before", () => {
    const september = { from: new Date(2026, 8, 1), to: endOf(2026, 8, 30) };
    expect(
      resolveComparisonRange("previous-period", september, null, {
        preset: "custom",
        now: TODAY,
      }),
    ).toEqual({ from: new Date(2026, 7, 1), to: endOf(2026, 7, 31) });
  });
});
