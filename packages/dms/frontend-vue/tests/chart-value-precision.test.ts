import { describe, expect, it } from "vitest";
import {
  formatValue,
  formatValueParts,
} from "../layers/dms-ui/app/composables/chart/formatValue";
import type { ValueFormat } from "../layers/dms-ui/app/composables/chart/types";

describe("chart value precision", () => {
  it("preserves all legacy defaults", () => {
    expect(formatValue(9.39, "currency", "fr-FR")).toBe("9 €");
    expect(formatValue(9.3912)).toBe("9.391");
    expect(formatValue(9.39, "percent")).toBe("9.4%");
    expect(formatValue(1234, "compact")).toBe("1.2K");
  });

  it.each(["fr-FR", "en-GB", "ja-JP", "ar-KW"])(
    "uses native currency digits in %s",
    (locale) => {
      for (const currency of ["EUR", "JPY", "KWD"]) {
        for (const value of [9.391, 0, -9.391]) {
          const expected = new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
          }).format(value);
          expect(
            formatValue(value, "currency", locale, currency, "native"),
          ).toBe(expected);
        }
      }
    },
  );

  it.each<ValueFormat>(["number", "currency", "percent", "compact"])(
    "supports fixed precision for %s",
    (format) => {
      expect(formatValue(9.3, format, "en", "JPY", 2)).toContain("9.30");
      expect(formatValue(9.3, format, "en", "KWD", 0)).not.toContain(".");
    },
  );

  it("keeps KPI parts aligned with full strings and unit placement", () => {
    expect(
      formatValueParts(9.39, "currency", "fr-FR", "EUR", "native"),
    ).toEqual({ value: "9,39", unit: "€", unitIsPrefix: false });
    expect(formatValueParts(9.39, "currency", "en-US", "EUR", 3)).toEqual({
      value: "9.390",
      unit: "€",
      unitIsPrefix: true,
    });
    expect(formatValueParts(9.3, "number", "fr-FR", "EUR", 2).value).toBe(
      "9,30",
    );
  });
});
