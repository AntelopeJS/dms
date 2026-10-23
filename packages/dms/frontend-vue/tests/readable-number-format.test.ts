/**
 * Figures group their digits from four on in every locale ("1 234" beside
 * "12 345", where Spanish or Polish would leave "1234"), with the locale's own
 * separator: French's narrow no-break space is drawn wide enough by the
 * interface's font (see geist-narrow-space.test.ts).
 */
import { describe, expect, it } from "vitest";
import {
  formatNumber,
  formatPercentage,
  formatPrice,
  readableNumberFormat,
} from "../layers/dms-core/app/utils/formatter";

const NBSP = "\u00A0";
const NARROW_NBSP = "\u202F";

describe("readableNumberFormat", () => {
  it("groups a four-digit figure with French's narrow no-break space", () => {
    expect(readableNumberFormat("fr-FR").format(1234)).toBe(
      `1${NARROW_NBSP}234`,
    );
    expect(readableNumberFormat("fr-FR").format(12345)).toBe(
      `12${NARROW_NBSP}345`,
    );
    expect(formatNumber(1712.2, "fr-FR")).toBe(`1${NARROW_NBSP}712,2`);
  });

  it("groups a four-digit figure where the locale would not", () => {
    expect(formatNumber(1234, "es-ES")).toBe("1.234");
    expect(formatNumber(1234, "pl-PL")).toBe(`1${NBSP}234`);
  });

  it("leaves the separators of the other parts alone", () => {
    expect(formatPrice(7700, "fr-FR")).toBe(`7${NARROW_NBSP}700,00${NBSP}€`);
    expect(formatPercentage(0.25, "fr-FR")).toBe(
      new Intl.NumberFormat("fr-FR", { style: "percent" }).format(0.25),
    );
  });

  it("lets the options turn the grouping off", () => {
    expect(formatNumber(1234, "fr-FR", { useGrouping: false })).toBe("1234");
  });

  it("splits a figure into parts with the same groups", () => {
    const parts = readableNumberFormat("fr-FR").formatToParts(1234);
    expect(parts.find((part) => part.type === "group")?.value).toBe(
      NARROW_NBSP,
    );
  });
});
