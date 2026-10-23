/**
 * The corners of the pill tabs: tokens derived from `--ui-radius`, so a theme
 * that changes the radius reaches the tabs too, and the v2 sizes at the
 * default radius.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import appConfig from "../layers/dms-layout/app/app.config";

const STYLESHEET = resolve(
  __dirname,
  "../layers/dms-layout/app/assets/css/main.css",
);
/** A radius in pixels or rem written into a class: `rounded-[10px]`. */
const FIXED_RADIUS = /rounded(?:-[a-z]+)?-\[\d/;
const ROOT_FONT_SIZE_PX = 16;
/** The DMS's `--ui-radius`, `calc(0.5rem / 1.5)`, in pixels. */
const DEFAULT_UI_RADIUS_PX = (ROOT_FONT_SIZE_PX * 0.5) / 1.5;
const V2_TAB_RADII_PX: Record<string, number> = {
  "--dms-radius-tab-list": 10,
  "--dms-radius-tab": 7,
  "--dms-radius-tab-badge": 4,
};

function radiusFactor(css: string, token: string): number | undefined {
  const declaration = new RegExp(
    `${token}:\\s*calc\\(var\\(--ui-radius\\)\\s*\\*\\s*([\\d.]+)\\)`,
  ).exec(css);
  return declaration ? Number(declaration[1]) : undefined;
}

describe("pill tabs theme", () => {
  const pill = appConfig.ui.tabs.variants.variant.pill;

  it("takes every corner from a radius token, none in pixels", () => {
    const classes = [
      pill.list,
      pill.indicator,
      pill.trigger,
      appConfig.ui.tabs.slots.trailingBadge,
    ];
    for (const value of classes) {
      expect(value).not.toMatch(FIXED_RADIUS);
      expect(value).toMatch(/rounded-\(--dms-radius-tab(?:-list|-badge)?\)/);
    }
  });

  it("derives the tokens from --ui-radius, at the v2 sizes by default", () => {
    const css = readFileSync(STYLESHEET, "utf8");
    for (const [token, pixels] of Object.entries(V2_TAB_RADII_PX)) {
      const factor = radiusFactor(css, token);
      expect(factor, token).toBeDefined();
      expect((factor ?? 0) * DEFAULT_UI_RADIUS_PX, token).toBeCloseTo(pixels);
    }
  });
});
