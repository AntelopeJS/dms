import { describe, expect, it } from "vitest";
import enGB from "../layers/dms-layout/i18n/locales/layout-en-GB.json";
import fr from "../layers/dms-layout/i18n/locales/layout-fr-FR.json";
import {
  ACCOUNT_MENU_ENTRIES,
  ACCOUNT_SETTINGS_ROUTE,
  PROFILE_ROUTE,
  SETTINGS_ROUTE,
} from "../layers/dms-layout/app/utils/account-menu";

const ACCOUNT_CATEGORY_PATH = "/settings/user/";

function lookup(messages: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages,
    );
}

describe("account menu entries", () => {
  it("leaves every setting to the sidebar footer and opens the user's own", () => {
    const targets = ACCOUNT_MENU_ENTRIES.map((entry) => entry.to);
    expect(targets).not.toContain(SETTINGS_ROUTE);
    expect(targets).toContain(ACCOUNT_SETTINGS_ROUTE);
    expect(ACCOUNT_SETTINGS_ROUTE.startsWith(ACCOUNT_CATEGORY_PATH)).toBe(true);
    expect(ACCOUNT_SETTINGS_ROUTE).not.toBe(PROFILE_ROUTE);
  });

  it.each([
    ["en-GB", enGB, "Account settings"],
    ["fr", fr, "Paramètres du compte"],
  ])("labels Account settings in %s", (_locale, messages, label) => {
    const entry = ACCOUNT_MENU_ENTRIES.find(
      (item) => item.to === ACCOUNT_SETTINGS_ROUTE,
    )!;
    expect(lookup(messages, entry.labelKey)).toBe(label);
    ACCOUNT_MENU_ENTRIES.forEach((item) =>
      expect(typeof lookup(messages, item.labelKey)).toBe("string"),
    );
  });
});
