import type { ValueProxy } from "@antelopejs/interface-database";
import { expect } from "chai";
import { compileRowRule } from "../../../../implementations/dms-base/services";

interface Expression {
  text: string;
  and: (other: Expression) => Expression;
  or: (other: Expression) => Expression;
  not: () => Expression;
}

const expression = (text: string): Expression => ({
  text,
  and: (other) => expression(`(${text} AND ${other.text})`),
  or: (other) => expression(`(${text} OR ${other.text})`),
  not: () => expression(`NOT ${text}`),
});

const field = (name: string) =>
  // SAFETY: compileRowRule calls only eq/ne on fields; their expression results implement every and/or/not operation exercised here, not the entire database proxy API.
  ({
    eq: (value: Parameters<ValueProxy<unknown>["eq"]>[0]) =>
      expression(`${name}=${String(value)}`),
    ne: (value: Parameters<ValueProxy<unknown>["ne"]>[0]) =>
      expression(`${name}!=${String(value)}`),
  }) as unknown as ValueProxy<unknown>;

const compile = (rule: Parameters<typeof compileRowRule>[0]) => {
  const condition = compileRowRule(rule, field);
  // SAFETY: Nonliteral results originate from this fixture's eq/ne and expression combinators, all of which return an Expression with text.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The owner returns literal booleans or query proxies; preserve the existing distinction before reading the fixture expression's text.
  return typeof condition === "boolean"
    ? condition
    : (condition as unknown as Expression).text;
};

describe("[unit] dms-base — footer summary rules", () => {
  it("compiles field comparisons", () => {
    expect(compile({ field: "status", equals: "open" })).to.equal(
      "status=open",
    );
    expect(compile({ field: "status", notEquals: "open" })).to.equal(
      "status!=open",
    );
    expect(compile({ field: "status", in: ["open", "late"] })).to.equal(
      "(status=open OR status=late)",
    );
    expect(compile({ field: "status", notIn: ["open"] })).to.equal(
      "NOT status=open",
    );
  });

  it("combines rules, folding the literals of empty lists away", () => {
    expect(
      compile({
        and: [
          { field: "status", equals: "open" },
          { not: { field: "amount", equals: 0 } },
        ],
      }),
    ).to.equal("(status=open AND NOT amount=0)");
    expect(compile({ field: "status", in: [] })).to.equal(false);
    expect(compile({ field: "status", notIn: [] })).to.equal(true);
    expect(
      compile({
        or: [
          { field: "status", in: [] },
          { field: "a", equals: 1 },
        ],
      }),
    ).to.equal("a=1");
    expect(
      compile({
        and: [
          { field: "status", in: [] },
          { field: "a", equals: 1 },
        ],
      }),
    ).to.equal(false);
  });
});
