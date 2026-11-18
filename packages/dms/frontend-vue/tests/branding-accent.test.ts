/**
 * A custom accent becomes a brand palette: 11 shades around the picked color,
 * with the ink on the accent fill and the accent text on white readable, that
 * the editor writes as variables and reads back as the Custom swatch.
 */
import { describe, expect, it } from "vitest";
import {
  AA_CONTRAST,
  brandPalette,
  brandVariables,
  contrastRatio,
  customAccentOf,
  isBrandVariable,
  normalizeHex,
  onFillOf,
} from "../layers/dms-layout/app/entries/branding/model";

const PALETTE_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const PICKS = [
  "#3b82f6",
  "#e11d48",
  "#16a34a",
  "#f59e0b",
  "#ffe600",
  "#7c3aed",
  "#0f766e",
  "#1e3a8a",
  "#111827",
  "#d1d5db",
  "#808080",
];

function palette(color: string) {
  const built = brandPalette(color);
  if (!built) throw new Error(`no palette for ${color}`);
  return built;
}

const hexAt = (color: string, shade: number) =>
  palette(color).find((entry) => entry.shade === shade)?.hex ?? "";

/** The lightness a viewer sees: relative luminance, which only falls as a color darkens. */
function luminanceOf(hex: string): number {
  const linear = (start: number) => {
    const unit = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5);
}

describe("normalizeHex", () => {
  it("takes #rgb and #rrggbb in any case, and nothing else", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex(" #3B82F6 ")).toBe("#3b82f6");
    expect(normalizeHex("3b82f6")).toBeUndefined();
    expect(normalizeHex("#3b82f")).toBeUndefined();
    expect(normalizeHex("red")).toBeUndefined();
    expect(normalizeHex("#3b82f6; color: red")).toBeUndefined();
  });
});

describe("brandPalette", () => {
  it("gives no palette for a value that is not a hex color", () => {
    expect(brandPalette("violet")).toBeUndefined();
  });

  it.each(PICKS)("builds the 11 shades, 50 to 950, for %s", (color) => {
    expect(palette(color).map((entry) => entry.shade)).toEqual([
      ...PALETTE_SHADES,
    ]);
    for (const { hex } of palette(color)) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(PICKS)("puts %s itself at shade 500", (color) => {
    expect(hexAt(color, 500)).toBe(color);
  });

  it("puts a short hex at 500 in its long form", () => {
    expect(hexAt("#F80", 500)).toBe("#ff8800");
  });

  it.each(PICKS)("gets darker from shade 50 to 950 for %s", (color) => {
    const lightness = palette(color).map((entry) => luminanceOf(entry.hex));
    lightness.slice(1).forEach((value, index) => {
      expect(value).toBeLessThan(lightness[index] ?? 0);
    });
  });

  it.each(PICKS)("keeps the ink on the accent fill at AA for %s", (color) => {
    const ink = onFillOf(hexAt(color, 950));
    expect(contrastRatio(hexAt(color, 400), ink)).toBeGreaterThanOrEqual(
      AA_CONTRAST,
    );
  });

  it.each(PICKS)("keeps the accent text on white at AA for %s", (color) => {
    expect(contrastRatio(hexAt(color, 700), "#ffffff")).toBeGreaterThanOrEqual(
      AA_CONTRAST,
    );
  });

  it("lifts the fill of a dark pick instead of leaving unreadable ink on it", () => {
    expect(contrastRatio("#1e3a8a", onFillOf("#0a1230"))).toBeLessThan(
      AA_CONTRAST,
    );
    expect(luminanceOf(hexAt("#1e3a8a", 400))).toBeGreaterThan(
      luminanceOf("#1e3a8a"),
    );
  });

  it("keeps the hue of the pick along the ramp", () => {
    const [red, green, blue] = [1, 3, 5].map((start) =>
      Number.parseInt(hexAt("#3b82f6", 300).slice(start, start + 2), 16),
    );
    expect(blue).toBeGreaterThan(green ?? 0);
    expect(green).toBeGreaterThan(red ?? 0);
  });

  it("gives a gray pick a gray ramp", () => {
    for (const { hex } of palette("#808080")) {
      const [red, green, blue] = [1, 3, 5].map((start) =>
        Number.parseInt(hex.slice(start, start + 2), 16),
      );
      expect(Math.abs((red ?? 0) - (blue ?? 0))).toBeLessThanOrEqual(2);
      expect(Math.abs((green ?? 0) - (blue ?? 0))).toBeLessThanOrEqual(2);
    }
  });
});

describe("brand variables", () => {
  it("name the 11 shades --color-brand-<shade>", () => {
    const names = Object.keys(brandVariables(palette("#3b82f6")));
    expect(names).toEqual(
      PALETTE_SHADES.map((shade) => `--color-brand-${shade}`),
    );
    expect(names.every(isBrandVariable)).toBe(true);
    expect(isBrandVariable("--color-brand-500x")).toBe(false);
    expect(isBrandVariable("--color-acme-500")).toBe(false);
  });
});

describe("customAccentOf", () => {
  const draft = (primary: string | undefined, shade500: string | undefined) => {
    const shared: Record<string, string> = {};
    if (shade500) shared["--color-brand-500"] = shade500;
    const colors: Record<string, string> = {};
    if (primary) colors.primary = primary;
    return { variables: { shared, light: {}, dark: {} }, colors, logos: {} };
  };

  it("reads the color of the brand palette the primary points at", () => {
    expect(customAccentOf(draft("brand", "#3B82F6"))).toBe("#3b82f6");
  });

  it("reads nothing for a preset, even with brand shades left over", () => {
    expect(customAccentOf(draft("violet", "#3b82f6"))).toBeUndefined();
    expect(customAccentOf(draft(undefined, "#3b82f6"))).toBeUndefined();
  });

  it("reads nothing when the brand 500 is not a hex color", () => {
    expect(
      customAccentOf(draft("brand", "oklch(0.6 0.2 250)")),
    ).toBeUndefined();
    expect(customAccentOf(draft("brand", undefined))).toBeUndefined();
  });
});
