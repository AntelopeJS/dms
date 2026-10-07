import type { ValueProxy } from "@antelopejs/interface-database";
import { expect } from "chai";
import { compileRowRule } from "../../../../implementations/dms-base/footer-summary";

// A condition built by hand: each operator records itself as text.
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
  ({
    eq: (value: unknown) => expression(`${name}=${String(value)}`),
    ne: (value: unknown) => expression(`${name}!=${String(value)}`),
  }) as unknown as ValueProxy<unknown>;

const compile = (rule: Parameters<typeof compileRowRule>[0]) => {
  const condition = compileRowRule(rule, field);
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
