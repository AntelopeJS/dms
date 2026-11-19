import type { NavigationMenuItem } from "@nuxt/ui";
import { describe, expect, it } from "vitest";
import {
  MOCKUP_SECTION_SLOT,
  mockupMenu,
} from "../layers/dms-layout/app/entries/components/layout/mockupMenu";
import type {
  PreviewNavigation,
  PreviewNavigationSection,
} from "../layers/dms-ui/app/entries/utils/blockPreview";

const DEFAULT_SECTION = "PAGES";

function menuOf(
  sections: PreviewNavigationSection[],
  editable = false,
): NavigationMenuItem[][] {
  const navigation: PreviewNavigation = {
    sections,
    ...(editable && { editable: true }),
  };
  return mockupMenu(navigation, {
    defaultSection: DEFAULT_SECTION,
    select: () => {},
  }).groups;
}

/** Each group's entries: `#` before a header. */
function rows(groups: NavigationMenuItem[][]): string[][] {
  return groups.map((group) =>
    group.map(
      (item) => `${item.type === "label" ? "#" : ""}${String(item.label)}`,
    ),
  );
}

const HOME = { id: "home", label: "Home" };
const ORDERS = { id: "orders", label: "Orders" };

describe("the mockup's sidebar, the spec's own menu", () => {
  it("lists the pages without a category under the default Pages header, as the real menu does (fails when the default section's pages show bare)", () => {
    const groups = menuOf([{ items: [HOME, ORDERS] }]);

    expect(rows(groups)).toEqual([["#PAGES", "Home", "Orders"]]);
    expect(groups[0]?.[0]?.slot).toBe(MOCKUP_SECTION_SLOT);
  });

  it("lists only the mockup's own pages and the sections holding one, no app entry and no empty section (fails when the app's menu or an empty section comes back)", () => {
    const groups = menuOf([
      { items: [] },
      {
        category: { id: "sales", title: "Sales" },
        items: [{ id: "quotes", label: "Quotes" }],
      },
      { category: { id: "crm", title: "Customers" }, items: [] },
    ]);

    expect(rows(groups)).toEqual([["#Sales", "Quotes"]]);
  });

  it("draws an empty mockup as an empty menu (fails when a mockup of an existing app starts with the app's pages)", () => {
    expect(menuOf([{ items: [] }])).toEqual([]);
  });

  it("while editing, lists every category and the default section beside them, empty or not (fails when an empty section cannot take a dropped page)", () => {
    const groups = menuOf(
      [{ items: [] }, { category: { id: "crm", title: "Customers" }, items: [] }],
      true,
    );

    expect(rows(groups)).toEqual([["#PAGES"], ["#Customers"]]);
  });
});
