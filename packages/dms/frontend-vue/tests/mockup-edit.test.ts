import { describe, expect, it } from "vitest";
import {
  applyMockupEdit,
  type MockupEdit,
} from "../layers/dms-ui/app/entries/utils/mockupEdit";
import {
  commit,
  reset,
  undo,
} from "../layers/dms-ui/app/entries/utils/mockupHistory";
import {
  nodeAt,
  parseMockupSpec,
  type MockupSpecDocument,
} from "../layers/dms-ui/app/entries/utils/mockupSpec";

function spec(): MockupSpecDocument {
  return {
    $schema: "../mockup-spec.schema.json",
    version: 1,
    title: "Order desk",
    pages: [
      {
        id: "orders",
        title: "Orders",
        options: { theme: "light" },
        fixtures: { revenue: { value: 1 } },
        tree: [
          {
            type: "Grid",
            options: { gap: "1rem" },
            children: [
              {
                id: "kpis",
                type: "GridRow",
                children: [
                  {
                    id: "revenue",
                    type: "KpiCard",
                    options: { title: "Revenue", fetchUrl: "fixture:revenue" },
                  },
                  {
                    id: "orders",
                    type: "KpiCard",
                    options: { title: "Orders" },
                  },
                ],
              },
            ],
          },
          { type: "ChartCard", options: { title: "Week" } },
        ],
      },
      { id: "settings", title: "Settings", tree: [] },
    ],
  };
}

const ROW = "/pages/0/tree/0/children/0";
const REVENUE = `${ROW}/children/0`;
const ORDERS = `${ROW}/children/1`;
const CHART = "/pages/0/tree/1";

function apply(edit: MockupEdit, from = spec()) {
  return applyMockupEdit(from, edit);
}

function idsAt(document: MockupSpecDocument, pointer: string): unknown[] {
  return (nodeAt(document, pointer)?.children ?? []).map((child) => child.id);
}

describe("applyMockupEdit leaves its input alone", () => {
  it("returns a new spec and keeps the one it was given intact (fails on an in-place edit)", () => {
    const before = spec();
    const snapshot = structuredClone(before);
    const result = applyMockupEdit(before, {
      kind: "setOption",
      pointer: REVENUE,
      key: "title",
      value: "Turnover",
    });
    expect(before).toEqual(snapshot);
    expect(nodeAt(result.spec, REVENUE)?.options?.title).toBe("Turnover");
  });

  it("keeps the fields it does not know, fixtures and `fixture:` references included (fails on a rebuild from known fields)", () => {
    const result = apply({ kind: "removeNode", pointer: CHART });
    expect(result.spec).toMatchObject({
      $schema: "../mockup-spec.schema.json",
      version: 1,
      title: "Order desk",
    });
    expect(result.spec.pages[0]).toMatchObject({
      options: { theme: "light" },
      fixtures: { revenue: { value: 1 } },
    });
    expect(nodeAt(result.spec, REVENUE)?.options?.fetchUrl).toBe(
      "fixture:revenue",
    );
  });

  it("answers the very spec it was given for an edit it cannot apply (fails when a refused edit still makes an undo step)", () => {
    const before = spec();
    const refused: MockupEdit[] = [
      { kind: "removeNode", pointer: "/pages/0/tree/9" },
      { kind: "moveNode", from: ROW, parent: REVENUE, index: 0 },
      { kind: "moveNode", from: ROW, parent: ROW, index: 0 },
      { kind: "moveNode", from: REVENUE, parent: ROW, index: 0 },
      { kind: "removePage", page: "nowhere" },
      { kind: "updatePage", page: "orders", id: "settings" },
      { kind: "updatePage", page: "orders", id: "Not A Slug" },
      { kind: "movePage", from: 0, to: 5 },
    ];
    for (const edit of refused) {
      expect(applyMockupEdit(before, edit).spec).toBe(before);
    }
    expect(
      applyMockupEdit(
        { ...before, pages: before.pages.slice(0, 1) },
        { kind: "removePage", page: "orders" },
      ).spec.pages,
    ).toHaveLength(1);
  });
});

describe("options", () => {
  it("sets an option in place, keeping the others in their order (fails when the key moves to the end)", () => {
    const { spec: next, select } = apply({
      kind: "setText",
      pointer: REVENUE,
      key: "title",
      value: "Turnover",
    });
    expect(Object.entries(nodeAt(next, REVENUE)?.options ?? {})).toEqual([
      ["title", "Turnover"],
      ["fetchUrl", "fixture:revenue"],
    ]);
    expect(select).toBe(REVENUE);
  });

  it("removes an option set to undefined, and the options object once empty (fails on `{ key: undefined }` or `options: {}`)", () => {
    const next = apply({
      kind: "setOption",
      pointer: ORDERS,
      key: "title",
      value: undefined,
    }).spec;
    expect(nodeAt(next, ORDERS)).toEqual({ id: "orders", type: "KpiCard" });
  });
});

describe("inserting, duplicating, replacing", () => {
  it("inserts at the page root or under a node and selects the new node (fails on a wrong index or pointer)", () => {
    const atRoot = apply({
      kind: "insertNode",
      parent: null,
      page: "orders",
      index: 1,
      node: { type: "Banner" },
    });
    expect(atRoot.select).toBe("/pages/0/tree/1");
    expect(nodeAt(atRoot.spec, "/pages/0/tree/2")?.type).toBe("ChartCard");

    const inRow = apply({
      kind: "insertNode",
      parent: ROW,
      page: "orders",
      index: 99,
      node: { id: "refunds", type: "KpiCard" },
    });
    expect(inRow.select).toBe(`${ROW}/children/2`);
    expect(idsAt(inRow.spec, ROW)).toEqual(["revenue", "orders", "refunds"]);
  });

  it("gives an inserted node an id its siblings do not carry (fails when two siblings share an id)", () => {
    const next = apply({
      kind: "insertNode",
      parent: ROW,
      page: "orders",
      index: 0,
      node: { id: "orders", type: "KpiCard" },
    }).spec;
    expect(idsAt(next, ROW)).toEqual(["orders-2", "revenue", "orders"]);
  });

  it("writes the fixtures of an inserted block into its page in the same edit, and one undo takes both back (fails when the node lands without its fixture)", () => {
    const before = spec();
    const rows = [{ id: "1", name: "Ada" }];
    const { spec: next } = apply(
      {
        kind: "insertNode",
        parent: null,
        page: "orders",
        index: 0,
        node: {
          type: "TableView",
          options: { fetchUrl: "fixture:table-data" },
        },
        fixtures: { "table-data": rows, revenue: "not the one the page holds" },
      },
      before,
    );

    expect(next.pages[0]?.fixtures).toEqual({
      revenue: { value: 1 },
      "table-data": rows,
    });
    expect(next.pages[1]).toBe(before.pages[1]);
    expect(undo(commit(reset(before), next)).present).toBe(before);
  });

  it("writes the fixtures of a replacing block into the page of the replaced node (fails when a swap to a table leaves it without rows)", () => {
    const { spec: next } = apply({
      kind: "replaceNode",
      pointer: CHART,
      node: { type: "TableView", options: { fetchUrl: "fixture:table-data" } },
      fixtures: { "table-data": [] },
    });

    expect(next.pages[0]?.fixtures).toEqual({
      revenue: { value: 1 },
      "table-data": [],
    });
  });

  it("inserts nothing under a parent of another page (fails when the page id is ignored)", () => {
    const before = spec();
    const result = applyMockupEdit(before, {
      kind: "insertNode",
      parent: ROW,
      page: "settings",
      index: 0,
      node: { type: "Banner" },
    });
    expect(result.spec).toBe(before);
  });

  it("duplicates a node right after it with a fresh id, and selects the copy (fails on a shared id or a shared object)", () => {
    const { spec: next, select } = apply({
      kind: "duplicateNode",
      pointer: REVENUE,
    });
    expect(idsAt(next, ROW)).toEqual(["revenue", "revenue-2", "orders"]);
    expect(select).toBe(`${ROW}/children/1`);
    const copy = nodeAt(next, `${ROW}/children/1`);
    expect(copy?.options).toEqual(nodeAt(next, REVENUE)?.options);
    expect(copy?.options).not.toBe(nodeAt(next, REVENUE)?.options);
  });

  it("duplicates a node without the stamped ids it and its children carry, keeping the others (fails when the copy keeps an id a note is anchored on)", () => {
    const stamped = {
      id: "b-k3j9x0qz",
      type: "ChartCard",
      children: [
        { id: "chart", type: "ChartArea" },
        { id: "b-q8w2e4r6", type: "Banner" },
      ],
    };
    const from = apply({ kind: "replaceNode", pointer: CHART, node: stamped });

    const { spec: next } = apply(
      { kind: "duplicateNode", pointer: CHART },
      from.spec,
    );

    expect(nodeAt(next, CHART)).toEqual(stamped);
    expect(nodeAt(next, "/pages/0/tree/2")).toEqual({
      type: "ChartCard",
      children: [{ id: "chart", type: "ChartArea" }, { type: "Banner" }],
    });
  });

  it("replaces a node with another type, keeping its id and placement (fails when the id is lost)", () => {
    const placed = apply({
      kind: "setOption",
      pointer: REVENUE,
      key: "x",
      value: 1,
    }).spec;
    const withPlacement = applyMockupEdit(placed, {
      kind: "replaceNode",
      pointer: REVENUE,
      node: { type: "Banner", options: { title: "Hello" } },
    });
    expect(nodeAt(withPlacement.spec, REVENUE)).toEqual({
      type: "Banner",
      options: { title: "Hello" },
      id: "revenue",
    });
    expect(withPlacement.select).toBe(REVENUE);
  });
});

describe("moving and removing", () => {
  it("moves a node down within its list by its landing index (fails when the index is read before the removal)", () => {
    const { spec: next, select } = apply({
      kind: "moveNode",
      from: REVENUE,
      parent: ROW,
      index: 1,
    });
    expect(idsAt(next, ROW)).toEqual(["orders", "revenue"]);
    expect(select).toBe(ORDERS);
  });

  it("moves a node out to the page root and follows the shifted pointers (fails when the target is not re-addressed)", () => {
    const { spec: next, select } = apply({
      kind: "moveNode",
      from: CHART,
      parent: ROW,
      index: 0,
    });
    expect(idsAt(next, ROW)).toEqual([undefined, "revenue", "orders"]);
    expect(nodeAt(next, `${ROW}/children/0`)?.type).toBe("ChartCard");
    expect(select).toBe(`${ROW}/children/0`);
    expect(next.pages[0]?.tree).toHaveLength(1);
  });

  it("re-addresses a target that sits after the moved node in the same list (fails on a stale target index)", () => {
    const moved = apply({
      kind: "moveNode",
      from: "/pages/0/tree/0",
      parent: "/pages/0/tree/1",
      index: 0,
    });
    expect(moved.spec.pages[0]?.tree.map((node) => node.type)).toEqual([
      "ChartCard",
    ]);
    expect(moved.select).toBe("/pages/0/tree/0/children/0");
    expect(nodeAt(moved.spec, moved.select ?? "")?.type).toBe("Grid");
  });

  it("removes a node and selects nothing (fails when a sibling is removed instead)", () => {
    const { spec: next, select } = apply({
      kind: "removeNode",
      pointer: REVENUE,
    });
    expect(idsAt(next, ROW)).toEqual(["orders"]);
    expect(select).toBeUndefined();
  });
});

describe("pages", () => {
  it("adds a page with a slug id free among the pages, and opens it (fails on a duplicate id)", () => {
    const first = apply({ kind: "addPage", title: "Réglages Équipe" });
    expect(first.page).toBe("reglages-equipe");
    const second = applyMockupEdit(first.spec, {
      kind: "addPage",
      title: "Settings",
    });
    expect(second.page).toBe("settings-2");
    expect(second.spec.pages.at(-1)).toEqual({
      id: "settings-2",
      title: "Settings",
      tree: [],
    });
  });

  it("renames a page and changes its URL, keeping the rest (fails when the tree is dropped)", () => {
    const next = apply({
      kind: "updatePage",
      page: "orders",
      title: "Sales",
      id: "sales",
    });
    expect(next.page).toBe("sales");
    expect(next.spec.pages[0]).toMatchObject({
      id: "sales",
      title: "Sales",
      fixtures: { revenue: { value: 1 } },
    });
    expect(next.spec.pages[0]?.tree).toHaveLength(2);
  });

  it("reorders pages, which makes the first one home (fails when the page is copied instead of moved)", () => {
    const next = apply({ kind: "movePage", from: 1, to: 0 });
    expect(next.spec.pages.map((page) => page.id)).toEqual([
      "settings",
      "orders",
    ]);
  });

  it("removes a page and opens the one before it (fails when the last page can go)", () => {
    const next = apply({ kind: "removePage", page: "settings" });
    expect(next.spec.pages.map((page) => page.id)).toEqual(["orders"]);
    expect(next.page).toBe("orders");
  });
});

describe("parseMockupSpec", () => {
  it("reads a spec as written and refuses one whose pages or nodes are not shaped right (fails on a shallow check)", () => {
    expect(parseMockupSpec(spec())).toEqual(spec());
    expect(parseMockupSpec({ pages: "x" })).toBeUndefined();
    const badNode = {
      ...spec(),
      pages: [{ id: "x", title: "X", tree: [{ children: [{ type: 3 }] }] }],
    };
    expect(parseMockupSpec(badNode)).toBeUndefined();
  });
});
