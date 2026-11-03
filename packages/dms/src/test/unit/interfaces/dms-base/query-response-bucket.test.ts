import { expect } from "chai";
import {
  chartCardData,
  topListData,
  type SeriesBucket,
  type SeriesOptions,
} from "@antelopejs/interface-dms/base/query-response";
import type { ChartSeries } from "@antelopejs/interface-dms/base/chart";

const MONTHS = [
  { x: 202608, y: 10 },
  { x: 202609, y: 20 },
  { x: 202610, y: 30 },
];
const BY_MONTH: SeriesOptions = { measure: "sum", bucket: "month" };

function xOf(series: ChartSeries[] | undefined): Array<number | string | Date> {
  return (series?.[0]?.data ?? []).flatMap((point) =>
    point instanceof Object && "x" in point ? [point.x] : [],
  );
}

function labelOf(
  x: number,
  bucket: SeriesBucket,
): number | string | Date | undefined {
  return xOf(
    chartCardData([{ x, y: 1 }], { measure: "sum", bucket }).series,
  )[0];
}

describe("[unit] interfaces/dms-base/query-response: a bucketed series read by a person", () => {
  it("names a month of a chart card 'Aug 2026', not its stamp 202608", () => {
    expect(xOf(chartCardData(MONTHS, BY_MONTH).series)).to.deep.equal([
      "Aug 2026",
      "Sep 2026",
      "Oct 2026",
    ]);
  });

  it("keeps the figures of the points", () => {
    const [first] = chartCardData(MONTHS, BY_MONTH).series[0]?.data ?? [];
    expect(first).to.deep.equal({ x: "Aug 2026", y: 10 });
  });

  it("names the preceding period's months too", () => {
    const data = chartCardData(MONTHS, {
      ...BY_MONTH,
      previous: [{ x: 202605, y: 5 }],
    });
    expect(xOf(data.comparisonSeries)).to.deep.equal(["May 2026"]);
  });

  it("names a day, a quarter and a year", () => {
    expect(labelOf(20260801, "day")).to.equal("Aug 1, 2026");
    expect(labelOf(20263, "quarter")).to.equal("Q3 2026");
    expect(labelOf(2026, "year")).to.equal("2026");
  });

  it("names a week by its Monday, even across New Year", () => {
    expect(labelOf(20668, "week")).to.equal("Week of Aug 3");
    expect(labelOf(20815, "week")).to.equal("Week of Dec 28");
    expect(labelOf(20822, "week")).to.equal("Week of Jan 4");
  });

  it("returns a week stamp that is not a Monday as it came", () => {
    expect(labelOf(20669, "week")).to.equal(20669);
  });

  it("titles a ranked entry by its period and keeps its id", () => {
    const [entry] = topListData([{ x: 202608, y: 10 }], BY_MONTH).items;
    expect(entry?.title).to.equal("Aug 2026");
    expect(entry?.id).to.equal(202608);
  });

  it("leaves a key that is no stamp of the bucket as it came", () => {
    const series = chartCardData(
      [
        { x: 202613, y: 1 },
        { x: "web", y: 2 },
        { x: 1.5, y: 3 },
      ],
      BY_MONTH,
    ).series;
    expect(xOf(series)).to.deep.equal([202613, "web", 1.5]);
  });

  it("leaves a series with no bucket as it came", () => {
    const series = chartCardData(MONTHS, { measure: "sum" }).series;
    expect(xOf(series)).to.deep.equal([202608, 202609, 202610]);
  });
});
