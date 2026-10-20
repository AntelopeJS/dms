import type { RequestContext } from "@antelopejs/interface-api";
import type { ValueProxy } from "@antelopejs/interface-database";
import { expect } from "chai";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import type { DataCompareMode } from "@antelopejs/interface-dms/base/data-types/core";
import { DefaultDataCompareTypes } from "@antelopejs/interface-dms/base/data-types/compare-types";

// The expression a filter builds, recorded instead of querying a database.
class Expression {
  constructor(
    readonly op: string,
    readonly operand: unknown,
  ) {}

  and(other: unknown): Expression {
    return new Expression("and", [this, other]);
  }
}

const expression = (op: string, operand: unknown) =>
  new Expression(op, operand);

/** What an order filter wraps its comparison in: the value is set. */
const whenSet = (comparison: Expression) =>
  expression("and", [expression("ne", null), comparison]);

function recordingProxy(): ValueProxy<unknown> {
  const compare = (op: string) => (operand: unknown) => expression(op, operand);
  const proxy = {
    gt: compare("gt"),
    ge: compare("ge"),
    lt: compare("lt"),
    le: compare("le"),
    ne: compare("ne"),
    default: () => proxy,
  };
  return proxy as unknown as ValueProxy<unknown>;
}

const context = {} as RequestContext;
const row = {} as ValueProxy<Record<string, unknown>>;

describe("[unit] interfaces/dms-base — date filters", () => {
  const dateType = new DefaultDataTypes.DateType();

  it("compares a stored date with an instant itself, and before a picked day", () => {
    const after = dateType.filter(
      context,
      recordingProxy(),
      "startedAt",
      "2026-09-28T09:30:00.000Z",
      "greater_than",
      row,
    );
    expect(after).to.deep.equal(
      whenSet(expression("gt", new Date("2026-09-28T09:30:00.000Z"))),
    );

    const before = dateType.filter(
      context,
      recordingProxy(),
      "startedAt",
      "2026-09-28",
      "less_than",
      row,
    );
    expect(before).to.deep.equal(
      whenSet(expression("lt", new Date("2026-09-28"))),
    );
  });

  it("reads a picked day as the whole day: greater than starts the next day", () => {
    const after = dateType.filter(
      context,
      recordingProxy(),
      "issuedAt",
      "2026-10-15",
      "greater_than",
      row,
    );
    expect(after).to.deep.equal(
      whenSet(expression("ge", new Date("2026-10-16T00:00:00.000Z"))),
    );
  });

  it("leaves an empty date out of before, after and between", () => {
    const before = dateType.filter(
      context,
      recordingProxy(),
      "lastActivityAt",
      "2026-09-29T09:30:00.000Z",
      "less_than",
      row,
    );
    expect(before).to.deep.equal(
      whenSet(expression("lt", new Date("2026-09-29T09:30:00.000Z"))),
    );

    const between = dateType.filter(
      context,
      recordingProxy(),
      "lastActivityAt",
      "2026-10-01,2026-10-15",
      "is_between",
      row,
    );
    expect(between).to.deep.equal(
      whenSet(
        expression("ge", new Date("2026-10-01T00:00:00.000Z")).and(
          expression("lt", new Date("2026-10-16T00:00:00.000Z")),
        ),
      ),
    );
  });

  it("refuses a value that is no date", () => {
    expect(() =>
      dateType.filter(
        context,
        recordingProxy(),
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
    Expression,
  ][] = [
    [
      "less_than",
      new DefaultDataCompareTypes.LessThan(),
      "0",
      expression("lt", 0),
    ],
    [
      "greater_than",
      new DefaultDataCompareTypes.GreaterThan(),
      "0",
      expression("gt", 0),
    ],
    [
      "less_than_or_equal_to",
      new DefaultDataCompareTypes.LessThanOrEqualTo(),
      "10",
      expression("le", 10),
    ],
    [
      "greater_than_or_equal_to",
      new DefaultDataCompareTypes.GreaterThanOrEqualTo(),
      "10",
      expression("ge", 10),
    ],
    [
      "is_between",
      new DefaultDataCompareTypes.IsBetween(),
      "1,5",
      expression("ge", 1).and(expression("le", 5)),
    ],
  ];

  for (const [mode, compareMode, value, comparison] of cases) {
    it(`leaves an empty value out of ${mode}`, () => {
      const built = compareMode.filter(
        context,
        recordingProxy(),
        "amountDue",
        value,
        row,
      );
      expect(built).to.deep.equal(whenSet(comparison));
    });
  }
});
