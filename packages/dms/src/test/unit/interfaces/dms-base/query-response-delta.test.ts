import { expect } from "chai";
import {
  chartCardData,
  kpiCardData,
  topListData,
  type SeriesOptions,
} from "@antelopejs/interface-dms/base/query-response";

const CURRENT = [{ x: "a", y: 112.5 }];
const OPTIONS: SeriesOptions = {
  measure: "sum",
  previous: [{ x: "a", y: 100 }],
};
const FROM_ZERO: SeriesOptions = {
  measure: "sum",
  previous: [{ x: "a", y: 0 }],
};
const EXPECTED_PERCENT = 12.5;

/**
 * Every card prints a `delta` as a percent, so 100 to 112.5 has to arrive as
 * 12.5: handed the 0.125 ratio, the card printed +0.1 %.
 */
describe("[unit] interfaces/dms-base/query-response — the delta a card reads", () => {
  it("states a KPI's change in percent", () => {
    expect(kpiCardData(CURRENT, OPTIONS).delta).to.equal(EXPECTED_PERCENT);
  });

  it("states a chart card's change in percent", () => {
    expect(chartCardData(CURRENT, OPTIONS).delta).to.equal(EXPECTED_PERCENT);
  });

  it("states a ranked entry's change in percent", () => {
    expect(topListData(CURRENT, OPTIONS).items[0]?.delta).to.equal(
      EXPECTED_PERCENT,
    );
  });

  it("states no change from a preceding zero", () => {
    expect(kpiCardData(CURRENT, FROM_ZERO).delta).to.equal(undefined);
  });
});
