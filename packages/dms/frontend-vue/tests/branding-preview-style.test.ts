/** @vitest-environment jsdom */
/**
 * The preview's root carries the DMS tokens of one mode, read from the
 * stylesheets, then the draft: the saved theme and the other mode never reach
 * it.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  previewStyle,
  readDmsTokens,
  type DmsTokens,
} from "../layers/dms-layout/app/entries/branding/model";

function addStyle(css: string, devId?: string): void {
  const element = document.createElement("style");
  if (devId) element.setAttribute("data-vite-dev-id", devId);
  element.textContent = css;
  document.head.append(element);
}

afterEach(() => {
  document.head.innerHTML = "";
});

const TOKENS: DmsTokens = {
  light: { "--ui-bg": "#ffffff", "--ui-radius": "0.333rem" },
  dark: { "--ui-bg": "#15151b" },
};

const NO_THEME = {
  variables: { shared: {}, light: {}, dark: {} },
  colors: {},
  logos: {},
};

describe("readDmsTokens", () => {
  it("reads :root and .dark from nested rules, raw, and skips the project's theme and :root variants", () => {
    addStyle(
      `@media all { :root { --ui-primary: var(--ui-color-primary-700); } }
       .dark { --ui-primary: var(--ui-color-primary-400); }
       :root.dms-increase-contrast { --ui-border: black; }`,
    );
    addStyle(
      ":root { --ui-primary: red; } .dark { --ui-bg: navy; }",
      "/project/frontend-vue/app/assets/css/theme.css",
    );
    expect(readDmsTokens(Array.from(document.styleSheets))).toEqual({
      light: { "--ui-primary": "var(--ui-color-primary-700)" },
      dark: { "--ui-primary": "var(--ui-color-primary-400)" },
    });
  });
});

describe("previewStyle", () => {
  it("keeps a dark-only draft value out of the light preview", () => {
    const draft = {
      ...NO_THEME,
      variables: { shared: {}, light: {}, dark: { "--ui-bg": "#000000" } },
    };
    const light = previewStyle({
      tokens: TOKENS,
      draft,
      mode: "light",
      dmsColors: {},
    });
    const dark = previewStyle({
      tokens: TOKENS,
      draft,
      mode: "dark",
      dmsColors: {},
    });
    expect(light["--ui-bg"]).toBe("#ffffff");
    expect(dark["--ui-bg"]).toBe("#000000");
  });

  it("falls back to the DMS default for a value the draft removed", () => {
    const style = previewStyle({
      tokens: TOKENS,
      draft: NO_THEME,
      mode: "dark",
      dmsColors: {},
    });
    expect(style["--ui-radius"]).toBe("0.333rem");
    expect(style["--ui-bg"]).toBe("#15151b");
  });

  it("paints each role with the draft's palette, else the DMS's", () => {
    const style = previewStyle({
      tokens: TOKENS,
      draft: { ...NO_THEME, colors: { primary: "violet" } },
      mode: "light",
      dmsColors: { primary: "dms", neutral: "neutral" },
    });
    expect(style["--ui-color-primary-500"]).toMatch(/^oklch\(/);
    expect(style["--ui-color-neutral-50"]).toMatch(/^oklch\(/);
    expect(
      previewStyle({
        tokens: TOKENS,
        draft: NO_THEME,
        mode: "light",
        dmsColors: { primary: "dms" },
      })["--ui-color-primary-500"],
    ).toBe("var(--color-dms-500)");
  });
});
