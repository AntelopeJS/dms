import { effectScope } from "vue";
import { describe, expect, it } from "vitest";
import { usePeriod } from "../layers/dms-core/app/composables/period/usePeriod";
import { usePeriodDraft } from "../layers/dms-ui/app/build/composables/period/usePeriodDraft";
import {
  formatPeriodRange,
  localeWeekStart,
  periodDuration,
} from "../layers/dms-ui/app/build/composables/period/periodDisplay";

function setup() {
  const scope = effectScope();
  const result = scope.run(() => {
    const period = usePeriod({
      defaultPreset: "this-month",
      presets: ["last-7-days", "this-month", "custom"],
    });
    return { period, draft: usePeriodDraft(period) };
  });
  if (!result) throw new Error("scope did not run");
  return { ...result, stop: () => scope.stop() };
}

describe("period draft", () => {
  it("stages presets and comparisons without moving the period", () => {
    const { period, draft, stop } = setup();
    const before = period.state.value.key;

    draft.selectPreset("last-7-days");
    draft.selectComparison("previous-period");

    expect(draft.isDirty.value).toBe(true);
    expect(draft.compareRange.value).not.toBeNull();
    expect(period.state.value.key).toBe(before);
    stop();
  });

  it("commits the staged selection on apply", () => {
    const { period, draft, stop } = setup();

    draft.selectPreset("last-7-days");
    draft.selectComparison("previous-year");
    draft.apply();

    expect(period.preset.value).toBe("last-7-days");
    expect(period.comparison.value).toBe("previous-year");
    expect(draft.isDirty.value).toBe(false);
    stop();
  });

  it("applies a picked range as the custom preset", () => {
    const { period, draft, stop } = setup();
    const range = {
      from: new Date(2026, 8, 14),
      to: new Date(2026, 8, 20, 23, 59, 59, 999),
    };

    draft.selectRange(range);
    expect(period.preset.value).toBe("this-month");
    draft.apply();

    expect(period.preset.value).toBe("custom");
    expect(period.state.value.range).toEqual(range);
    stop();
  });

  it("drops staged changes on reset", () => {
    const { period, draft, stop } = setup();

    draft.selectPreset("last-7-days");
    draft.reset();

    expect(draft.preset.value).toBe(period.preset.value);
    expect(draft.isDirty.value).toBe(false);
    stop();
  });

  it("starts a custom selection on the whole days on screen", () => {
    const { draft, stop } = setup();

    draft.selectPreset("custom");

    const range = draft.customRange.value;
    expect(range?.from.getHours()).toBe(0);
    expect(range?.to.getHours()).toBe(23);
    stop();
  });
});

describe("period display", () => {
  it("counts whole days, and hours below a day", () => {
    expect(
      periodDuration({
        from: new Date(2026, 8, 1),
        to: new Date(2026, 8, 30, 23, 59, 59, 999),
      }),
    ).toEqual({ unit: "days", count: 30 });
    expect(
      periodDuration({
        from: new Date(2026, 8, 1, 10),
        to: new Date(2026, 8, 1, 11),
      }),
    ).toEqual({ unit: "hours", count: 1 });
  });

  it("keeps the year off a comparison label on request", () => {
    const range = {
      from: new Date(2026, 7, 1),
      to: new Date(2026, 7, 30, 23, 59, 59, 999),
    };
    expect(formatPeriodRange(range, "en-US")).toContain("2026");
    expect(formatPeriodRange(range, "en-US", false)).not.toContain("2026");
  });

  it("starts the week on Monday for the DMS locales", () => {
    expect(localeWeekStart("en")).toBe(1);
    expect(localeWeekStart("fr")).toBe(1);
    expect(localeWeekStart("fr-FR")).toBe(1);
  });
});
