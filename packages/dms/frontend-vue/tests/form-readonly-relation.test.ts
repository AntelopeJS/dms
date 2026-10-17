import { describe, expect, it } from "vitest";
import { readonlyDisplayValue } from "../layers/dms-ui/app/build/composables/form/readonlyValue";
import { sameRelationValue } from "../layers/dms-ui/app/build/composables/data-types/relationValue";

describe("readonlyDisplayValue", () => {
  const options = { keyMapping: { label: "name", value: "_id" } };
  const customer = { _id: "cust-025", name: "Catherine Remacle" };

  it("shows a relation as loaded, with its label, while the form holds it", () => {
    expect(
      readonlyDisplayValue("cust-025", customer, sameRelationValue, options),
    ).toBe(customer);
  });

  it("shows the form's value once it differs, or without a comparer", () => {
    expect(
      readonlyDisplayValue("cust-026", customer, sameRelationValue, options),
    ).toBe("cust-026");
    expect(readonlyDisplayValue("a", "b", undefined)).toBe("a");
    expect(readonlyDisplayValue("a", undefined, sameRelationValue)).toBe("a");
  });
});
