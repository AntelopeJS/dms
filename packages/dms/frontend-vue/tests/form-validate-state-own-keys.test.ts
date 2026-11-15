import { describe, expect, it } from "vitest";
import * as z from "zod";
import { validateFormState } from "../layers/dms-ui/app/entries/composables/form/formValidation";

describe("validateFormState", () => {
  it("reads a field the state does not hold as empty, whatever Object.prototype holds", async () => {
    const result = await validateFormState(
      z.object({ toString: z.string().optional() }),
      {},
      {
        fields: [{ id: "toString", required: true }],
        requiredMessage: "required",
      },
    );
    expect(result).toEqual({
      issues: [{ message: "required", path: ["toString"] }],
    });
  });
});
