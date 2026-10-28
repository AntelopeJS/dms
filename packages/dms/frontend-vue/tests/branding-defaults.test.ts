import { defu } from "defu";
import { describe, expect, it } from "vitest";
import appConfig from "../layers/dms-layout/app/app.config";

const ANTELOPE_ICON = "/images/antelope-logo/icon.svg";

describe("branding defaults", () => {
  it("hold the palettes and logos the layout ships", () => {
    expect(appConfig.branding.defaults).toEqual({
      colors: appConfig.ui.colors,
      logo: appConfig.branding.logo,
    });
    expect(appConfig.branding.defaults.colors.primary).toBe("dms");
    expect(appConfig.branding.logo.favicon).toEqual({
      light: ANTELOPE_ICON,
      dark: ANTELOPE_ICON,
    });
  });

  it("survive a live edit of the merged palette and logos", () => {
    const merged = defu(
      { branding: { footer: { localeSwitcher: false } } },
      structuredClone(appConfig),
    );

    merged.ui.colors.primary = "violet";
    merged.branding.logo.favicon!.light = "/branding/icon.png";

    expect(merged.branding.defaults.colors.primary).toBe("dms");
    expect(merged.branding.defaults.logo.favicon?.light).toBe(ANTELOPE_ICON);
  });
});
