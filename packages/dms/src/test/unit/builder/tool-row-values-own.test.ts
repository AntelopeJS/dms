import fs from "node:fs";
import path from "node:path";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import {
  connectDatabase,
  createOpsCategory,
  fixture,
  mapOrders,
  mapOrdersWithRowValues,
  mappingOfOrders,
  PageSchema,
  valueFree,
} from "./helpers/mapped-orders";
import { projectFile } from "./helpers/project-files";
import { MODULE, OP_TIMEOUT } from "./mapped-database";

/** Tabs the AI writes itself over the mapped `status` column, with values no row holds. */
const OWN_TABS: JsonValue = [
  { id: "all", label: "All" },
  {
    id: "own-open",
    label: "Own open",
    filter: { accessorKey: "status", value: "own_open", mode: "is" },
  },
];

/** A select the AI writes itself on a form field, of values no row holds. */
const OWN_SELECT: JsonValue = {
  $dataType: "select",
  config: { items: [{ label: "Own low", value: "own_low" }] },
};

/** The record of a mapped module's `package.json`, as far as a test rewrites it. */
const ManifestSchema = z
  .object({
    dmsBuilder: z
      .object({
        database: z.object({ rowLiterals: z.array(z.string()) }).passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

/** Adds a Form to a page whose one field is {@link OWN_SELECT}. */
async function addOwnSelect(page: string): Promise<void> {
  const fields = [{ id: "priority", type: OWN_SELECT }];
  await valueFree("builder_add_block", {
    page,
    name: "note",
    type: "Form",
    config: { fields },
  });
}

/**
 * Leaves the mapped module's record as dms wrote it before it recorded row values, and answers
 * how to put the record back.
 */
function unrecordRowLiterals(): () => void {
  const manifest = path.join(fixture().root, "modules", MODULE, "package.json");
  const record = ManifestSchema.parse(
    JSON.parse(
      projectFile(fixture().root, path.relative(fixture().root, manifest)),
    ),
  );
  const { rowLiterals, ...unrecorded } = record.dmsBuilder.database;
  expect(rowLiterals).to.not.have.lengthOf(0);
  fs.writeFileSync(
    manifest,
    JSON.stringify({
      ...record,
      dmsBuilder: { ...record.dmsBuilder, database: unrecorded },
    }),
  );
  return () => fs.writeFileSync(manifest, JSON.stringify(record));
}

describe("[unit] the builder tools over a mapped resource answer the literals the AI wrote: over a resource mapped by dms 0.20.8 or before, whose code holds the values of its rows, each tool that reads a page answers the tabs and select items of the AI as written and the mapping's still hidden (fails on an implementation that hides every literal of code over a mapped module)", function () {
  this.timeout(OP_TIMEOUT);

  connectDatabase();

  it("shows the tabs and select items the AI wrote over a mapped resource, beside the hidden ones the mapping wrote", async () => {
    const orders = await mapOrdersWithRowValues();
    await valueFree("builder_add_block", {
      page: orders.page,
      name: "mine",
      type: "TableView",
      controller: orders.ref,
      config: { caption: "Mine", tabs: OWN_TABS },
    });
    await addOwnSelect(orders.page);
    const mappedPage = await valueFree("builder_page_structure", {
      pageRef: orders.page,
    });
    expect(mappedPage).to.include('"tabs":{"$hidden":4}');
    expect(mappedPage).to.include(JSON.stringify(OWN_TABS));
    expect(mappedPage).to.include(JSON.stringify(OWN_SELECT));
    const restore = unrecordRowLiterals();
    const mappedBefore = await valueFree("builder_page_structure", {
      pageRef: orders.page,
    });
    expect(mappedBefore).to.not.include("own_open");
    expect(mappedBefore).to.not.include("own_low");
    restore();
    await createOpsCategory();
    await valueFree("builder_create_page", {
      name: "own-orders",
      displayName: "Own orders",
      category: "pages.ops",
    });
    await valueFree("builder_add_block", {
      page: "/ops/own-orders",
      name: "table",
      type: "TableView",
      controller: orders.ref,
      config: { caption: "Own orders", tabs: OWN_TABS },
    });
    const ownPage = await valueFree("builder_page_structure", {
      pageRef: "/ops/own-orders",
    });
    expect(ownPage).to.include(JSON.stringify(OWN_TABS));
    expect(ownPage).to.not.include("$hidden");
  });

  it("shows the select items the AI wrote in a module before its first mapping", async () => {
    await valueFree("builder_create_category", {
      name: "own",
      displayName: "Own",
      module: MODULE,
    });
    await valueFree("builder_create_page", {
      name: "notes",
      displayName: "Notes",
      category: "pages.own",
    });
    await addOwnSelect("/own/notes");
    await mapOrders();
    const notes = await valueFree("builder_page_structure", {
      pageRef: "/own/notes",
    });
    expect(notes).to.include(JSON.stringify(OWN_SELECT));
  });

  it("keeps a mapped badge and its tabs hidden once a person relabels one of their items", async () => {
    const orders = await mapOrdersWithRowValues();
    const page = PageSchema.parse(
      JSON.parse(
        await valueFree("builder_page_structure", { pageRef: orders.page }),
      ),
    ).data.page.filepath;
    for (const file of [...orders.files, page]) {
      const code = projectFile(
        fixture().root,
        path.relative(fixture().root, file),
      );
      fs.writeFileSync(file, code.replaceAll("Zq paid", "Settled"));
    }
    const fields = await valueFree("builder_resource_structure", {
      ref: orders.ref,
    });
    expect(fields).to.include('"items":{"$hidden":3}');
    const tabs = await valueFree("builder_page_structure", {
      pageRef: orders.page,
    });
    expect(tabs).to.include('"tabs":{"$hidden":4}');
  });

  it("keeps the tabs of a moved page hidden when a module mapped before dms recorded them drops its badge", async () => {
    const orders = await mapOrdersWithRowValues();
    unrecordRowLiterals();
    await createOpsCategory();
    await valueFree("builder_configure_page", {
      pageRef: orders.page,
      patch: { category: "pages.ops" },
    });
    await valueFree("builder_map_resources", mappingOfOrders(null));
    const moved = await valueFree("builder_page_structure", {
      pageRef: "/ops/erp-orders",
    });
    expect(moved).to.include('"tabs":{"$hidden":4}');
  });
});
