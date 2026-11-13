import { expect } from "chai";
import { evaluateRowActionRule } from "../../../utils";

const ROW_ACTIVE_ADMIN = {
  status: "active",
  role: "admin",
  age: 30,
  profile: { verified: true, country: "FR" },
};

describe("[unit] utils/row-action-rule-evaluator", () => {
  describe("fallback behaviour", () => {
    it("returns false when the rule has no known operator", () => {
      const rule = {};
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(false);
    });

    it("returns false when field is set but no operator is provided", () => {
      const rule = { field: "status" };
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(false);
    });
  });
});
