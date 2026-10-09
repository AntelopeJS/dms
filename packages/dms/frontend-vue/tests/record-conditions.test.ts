/**
 * The `when` / `unavailableWhen` conditions of a record action, evaluated in
 * the browser on the record the page shows: a field equal to a value, in a
 * list, truthy or not, and `all` / `any` / `not` around them.
 */
import { describe, expect, it } from "vitest";
import {
  matchesRecordCondition,
  recordActionState,
} from "../layers/dms-ui/app/build/utils/recordConditions";
import type {
  RecordAction,
  RecordCondition,
} from "../layers/dms-ui/app/types/record-action";

const WORKSPACE = {
  status: "past_due",
  billed: true,
  stripeCustomerId: "",
  seats: 0,
  members: [],
  plan: { name: "Business" },
};

const holds = (condition: RecordCondition) =>
  matchesRecordCondition(condition, WORKSPACE);

const ACTION: RecordAction = {
  label: "Suspend",
  target: { type: "api", url: "/suspend", successMessage: "Suspended" },
};

describe("a record condition", () => {
  it("compares a field with a value, through a dotted path", () => {
    expect(holds({ field: "status", equals: "past_due" })).toBe(true);
    expect(holds({ field: "status", equals: "active" })).toBe(false);
    expect(holds({ field: "plan.name", equals: "Business" })).toBe(true);
    // A missing field equals nothing, not even null.
    expect(holds({ field: "joinedAt", equals: null })).toBe(false);
  });

  it("checks a field against a list", () => {
    expect(holds({ field: "status", in: ["active", "past_due"] })).toBe(true);
    expect(holds({ field: "status", in: ["cancelled"] })).toBe(false);
  });

  it("reads an empty string, zero, a missing field and an empty list as falsy", () => {
    expect(holds({ field: "billed", truthy: true })).toBe(true);
    for (const field of ["stripeCustomerId", "seats", "joinedAt", "members"]) {
      expect(holds({ field, truthy: false }), field).toBe(true);
    }
  });

  it("combines conditions with all, any and not", () => {
    const billed = { field: "billed", truthy: true };
    const suspended = { field: "status", equals: "suspended" };
    expect(holds({ all: [billed, { not: suspended }] })).toBe(true);
    expect(holds({ all: [billed, suspended] })).toBe(false);
    expect(holds({ any: [suspended, billed] })).toBe(true);
    expect(holds({ any: [] })).toBe(false);
    expect(holds({ all: [] })).toBe(true);
  });

  it("never holds on an unknown operator", () => {
    expect(
      holds({ field: "status", matches: "past" } as unknown as RecordCondition),
    ).toBe(false);
  });
});

describe("a record action's state", () => {
  it("shows an action only while its `when` holds", () => {
    const whenActive = {
      ...ACTION,
      when: { field: "status", in: ["active", "past_due"] },
    };
    expect(recordActionState(whenActive, WORKSPACE).isVisible).toBe(true);
    expect(
      recordActionState(whenActive, { ...WORKSPACE, status: "suspended" })
        .isVisible,
    ).toBe(false);
  });

  it("disables an action with the reason of the first condition that holds", () => {
    const credit = {
      ...ACTION,
      unavailableWhen: [
        { field: "billed", truthy: false, reason: "$not_billed" },
        { field: "stripeCustomerId", truthy: false, reason: "$no_customer" },
        { field: "status", equals: "past_due", reason: "$past_due" },
      ],
    };
    expect(recordActionState(credit, WORKSPACE)).toEqual({
      isVisible: true,
      isDisabled: true,
      disabledReason: "$no_customer",
    });
    expect(
      recordActionState(credit, {
        ...WORKSPACE,
        status: "active",
        stripeCustomerId: "cus_1",
      }),
    ).toEqual({
      isVisible: true,
      isDisabled: false,
      disabledReason: undefined,
    });
  });

  it("holds back a conditional action until the record has loaded", () => {
    expect(
      recordActionState(
        { ...ACTION, when: { field: "billed", truthy: true } },
        null,
      ).isVisible,
    ).toBe(false);
    expect(
      recordActionState(
        {
          ...ACTION,
          unavailableWhen: { field: "billed", truthy: false, reason: "$x" },
        },
        null,
      ),
    ).toEqual({ isVisible: true, isDisabled: true });
    expect(recordActionState(ACTION, null)).toEqual({
      isVisible: true,
      isDisabled: false,
    });
  });

  it("keeps the reason of a button the server disabled", () => {
    const refused = {
      ...ACTION,
      disabled: true,
      disabledReason: "$seats.full",
      unavailableWhen: { field: "billed", truthy: true, reason: "$billed" },
    };
    expect(recordActionState(refused, WORKSPACE)).toEqual({
      isVisible: true,
      isDisabled: true,
      disabledReason: "$seats.full",
    });
  });
});
