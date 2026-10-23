import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import type { CommandPaletteGroup } from "@nuxt/ui";
import {
  ACCOUNT_MENU_ENTRIES,
  PROFILE_ROUTE,
  SETTINGS_ROUTE,
  isAccountMenuRoute,
} from "../layers/dms-layout/app/utils/account-menu";

interface TreeNodeStub {
  id: string;
  displayName: string;
  fullSlug: string;
  layoutUrl?: string;
  childrenOrders: string[];
  children: Record<string, TreeNodeStub>;
}

function node(
  id: string,
  fullSlug: string,
  children: TreeNodeStub[] = [],
): TreeNodeStub {
  return {
    id,
    displayName: id,
    fullSlug,
    layoutUrl: fullSlug,
    childrenOrders: children.map((child) => child.id),
    children: Object.fromEntries(children.map((child) => [child.id, child])),
  };
}

const TREE = node("root", "", [
  node("Home", "/home"),
  node("Settings", SETTINGS_ROUTE, [
    node("Profile", PROFILE_ROUTE),
    node("Roles", "/settings/workspace/roles"),
  ]),
]);

let registered: { groups: () => CommandPaletteGroup[] } | undefined;

beforeEach(() => {
  const globals = {
    computed,
    defineDmsPlugin: (setup: () => void) => setup,
    getAppTranslation: () => ({
      processI18n: (value: string) => value,
      t: (key: string) => key,
    }),
    useSiteLayout: () => ({ siteLayoutTree: ref(TREE) }),
    registerCommandPaletteSource: (source: typeof registered) => {
      registered = source;
    },
    resolveOptionalI18nKey: () => undefined,
    isAccountMenuRoute,
    DEFAULT_PAGE_ICON: "i-page",
    COMMAND_PALETTE_SEARCH_TEXT_KEY: "searchText",
  };
  Object.entries(globals).forEach(([name, value]) =>
    vi.stubGlobal(name, value),
  );
});

afterEach(() => {
  registered = undefined;
  vi.unstubAllGlobals();
});

// The session group lists the account entries: navigation offering the same
// destinations showed Settings (and Profile) twice.
it("leaves the account destinations to the session group", async () => {
  const { default: setup } = await import(
    "../layers/dms-layout/app/plugins/command-palette-navigation.client"
  );
  (setup as unknown as () => void)();

  const targets = registered!
    .groups()
    .flatMap((group) => group.items ?? [])
    .map((item) => item.to);

  expect(targets).toEqual(["/home", "/settings/workspace/roles"]);
  ACCOUNT_MENU_ENTRIES.forEach((entry) =>
    expect(targets).not.toContain(entry.to),
  );
});
