import { expect } from "chai";
import type { MockupNode, MockupSpecPage } from "../../../mockup";
import type { BlockDraft } from "../../helpers/live-page";
import { nodeAt, planEdited, takeNode } from "../../helpers/mockup-apply";

const IN_CODE = "Defined by an expression in code; preserved unchanged on save";

const STACK: BlockDraft[] = [
  {
    name: "stack",
    type: "VStack",
    children: [
      { name: "a", type: "KpiCard", config: { title: "A" } },
      { name: "custom", type: null },
    ],
  },
];

describe("[unit] mockup apply: a block moved to another parent", () => {
  it("writes a plain block at its new place and takes it from its old one (fails a plan that preserves it by a path it no longer has)", () => {
    const plan = planEdited(STACK, (page) => {
      page.tree.push(takeNode(page.tree, "a"));
    });

    expect(plan.draft.blocks).to.deep.equal([
      {
        name: "stack",
        type: "VStack",
        config: {},
        children: [{ name: "custom", preserve: true }],
      },
      { name: "a", type: "KpiCard", config: { title: "A" } },
    ]);
    expect(plan.summary.removed).to.deep.equal(["/books#stack/a"]);
    expect(plan.wiring).to.deep.equal([]);
  });

  it("leaves a sketched block where it was and lists the move (fails a plan that deletes code it cannot copy)", () => {
    const plan = planEdited(STACK, (page) => {
      page.tree.push(takeNode(page.tree, "custom"));
    });

    expect(plan.draft.blocks[0]?.children).to.deep.equal([
      { name: "a", preserve: true },
      { name: "custom", preserve: true },
    ]);
    expect(plan.draft.blocks).to.have.length(1);
    expect(plan.wiring).to.deep.equal([
      {
        pointer: "/pages/0/tree/1",
        id: "custom",
        type: "sketch",
        reason: "move",
        kept: "/books#stack/custom",
      },
    ]);
  });

  it("keeps a removed parent whole when a block it held cannot move, and moves nothing else out of it (fails a plan that loses the sketch, or copies a block it also keeps)", () => {
    const plan = planEdited(STACK, (page) => {
      page.tree = nodeAt(page, "stack").children ?? [];
    });

    expect(plan.draft.blocks).to.deep.equal([
      { name: "stack", preserve: true },
    ]);
    expect(
      plan.wiring.map(({ id, reason, kept }) => ({ id, reason, kept })),
    ).to.deep.equal([
      { id: "a", reason: "move", kept: "/books#stack/a" },
      { id: "custom", reason: "move", kept: "/books#stack/custom" },
      { id: "custom", reason: "parent", kept: "/books#stack" },
    ]);
  });

  it("lists the removed parent it keeps for a block that could not move out of it into another (fails a plan that keeps a removed block without a note)", () => {
    const plan = planEdited(
      [
        {
          name: "a",
          type: "VStack",
          children: [
            { name: "custom", type: null },
            { name: "k", type: "KpiCard", config: { title: "K" } },
          ],
        },
        {
          name: "b",
          type: "VStack",
          children: [{ name: "other", type: "KpiCard", config: {} }],
        },
      ],
      (page) => {
        nodeAt(page, "b").children?.push(takeNode(page.tree, "custom"));
        takeNode(page.tree, "a");
      },
    );

    expect(plan.draft.blocks[0]).to.deep.equal({ name: "a", preserve: true });
    expect(plan.wiring).to.deep.equal([
      {
        pointer: "/pages/0/tree/0/children/1",
        id: "custom",
        type: "sketch",
        reason: "move",
        kept: "/books#a/custom",
      },
      {
        pointer: "/pages/0/tree/0/children/1",
        id: "custom",
        type: "sketch",
        reason: "parent",
        kept: "/books#a",
      },
    ]);
  });

  it("unwraps a container of plain blocks: its children written at the top, the container removed (fails a plan that keeps what it can rewrite)", () => {
    const plan = planEdited(
      [
        {
          name: "stack",
          type: "VStack",
          children: [
            { name: "a", type: "KpiCard", config: { title: "A" } },
            { name: "b", type: "KpiCard", config: { title: "B" } },
          ],
        },
      ],
      (page) => {
        page.tree = nodeAt(page, "stack").children ?? [];
      },
    );

    expect(
      plan.draft.blocks.map(({ name, preserve }) => ({ name, preserve })),
    ).to.deep.equal([
      { name: "a", preserve: undefined },
      { name: "b", preserve: undefined },
    ]);
    expect(plan.summary.removed).to.deep.equal(["/books#stack"]);
  });
});

const SAME_NAMES: BlockDraft[] = [
  { name: "widget", type: "KpiCard", config: { title: "W" } },
  {
    name: "s1",
    type: "VStack",
    children: [
      { name: "widget", type: null },
      { name: "k1", type: "KpiCard", config: { title: "K1" } },
    ],
  },
  { name: "s2", type: "VStack", children: [{ name: "widget", type: null }] },
];
const CUSTOM_PATHS = ["/books#s1/widget", "/books#s2/widget"];
const PLACES = [[], ["s1"], ["s2"]];

function listAt(page: MockupSpecPage, ids: string[]): MockupNode[] {
  if (ids.length === 0) return page.tree;
  const node = nodeAt(page, ...ids);
  node.children ??= [];
  return node.children;
}

describe("[unit] mockup apply: blocks of one name", () => {
  it("never removes a custom component while a sketch of its name is left, wherever the mockup puts the sketches and whether it keeps a block of their name (fails a matcher that pairs a sketch with a block of the builder's own, or drops a move it cannot tell apart)", () => {
    const removed = [true, false].flatMap((keepBlock) =>
      PLACES.flatMap((first) =>
        PLACES.flatMap((second) => {
          const plan = planEdited(SAME_NAMES, (page) => {
            const one = takeNode(listAt(page, ["s1"]), "widget");
            const two = takeNode(listAt(page, ["s2"]), "widget");
            if (!keepBlock) takeNode(page.tree, "widget");
            listAt(page, first).push(one);
            listAt(page, second).push(two);
          });
          return plan.summary.removed
            .filter((path) => CUSTOM_PATHS.includes(path))
            .map(
              (path) =>
                `${path}, sketches in /${first.join("/")} and /${second.join("/")}, block ${keepBlock ? "kept" : "removed"}`,
            );
        }),
      ),
    );

    expect(removed).to.deep.equal([]);
  });
});

const LOCKED_GRID: BlockDraft[] = [
  {
    name: "rows",
    type: "Grid",
    config: { minColumnWidth: "200px" },
    lockedOptions: { gap: IN_CODE },
    children: [
      { name: "r1", type: "GridRow" },
      { name: "r2", type: "GridRow" },
    ],
  },
];

describe("[unit] mockup apply: a block whose options are set in code", () => {
  it("writes an option it may edit, never the locked one, children as they stand (fails a plan that sends the locked key or preserves the block)", () => {
    const plan = planEdited(LOCKED_GRID, (page) => {
      const options = nodeAt(page, "rows").options ?? {};
      options.minColumnWidth = "120px";
    });

    expect(plan.draft.blocks).to.deep.equal([
      {
        name: "rows",
        type: "Grid",
        config: { minColumnWidth: "120px" },
        children: [
          { name: "r1", preserve: true },
          { name: "r2", preserve: true },
        ],
      },
    ]);
  });

  it("keeps it, its children listed as they are, when the mockup reorders them, and lists the change (fails a plan the builder refuses for moving locked children)", () => {
    const plan = planEdited(LOCKED_GRID, (page) => {
      nodeAt(page, "rows").children?.reverse();
    });

    expect(plan.draft.blocks).to.deep.equal([
      {
        name: "rows",
        preserve: true,
        children: [
          { name: "r1", preserve: true },
          { name: "r2", preserve: true },
        ],
      },
    ]);
    expect(plan.wiring).to.deep.equal([
      {
        pointer: "/pages/0/tree/0",
        id: "rows",
        type: "Grid",
        reason: "locked",
        kept: "/books#rows",
      },
    ]);
  });
});

const TABLE: BlockDraft[] = [
  {
    name: "table",
    type: "TableView",
    controller: "book",
    config: { caption: "Books", pageSize: 20, views: [{ id: "all" }] },
  },
];

describe("[unit] mockup apply: a table bound to a resource", () => {
  it("writes an option the mockup draws, keeping what its resource decides (fails a plan that writes the sample rows or drops the views)", () => {
    const plan = planEdited(TABLE, (page) => {
      const options = nodeAt(page, "table").options ?? {};
      options.caption = "All books";
    });

    expect(plan.draft.blocks).to.deep.equal([
      {
        name: "table",
        type: "TableView",
        config: { caption: "All books", pageSize: 20, views: [{ id: "all" }] },
        controller: "book",
      },
    ]);
  });

  it("keeps it and lists it when its columns changed (fails a plan that writes mockup columns over the resource's)", () => {
    const plan = planEdited(TABLE, (page) => {
      const options = nodeAt(page, "table").options ?? {};
      options.columns = {};
    });

    expect(plan.draft.blocks).to.deep.equal([
      { name: "table", preserve: true },
    ]);
    expect(plan.wiring.map(({ reason }) => reason)).to.deep.equal(["table"]);
  });
});

const CHART_CARD: BlockDraft[] = [
  {
    name: "sales",
    type: "ChartCard",
    config: {
      title: "Sales",
      chart: {
        $block: { type: "ChartArea", config: { xaxisType: "datetime" } },
      },
    },
  },
];

describe("[unit] mockup apply: a block held in an option", () => {
  it("writes its parent's edit with the held block as it is (fails a plan that drops the option holding it)", () => {
    const plan = planEdited(CHART_CARD, (page) => {
      const options = nodeAt(page, "sales").options ?? {};
      options.title = "Revenue";
    });

    expect(plan.draft.blocks).to.deep.equal([
      {
        name: "sales",
        type: "ChartCard",
        config: { title: "Revenue", chart: CHART_CARD[0].config?.chart },
      },
    ]);
    expect(plan.wiring).to.deep.equal([]);
  });

  it("lists an edit of the held block and keeps its live value (fails a plan that writes the node's options as a block)", () => {
    const plan = planEdited(CHART_CARD, (page) => {
      const options = nodeAt(page, "sales").options ?? {};
      options.title = "Revenue";
      nodeAt(page, "sales", "chart").options = { xaxisType: "category" };
    });

    expect(plan.draft.blocks[0]?.config).to.deep.equal({
      title: "Revenue",
      chart: CHART_CARD[0].config?.chart,
    });
    expect(plan.wiring).to.deep.equal([
      {
        pointer: "/pages/0/tree/0/children/0",
        id: "chart",
        type: "ChartArea",
        reason: "held-block",
        kept: "/books#sales/chart",
      },
    ]);
  });
});
