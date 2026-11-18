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

/** The app's own menu as the site layout gives it: its default section, two named ones and a bare page. */
const APP: NavigationMenuItem[][] = [
  [
    { id: "pages", label: "Pages", type: "label" },
    { id: "dashboard", label: "Dashboard", to: "/dashboard" },
    {
      id: "orders",
      label: "Orders",
      to: "/orders?status=open",
      children: [{ id: "returns", label: "Returns", to: "/orders/returns" }],
    },
  ],
  [
    { id: "sales", label: "Sales Team", type: "label" },
    { id: "invoices", label: "Invoices", to: "/invoices" },
  ],
  [
    { id: "reports", label: "Reports", type: "label" },
    { id: "weekly", label: "Weekly", to: "/reports/weekly/" },
  ],
  [{ id: "help", label: "Help", to: "/help" }],
];

function menuOf(
  sections: PreviewNavigationSection[],
  editable = false,
): NavigationMenuItem[][] {
  const navigation: PreviewNavigation = {
    sections,
    ...(editable && { editable: true }),
  };
  return mockupMenu(navigation, APP, {
    defaultSection: "Default",
    select: () => {},
  }).groups;
}

/** Each group's entries: `#` before a header, `(app)` after an app entry drawn dimmed. */
function rows(groups: NavigationMenuItem[][]): string[][] {
  return groups.map((group) =>
    group.map(
      (item) =>
        `${item.type === "label" ? "#" : ""}${String(item.label)}${item.disabled ? " (app)" : ""}`,
    ),
  );
}

const HOME = { id: "home", label: "Home" };

describe("the mockup's menu merged with the app's own", () => {
  it("lists the mockup's pages without a section in the app's default section, after its dimmed entries, under one header (fails when a second Pages section shows)", () => {
    const groups = menuOf([{ items: [HOME] }]);

    expect(rows(groups)).toEqual([
      ["#Pages", "Dashboard (app)", "Orders (app)", "Home"],
      ["#Sales Team (app)", "Invoices (app)"],
      ["#Reports (app)", "Weekly (app)"],
      ["Help (app)"],
    ]);
    expect(groups[0]?.[0]?.slot).toBe(MOCKUP_SECTION_SLOT);
  });

  it("while editing beside categories, heads the default section once, with the app's title (fails when the mockup's own Pages header comes back)", () => {
    const groups = menuOf(
      [
        { items: [HOME] },
        { category: { id: "crm", title: "Customers" }, items: [] },
      ],
      true,
    );

    expect(groups.flat().filter((item) => item.type === "label")).toHaveLength(
      4,
    );
    expect(rows(groups)[0]).toEqual([
      "#Pages",
      "Dashboard (app)",
      "Orders (app)",
      "Home",
    ]);
  });

  it("lists a section titled as an app section, case and spaces aside, in it after the app's entries, and the other sections after the app's (fails when the same title shows twice or the app's entries stop coming first)", () => {
    const groups = menuOf([
      { items: [] },
      {
        category: { id: "sales", title: "sales  team" },
        items: [{ id: "quotes", label: "Quotes" }],
      },
      {
        category: { id: "crm", title: "Customers" },
        items: [{ id: "people", label: "People" }],
      },
    ]);

    expect(rows(groups)).toEqual([
      ["#Pages (app)", "Dashboard (app)", "Orders (app)"],
      ["#sales  team", "Invoices (app)", "Quotes"],
      ["#Reports (app)", "Weekly (app)"],
      ["Help (app)"],
      ["#Customers", "People"],
    ]);
  });

  it("leaves out the app entry each mockup page was converted from, its children kept, and a section left empty (fails when a converted page shows twice)", () => {
    const groups = menuOf([
      {
        items: [
          { id: "orders", label: "Orders", livePage: "/orders" },
          { id: "weekly", label: "Weekly", livePage: "/reports/weekly" },
        ],
      },
    ]);

    expect(rows(groups)).toEqual([
      ["#Pages", "Dashboard (app)", "Returns (app)", "Orders", "Weekly"],
      ["#Sales Team (app)", "Invoices (app)"],
      ["Help (app)"],
    ]);
  });
});
