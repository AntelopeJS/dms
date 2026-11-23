import { expect } from "chai";
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";
import { defined } from "../../../helpers/defined";

function configOf(type: string) {
  const declared = ListBlockTypes().find((block) => block.type === type);
  expect(declared, `${type} is declared`).to.not.equal(undefined);
  return defined(declared).config;
}

describe('[unit] interfaces/dms-base/table-view — its row actions in the catalog: a table offers them unless they are turned off, or a builder shows a table anyone can delete rows from with its "Deleting data" switch off', () => {
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

describe("[unit] interfaces/dms-base — options for a page built without code: the simple view shows what someone building without code reads, the table's technical options are left to the developer view, and a meter's source is one an editor can generate, its maximum staying the meter's own", () => {
  it("leaves a table's technical options to the developer view", () => {
    const table = configOf("TableView");
    for (const option of [
      "maxHeight",
      "expandable",
      "searchShortcut",
      "pinnedRows",
      "liveHold",
    ]) {
      expect(table[option]?.ui?.advanced, option).to.equal(true);
    }
    expect(table.caption?.ui?.advanced, "its title").to.equal(undefined);
  });

  it("offers a meter's source with the arrangement it reads", () => {
    const source = configOf("Meter").fetchUrl?.ui;
    expect(source?.responseShape).to.equal("value");
    expect(source?.advanced).to.equal(undefined);
  });

  it("keeps a source no editor can generate for the developer view", () => {
    const source = configOf("ActivityFeed").fetchUrl?.ui;
    expect(source?.responseShape).to.equal(undefined);
    expect(source?.advanced).to.equal(true);
  });
});

describe("[unit] interfaces/dms-base/chart-card — the chart it wraps, in the catalog: it draws the series the card fetched under the card's heading, and its own source and title are never read, as a builder offering them would let an author wire a source that does nothing", () => {
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

describe("[unit] interfaces/dms-base/chart-card — the switches it draws on: a card and its chart draw their variation, legend, tooltip, grid, curve and rounded bars unless turned off, so a builder reading an unset switch as off would show every one off", () => {
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
