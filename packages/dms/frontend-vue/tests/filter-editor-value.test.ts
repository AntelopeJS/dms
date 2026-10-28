import { describe, expect, it } from "vitest";
import {
  dateFilterEditorValue,
  filterEditorValue,
  numberFilterEditorValue,
} from "../layers/dms-ui/app/entries/composables/table/utils/filterEditorValue";

const NUMBER = { filterEditorValue: numberFilterEditorValue };
const DATE = { filterEditorValue: dateFilterEditorValue };

describe("filterEditorValue", () => {
  it("hands a number type's editor a view's numeric text as a number", () => {
    expect(filterEditorValue(NUMBER, "is", "0")).toBe(0);
    expect(filterEditorValue(NUMBER, "greater_than", "0.25")).toBe(0.25);
  });

  it("keeps a text a number editor cannot read", () => {
    expect(filterEditorValue(NUMBER, "is", "")).toBe("");
    expect(filterEditorValue(NUMBER, "is", "{{amount}}")).toBe("{{amount}}");
  });

  it("splits a date range into its two days, and only a range", () => {
    expect(
      filterEditorValue(DATE, "is_between", "2026-10-01,2026-10-15"),
    ).toEqual(["2026-10-01", "2026-10-15"]);
    expect(filterEditorValue(DATE, "is", "2026-10-01")).toBe("2026-10-01");
    expect(filterEditorValue(DATE, "greater_than", "{{now-21d}}")).toBe(
      "{{now-21d}}",
    );
  });

  it("leaves a typed value, or a type without a conversion, as it is", () => {
    expect(filterEditorValue(NUMBER, "is", 12)).toBe(12);
    expect(filterEditorValue({}, "is", "true")).toBe("true");
    expect(filterEditorValue(undefined, "is", "0")).toBe("0");
  });
});
