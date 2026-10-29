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

const fromJson = (json: string): Parameters<typeof compileRowRule>[0] =>
  JSON.parse(json);

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

  it("rejects mixed-key rules whose dispatched operand is malformed, not first-key dispatch that throws a TypeError", () => {
    const andOperand = { field: "amount", equals: 41, and: 123 };
    const inOperand = { field: "amount", notIn: [41], in: 123 };
    expect(() => compile(andOperand)).to.throw(
      Error,
      /rule\.and must be an array of rules/,
    );
    expect(() => compile(inOperand)).to.throw(
      Error,
      /rule\.in must be an array/,
    );
  });

  it("rejects malformed operands nested in and, or and not instead of throwing a TypeError", () => {
    expect(() =>
      compile(
        fromJson('{"and":[{"field":"a","equals":1},{"field":"b","in":"x"}]}'),
      ),
    ).to.throw(Error, /rule\.and\[1\]\.in must be an array/);
    expect(() =>
      compile(
        fromJson(
          '{"or":[{"field":"a","equals":1},{"not":{"field":"b","notIn":7}}]}',
        ),
      ),
    ).to.throw(Error, /rule\.or\[1\]\.not\.notIn must be an array/);
    expect(() =>
      compile(fromJson('{"not":{"field":"b","equals":1,"or":{}}}')),
    ).to.throw(Error, /rule\.not\.or must be an array of rules/);
    expect(() => compile(fromJson('{"not":null}'))).to.throw(
      Error,
      /rule\.not must be a rule object/,
    );
    expect(() => compile(fromJson('{"not":[]}'))).to.throw(
      Error,
      /rule\.not must be a rule object/,
    );
    expect(() => compile(fromJson('{"and":[null]}'))).to.throw(
      Error,
      /rule\.and\[0\] must be a rule object/,
    );
    expect(() => compile(fromJson('{"or":[[]]}'))).to.throw(
      Error,
      /rule\.or\[0\] must be a rule object/,
    );
  });

  it("keeps compiling a valid rule that carries a shadowed operator", () => {
    expect(
      compile({
        field: "amount",
        equals: 41,
        and: [{ field: "a", equals: 1 }],
      }),
    ).to.equal("a=1");
  });
});
