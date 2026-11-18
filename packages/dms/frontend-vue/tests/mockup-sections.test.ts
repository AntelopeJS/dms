import { describe, expect, it } from "vitest";
import type { JsonValue } from "../layers/dms-core/app/types/json";
import { dropEdit } from "../layers/dms-ui/app/entries/composables/block-preview/useMockupSectionEditing";
import {
  parsePreviewMessage,
  parsePreviewOutboundMessage,
  PREVIEW_CHANNEL,
} from "../layers/dms-ui/app/entries/utils/blockPreview";
import { applyMockupEdit } from "../layers/dms-ui/app/entries/utils/mockupEdit";
import { mockupNavigation } from "../layers/dms-ui/app/entries/utils/mockupFrame";
import {
  layoutSections,
  OVERVIEW_MIN_HEIGHT,
} from "../layers/dms-ui/app/entries/utils/mockupOverview";
import {
  groupSections,
  type MockupSectionEdit,
} from "../layers/dms-ui/app/entries/utils/mockupSections";
import type { MockupSpecDocument } from "../layers/dms-ui/app/entries/utils/mockupSpec";

const SALES = { id: "sales", title: "Sales", icon: "i-ph-storefront" };
const ADMIN = { id: "admin", title: "Admin" };

function spec(): MockupSpecDocument {
  return {
    version: 1,
    categories: [SALES, ADMIN],
    pages: [
      { id: "home", title: "Home", tree: [] },
      { id: "orders", title: "Orders", category: "sales", tree: [] },
      { id: "users", title: "Users", category: "admin", tree: [] },
      { id: "invoices", title: "Invoices", category: "sales", tree: [] },
    ],
  };
}

function edit(next: MockupSectionEdit, from = spec()): MockupSpecDocument {
  return applyMockupEdit(from, next).spec;
}

const ids = (document: MockupSpecDocument) =>
  document.pages.map((page) => page.id);

describe("the sidebar's sections", () => {
  it("lists the default section first, then each category in order, a page naming no known category in the default one (fails when the order or the default section is lost)", () => {
    const pages = [
      { id: "a", category: "admin" },
      { id: "b" },
      { id: "c", category: "sales" },
      { id: "d", category: "gone" },
    ];
    const sections = groupSections(
      [SALES, ADMIN],
      pages,
      (page) => page.category,
    );

    expect(
      sections.map((section) => [
        section.category?.id,
        section.pages.map((page) => page.id),
      ]),
    ).toEqual([
      [undefined, ["b", "d"]],
      ["sales", ["c"]],
      ["admin", ["a"]],
    ]);
  });

  it("adds a section with a free id from its title, renames it, sets and clears its icon, and keeps the pages (fails when an edit drops a field)", () => {
    const added = edit({ kind: "addCategory", title: "  Sales " });
    const renamed = edit(
      { kind: "updateCategory", category: "sales", title: "Selling" },
      added,
    );
    const iconed = edit(
      { kind: "updateCategory", category: "admin", icon: "i-ph-gear" },
      renamed,
    );
    const cleared = edit(
      { kind: "updateCategory", category: "sales", icon: "" },
      iconed,
    );

    expect(added.categories).toEqual([
      SALES,
      ADMIN,
      { id: "sales-2", title: "Sales" },
    ]);
    expect(cleared.categories).toEqual([
      { id: "sales", title: "Selling" },
      { id: "admin", title: "Admin", icon: "i-ph-gear" },
      { id: "sales-2", title: "Sales" },
    ]);
    expect(cleared.pages).toEqual(spec().pages);
  });

  it("deletes a section and lists its pages last in the default one, the categories key going with the last section (fails when its pages keep a dangling category)", () => {
    const once = edit({ kind: "removeCategory", category: "sales" });
    const twice = edit({ kind: "removeCategory", category: "admin" }, once);

    expect(once.categories).toEqual([ADMIN]);
    expect(once.pages.map((page) => [page.id, page.category])).toEqual([
      ["home", undefined],
      ["orders", undefined],
      ["invoices", undefined],
      ["users", "admin"],
    ]);
    expect(Object.hasOwn(twice, "categories")).toBe(false);
  });

  it("moves a page into a section at an index, the spec's pages following the sections' order, so the first one listed is home (fails when the page keeps its old section)", () => {
    const moved = edit({
      kind: "movePageTo",
      page: "home",
      category: "sales",
      index: 1,
    });
    const back = edit(
      { kind: "movePageTo", page: "users", category: null, index: 0 },
      moved,
    );

    expect(ids(moved)).toEqual(["orders", "home", "invoices", "users"]);
    expect(moved.pages[1]?.category).toBe("sales");
    expect(ids(back)).toEqual(["users", "orders", "home", "invoices"]);
    expect(Object.hasOwn(back.pages[0] ?? {}, "category")).toBe(false);
  });

  it("moves a section, its pages following it in the spec (fails when only the categories move)", () => {
    const moved = edit({ kind: "moveCategory", category: "admin", to: 0 });

    expect(moved.categories).toEqual([ADMIN, SALES]);
    expect(ids(moved)).toEqual(["home", "users", "orders", "invoices"]);
  });

  it("answers the very spec for a section edit that changes nothing, so it makes no undo step", () => {
    const before = spec();
    const idle: MockupSectionEdit[] = [
      { kind: "addCategory", title: "   " },
      { kind: "updateCategory", category: "sales", title: "Sales" },
      { kind: "updateCategory", category: "gone", title: "X" },
      { kind: "removeCategory", category: "gone" },
      { kind: "moveCategory", category: "sales", to: 0 },
      { kind: "movePageTo", page: "orders", category: "sales", index: 0 },
      { kind: "movePageTo", page: "orders", category: "gone", index: 0 },
    ];
    for (const next of idle) {
      expect(applyMockupEdit(before, next).spec).toBe(before);
    }
  });
});

describe("a drop in a sidebar", () => {
  const sections = [
    { items: [{ id: "home" }] },
    { category: SALES, items: [{ id: "orders" }, { id: "invoices" }] },
    { category: ADMIN, items: [{ id: "users" }] },
  ];

  it("makes one edit: a page into another section at the line, a page within its section counted without it, a section before another, and none when nothing moves (fails when the index counts the dragged page)", () => {
    expect(
      dropEdit(
        sections,
        { kind: "page", page: "home" },
        { kind: "page", section: 1, index: 1 },
      ),
    ).toEqual({
      kind: "movePageTo",
      page: "home",
      category: "sales",
      index: 1,
    });
    expect(
      dropEdit(
        sections,
        { kind: "page", page: "orders" },
        { kind: "page", section: 1, index: 2 },
      ),
    ).toEqual({
      kind: "movePageTo",
      page: "orders",
      category: "sales",
      index: 1,
    });
    expect(
      dropEdit(
        sections,
        { kind: "section", category: "admin" },
        { kind: "section", index: 0 },
      ),
    ).toEqual({ kind: "moveCategory", category: "admin", to: 0 });
    expect(
      dropEdit(
        sections,
        { kind: "page", page: "orders" },
        { kind: "page", section: 1, index: 1 },
      ),
    ).toBeUndefined();
    expect(
      dropEdit(
        sections,
        { kind: "section", category: "sales" },
        { kind: "section", index: 1 },
      ),
    ).toBeUndefined();
  });
});

describe("the preview's sidebar and the Overview", () => {
  it("lists the pages under their sections, home by its spec index, editable when asked (fails when a page loses its section)", () => {
    const navigation = mockupNavigation({
      title: "Shop",
      categories: [SALES],
      pages: [
        { id: "home", title: "Home" },
        { id: "orders", title: "Orders", category: "sales", icon: "i-ph-cart" },
        { id: "notes", title: "Notes" },
      ],
      active: "orders",
      editable: true,
    });

    expect(navigation).toEqual({
      title: "Shop",
      sections: [
        {
          items: [
            { id: "home", label: "Home", icon: "i-ph-house-light" },
            { id: "notes", label: "Notes", icon: undefined },
          ],
        },
        {
          category: SALES,
          items: [{ id: "orders", label: "Orders", icon: "i-ph-cart" }],
        },
      ],
      active: "orders",
      editable: true,
    });
  });

  it("names the live page a converted page comes from, and hands the sidebar's widgets to the frame, each title its caption (fails when the sidebar cannot tell a converted page's live entry or never gets the widgets)", () => {
    const navigation = mockupNavigation({
      title: "Shop",
      categories: [],
      pages: [{ id: "orders", title: "Orders", livePage: { ref: "/orders" } }],
      active: "orders",
      widgets: [
        { id: "plan", title: "Your plan", html: "<p>Pro</p>", height: 120 },
        { id: "help", html: "<p>Help</p>", css: "p{}", height: 90 },
      ],
    });

    expect(navigation.sections[0]?.items[0]?.livePage).toBe("/orders");
    expect(navigation.widgets).toEqual([
      { id: "plan", caption: "Your plan", html: "<p>Pro</p>", height: 120 },
      { id: "help", html: "<p>Help</p>", css: "p{}", height: 90 },
    ]);
    const render = (widgets: JsonValue) =>
      parsePreviewMessage({
        channel: PREVIEW_CHANNEL,
        type: "render",
        tree: [],
        navigation: { sections: [], widgets },
      });
    expect(render([{ id: "plan", html: "<p>Pro</p>", height: 120 }])).toEqual(
      expect.objectContaining({ type: "render" }),
    );
    expect(render([{ id: "plan", height: 120 }])).toBeUndefined();
  });

  it("lays each section out in rows of its own, in order, under its label, and gives an empty section no room (fails when two sections share a row)", () => {
    const { frames, labels } = layoutSections([
      { label: "Pages", pages: [{ id: "home" }] },
      { label: "Empty", pages: [] },
      {
        label: "Sales",
        pages: [{ id: "orders" }, { id: "invoices", height: 1200 }],
      },
      { label: "Admin", pages: [{ id: "users" }] },
    ]);
    const top = (id: string) => frames.find((frame) => frame.id === id)?.rect.y;

    expect(frames.map((frame) => frame.id)).toEqual([
      "home",
      "orders",
      "invoices",
      "users",
    ]);
    expect(labels.map((entry) => entry.label)).toEqual([
      "Pages",
      "Sales",
      "Admin",
    ]);
    expect(labels.map((entry) => entry.y)).toEqual([
      top("home"),
      top("orders"),
      top("users"),
    ]);
    expect(top("orders")).toBeGreaterThan(OVERVIEW_MIN_HEIGHT);
    expect(top("invoices")).toBe(top("orders"));
    expect(top("users")).toBeGreaterThan((top("orders") ?? 0) + 1200);
  });

  it("reads a section edit a sidebar posts and refuses a malformed one (fails when a bad edit reaches the spec)", () => {
    const read = (edit: JsonValue) =>
      parsePreviewOutboundMessage({
        channel: PREVIEW_CHANNEL,
        type: "section-edit",
        edit,
      });

    expect(
      read({ kind: "movePageTo", page: "home", category: null, index: 2 }),
    ).toEqual({
      channel: PREVIEW_CHANNEL,
      type: "section-edit",
      edit: { kind: "movePageTo", page: "home", category: null, index: 2 },
    });
    expect(
      read({ kind: "movePageTo", page: "home", index: -1 }),
    ).toBeUndefined();
    expect(
      read({ kind: "moveCategory", category: "a", to: 1.5 }),
    ).toBeUndefined();
    expect(read({ kind: "dropTables" })).toBeUndefined();
    expect(read({ kind: "updateCategory", category: 3 })).toBeUndefined();
  });
});
