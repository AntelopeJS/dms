/**
 * What a PeriodSelector offers besides its presets: every period (`all`, no
 * bounds sent), a window labelled relative to now ("since yesterday 11:52"),
 * and a comparison drawn as a menu, a toggle or nothing.
 */
import { effectScope } from "vue";
import { describe, expect, it } from "vitest";
import { resolvePresetRange } from "../layers/dms-core/app/composables/period/presetResolvers";
import { resolveComparisonRange } from "../layers/dms-core/app/composables/period/compareResolvers";
import { usePeriod } from "../layers/dms-core/app/composables/period/usePeriod";
import { appendPeriodToUrl } from "../layers/dms-core/app/composables/period/usePeriodScope";
import { usePeriodDraft } from "../layers/dms-ui/app/build/composables/period/usePeriodDraft";
import { formatRelativeInstant } from "../layers/dms-ui/app/build/composables/period/periodDisplay";
import { resolveComparisonControl } from "../layers/dms-ui/app/build/composables/period/periodComparisonControl";

const NOW = new Date(2026, 9, 11, 19, 54);
const FALLBACK = { from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) };

function allTimePeriod() {
  const scope = effectScope();
  const result = scope.run(() => {
    const period = usePeriod({
      defaultPreset: "all",
      defaultComparison: "previous-period",
      presets: ["last-24h", "all", "custom"],
    });
    return { period, draft: usePeriodDraft(period) };
  });
  if (!result) throw new Error("scope did not run");
  return { ...result, stop: () => scope.stop() };
}

describe("every period", () => {
  it("resolves to no bounds, and nothing to compare with", () => {
    expect(resolvePresetRange("all", NOW, FALLBACK)).toBeNull();
    expect(resolveComparisonRange("previous-period", null, null)).toBeNull();
  });

  it("is published with no range, and sends no from / to", () => {
    const { period, stop } = allTimePeriod();
    const { state } = period;
    expect(state.value.range).toBeNull();
    expect(state.value.compareRange).toBeNull();

    const url = appendPeriodToUrl("/api/requests?route=1", state.value)!;
    const params = new URL(url, "http://dms.local").searchParams;
    expect(params.has("from")).toBe(false);
    expect(params.has("to")).toBe(false);
    expect(params.has("compareFrom")).toBe(false);
    expect(params.get("preset")).toBe("all");
    expect(params.get("route")).toBe("1");
    stop();
  });

  it("starts a custom range from today in the popover", () => {
    const { draft, stop } = allTimePeriod();
    expect(draft.range.value).toBeNull();
    draft.selectPreset("custom");
    const today = new Date();
    expect(draft.range.value!.from.getDate()).toBe(today.getDate());
    expect(draft.range.value!.to.getHours()).toBe(23);
    stop();
  });
});

describe("a window labelled relative to now", () => {
  it("gives the time alone today", () => {
    const start = new Date(2026, 9, 11, 11, 52);
    expect(formatRelativeInstant(start, NOW, "en-GB")).toBe("11:52");
  });

  it("says yesterday in the reader's language", () => {
    const start = new Date(2026, 9, 10, 11, 52);
    expect(formatRelativeInstant(start, NOW, "en-GB")).toBe("yesterday 11:52");
    expect(formatRelativeInstant(start, NOW, "fr-FR")).toBe("hier 11:52");
  });

  it("gives the weekday within a week", () => {
    const start = new Date(2026, 9, 7, 11, 52);
    expect(formatRelativeInstant(start, NOW, "en-GB")).toMatch(/^Wed 11:52$/);
  });

  it("gives the date beyond a week, and its year when not this one's", () => {
    expect(
      formatRelativeInstant(new Date(2026, 9, 4, 11, 52), NOW, "en-US"),
    ).toBe("Oct 4, 11:52 AM");
    expect(
      formatRelativeInstant(new Date(2025, 9, 4, 11, 52), NOW, "en-US"),
    ).toContain("2025");
  });
});

describe("the comparison control", () => {
  it("is a menu of several comparisons by default", () => {
    expect(resolveComparisonControl({}).control).toBe("menu");
  });

  it("is a toggle when a single comparison is offered, none accepted too", () => {
    const resolved = resolveComparisonControl({
      comparisons: ["previous-period"],
    });
    expect(resolved).toMatchObject({
      control: "toggle",
      toggled: "previous-period",
      comparisons: ["none", "previous-period"],
    });
  });

  it("toggles the default comparison when asked for a toggle among several", () => {
    const resolved = resolveComparisonControl({
      comparisonControl: "toggle",
      defaultComparison: "previous-year",
    });
    expect(resolved.toggled).toBe("previous-year");
  });

  it("keeps the comparison on when hidden", () => {
    const resolved = resolveComparisonControl({
      comparisonControl: "hidden",
      comparisons: ["previous-period"],
    });
    expect(resolved).toMatchObject({
      control: "hidden",
      toggled: null,
      defaultComparison: "previous-period",
      comparisons: ["previous-period"],
    });
  });

  it("draws nothing when nothing but none is offered", () => {
    expect(
      resolveComparisonControl({
        comparisons: ["none"],
        comparisonControl: "menu",
      }).control,
    ).toBe("hidden");
  });
});
