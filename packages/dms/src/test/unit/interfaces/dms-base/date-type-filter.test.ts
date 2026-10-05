import type { RequestContext } from "@antelopejs/interface-api";
import type { ValueProxy } from "@antelopejs/interface-database";
import { expect } from "chai";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";

interface Comparison {
  op: string;
  operand: unknown;
}

// Records the comparison a filter builds instead of querying a database.
function recordingProxy(): { proxy: ValueProxy<unknown>; calls: Comparison[] } {
  const calls: Comparison[] = [];
  const record = (op: string) => (operand: unknown) => {
    calls.push({ op, operand });
    return true;
  };
  const proxy = { gt: record("gt"), lt: record("lt") };
  return { proxy: proxy as unknown as ValueProxy<unknown>, calls };
}

const context = {} as RequestContext;
const row = {} as ValueProxy<Record<string, unknown>>;

describe("[unit] interfaces/dms-base — date filters", () => {
  const dateType = new DefaultDataTypes.DateType();

  it("compares a stored date with the instant itself, after or before it", () => {
    const after = recordingProxy();
    dateType.filter(
      context,
      after.proxy,
      "startedAt",
      "2026-09-28T09:30:00.000Z",
      "greater_than",
      row,
    );
    expect(after.calls).to.deep.equal([
      { op: "gt", operand: new Date("2026-09-28T09:30:00.000Z") },
    ]);

    const before = recordingProxy();
    dateType.filter(
      context,
      before.proxy,
      "startedAt",
      "2026-09-28",
      "less_than",
      row,
    );
    expect(before.calls).to.deep.equal([
      { op: "lt", operand: new Date("2026-09-28") },
    ]);
  });

  it("refuses a value that is no date", () => {
    expect(() =>
      dateType.filter(
        context,
        recordingProxy().proxy,
        "startedAt",
        "soon",
        "greater_than",
        row,
      ),
    ).to.throw(/expects a date value/);
  });
});
