import { describe, expect, it } from "vitest";
import * as legacy from "../layers/dms-ui/app/build/composables/form/useControlError";
import { useControlError } from "../layers/dms-ui/app/composables/form/useControlError";
import { FORM_CONTROL_ERRORS_KEY } from "../layers/dms-ui/app/build/composables/form/formControlErrors";

describe("useControlError location", () => {
  it("stays importable from its former build/ path", () => {
    expect(legacy.useControlError).toBe(useControlError);
    expect(legacy.FORM_CONTROL_ERRORS_KEY).toBe(FORM_CONTROL_ERRORS_KEY);
  });
});
