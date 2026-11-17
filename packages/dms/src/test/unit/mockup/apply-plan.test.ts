import { expect } from "chai";
import type { BlockDraft } from "../../helpers/live-page";
import { nodeAt, planEdited } from "../../helpers/mockup-apply";

const PAGE: BlockDraft[] = [
  {
    name: "revenue",
    type: "KpiCard",
    config: { title: "Revenue", fetchUrl: "/api/books/revenue" },
  },
  { name: "custom", type: null },
  {
    name: "rows",
    type: "Grid",
    children: [
      {
        name: "row",
        type: "GridRow",
        children: [
          {
            name: "a",
            type: "KpiCard",
            config: { title: "A" },
            meta: { colSpan: 2 },
          },
          { name: "b", type: "KpiCard", config: { title: "B" } },
        ],
      },
    ],
  },
];

describe("[unit] mockup apply: what a page left alone writes", () => {
  it("keeps every block of an unchanged page as it is (fails a plan that rewrites blocks it could keep)", () => {
    const plan = planEdited(PAGE);

    expect(plan.draft.blocks).to.deep.equal([
      { name: "revenue", preserve: true },
      { name: "custom", preserve: true },
      { name: "rows", preserve: true },
    ]);
    expect(plan.wiring).to.deep.equal([]);
    expect(plan.summary.removed).to.deep.equal([]);
  });

  it("keeps a block a Custom sketch stands for even when the sketch was edited, and lists the edit (fails a plan that writes the sketch or drops the block)", () => {
    const plan = planEdited(PAGE, (page) => {
      const options = nodeAt(page, "custom").options ?? {};
      options.html = "<p>a new chart</p>";
    });

    expect(plan.draft.blocks[1]).to.deep.equal({
      name: "custom",
      preserve: true,
    });
    expect(plan.wiring).to.deep.equal([
      {
        pointer: "/pages/0/tree/1",
        id: "custom",
        type: "sketch",
        reason: "custom-component",
        kept: "/books#custom",
      },
    ]);
  });
});

describe("[unit] mockup apply: edits it writes", () => {
  it("writes an option edit, with the fixture standing for a live route read from that route again (fails a plan that writes fixture: into the page)", () => {
    const plan = planEdited(PAGE, (page) => {
      const options = nodeAt(page, "revenue").options ?? {};
      options.title = "Income";
    });

    expect(plan.draft.blocks[0]).to.deep.equal({
      name: "revenue",
      type: "KpiCard",
      config: { title: "Income", fetchUrl: "/api/books/revenue" },
    });
    expect(plan.summary.written).to.deep.equal(["/books#revenue"]);
  });

  it("reorders kept blocks and changes the span of one, still keeping both (fails a plan that rewrites a block to move it)", () => {
    const plan = planEdited(PAGE, (page) => {
      const row = nodeAt(page, "rows", "row");
      const [a, b] = row.children ?? [];
      row.children = [b, { ...a, colSpan: 1 }];
    });

    const [rows] = plan.draft.blocks.slice(2);
    expect(rows).to.deep.include({ name: "rows", type: "Grid" });
    expect(rows.children?.[0]?.children).to.deep.equal([
      { name: "b", preserve: true },
      { name: "a", preserve: true, meta: { colSpan: 1 } },
    ]);
    expect(plan.summary.preserved).to.deep.equal([
      "/books#revenue",
      "/books#custom",
      "/books#rows/row/b",
      "/books#rows/row/a",
    ]);
  });

  it("drops the span of a kept block whose node has none (fails a plan that keeps the live span)", () => {
    const plan = planEdited(PAGE, (page) => {
      delete nodeAt(page, "rows", "row", "a").colSpan;
    });

    expect(plan.draft.blocks[2]?.children?.[0]?.children?.[0]).to.deep.equal({
      name: "a",
      preserve: true,
    });
  });

  it("removes a block the mockup removed, and only that one (fails a plan that keeps or preserves it)", () => {
    const plan = planEdited(PAGE, (page) => {
      page.tree = page.tree.filter((node) => node.id !== "revenue");
    });

    expect(plan.draft.blocks.map((block) => block.name)).to.deep.equal([
      "custom",
      "rows",
    ]);
    expect(plan.summary.removed).to.deep.equal(["/books#revenue"]);
  });

  it("adds a new block of a builder type, named after its id, or a name made from it the next apply derives again (fails a plan that drops it or names it after its type)", () => {
    const plan = planEdited(PAGE, (page) => {
      page.tree.push(
        { id: "orders", type: "KpiCard", options: { title: "Orders" } },
        { id: "n-1", type: "KpiCard", options: { title: "Other" } },
      );
    });

    expect(plan.draft.blocks.slice(3)).to.deep.equal([
      { name: "orders", type: "KpiCard", config: { title: "Orders" } },
      { name: "n_1", type: "KpiCard", config: { title: "Other" } },
    ]);
    expect(plan.summary.added).to.deep.equal(["/books#orders", "/books#n_1"]);
    expect(plan.stamps).to.deep.equal([]);
  });

  it("names a new block with no id anew when its name is a removed block's, and gives the node that name as its id (fails a plan that reuses a live name, or leaves the next apply nothing to pair it by)", () => {
    const plan = planEdited(
      [{ name: "kpiCard", type: "KpiCard", config: { title: "Old" } }],
      (page) => {
        page.tree = [{ type: "KpiCard", options: { title: "New" } }];
      },
    );

    expect(plan.draft.blocks).to.deep.equal([
      { name: "kpiCard2", type: "KpiCard", config: { title: "New" } },
    ]);
    expect(plan.summary.removed).to.deep.equal(["/books#kpiCard"]);
    expect(plan.stamps).to.deep.equal([
      { path: "/pages/0/tree/0", id: "kpiCard2", type: "KpiCard" },
    ]);
  });
});

describe("[unit] mockup apply: what it leaves for wiring", () => {
  it("lists a slot or span set on a top-level block, which the builder lays out in order only (fails a plan that drops it without a note)", () => {
    const plan = planEdited(PAGE, (page) => {
      nodeAt(page, "revenue").slot = "side";
      nodeAt(page, "rows").colSpan = 2;
    });

    expect(
      plan.draft.blocks.map(({ name, slot, meta }) => ({ name, slot, meta })),
    ).to.deep.equal([
      { name: "revenue", slot: undefined, meta: undefined },
      { name: "custom", slot: undefined, meta: undefined },
      { name: "rows", slot: undefined, meta: undefined },
    ]);
    expect(plan.wiring).to.deep.equal([
      {
        pointer: "/pages/0/tree/0",
        id: "revenue",
        type: "KpiCard",
        reason: "placement",
      },
      {
        pointer: "/pages/0/tree/2",
        id: "rows",
        type: "Grid",
        reason: "placement",
      },
    ]);
  });

  it("lists a new block whose id gives the block name of another at its place, and writes it under no other name (fails a plan that renames it, which the next apply removes again)", () => {
    const plan = planEdited(PAGE, (page) => {
      page.tree.push(
        { id: "orders_2", type: "KpiCard", options: { title: "Orders" } },
        { id: "orders-2", type: "KpiCard", options: { title: "Orders" } },
      );
    });

    expect(plan.summary.added).to.deep.equal(["/books#orders_2"]);
    expect(plan.wiring).to.deep.equal([
      {
        pointer: "/pages/0/tree/4",
        id: "orders-2",
        type: "KpiCard",
        reason: "name",
      },
    ]);
  });

  it("lists a new block reading a fixture that stands for no live route, and writes nothing of it (fails a plan that writes the fixture: reference)", () => {
    const plan = planEdited(PAGE, (page) => {
      page.tree.push({
        id: "sales",
        type: "KpiCard",
        options: { title: "Sales", fetchUrl: "fixture:sales" },
      });
    });

    expect(plan.draft.blocks.map((block) => block.name)).to.deep.equal([
      "revenue",
      "custom",
      "rows",
    ]);
    expect(plan.wiring).to.deep.equal([
      {
        pointer: "/pages/0/tree/3",
        id: "sales",
        type: "KpiCard",
        reason: "data",
      },
    ]);
  });

  it("lists a block given sample data its live block lacks, and keeps the live block (fails a plan that writes a static value into the page)", () => {
    const plan = planEdited(PAGE, (page) => {
      const options = nodeAt(page, "revenue").options ?? {};
      options.staticValue = 1200;
    });

    expect(plan.draft.blocks[0]).to.deep.equal({
      name: "revenue",
      preserve: true,
    });
    expect(plan.wiring).to.deep.equal([
      {
        pointer: "/pages/0/tree/0",
        id: "revenue",
        type: "KpiCard",
        reason: "data",
        kept: "/books#revenue",
      },
    ]);
  });

  it("lists a new Custom sketch and writes nothing of it (fails a plan that writes a sketch as a block)", () => {
    const plan = planEdited(PAGE, (page) => {
      page.tree.unshift({
        id: "map",
        type: "sketch",
        options: { html: "<p>map</p>" },
      });
    });

    expect(plan.draft.blocks).to.have.length(3);
    expect(plan.wiring).to.deep.equal([
      {
        pointer: "/pages/0/tree/0",
        id: "map",
        type: "sketch",
        reason: "custom-component",
      },
    ]);
  });
});
