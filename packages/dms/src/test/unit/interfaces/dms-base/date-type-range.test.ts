import { expect } from "chai";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types";

const range = () => new DefaultDataTypes.DateType({ range: true });

/** A date range validates to one shape, `{ start, end }`, whatever it came as. */
describe("[unit] interfaces/dms-base — DateType range", () => {
  it("keeps a { start, end } range as dates", () => {
    const parsed = range()
      .getValidation()
      .parse({ start: "2026-03-01", end: "2026-03-31" });

    expect(parsed).to.deep.equal({
      start: new Date("2026-03-01"),
      end: new Date("2026-03-31"),
    });
  });

  it("reads a [start, end] pair as the same object", () => {
    const parsed = range().getValidation().parse(["2026-03-01", "2026-03-31"]);

    expect(parsed).to.deep.equal({
      start: new Date("2026-03-01"),
      end: new Date("2026-03-31"),
    });
  });

  it("refuses a range ending before it starts, or a list of three dates", () => {
    const validation = range().getValidation();

    expect(
      validation.safeParse({ start: "2026-03-31", end: "2026-03-01" }).success,
    ).to.equal(false);
    expect(
      validation.safeParse(["2026-03-01", "2026-03-02", "2026-03-03"]).success,
    ).to.equal(false);
  });
});
