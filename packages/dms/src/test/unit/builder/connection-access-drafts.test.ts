import { expect } from "chai";
import type { BlockDraft, BlockNode } from "@antelopejs/interface-dms-builder";
import {
  AddBlock,
  CreateResource,
  GetPageStructure,
  MapResources,
  SetPageBlocks,
} from "../../../implementations/dms-builder";
import { expectOk, setConnectionAccess } from "./harness";
import {
  COUNTRIES,
  countries,
  countriesPage,
  form,
  formMode,
  READ_ONLY,
  refusalOf,
  useErpFixture,
} from "./helpers/connection-access";
import { OP_TIMEOUT } from "./mapped-database";

/** The page's blocks as a draft keeps them, each rewritten from what the page reports. */
function kept(blocks: BlockNode[]): BlockDraft[] {
  return blocks.map(({ name, type, config, controller }) => ({
    name,
    type: type ?? undefined,
    config,
    controller,
  }));
}

/** Saves the page with its blocks rewritten as they are, `change` applied to the named one. */
async function saveWith(
  page: string,
  name: string,
  change: Partial<BlockDraft>,
) {
  const structure = expectOk(await GetPageStructure(page), "GetPageStructure");
  const blocks = kept(structure.blocks).map((block) =>
    block.name === name ? { ...block, ...change } : block,
  );
  return SetPageBlocks(
    page,
    { blocks },
    { expectedVersion: structure.version },
  );
}

/** Saves the page with its blocks rewritten as they are, and `added` after them. */
async function saveAdding(page: string, added: BlockDraft) {
  const structure = expectOk(await GetPageStructure(page), "GetPageStructure");
  return SetPageBlocks(
    page,
    { blocks: [...kept(structure.blocks), added] },
    { expectedVersion: structure.version },
  );
}

const CREATE_FORM = {
  name: "createForm",
  type: "ResourceForm",
  controller: COUNTRIES,
  config: { mode: "new" },
} satisfies BlockDraft;

const COUNTRIES_TABLE = {
  name: "countriesTable",
  type: "TableView",
  controller: COUNTRIES,
  config: {},
} satisfies BlockDraft;

describe("[unit] a page draft over a mapped table follows its connection's access", function () {
  this.timeout(OP_TIMEOUT);
  useErpFixture();
  let page: string;

  before(async () => {
    setConnectionAccess({ erp: "read-write" });
    expectOk(await MapResources(countries(true)), "writable mapping");
    page = await countriesPage();
    expectOk(await form(page, "showForm", "view"), "a form that shows a row");
    expectOk(await form(page, "editForm", "edit"), "a form that edits rows");
    expectOk(
      await CreateResource({
        name: "note",
        fields: [{ name: "text", dataType: { $dataType: "string" } }],
      }),
      "a project resource",
    );
    expectOk(
      await AddBlock({
        page,
        name: "noteForm",
        type: "ResourceForm",
        controller: "note",
        config: { mode: "edit" },
      }),
      "a form that edits a project resource",
    );
    setConnectionAccess({ erp: "read" });
  });

  it("is refused, and left as it was, when it turns a form into one that edits rows on a read connection", async () => {
    expect(
      refusalOf(await saveWith(page, "showForm", { config: { mode: "edit" } })),
    ).to.include(
      `refused to turn a form into one that edits rows of "${COUNTRIES}": ${READ_ONLY}`,
    );
    expect(await formMode(page, "showForm")).to.equal("view");
  });

  it("is refused when it adds a form that creates rows, or a table over one still serving write routes, on a read connection", async () => {
    expect(refusalOf(await saveAdding(page, CREATE_FORM))).to.include(
      `refused to add a form that creates rows of "${COUNTRIES}": ${READ_ONLY}`,
    );
    expect(refusalOf(await saveAdding(page, COUNTRIES_TABLE))).to.include(
      `refused to add a TableView over "${COUNTRIES}", whose table still serves create, edit and delete routes`,
    );
    const structure = expectOk(await GetPageStructure(page), "structure");
    expect(structure.blocks.map(({ name }) => name)).to.not.include.members([
      "createForm",
      "countriesTable",
    ]);
  });

  it("is refused when it moves a form that edits rows onto the mapped table", async () => {
    expect(
      refusalOf(await saveWith(page, "noteForm", { controller: COUNTRIES })),
    ).to.include(
      `refused to add a form that edits rows of "${COUNTRIES}": ${READ_ONLY}`,
    );
  });

  it("saves a page whose writing form keeps its mode, and a form that only shows a row, on a read connection", async () => {
    expectOk(
      await saveWith(page, "editForm", {
        config: { mode: "edit", title: "Edit a country" },
      }),
      "a title on a form that edits",
    );
    expect(await formMode(page, "editForm")).to.equal("edit");
    expectOk(
      await saveAdding(page, {
        ...CREATE_FORM,
        name: "secondShowForm",
        config: { mode: "view" },
      }),
      "a form that shows a row",
    );
  });

  it("saves the forms and the table once the connection is read-write", async () => {
    setConnectionAccess({ erp: "read-write" });
    expectOk(
      await saveWith(page, "showForm", { config: { mode: "edit" } }),
      "a form turned into one that edits",
    );
    expect(await formMode(page, "showForm")).to.equal("edit");
    expectOk(await saveAdding(page, CREATE_FORM), "a form that creates");
    expectOk(await saveAdding(page, COUNTRIES_TABLE), "a table");
  });
});
