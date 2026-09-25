import { expect } from "chai";
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";

function configOf(type: string) {
  const declared = ListBlockTypes().find((block) => block.type === type);
  expect(declared, `${type} is declared`).to.not.equal(undefined);
  return declared!.config;
}

/**
 * A table offers its row actions unless they are turned off. The catalog has
 * to say so, or a builder shows a table anyone can delete rows from with its
 * "Deleting data" switch off.
 */
describe("[unit] interfaces/dms-base/table-view — its row actions in the catalog", () => {
  const actions = () => configOf("TableView").rowActions?.properties ?? {};

  it("says the actions a table offers by itself are on", () => {
    for (const action of ["add", "edit", "delete", "duplicate", "copyLink"]) {
      expect(actions()[action]?.default, action).to.equal(true);
    }
  });

  it("says when an action depends on another one", () => {
    expect(actions().details?.default).to.equal(undefined);
    expect(actions().details?.description).to.match(/editing is off/);
    expect(actions().archive?.default).to.equal(true);
    expect(actions().archive?.description).to.match(/ghost delete/);
  });

  it("leaves row selection off until it is turned on", () => {
    expect(actions().hasSelection?.default).to.equal(undefined);
  });
});

/**
 * A chart inside a card draws the series the card fetched, under the card's
 * heading. Its own source and title are never read, and a builder offering
 * them would let an author wire a source that does nothing.
 */
describe("[unit] interfaces/dms-base/chart-card — the chart it wraps, in the catalog", () => {
  it("names the options of its chart it supplies itself", () => {
    const supplied = configOf("ChartCard").chart?.ui?.supplies;

    expect(supplied).to.include.members([
      "fetchUrl",
      "fetchUrlMethod",
      "periodScope",
      "title",
    ]);
  });

  it("keeps a chart's backend-only settings for the advanced view", () => {
    const chart = configOf("ChartLine");

    expect(chart.realtimeTopic?.ui?.advanced).to.equal(true);
    expect(chart.syncGroup?.ui?.advanced).to.equal(true);
    expect(chart.annotations?.ui?.advanced).to.equal(true);
    expect(chart.showGrid?.ui?.advanced, "a setting anyone reads").to.equal(
      undefined,
    );
  });
});

/**
 * A card and its chart draw their variation, legend, tooltip, grid, curve and
 * rounded bars unless those are turned off. A builder reading an unset switch
 * as off would show every one of them off on a card that draws them all.
 */
describe("[unit] interfaces/dms-base/chart-card — the switches it draws on", () => {
  it("says a card shows its variation and its legend", () => {
    const card = configOf("ChartCard");

    expect(card.showDelta?.default).to.equal(true);
    expect(card.showLegend?.default).to.equal(true);
  });

  it("says a chart shows what it draws unless told not to", () => {
    const chart = configOf("ChartColumn");

    for (const option of ["showTooltip", "showGrid", "roundedCorners"]) {
      expect(chart[option]?.default, option).to.equal(true);
    }
    expect(configOf("ChartLine").smooth?.default).to.equal(true);
  });

  it("leaves what it only does when asked unset", () => {
    expect(configOf("ChartColumn").stacked?.default).to.equal(undefined);
  });
});
