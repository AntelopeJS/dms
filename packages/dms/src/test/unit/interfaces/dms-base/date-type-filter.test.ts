import { ValueProxy } from "@antelopejs/interface-database";
import { expect } from "chai";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import type { DataCompareMode } from "@antelopejs/interface-dms/base/data-types/core";
import { DefaultDataCompareTypes } from "@antelopejs/interface-dms/base/data-types/compare-types";
import { untouchedRequestContext } from "../../../helpers/request-context";

function field<T = unknown>(): ValueProxy<T> {
  return ValueProxy.constant("field").cast<T>();
}

/** What an order filter wraps its comparison in: the value is set. */
const whenSet = (comparison: ValueProxy<boolean>) =>
  field().default(null).ne(null).and(comparison);

const context = untouchedRequestContext();
const row: Parameters<DataCompareMode["filter"]>[4] = new Proxy(field(), {
  get: () => {
    throw new Error("The filter read the row");
  },
});

describe("[unit] interfaces/dms-base — date filters", () => {
  const dateType = new DefaultDataTypes.DateType();

  it("compares a stored date with an instant itself, and before a picked day", () => {
    const after = dateType.filter(
      context,
      field(),
      "startedAt",
      "2026-09-28T09:30:00.000Z",
      "greater_than",
      row,
    );
    expect(after).to.deep.equal(
      whenSet(field().gt(new Date("2026-09-28T09:30:00.000Z"))),
    );

    const before = dateType.filter(
      context,
      field(),
      "startedAt",
      "2026-09-28",
      "less_than",
      row,
    );
    expect(before).to.deep.equal(whenSet(field().lt(new Date("2026-09-28"))));
  });

  it("reads a picked day as the whole day: greater than starts the next day", () => {
    const after = dateType.filter(
      context,
      field(),
      "issuedAt",
      "2026-10-15",
      "greater_than",
      row,
    );
    expect(after).to.deep.equal(
      whenSet(field().ge(new Date("2026-10-16T00:00:00.000Z"))),
    );
  });

  it("leaves an empty date out of before, after and between", () => {
    const before = dateType.filter(
      context,
      field(),
      "lastActivityAt",
      "2026-09-29T09:30:00.000Z",
      "less_than",
      row,
    );
    expect(before).to.deep.equal(
      whenSet(field().lt(new Date("2026-09-29T09:30:00.000Z"))),
    );

    const between = dateType.filter(
      context,
      field(),
      "lastActivityAt",
      "2026-10-01,2026-10-15",
      "is_between",
      row,
    );
    expect(between).to.deep.equal(
      whenSet(
        field()
          .ge(new Date("2026-10-01T00:00:00.000Z"))
          .and(field().lt(new Date("2026-10-16T00:00:00.000Z"))),
      ),
    );
  });

  it("refuses a value that is no date", () => {
    expect(() =>
      dateType.filter(
        context,
        field(),
        "startedAt",
        "soon",
        "greater_than",
        row,
      ),
    ).to.throw(/expects a date value/);
  });
});

describe("[unit] interfaces/dms-base — order filters on a number", () => {
  const cases: [
    string,
    { filter: DataCompareMode["filter"] },
    string,
    ValueProxy<boolean>,
  ][] = [
    ["less_than", new DefaultDataCompareTypes.LessThan(), "0", field().lt(0)],
    [
      "greater_than",
      new DefaultDataCompareTypes.GreaterThan(),
      "0",
      field().gt(0),
    ],
    [
      "less_than_or_equal_to",
      new DefaultDataCompareTypes.LessThanOrEqualTo(),
      "10",
      field().le(10),
    ],
    [
      "greater_than_or_equal_to",
      new DefaultDataCompareTypes.GreaterThanOrEqualTo(),
      "10",
      field().ge(10),
    ],
    [
      "is_between",
      new DefaultDataCompareTypes.IsBetween(),
      "1,5",
      field().ge(1).and(field().le(5)),
    ],
  ];

  for (const [mode, compareMode, value, comparison] of cases) {
    it(`leaves an empty value out of ${mode}`, () => {
      const built = compareMode.filter(
        context,
        field(),
        "amountDue",
        value,
        row,
      );
      expect(built).to.deep.equal(whenSet(comparison));
    });
  }
});

describe("[unit] interfaces/dms-base — is_between on a numeric field", () => {
  /**
   * Catches an IsBetween that hands the parsed Date objects to the numeric
   * value proxy: the sibling order filters send epoch milliseconds.
   */
  it("sends epoch milliseconds for ISO date bounds", () => {
    const built = new DefaultDataCompareTypes.IsBetween().filter(
      context,
      field(),
      "occurredAtMs",
      "2026-10-01, 2026-10-15T12:00:00.000Z",
      row,
    );
    expect(built).to.deep.equal(
      whenSet(
        field()
          .ge(Date.parse("2026-10-01T00:00:00.000Z"))
          .and(field().le(Date.parse("2026-10-15T12:00:00.000Z"))),
      ),
    );
  });

  it("sends a number bound and an ISO date bound together as numbers", () => {
    const built = new DefaultDataCompareTypes.IsBetween().filter(
      context,
      field(),
      "occurredAtMs",
      "1, 2026-10-01",
      row,
    );
    expect(built).to.deep.equal(
      whenSet(
        field()
          .ge(1)
          .and(field().le(Date.parse("2026-10-01T00:00:00.000Z"))),
      ),
    );
  });
});
