import { describe, expect, it } from "vitest";
import { filterEditorValue } from "../layers/dms-ui/app/build/composables/table/utils/filterEditorValue";

describe("filterEditorValue", () => {
  it("hands a number input a view's numeric text as a number", () => {
    expect(filterEditorValue("dms-input-number", "0")).toBe(0);
    expect(filterEditorValue("dms-input-percentage", "0.25")).toBe(0.25);
  });

  it("keeps a text a number input cannot read", () => {
    expect(filterEditorValue("dms-input-number", "")).toBe("");
    expect(filterEditorValue("dms-input-number", "{{amount}}")).toBe(
      "{{amount}}",
    );
  });

  it("hands a boolean control a boolean", () => {
    expect(filterEditorValue("dms-switch", "true")).toBe(true);
    expect(filterEditorValue("dms-checkbox", "false")).toBe(false);
  });

  it("splits a date range into its two days", () => {
    expect(
      filterEditorValue("dms-date-picker-range", "2026-10-01,2026-10-15"),
    ).toEqual(["2026-10-01", "2026-10-15"]);
  });

  it("leaves a typed value, and a text editor's value, as they are", () => {
    expect(filterEditorValue("dms-input-number", 12)).toBe(12);
    expect(filterEditorValue("dms-date-picker", "{{now-21d}}")).toBe(
      "{{now-21d}}",
    );
    expect(filterEditorValue("dms-select", "true")).toBe("true");
    expect(filterEditorValue(undefined, "0")).toBe("0");
  });
});
