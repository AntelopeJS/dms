import { expect } from "chai";
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";

function periodSelectorConfig() {
  const declared = ListBlockTypes().find(
    (block) => block.type === "PeriodSelector",
  );
  expect(declared, "PeriodSelector is declared").to.not.equal(undefined);
  return declared!.config;
}

/**
 * The labels an author can override are keyed by a closed set of ranges and
 * comparisons. The catalog has to say which, and what each one is called, or a
 * builder can only offer an object typed by hand.
 */
describe("[unit] interfaces/dms-base/period-selector — its catalog entry", () => {
  it("names the ranges a range label can be given for", () => {
    const labels = periodSelectorConfig().presetLabels;

    expect(labels?.type).to.equal("record");
    expect(labels?.ui?.widget, "no longer a JSON box").to.equal(undefined);
    expect(labels?.keys?.enum).to.include("last-30-days");
    expect(labels?.keys?.ui?.valueLabels?.["ytd"]).to.equal("Year to date");
    expect(labels?.values?.type).to.equal("string");
  });

  it("names the comparisons a comparison label can be given for", () => {
    const labels = periodSelectorConfig().comparisonLabels;

    expect(labels?.keys?.enum).to.deep.equal([
      "none",
      "previous-period",
      "previous-year",
      "custom",
    ]);
    expect(labels?.keys?.ui?.valueLabels?.["previous-period"]).to.equal(
      "vs previous period",
    );
  });

  it("names the values of the pickers that choose a range", () => {
    const config = periodSelectorConfig();

    expect(
      config.defaultPreset?.ui?.label,
      "its own hints still apply",
    ).to.equal("Default range");
    expect(config.defaultPreset?.ui?.valueLabels?.["last-7-days"]).to.equal(
      "Last 7 days",
    );
    expect(config.presets?.items?.ui?.valueLabels?.["today"]).to.equal("Today");
  });
});
