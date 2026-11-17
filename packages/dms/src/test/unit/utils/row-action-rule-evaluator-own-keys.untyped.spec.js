import { expect } from "chai";
import { evaluateRowActionRule } from "../../../utils";

describe("[unit] utils/row-action-rule-evaluator own keys", () => {
  const row = {
    status: "active",
    profile: { country: "FR" },
    tags: ["a", "b"],
  };

  it("rejects an and rule that does not hold an array", () => {
    const rule = { and: "x" };
    expect(() => evaluateRowActionRule(rule, row)).to.throw(TypeError);
  });

  it("rejects a field rule whose field is not a string", () => {
    const rule = { field: 5, equals: 5 };
    expect(() => evaluateRowActionRule(rule, row)).to.throw(TypeError);
  });
});
