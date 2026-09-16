import type { RowActionRule } from "@antelopejs/interface-dms/base/types/row-action";
import { expect } from "chai";
import { evaluateRowActionRule } from "../../../utils/row-action-rule-evaluator";

const ROW_ACTIVE_ADMIN = {
  status: "active",
  role: "admin",
  age: 30,
  profile: { verified: true, country: "FR" },
};

const ROW_INACTIVE_USER = {
  status: "inactive",
  role: "user",
  age: 18,
  profile: { verified: false, country: "BE" },
};

describe("[unit] utils/row-action-rule-evaluator", () => {
  describe("field operators", () => {
    it("evaluates equals to true when the field matches", () => {
      const rule = { field: "status", equals: "active" } as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(true);
    });

    it("evaluates equals to false when the field differs", () => {
      const rule = { field: "status", equals: "active" } as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_INACTIVE_USER)).to.equal(false);
    });

    it("evaluates notEquals correctly", () => {
      const rule = { field: "role", notEquals: "admin" } as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(false);
      expect(evaluateRowActionRule(rule, ROW_INACTIVE_USER)).to.equal(true);
    });

    it("evaluates in against an array of values", () => {
      const rule = {
        field: "role",
        in: ["admin", "editor"],
      } as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(true);
      expect(evaluateRowActionRule(rule, ROW_INACTIVE_USER)).to.equal(false);
    });

    it("evaluates notIn against an array of values", () => {
      const rule = {
        field: "role",
        notIn: ["admin", "editor"],
      } as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(false);
      expect(evaluateRowActionRule(rule, ROW_INACTIVE_USER)).to.equal(true);
    });

    it("supports dotted field paths", () => {
      const rule = {
        field: "profile.verified",
        equals: true,
      } as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(true);
      expect(evaluateRowActionRule(rule, ROW_INACTIVE_USER)).to.equal(false);
    });

    it("returns false when a dotted field path is missing", () => {
      const rule = {
        field: "profile.missing.deep",
        equals: "x",
      } as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(false);
    });
  });

  describe("logical operators", () => {
    it("evaluates and with all children truthy", () => {
      const rule = {
        and: [
          { field: "status", equals: "active" },
          { field: "role", equals: "admin" },
        ],
      } as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(true);
    });

    it("evaluates and to false if any child is false", () => {
      const rule = {
        and: [
          { field: "status", equals: "active" },
          { field: "role", equals: "user" },
        ],
      } as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(false);
    });

    it("evaluates or with at least one truthy child", () => {
      const rule = {
        or: [
          { field: "status", equals: "archived" },
          { field: "role", equals: "admin" },
        ],
      } as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(true);
    });

    it("evaluates or to false when all children are false", () => {
      const rule = {
        or: [
          { field: "status", equals: "archived" },
          { field: "role", equals: "editor" },
        ],
      } as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(false);
    });

    it("evaluates not by negating its child", () => {
      const rule = {
        not: { field: "status", equals: "active" },
      } as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(false);
      expect(evaluateRowActionRule(rule, ROW_INACTIVE_USER)).to.equal(true);
    });

    it("supports nesting logical operators", () => {
      const rule = {
        and: [
          { field: "status", equals: "active" },
          {
            or: [
              { field: "role", equals: "editor" },
              { not: { field: "profile.verified", equals: false } },
            ],
          },
        ],
      } as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(true);
      expect(evaluateRowActionRule(rule, ROW_INACTIVE_USER)).to.equal(false);
    });

    it("evaluates an empty and rule to true", () => {
      const rule = { and: [] } as unknown as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(true);
    });

    it("evaluates an empty or rule to false", () => {
      const rule = { or: [] } as unknown as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(false);
    });
  });

  describe("fallback behaviour", () => {
    it("returns false when the rule has no known operator", () => {
      const rule = {} as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(false);
    });

    it("returns false when field is set but no operator is provided", () => {
      const rule = { field: "status" } as unknown as RowActionRule;
      expect(evaluateRowActionRule(rule, ROW_ACTIVE_ADMIN)).to.equal(false);
    });
  });
});
