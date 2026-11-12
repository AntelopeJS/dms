import { describe, expect, it } from "vitest";
import type { MockupBlockType } from "../layers/dms-ui/app/entries/utils/mockupCatalog";
import {
  dropEdit,
  dropTarget,
  insertionAfter,
  type MockupDrag,
  type MockupDropContext,
} from "../layers/dms-ui/app/entries/utils/mockupDrop";
import type { MockupSpecDocument } from "../layers/dms-ui/app/entries/utils/mockupSpec";

function block(
  type: string,
  extra: Partial<MockupBlockType> = {},
): MockupBlockType {
  return {
    type,
    componentName: type,
    meta: { name: type },
    config: {},
    defaults: {},
    ...extra,
  };
}

const CATALOG = new Map(
  [
    block("Grid", { container: true }),
    block("GridRow", { container: true }),
    block("PageToolbar", { container: true, allowedChildren: ["LiveToggle"] }),
    block("KpiCard"),
    block("ChartCard"),
    block("LiveToggle"),
  ].map((entry) => [entry.type, entry]),
);

const SPEC: MockupSpecDocument = {
  pages: [
    {
      id: "orders",
      title: "Orders",
      tree: [
        {
          type: "Grid",
          children: [
            {
              id: "kpis",
              type: "GridRow",
              children: [
                { id: "revenue", type: "KpiCard" },
                { id: "orders", type: "KpiCard" },
              ],
            },
          ],
        },
        { type: "ChartCard" },
        { type: "PageToolbar", children: [{ id: "live", type: "LiveToggle" }] },
      ],
    },
  ],
};

const GRID = "/pages/0/tree/0";
const ROW = `${GRID}/children/0`;
const REVENUE = `${ROW}/children/0`;
const ORDERS = `${ROW}/children/1`;
const CHART = "/pages/0/tree/1";
const TOOLBAR = "/pages/0/tree/2";

const CONTEXT: MockupDropContext = {
  spec: SPEC,
  page: 0,
  catalog: CATALOG,
  paths: {
    "block-0": GRID,
    "block-0.kpis": ROW,
    "block-0.kpis.revenue": REVENUE,
    "block-0.kpis.orders": ORDERS,
    "block-1": CHART,
    "block-2": TOOLBAR,
    "block-2.live": `${TOOLBAR}/children/0`,
  },
  blocks: [
    { path: "block-0", rect: { x: 0, y: 0, width: 1000, height: 200 } },
    { path: "block-0.kpis", rect: { x: 0, y: 0, width: 1000, height: 100 } },
    {
      path: "block-0.kpis.revenue",
      rect: { x: 0, y: 0, width: 490, height: 100 },
    },
    {
      path: "block-0.kpis.orders",
      rect: { x: 510, y: 0, width: 490, height: 100 },
    },
    { path: "block-1", rect: { x: 0, y: 220, width: 1000, height: 200 } },
    { path: "block-2", rect: { x: 0, y: 440, width: 1000, height: 40 } },
    { path: "block-2.live", rect: { x: 0, y: 440, width: 100, height: 40 } },
  ],
};

const ADD_KPI: MockupDrag = { kind: "add", type: "KpiCard" };

describe("dropTarget", () => {
  it("drops beside a leaf in a row by which half the pointer is on, the line between the two (fails on a stack's vertical reading)", () => {
    expect(dropTarget(CONTEXT, ADD_KPI, { x: 400, y: 50 })).toEqual({
      parent: ROW,
      index: 1,
      line: { x: 507, y: 0, width: 3, height: 100 },
    });
    expect(dropTarget(CONTEXT, ADD_KPI, { x: 100, y: 50 })).toMatchObject({
      parent: ROW,
      index: 0,
    });
  });

  it("drops beside a leaf of the page by its upper or lower half (fails when the line is drawn after the wrong block)", () => {
    expect(dropTarget(CONTEXT, ADD_KPI, { x: 500, y: 250 })).toEqual({
      parent: null,
      index: 1,
      line: { x: 0, y: 217, width: 1000, height: 3 },
    });
    expect(dropTarget(CONTEXT, ADD_KPI, { x: 500, y: 400 })).toMatchObject({
      parent: null,
      index: 2,
    });
  });

  it("drops at the end of the page below every block (fails when a drop outside the blocks is lost)", () => {
    expect(dropTarget(CONTEXT, ADD_KPI, { x: 500, y: 900 })).toEqual({
      parent: null,
      index: 3,
      line: { x: 0, y: 480, width: 1000, height: 3 },
    });
  });

  it("never drops a type into a container that does not take it (fails when allowedChildren is ignored)", () => {
    expect(dropTarget(CONTEXT, ADD_KPI, { x: 500, y: 460 })).toMatchObject({
      parent: null,
    });
    expect(
      dropTarget(
        CONTEXT,
        { kind: "add", type: "LiveToggle" },
        { x: 500, y: 460 },
      ),
    ).toMatchObject({ parent: TOOLBAR, index: 1 });
  });

  it("never drops a moved node inside itself (fails when a row lands in its own children)", () => {
    const drag: MockupDrag = { kind: "move", pointer: ROW, type: "GridRow" };
    const target = dropTarget(CONTEXT, drag, { x: 400, y: 50 });
    expect(target.parent).toBe(GRID);
    expect(target.line).toEqual({ x: 8, y: 8, width: 984, height: 3 });
  });
});

describe("dropEdit", () => {
  it("counts a move down its own list without the node itself (fails on an off-by-one drop)", () => {
    const drag: MockupDrag = {
      kind: "move",
      pointer: REVENUE,
      type: "KpiCard",
    };
    const line = { x: 0, y: 0, width: 0, height: 0 };
    expect(
      dropEdit(drag, { parent: ROW, index: 2, line }, "orders", () => ({})),
    ).toEqual({
      kind: "moveNode",
      from: REVENUE,
      parent: ROW,
      index: 1,
    });
    expect(
      dropEdit(drag, { parent: null, index: 1, line }, "orders", () => ({})),
    ).toEqual({
      kind: "moveNode",
      from: REVENUE,
      parent: null,
      index: 1,
    });
  });

  it("inserts the node a new block starts as (fails when the drop ignores its target)", () => {
    const line = { x: 0, y: 0, width: 0, height: 0 };
    expect(
      dropEdit(ADD_KPI, { parent: ROW, index: 1, line }, "orders", () => ({
        type: "KpiCard",
      })),
    ).toEqual({
      kind: "insertNode",
      parent: ROW,
      page: "orders",
      index: 1,
      node: { type: "KpiCard" },
    });
  });
});

describe("insertionAfter", () => {
  it("adds right after the selection, climbing out of a container that does not take the type (fails on an insert the backend refuses)", () => {
    expect(insertionAfter(SPEC, 0, REVENUE, "KpiCard", CATALOG)).toEqual({
      parent: ROW,
      index: 1,
    });
    expect(
      insertionAfter(SPEC, 0, `${TOOLBAR}/children/0`, "KpiCard", CATALOG),
    ).toEqual({ parent: null, index: 3 });
  });

  it("adds at the end of the page when nothing is selected (fails when it lands first)", () => {
    expect(insertionAfter(SPEC, 0, undefined, "KpiCard", CATALOG)).toEqual({
      parent: null,
      index: 3,
    });
  });
});
