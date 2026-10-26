/**
 * A refused submit's field error stays under its field until the value
 * changes or the form is saved. UForm re-validating the field from its
 * schema in between (a number input committing its value on blur, its input
 * event landing 300 ms later, after the refusal) replaced the error with
 * none: a second submit of the same refused value showed nothing at all.
 */
import { describe, expect, it } from "vitest";
import {
  changedServerErrorFields,
  keptServerErrors,
  serverErrorValue,
  type KeptServerError,
} from "../layers/dms-ui/app/entries/composables/form/serverFieldErrors";

const RATE_ERROR = { name: "rate", message: "A business pays 21%." };

const STREET_ERROR = { name: "address.street", message: "Unknown street." };

const kept = new Map<string, KeptServerError>([
  ["rate", { value: serverErrorValue(0.06), errors: [RATE_ERROR] }],
  [
    "address",
    { value: serverErrorValue({ street: "Nowhere" }), errors: [STREET_ERROR] },
  ],
]);

const REFUSED = { rate: 0.06, address: { street: "Nowhere" } };

describe("keptServerErrors", () => {
  it("answers a re-validation with the errors of the fields still refused", () => {
    expect(keptServerErrors(kept, REFUSED, false)).toEqual([
      RATE_ERROR,
      STREET_ERROR,
    ]);
  });

  it("leaves out a field whose value moved", () => {
    expect(
      keptServerErrors(
        kept,
        { rate: 0.06, address: { street: "Main St" } },
        false,
      ),
    ).toEqual([RATE_ERROR]);
  });

  it("never stops a submit: the server judges the values again", () => {
    expect(keptServerErrors(kept, REFUSED, true)).toEqual([]);
  });
});

describe("changedServerErrorFields", () => {
  it("names the fields whose value moved off the refused one", () => {
    expect(
      changedServerErrorFields(kept, {
        rate: 0.21,
        address: { street: "Nowhere" },
      }),
    ).toEqual(["rate"]);
  });

  it("keeps a field set again to the same value", () => {
    expect(
      changedServerErrorFields(kept, {
        rate: 0.06,
        address: { street: "Nowhere" },
      }),
    ).toEqual([]);
  });

  it("compares a cleared field as changed", () => {
    expect(
      changedServerErrorFields(kept, { address: { street: "Nowhere" } }),
    ).toEqual(["rate"]);
  });
});
