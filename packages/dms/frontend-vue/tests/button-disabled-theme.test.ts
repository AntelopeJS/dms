import { describe, expect, it } from "vitest";
import { twMerge } from "tailwind-merge";
import appConfig from "../layers/dms-layout/app/app.config";

// Nuxt UI 4's own button base, which the app config is merged over.
const NUXT_UI_BUTTON_BASE =
  "rounded-md font-medium inline-flex items-center disabled:cursor-not-allowed aria-disabled:cursor-not-allowed disabled:opacity-75 aria-disabled:opacity-75";

describe("button theme", () => {
  const merged = twMerge(NUXT_UI_BUTTON_BASE, appConfig.ui.button.slots.base);

  it("fades disabled buttons past Nuxt UI's default", () => {
    expect(merged).toContain("disabled:opacity-50");
    expect(merged).toContain("aria-disabled:opacity-50");
    expect(merged).not.toContain("opacity-75");
  });

  it("cancels the press effect on a disabled button", () => {
    expect(merged).toContain("disabled:active:scale-100");
  });
});
