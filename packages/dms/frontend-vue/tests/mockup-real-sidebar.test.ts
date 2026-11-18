/** @vitest-environment jsdom */
import { createApp, h, type App } from "vue";
import type { NavigationMenuItem } from "@nuxt/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MockupSidebarMenu from "../layers/dms-layout/app/entries/components/layout/MockupSidebarMenu";
import {
  DIMMED_ENTRY_CLASS,
  dimmedMenu,
  mockupMenu,
} from "../layers/dms-layout/app/entries/components/layout/mockupMenu";
import { PREVIEW_CHANNEL } from "../layers/dms-ui/app/entries/utils/blockPreview";
import {
  flush,
  posted,
  registerMenu,
  shopNavigation,
  stubMenuRuntime,
} from "./helpers/mockup-sidebar";

const EXISTING: NavigationMenuItem[][] = [
  [
    { label: "Examples", type: "label" },
    {
      label: "Overview",
      to: "/examples/overview",
      children: [{ label: "Charts", to: "/examples/charts" }],
    },
  ],
];

let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  stubMenuRuntime();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

describe("the mockup's menu", () => {
  it("lists the default section's pages bare and each category as a label over its pages, leaving out an empty one, the active page marked (fails when a section loses its header or an empty one shows)", () => {
    const select = vi.fn<(id: string) => void>();
    const { groups } = mockupMenu(shopNavigation(false), [], {
      defaultSection: "Pages",
      select,
    });

    expect(
      groups.map((group) =>
        group.map((item) => [item.type ?? "link", item.label, item.active]),
      ),
    ).toEqual([
      [["link", "Home", false]],
      [
        ["label", "Sales", undefined],
        ["link", "Orders", true],
      ],
    ]);
    groups[1]?.[1]?.onSelect?.(new Event("select"));
    expect(select).toHaveBeenCalledWith("orders");
  });

  it("while editing, lists every category and heads the default section too (fails when an empty section cannot take a dropped page)", () => {
    const { groups } = mockupMenu(shopNavigation(true), [], {
      defaultSection: "Pages",
      select: () => {},
    });

    expect(groups.map((group) => group[0]?.label)).toEqual([
      "Pages",
      "Sales",
      "Customers",
    ]);
  });

  it("dims every entry of the app's own menu and takes away its link and its action (fails when an existing page stays reachable from a mockup)", () => {
    const dimmed = dimmedMenu(EXISTING).flat();
    const entries = [
      ...dimmed,
      ...dimmed.flatMap((item) => item.children ?? []),
    ];

    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      expect(entry.to).toBeUndefined();
      expect(entry.disabled).toBe(true);
      expect(entry.class).toContain(DIMMED_ENTRY_CLASS);
    }
  });
});

/** The app's own Sales section, which the mockup's Sales joins. */
const APP_SALES: NavigationMenuItem[][] = [
  [
    { label: "SALES", type: "label" },
    { label: "Invoices", to: "/invoices" },
  ],
];

async function mountMenu(
  editable: boolean,
  existing: NavigationMenuItem[][] = EXISTING,
): Promise<void> {
  app = createApp({
    render: () =>
      h(MockupSidebarMenu, {
        navigation: shopNavigation(editable),
        existing,
        collapsed: false,
        open: [],
      }),
  });
  registerMenu(app);
  app.mount(host);
  await flush();
}

const find = (selector: string) => host.querySelector<HTMLElement>(selector);

function titleOf(category: string): HTMLElement {
  const title = find(`[data-dms-preview-section="${category}"]`);
  if (!title) throw new Error(`no section ${category}`);
  return title;
}

async function type(selector: string, value: string): Promise<void> {
  const input = find(selector);
  if (!(input instanceof HTMLInputElement)) throw new Error(`no ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event("input"));
  await flush();
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  await flush();
}

describe("the sidebar's menu around a mockup", () => {
  it("draws the app's entries dimmed and out of reach, then the mockup's pages, which pick the page (fails when the app's pages act or a mockup page does not)", async () => {
    await mountMenu(false);

    const rows = [...host.querySelectorAll("button")];
    expect(rows.map((row) => row.textContent?.trim())).toEqual([
      "Overview",
      "Home",
      "Orders",
    ]);
    expect(rows[0]?.disabled).toBe(true);
    expect(rows[0]?.dataset.to).toBeUndefined();
    expect(
      find('[data-dms-preview-page="orders"]')?.getAttribute("aria-current"),
    ).toBe("page");

    find('[data-dms-preview-page="home"]')?.click();
    expect(posted("navigate")).toEqual([
      { channel: PREVIEW_CHANNEL, type: "navigate", id: "home" },
    ]);
  });

  it("in Preview mode only navigates: no rename, no section menu, no new section, nothing to drag (fails when Preview mode keeps editing)", async () => {
    await mountMenu(false);

    titleOf("sales").dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );
    await flush();

    expect(host.querySelector("input")).toBeNull();
    expect(find("[data-dms-preview-section-menu]")).toBeNull();
    expect(find("[data-dms-preview-section-new]")).toBeNull();
    expect(host.querySelector('[draggable="true"]')).toBeNull();
  });

  it("while editing, renames a section on a double-click, deletes one from its menu and adds one, each handed to the embedding page (fails when the real sidebar edits nothing)", async () => {
    await mountMenu(true);

    titleOf("sales").dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );
    await flush();
    await type('input[aria-label="dms.mockup.section_name"]', "Selling");
    find('[data-menu-item="dms.mockup.section_delete"]')?.click();
    find("[data-dms-preview-section-new]")?.click();
    await flush();
    await type("[data-dms-preview-section-new-name]", "Reports");

    expect(posted("section-edit")).toEqual([
      {
        channel: PREVIEW_CHANNEL,
        type: "section-edit",
        edit: { kind: "updateCategory", category: "sales", title: "Selling" },
      },
      {
        channel: PREVIEW_CHANNEL,
        type: "section-edit",
        edit: { kind: "removeCategory", category: "sales" },
      },
      {
        channel: PREVIEW_CHANNEL,
        type: "section-edit",
        edit: { kind: "addCategory", title: "Reports" },
      },
    ]);
  });

  it("keeps the focus in the icon field its menu entry opened, and saves the icon typed, though the closing menu hands the focus back to its trigger (fails when the field closes at once)", async () => {
    await mountMenu(true);

    find('[data-menu-item="dms.mockup.section_icon"]')?.click();
    await flush();
    const field = find("nav input");

    expect(field).not.toBeNull();
    expect(document.activeElement).toBe(field);
    await type("nav input", "i-ph-coins");
    expect(posted("section-edit")).toContainEqual({
      channel: PREVIEW_CHANNEL,
      type: "section-edit",
      edit: { kind: "updateCategory", category: "sales", icon: "i-ph-coins" },
    });
  });

  it("keeps the focus in the title field the Rename entry opened, and saves the title on blur (fails when the field closes at once)", async () => {
    await mountMenu(true);

    find('[data-menu-item="dms.mockup.section_rename"]')?.click();
    await flush();
    const field = find('input[aria-label="dms.mockup.section_name"]');

    expect(document.activeElement).toBe(field);
    if (!(field instanceof HTMLInputElement)) throw new Error("no field");
    field.value = "Selling";
    field.dispatchEvent(new Event("input"));
    await flush();
    field.blur();
    await flush();
    expect(posted("section-edit")).toContainEqual({
      channel: PREVIEW_CHANNEL,
      type: "section-edit",
      edit: { kind: "updateCategory", category: "sales", title: "Selling" },
    });
  });

  it("while editing, moves a page dragged onto another section's page (fails when a page row cannot be dragged)", async () => {
    await mountMenu(true);
    const orders = find('[data-dms-preview-page="orders"] [draggable="true"]');
    const home = find('[data-dms-preview-page="home"] [draggable="true"]');
    if (!orders || !home) throw new Error("no draggable rows");

    orders.dispatchEvent(new MouseEvent("dragstart", { bubbles: true }));
    home.dispatchEvent(
      new MouseEvent("dragover", { bubbles: true, cancelable: true }),
    );
    await flush();
    expect(
      find('[data-dms-preview-page="home"] [data-dms-preview-page-drop]'),
    ).not.toBeNull();
    home.dispatchEvent(
      new MouseEvent("drop", { bubbles: true, cancelable: true }),
    );

    expect(posted("section-edit")).toEqual([
      {
        channel: PREVIEW_CHANNEL,
        type: "section-edit",
        edit: { kind: "movePageTo", page: "orders", category: null, index: 0 },
      },
    ]);
  });
});

describe("a mockup section merged with the app's", () => {
  it("renames the mockup's section from the merged header and leaves the app's entries in it as they are (fails when the merged header edits nothing)", async () => {
    await mountMenu(true, APP_SALES);

    const section = titleOf("sales").closest("ul");
    expect(
      [
        ...(section?.querySelectorAll<HTMLButtonElement>(
          ":scope > li > button",
        ) ?? []),
      ].map((row) => [row.textContent?.trim(), row.disabled]),
    ).toEqual([
      ["Invoices", true],
      ["Orders", false],
    ]);

    titleOf("sales").dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );
    await flush();
    await type('input[aria-label="dms.mockup.section_name"]', "Selling");

    expect(posted("section-edit")).toEqual([
      {
        channel: PREVIEW_CHANNEL,
        type: "section-edit",
        edit: { kind: "updateCategory", category: "sales", title: "Selling" },
      },
    ]);
  });
});
