import { expect } from "chai";
import { GetCatalog } from "../../../implementations/dms-builder";
import type {
  BlockCatalog,
  BlockTypeDescriptor,
} from "@antelopejs/interface-dms-builder";
import { createFixture, destroyFixture } from "./harness";

let catalog: BlockCatalog;

function blockNamed(type: string): BlockTypeDescriptor {
  const found = catalog.blocks.find((block) => block.type === type);
  if (!found) {
    throw new Error(`no block type ${type} in the catalog`);
  }
  return found;
}

/**
 * The catalog is the contract a builder UI reads to draw a config panel: which
 * blocks exist, which control each option wants, and where a block may be
 * dropped. Pinned because the data-source editor is about to be driven from it.
 */
describe("the block catalog", () => {
  before(async function () {
    this.timeout(60_000);
    createFixture();
    catalog = await GetCatalog();
  });

  after(() => destroyFixture());

  it("reports the block types cms-base declares, not only what it can infer", () => {
    expect(catalog.blocks.length).to.be.greaterThan(20);
    const annotated = catalog.blocks.filter(
      (block) => block.configOrigin === "annotated",
    );
    expect(
      annotated.length,
      "declared types win over inferred ones",
    ).to.be.greaterThan(10);
  });

  it("carries the component each block renders as", () => {
    expect(blockNamed("KpiCard").componentName).to.equal("dms-kpi-card");
    expect(blockNamed("ChartCard").componentName).to.equal("dms-chart-card");
  });

  it("describes the data-source option of every card that fetches one", () => {
    const cards = ["KpiCard", "ChartCard", "TopListCard"];
    for (const type of cards) {
      const option = blockNamed(type).config.fetchUrl;
      expect(option, `${type} exposes fetchUrl`).to.not.equal(undefined);
      expect(option?.ui?.group).to.equal("data");
    }
    for (const type of cards) {
      expect(
        blockNamed(type).config.fetchUrl?.ui?.widget,
        `${type} fetchUrl widget`,
      ).to.equal("dataSource");
    }
  });

  it("names the chart types a card may wrap", () => {
    const chart = blockNamed("ChartCard").config.chart;
    expect(chart?.ui?.widget).to.equal("block");
    expect(chart?.ui?.blockTypes).to.include("ChartLine");
    expect(chart?.ui?.blockTypes).to.include("ChartDonut");
  });

  it("states the placement rules a canvas enforces", () => {
    const grid = blockNamed("Grid");
    expect(grid.container).to.equal(true);
    expect(grid.allowedChildren, "a Grid only takes rows").to.deep.equal([
      "GridRow",
    ]);

    const row = blockNamed("GridRow");
    expect(row.container).to.equal(true);
    expect(
      row.childMeta?.colSpan,
      "a row's children carry their span as child metadata",
    ).to.not.equal(undefined);

    expect(
      catalog.blocks
        .filter((block) => block.allowedChildren !== undefined)
        .map((block) => block.type),
      "the only container naming what it takes",
    ).to.deep.equal(["Grid"]);
  });

  it("flags the blocks that need a resource before they can be added", () => {
    expect(blockNamed("TableView").controllerArg).to.equal(true);
    expect(blockNamed("KpiCard").controllerArg).to.not.equal(true);
  });

  it("offers no factory it could not write a call to", () => {
    const types = catalog.blocks.map((block) => block.type);
    expect(types, "takes a component's name, not options").to.not.include(
      "CustomComponent",
    );
    expect(types, "takes a mode before its options").to.not.include(
      "resourceForm",
    );
    expect(types, "the table form a page is built with").to.include(
      "ResourceForm",
    );
  });

  it("keeps a placeholder's own size to the advanced view", () => {
    const { config } = blockNamed("Placeholder");
    expect(config.height?.ui?.advanced).to.equal(true);
    expect(config.width?.ui?.advanced).to.equal(true);
    expect(
      config.label?.ui?.advanced,
      "what it says stays offered",
    ).to.not.equal(true);
  });

  it("gives the table form an icon of its own, beside the form's", () => {
    expect(blockNamed("ResourceForm").icon).to.equal("i-ph-clipboard-text");
    expect(blockNamed("Form").icon).to.not.equal(
      blockNamed("ResourceForm").icon,
    );
  });

  it("marks the options a data type is handed a table in", () => {
    const relation = catalog.dataTypes.find((type) => type.id === "relation");
    expect(relation?.config.dataApiController).to.include({
      "x-controller": true,
      optional: false,
    });
    expect(
      relation?.config.placeholder?.["x-controller"],
      "only the option typed by the table",
    ).to.equal(undefined);
  });

  it("reads the DataTypes declared beside DefaultDataTypes, which only re-exports them", () => {
    const ids = catalog.dataTypes.map((type) => type.id);
    expect(ids).to.include.members(["number", "string", "date", "relation"]);
    const date = catalog.dataTypes.find((type) => type.id === "date");
    expect(date?.import.name).to.equal("DefaultDataTypes.DateType");
    expect(Object.keys(date?.config ?? {})).to.have.length.greaterThan(0);
  });

  it("lists the field names a resource may not use", () => {
    expect(catalog.reservedFieldNames).to.include("_id");
    expect(catalog.reservedFieldNames).to.include("count");
    expect(
      catalog.dataTypes.length,
      "data types back the field editor",
    ).to.be.greaterThan(5);
  });
});
