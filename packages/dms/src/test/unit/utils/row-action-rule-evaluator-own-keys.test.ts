import type { RowActionRule } from "@antelopejs/interface-dms/base/types/row-action";
import { expect } from "chai";
import { evaluateRowActionRule } from "../../../utils";

describe("[unit] utils/row-action-rule-evaluator own keys", () => {
  const row = {
    status: "active",
    profile: { country: "FR" },
    tags: ["a", "b"],
  };

  it("reads a field the row does not hold as absent when Object.prototype names it", () => {
    const rule = {
      field: "constructor",
      equals: undefined,
    } satisfies RowActionRule;
    expect(evaluateRowActionRule(rule, row)).to.equal(true);
  });

  it("reads a nested field the object does not hold as absent when Object.prototype names it", () => {
    const rule = {
      field: "profile.toString",
      notIn: ["x"],
    } satisfies RowActionRule;
    expect(evaluateRowActionRule(rule, row)).to.equal(true);
    const absent = {
      field: "profile.toString",
      equals: undefined,
    } satisfies RowActionRule;
    expect(evaluateRowActionRule(absent, row)).to.equal(true);
  });

  it("still reads an own field named like an Object.prototype key", () => {
    const own = { constructor: "mine" };
    const rule = {
      field: "constructor",
      equals: "mine",
    } satisfies RowActionRule;
    expect(evaluateRowActionRule(rule, own)).to.equal(true);
  });

  it("still reads array members and length", () => {
    expect(
      evaluateRowActionRule({ field: "tags.length", equals: 2 }, row),
    ).to.equal(true);
    expect(
      evaluateRowActionRule({ field: "tags.1", equals: "b" }, row),
    ).to.equal(true);
  });

  it("rejects an and rule that does not hold an array", () => {
    const rule = { and: "x" };
    // @ts-expect-error The and operand is a string, off contract; the evaluator must still reject it with a TypeError.
    expect(() => evaluateRowActionRule(rule, row)).to.throw(TypeError);
  });

  it("rejects a field rule whose field is not a string", () => {
    const rule = { field: 5, equals: 5 };
    // @ts-expect-error The field is a number, off contract; the evaluator must still reject it with a TypeError.
    expect(() => evaluateRowActionRule(rule, row)).to.throw(TypeError);
  });
});
