import { describe, expect, it } from "vitest";
import enGB from "../layers/dms-layout/i18n/locales/layout-en-GB.json";
import fr from "../layers/dms-layout/i18n/locales/layout-fr-FR.json";
import {
  ACCOUNT_MENU_ENTRIES,
  PROFILE_ROUTE,
  SETTINGS_ROUTE,
  SWITCH_ACCOUNT_ROUTE,
  isAccountMenuRoute,
} from "../layers/dms-layout/app/utils/account-menu";

function lookup(messages: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages,
    );
}

describe("account menu entries", () => {
  it("opens every setting, the only way to them without a sidebar entry", () => {
    expect(ACCOUNT_MENU_ENTRIES.map((entry) => entry.to)).toEqual([
      PROFILE_ROUTE,
      "/settings",
      SWITCH_ACCOUNT_ROUTE,
    ]);
  });

  it.each([
    ["en-GB", enGB, "Settings"],
    ["fr", fr, "Paramètres"],
  ])("labels Settings in %s", (_locale, messages, label) => {
    const entry = ACCOUNT_MENU_ENTRIES.find(
      (item) => item.to === SETTINGS_ROUTE,
    )!;
    expect(lookup(messages, entry.labelKey)).toBe(label);
    ACCOUNT_MENU_ENTRIES.forEach((item) =>
      expect(typeof lookup(messages, item.labelKey)).toBe("string"),
    );
  });

  it.each([
    [PROFILE_ROUTE, true],
    [SETTINGS_ROUTE, true],
    [SWITCH_ACCOUNT_ROUTE, true],
    ["/settings/workspace/roles", false],
    ["/settings?tab=general", false],
  ])("recognises %s as an account destination: %s", (to, expected) => {
    expect(isAccountMenuRoute(to)).toBe(expected);
  });
});
