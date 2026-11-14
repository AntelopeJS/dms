import { ValueProxy } from "@antelopejs/interface-database";
import type { StoredRow } from "@antelopejs/interface-data-api/metadata";
import { expect } from "chai";
import type { RowActionRule } from "@antelopejs/interface-dms/base/types/row-action";
import { assertRowRule } from "@antelopejs/interface-dms/base/table-view/internal/row-rule-shape";
import { compileRowRule } from "../../../../implementations/dms-base/services";

const field = (name: string): ValueProxy<StoredRow[string]> =>
  ValueProxy.constant<StoredRow[string]>(name);

const fromJson = (json: string): RowActionRule => {
  const parsed: unknown = JSON.parse(json);
  assertRowRule(parsed, "Malformed row rule");
  return parsed;
};

const compile = (rule: RowActionRule) => compileRowRule(rule, field);

describe("[unit] dms-base — footer summary rules", () => {
  it("compiles field comparisons", () => {
    expect(compile({ field: "status", equals: "open" })).to.deep.equal(
      field("status").eq("open"),
    );
    expect(compile({ field: "status", notEquals: "open" })).to.deep.equal(
      field("status").ne("open"),
    );
    expect(compile({ field: "status", in: ["open", "late"] })).to.deep.equal(
      field("status").eq("open").or(field("status").eq("late")),
    );
    expect(compile({ field: "status", notIn: ["open"] })).to.deep.equal(
      field("status").eq("open").not(),
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
    ).to.deep.equal(
      field("status").eq("open").and(field("amount").eq(0).not()),
    );
    expect(compile({ field: "status", in: [] })).to.equal(false);
    expect(compile({ field: "status", notIn: [] })).to.equal(true);
    expect(
      compile({
        or: [
          { field: "status", in: [] },
          { field: "a", equals: 1 },
        ],
      }),
    ).to.deep.equal(field("a").eq(1));
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

  it("rejects an operand no provider records, alone or in a list or a nested rule", () => {
    expect(() => compile({ field: "amount", equals: 41n })).to.throw(
      Error,
      /Malformed row rule: equals must hold plain values/,
    );
    expect(() => compile({ field: "amount", in: [41, Symbol("x")] })).to.throw(
      Error,
      /Malformed row rule: in must hold plain values/,
    );
    expect(() =>
      compile({ not: { field: "amount", notEquals: () => 1 } }),
    ).to.throw(Error, /Malformed row rule: notEquals must hold plain values/);
  });

  it("keeps compiling a valid rule that carries a shadowed operator", () => {
    expect(
      compile({
        field: "amount",
        equals: 41,
        and: [{ field: "a", equals: 1 }],
      }),
    ).to.deep.equal(field("a").eq(1));
  });
});
