import { describe, expect, it } from "vitest";
import { isString } from "../layers/dms-core/app/utils/type-check";
import enGB from "../layers/dms-layout/i18n/locales/layout-en-GB.json";
import fr from "../layers/dms-layout/i18n/locales/layout-fr-FR.json";
import {
  ACCOUNT_MENU_ENTRIES,
  PROFILE_ROUTE,
  SETTINGS_ROUTE,
  SWITCH_ACCOUNT_ROUTE,
  isAccountMenuRoute,
} from "../layers/dms-layout/app/utils/account-menu";

type Messages = import("vue-i18n").LocaleMessage<
  import("vue-i18n").VueMessageType
>;

function lookup(messages: Messages, key: string): Messages[string] | undefined {
  return key
    .split(".")
    .reduce<
      Messages[string] | undefined
    >((node, part) => node?.[part], messages);
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
      expect(isString(lookup(messages, item.labelKey))).toBe(true),
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
