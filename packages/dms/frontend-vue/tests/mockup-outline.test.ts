import { describe, expect, it } from "vitest";
import type { MockupBlockType } from "../layers/dms-ui/app/entries/utils/mockupCatalog";
import {
  breadcrumb,
  outlineRows,
} from "../layers/dms-ui/app/entries/utils/mockupOutline";
import {
  layoutPathOf,
  type MockupSpecDocument,
} from "../layers/dms-ui/app/entries/utils/mockupSpec";

const CATALOG = new Map<string, MockupBlockType>([
  [
    "GridRow",
    {
      type: "GridRow",
      componentName: "dms-grid-row",
      meta: { name: "Grid row", icon: "i-ph-rows" },
      config: {},
      defaults: {},
    },
  ],
]);

const SPEC: MockupSpecDocument = {
  pages: [
    {
      id: "orders",
      title: "Orders",
      tree: [
        {
          type: "GridRow",
          children: [
            { id: "revenue", type: "KpiCard", options: { title: "Revenue" } },
            { type: "KpiCard", options: { title: "  " } },
          ],
        },
        {
          type: "sketch",
          options: { html: "<div></div>", caption: "Calendar" },
        },
      ],
    },
  ],
};

describe("the page outline", () => {
  it("lists every node depth first with its title, id or block name (fails when a blank title hides the block)", () => {
    expect(
      outlineRows(SPEC, 0, CATALOG).map((row) => [
        row.pointer,
        row.depth,
        row.label,
      ]),
    ).toEqual([
      ["/pages/0/tree/0", 0, "Grid row"],
      ["/pages/0/tree/0/children/0", 1, "Revenue"],
      ["/pages/0/tree/0/children/1", 1, "KpiCard"],
      ["/pages/0/tree/1", 0, "Calendar"],
    ]);
  });

  it("heads a node with its page and each node above it, by id when it has one (fails when the trail skips the page)", () => {
    expect(breadcrumb(SPEC, "/pages/0/tree/0/children/0", CATALOG)).toEqual([
      "Orders",
      "Grid row",
      "revenue",
    ]);
  });

  it("names a node's layout path as the compiler does: root index, then child id or index (fails on a spec pointer handed to the AI)", () => {
    expect(layoutPathOf(SPEC, "/pages/0/tree/0/children/0")).toBe(
      "block-0.revenue",
    );
    expect(layoutPathOf(SPEC, "/pages/0/tree/0/children/1")).toBe("block-0.1");
    expect(layoutPathOf(SPEC, "/pages/0/tree/1")).toBe("block-1");
    expect(layoutPathOf(SPEC, "/pages/0/tree/7")).toBeUndefined();
  });
});
