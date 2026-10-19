/**
 * A refused submit's field error stays under its field until the value
 * changes or the form is saved. UForm re-validating the field from its
 * schema in between (a number input committing its value on blur, its input
 * event landing 300 ms later, after the refusal) replaced the error with
 * none: a second submit of the same refused value showed nothing at all.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  changedServerErrorFields,
  droppedServerErrors,
  serverErrorValue,
  type KeptServerError,
} from "../layers/dms-ui/app/build/composables/form/serverFieldErrors";

const RATE_ERROR = { name: "rate", message: "A business pays 21%." };
const ADDRESS_ERROR = {
  name: "address",
  path: "address.street",
  message: "Unknown street.",
};

const kept = new Map<string, KeptServerError>([
  ["rate", { value: serverErrorValue(0.06), error: RATE_ERROR }],
  [
    "address",
    { value: serverErrorValue({ street: "Nowhere" }), error: ADDRESS_ERROR },
  ],
]);

/** A form holding errors under these names, as UForm answers `getErrors`. */
const formWith = (names: string[]) => ({
  getErrors: (pattern: RegExp) => names.filter((name) => pattern.test(name)),
});

describe("droppedServerErrors", () => {
  it("returns the kept errors their field lost to a re-validation", () => {
    expect(droppedServerErrors(kept, formWith(["address.street"]))).toEqual([
      RATE_ERROR,
    ]);
  });

  it("counts an error on a part of the field as still shown", () => {
    expect(
      droppedServerErrors(kept, formWith(["rate", "address.street"])),
    ).toEqual([]);
  });

  it("returns none when nothing is kept", () => {
    expect(droppedServerErrors(new Map(), formWith([]))).toEqual([]);
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

describe("the form", () => {
  const form = readFileSync(
    new URL("../layers/dms-ui/app/components/form/Form.vue", import.meta.url),
    "utf8",
  );

  it("puts back a server error a re-validation dropped", () => {
    expect(form).toMatch(
      /watch\(\s*\(\) => form\.value\?\.errors,[\s\S]*?droppedServerErrors\(serverErrors, target\)[\s\S]*?placeServerError\(target, error\)/,
    );
  });

  it("lets go of an error its field no longer takes", () => {
    expect(form).toMatch(
      /placeServerError\(target, error\);\s*if \(target\.getErrors\(fieldErrorPattern\(error\.name\)\)\.length\) continue;\s*serverErrors\.delete\(error\.name\);/,
    );
  });

  it("forgets the server errors once saved", () => {
    const markClean = /function markFormClean\(\): void \{[\s\S]*?\n\}/.exec(
      form,
    )?.[0];
    expect(markClean).toContain("clearServerErrors();");
  });
});
