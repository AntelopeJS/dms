import { expect } from "chai";
import { sampleRows } from "../../../mockup";

const DAY = 86_400_000;
const COLUMNS = [
  { field: "title", label: "Title", type: "string" },
  { field: "placedAt", label: "Placed", type: "date" },
];

describe("[unit] mockup sample rows", () => {
  it("dates each row a day before the clock's day, newest first (fails dates fixed in 2026)", () => {
    const now = Date.parse("2026-11-17T12:00:00Z");
    const today = Date.parse("2026-11-17T00:00:00Z");

    const dates = sampleRows(COLUMNS, now).map((row) => row.placedAt);

    expect(dates).to.deep.equal(
      [1, 2, 3].map((back) => new Date(today - back * DAY).toISOString()),
    );
  });

  it("is the same on every call of one day and keeps its other values", () => {
    const morning = Date.parse("2026-11-17T00:00:01Z");
    const night = Date.parse("2026-11-17T23:59:59Z");

    expect(sampleRows(COLUMNS, night)).to.deep.equal(
      sampleRows(COLUMNS, morning),
    );
    expect(sampleRows(COLUMNS, morning)[0]).to.include({
      _id: "sample-1",
      title: "Sample Title 1",
    });
  });
});
