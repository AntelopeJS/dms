import { describe, expect, it } from "vitest";
import { formatPrice } from "../layers/dms-core/app/utils/formatter";

describe("formatPrice currency", () => {
  it("writes euros when the field states no currency", () => {
    expect(formatPrice(1234.5, "en-GB")).toBe("€1,234.50");
  });

  it("writes the currency the field states", () => {
    expect(formatPrice(1234.5, "en-GB", { currency: "USD" })).toBe(
      "US$1,234.50",
    );
    expect(formatPrice(1234.5, "en-US", { currency: "usd" })).toBe("$1,234.50");
  });

  it("keeps an amount as an amount when the code is malformed", () => {
    expect(formatPrice(5, "en-GB", { currency: "dollars" })).toBe("€5.00");
    expect(formatPrice(5, "en-GB", { currency: "" })).toBe("€5.00");
  });
});
