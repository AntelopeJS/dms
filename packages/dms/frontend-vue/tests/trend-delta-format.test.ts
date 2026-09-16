import { describe, expect, it } from "vitest";
import { formatDeltaPercent } from "../layers/dms-ui/app/composables/chart/formatValue";

describe("formatDeltaPercent", () => {
  it("uses the French decimal comma and an explicit sign", () => {
    expect(formatDeltaPercent(12.3, "fr-FR")).toMatch(/^\+12,3\s?%$/);
  });

  it("uses the English decimal point", () => {
    expect(formatDeltaPercent(12.3, "en-GB")).toBe("+12.3%");
  });

  it("keeps the minus sign on a drop", () => {
    expect(formatDeltaPercent(-6.5, "en-GB")).toBe("-6.5%");
  });

  it("drops the sign on zero", () => {
    expect(formatDeltaPercent(0, "en-GB")).toBe("0.0%");
  });

  it("always shows one fraction digit", () => {
    expect(formatDeltaPercent(8, "en-GB")).toBe("+8.0%");
  });
});
