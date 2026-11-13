import path from "node:path";
import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { Listable } from "@antelopejs/interface-data-api/metadata";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  TableViewMeta,
} from "@antelopejs/interface-dms/base/table-view";
import {
  CreateCategory,
  CreatePage,
  CreateResource,
  GetPageStructure,
  PreviewLayout,
  SetPageBlocks,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import type { BlockDraft, RefValue } from "@antelopejs/interface-dms-builder";
import {
  forgetLoadedModule,
  provideLoadedModule,
} from "./helpers/module-cache";

const PAGE = "/shop/board";

let app: Fixture;
let loadedFile: string;

/**
 * The app's compiled DataAPI, as the core would have loaded it: a listed column
 * its table views show.
 */
class ticketDataAPI extends Controller("/api/ticket") {
  @Listable()
  @Column({
    name: "Title",
    type: new DefaultDataTypes.StringType(),
    validate: false,
  })
  declare title: string;
}

interface ColumnOption {
  id: string;
  header: string;
}

function isColumnOption(value: unknown): value is ColumnOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "header" in value &&
    typeof value.header === "string"
  );
}

function isColumnList(value: unknown): value is ColumnOption[] {
  return Array.isArray(value) && value.every(isColumnOption);
}

/** What a preview built in place of one block, as the canvas receives it. */
async function previewOf(block: Omit<BlockDraft, "name">) {
  const preview = expectOk(
    await PreviewLayout(PAGE, {
      blocks: [{ name: "block", ...block }],
    }),
    "PreviewLayout",
  );
  return {
    degraded: preview.degraded,
    component: preview.components.block,
  };
}

function previewsTableBlocks(): void {
  it("names the table a block still has to be given", async function () {
    this.timeout(60_000);
    const { degraded, component } = await previewOf({
      type: "TableView",
      config: {},
    });

    expect(degraded).to.deep.equal([`${PAGE}#block`]);
    expect(component.options).to.include({ label: "Table — choose its table" });
  });

  it("shows a table view's rows through its list route, leaving its class as it found it", async function () {
    this.timeout(60_000);
    const { degraded, component } = await previewOf({
      type: "TableView",
      controller: "ticket",
      config: { caption: "Tickets", rowActions: { delete: false } },
    });

    expect(degraded).to.deep.equal([]);
    expect(component.componentName).to.equal("dms-table-view");
    const options = component.options ?? {};
    expect(options).to.include({ caption: "Tickets" });
    expect(options.source).to.deep.include({
      fetchUrl: "/api/ticket/list",
    });
    const columns = options.columns;
    if (!isColumnList(columns)) {
      expect.fail("the table view lists its columns");
    }
    expect(columns.map((column) => [column.id, column.header])).to.deep.equal([
      ["title", "Title"],
    ]);
    const meta = GetMetadata(ticketDataAPI, TableViewMeta);
    expect(meta.componentBuilders).to.have.length(0);
    expect(meta.options).to.deep.equal({});
  });

  it("waits on the running page for a table view whose class is not loaded", async function () {
    this.timeout(60_000);
    const { degraded, component } = await previewOf({
      type: "TableView",
      controller: "invoice",
      config: {},
    });

    expect(degraded).to.deep.equal([`${PAGE}#block`]);
    expect(component.options).to.include({
      label: "Table — needs the running page",
    });
  });

  it("waits on the running page for a relation to a table it has not loaded", async function () {
    this.timeout(60_000);
    const { degraded, component } = await previewOf({
      type: "Form",
      config: { fields: [relationTo({ $ref: { resource: "invoice" } })] },
    });

    expect(degraded).to.deep.equal([`${PAGE}#block`]);
    expect(component.options).to.include({
      label: "a table it reads needs the running page",
    });
  });
}

function writesRelationTables(): void {
  it("writes the table a relation field points at, and reads it back", async function () {
    this.timeout(120_000);
    const current = expectOk(await GetPageStructure(PAGE), "GetPageStructure");
    expectOk(
      await SetPageBlocks(
        PAGE,
        {
          blocks: [
            {
              name: "picker",
              type: "Form",
              config: {
                fields: [relationTo({ $ref: { resource: "ticket" } })],
              },
            },
          ],
        },
        { expectedVersion: current.version },
      ),
      "SetPageBlocks",
    );

    expect(app.read("board/page.ts")).to.contain(
      "dataApiController: ticketDataAPI",
    );
    const [block] = expectOk(
      await GetPageStructure(PAGE),
      "GetPageStructure",
    ).blocks;
    expect(block.editable, "the class reads back as the table").to.equal(true);
    expect(block.config).to.have.deep.nested.property(
      "fields[0].type.config.dataApiController",
      { $ref: { resource: "ticket" } },
    );
  });
}

/**
 * A block over a table is built from the table's DataAPI class, which only the
 * running app holds. The preview reads it off what the app already loaded, and
 * only for a block whose factory leaves that class as it found it.
 */
describe("previewing a block over a table", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
    expectOk(
      await CreatePage({
        name: "board",
        displayName: "Board",
        category: "pages.shop",
      }),
      "CreatePage",
    );
    expectOk(
      await CreateResource({
        name: "ticket",
        fields: [{ name: "title", dataType: { $dataType: "string" } }],
      }),
      "CreateResource",
    );
    loadedFile = path.join(app.root, "dist", "ticket", "data-api.js");
    provideLoadedModule(loadedFile, { ticketDataAPI });
  });

  after(() => {
    forgetLoadedModule(loadedFile);
    destroyFixture();
  });

  previewsTableBlocks();
  writesRelationTables();
});

/** A form field over another table, as the panel writes one. */
function relationTo(dataApiController: RefValue) {
  return {
    id: "ticket",
    label: "Ticket",
    type: {
      $dataType: "relation",
      config: { dataApiController, keyMapping: { label: "title" } },
    },
  };
}
