import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import type {
  MappedRelation,
  MappedResource,
} from "@antelopejs/interface-dms-builder";
import {
  GetMapping,
  ListPages,
  ListResources,
  MapResources,
  PreviewMapResources,
} from "../../../implementations/dms-builder";
import {
  setCatalogConnectionsForTests,
  invalidateSourceIndex,
  resetWritableProject,
  setModuleReloadForTests,
} from "../../../implementations/dms-builder/engine";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { builderRecord, setBuilderRecord } from "./helpers/module-manifest";
import { projectFile } from "./helpers/project-files";
import {
  DESCRIPTIONS,
  FAKE_CATALOG,
  INPUT,
  MODULE,
  OP_TIMEOUT,
} from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

let app: Fixture;

/** What the workspace sends to map a relation again from what GetMapping read back. */
function asMapped(entry: MappedRelation): MappedResource {
  const { resource } = entry;
  const mapped: MappedResource = {
    relation: resource.relation,
    title: resource.title.value,
    tableView: resource.tableView.value,
    writable: resource.writable.value,
    fields: resource.fields
      .filter((field) => entry.included.includes(field.column))
      .map((field) =>
        field.relation
          ? {
              column: field.column,
              label: field.label.value,
              listable: field.listable.value,
              filterable: field.filterable.value,
              sortable: field.sortable.value,
              searchable: field.searchable.value,
              relation: field.relation.value,
            }
          : {
              column: field.column,
              label: field.label.value,
              listable: field.listable.value,
              filterable: field.filterable.value,
              sortable: field.sortable.value,
              searchable: field.searchable.value,
              declared: field.declared.value,
            },
      ),
  };
  if (resource.label.value) {
    mapped.label = resource.label.value;
  }
  return mapped;
}

function moduleFile(relative: string): string {
  return projectFile(app.root, path.join("modules", MODULE, "src", relative));
}

/**
 * A mapping changed after it was written: a relation mapped again from new choices, its page
 * following, and the relations decided against recorded in the module.
 */
describe("mapping again a database already mapped", function () {
  this.timeout(OP_TIMEOUT);

  before(async () => {
    app = createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({ erp: FAKE_CATALOG });
    setModuleReloadForTests(reloadedAtOnce);
    expectOk(await MapResources(INPUT), "MapResources");
  });

  after(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  it("reads a mapped relation back as its current choices", async () => {
    const read = await GetMapping("erp", MODULE);
    expectOk(read, "GetMapping");
    const relations = read.ok ? read.data : [];
    const accounts = relations.find(
      (entry) => entry.resource.relation === "sales.accounts",
    )!;
    expect(accounts.resource.label.value).to.equal("name");
    expect(accounts.resource.writable.value).to.equal(true);
    expect(accounts.included).to.include.members([
      "name",
      "status",
      "Order Date",
    ]);
    const contacts = relations.find(
      (entry) => entry.resource.relation === "sales.contacts",
    )!;
    expect(contacts.resource.writable.value).to.equal(false);
    expect(
      contacts.resource.fields.find((field) => field.column === "account_id")
        ?.relation?.value,
    ).to.equal("sales.accounts");
    const log = relations.find(
      (entry) => entry.resource.relation === "sales.raw_log",
    )!;
    expect(log.resource.tableView.value).to.equal(false);
  });

  it("reads the rest of the mapping when a mapped relation left the database, and says which", async () => {
    setCatalogConnectionsForTests({
      erp: {
        ...FAKE_CATALOG,
        async ListRelations() {
          return DESCRIPTIONS.filter(
            (description) => description.name !== "products",
          );
        },
      },
    });
    try {
      const read = await GetMapping("erp", MODULE);
      expectOk(read, "GetMapping without products");
      const relations = read.ok
        ? read.data.map((entry) => entry.resource.relation)
        : [];
      expect(relations).to.include("sales.accounts");
      expect(relations).to.not.include("sales.products");
      expect(read.ok && read.warnings).to.deep.equal([
        {
          code: "relation_missing",
          message:
            "sales.products is mapped, but the database no longer has it, or the role cannot see it",
        },
      ]);
    } finally {
      setCatalogConnectionsForTests({ erp: FAKE_CATALOG });
    }
  });

  it("maps a relation again from what it reads back, changing nothing", async () => {
    const read = await GetMapping("erp", MODULE);
    const relations = read.ok ? read.data : [];
    const remapped = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: relations
        .filter((entry) => entry.resource.relation === "sales.contacts")
        .map(asMapped),
    });
    expectOk(remapped, "MapResources from GetMapping");
    expect(
      remapped.ok && remapped.changes.map((change) => change.path),
      JSON.stringify(
        remapped.ok && remapped.changes.map((change) => change.diff),
      ),
    ).to.deep.equal([]);
  });

  it("gives a relation mapped again under a new title that title, read back the same", async () => {
    const before = await GetMapping("erp", MODULE);
    const contacts = (before.ok ? before.data : [])
      .filter((entry) => entry.resource.relation === "sales.contacts")
      .map((entry) => ({ ...asMapped(entry), title: "People" }));
    const remapped = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: contacts,
    });
    expectOk(remapped, "MapResources with a new title");
    const read = await GetMapping("erp", MODULE);
    const after = read.ok
      ? read.data.find((entry) => entry.resource.relation === "sales.contacts")
      : undefined;
    expect(after?.resource.title.value).to.equal("People");
  });

  it("rewrites a relation mapped before from new choices, and keeps its page", async () => {
    const remapped = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [
        {
          relation: "sales.countries",
          label: "name",
          tableView: true,
          writable: false,
          fields: [{ column: "name", searchable: true }],
        },
      ],
    });
    expectOk(remapped, "MapResources remap");
    const touched = remapped.ok
      ? remapped.changes.map((change) => change.path)
      : [];
    expect(
      touched.every((file) => file.includes("countries")),
      touched.join(", "),
    ).to.equal(true);
    const countries = moduleFile("sales/countries/data-api.ts");
    expect(countries).to.not.include("ReadWrite");
    expect(countries).to.not.match(/declare code:/);
    const pages = (await ListPages()).map((page) => page.id);
    expect(pages).to.include("sales-countries");
  });

  it("previews the page a remap without a TableView would remove, and writes nothing", async () => {
    const countries = (tableView: boolean) => ({
      module: MODULE,
      connection: "erp",
      resources: [
        {
          relation: "sales.countries",
          tableView,
          writable: false,
          fields: [{ column: "name" }],
        },
      ],
    });
    const pagesBefore = (await ListPages()).map((page) => page.id).sort();
    const source = moduleFile("sales/countries/data-api.ts");
    const removing = await PreviewMapResources(countries(false));
    expectOk(removing, "PreviewMapResources without a TableView");
    expect(removing.ok && removing.data.pagesToRemove).to.have.length(1);
    expect(removing.ok && removing.data.pagesToRemove[0]).to.include(
      "sales-countries",
    );
    const keeping = await PreviewMapResources(countries(true));
    expectOk(keeping, "PreviewMapResources with a TableView");
    expect(keeping.ok && keeping.data.pagesToRemove).to.deep.equal([]);
    const unpaged = await PreviewMapResources({
      module: MODULE,
      connection: "erp",
      resources: [
        {
          relation: "sales.raw_log",
          tableView: false,
          writable: false,
          fields: [],
        },
      ],
    });
    expectOk(unpaged, "PreviewMapResources of a relation without a page");
    expect(unpaged.ok && unpaged.data.pagesToRemove).to.deep.equal([]);
    expect((await ListPages()).map((page) => page.id).sort()).to.deep.equal(
      pagesBefore,
    );
    expect(moduleFile("sales/countries/data-api.ts")).to.equal(source);
  });

  it("removes the page of a relation mapped again without a TableView, and keeps its resource", async () => {
    const remapped = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [
        {
          relation: "sales.countries",
          tableView: false,
          writable: false,
          fields: [{ column: "name" }],
        },
      ],
    });
    expectOk(remapped, "MapResources without a TableView");
    const pages = (await ListPages()).map((page) => page.id);
    expect(pages).to.not.include("sales-countries");
    const refs = (await ListResources()).map((resource) => resource.ref);
    expect(refs).to.include("erp/sales/countries");
  });

  it("points a relation column at a relation the module mapped before", async () => {
    const remapped = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [
        {
          relation: "sales.contacts",
          label: "first_name",
          tableView: true,
          writable: true,
          fields: [
            { column: "first_name" },
            { column: "account_id", relation: "sales.accounts" },
          ],
        },
      ],
    });
    expectOk(remapped, "MapResources onto a mapped target");
    const contacts = moduleFile("sales/contacts/data-api.ts");
    expect(contacts).to.include("dataApiController: accountDataAPI");
    expect(contacts).to.include('keyMapping: { label: "name", value: "_id" }');
  });

  it("relabels the columns pointing at a relation mapped again under a new label", async () => {
    const read = await GetMapping("erp", MODULE);
    const accounts = (read.ok ? read.data : []).find(
      (entry) => entry.resource.relation === "sales.accounts",
    );
    const other = accounts?.resource.fields.find(
      (field) => field.column !== "name" && field.accepts.includes("string"),
    )?.column;
    expect(other, "a second text column on sales.accounts").to.be.a("string");
    const remapped = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [{ ...asMapped(accounts!), label: other }],
    });
    expectOk(remapped, "MapResources with a new label");
    expect(moduleFile("sales/contacts/data-api.ts")).to.include(
      `keyMapping: { label: "${other}", value: "_id" }`,
    );
    const again = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [{ ...asMapped(accounts!), label: other }],
    });
    expectOk(again, "MapResources with the same label");
    const touched = again.ok ? again.changes.map((change) => change.path) : [];
    expect(touched.filter((file) => file.includes("contacts"))).to.deep.equal(
      [],
    );
  });

  it("refuses to leave a relation without a label while a column shows it by its label", async () => {
    const read = await GetMapping("erp", MODULE);
    const accounts = (read.ok ? read.data : []).find(
      (entry) => entry.resource.relation === "sales.accounts",
    );
    const { label: _label, ...unlabelled } = asMapped(accounts!);
    const refused = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [unlabelled],
    });
    expect(refused.ok ? "" : JSON.stringify(refused.error)).to.match(
      /sales\.contacts refers to sales\.accounts, which would have no label to show/,
    );
  });

  it("keeps a page title written by hand when the relation is mapped again under another", async () => {
    const page = (await ListPages()).find(
      (entry) => entry.id === "sales-accounts",
    );
    const file = path.relative(app.root, page!.filepath);
    fs.writeFileSync(
      path.join(app.root, file),
      `const ACCOUNTS_TITLE = "Accounts";\n${projectFile(app.root, file).replace(/displayName: "[^"]*"/, "displayName: ACCOUNTS_TITLE")}`,
    );
    resetWritableProject();
    invalidateSourceIndex();
    const read = await GetMapping("erp", MODULE);
    const accounts = (read.ok ? read.data : []).find(
      (entry) => entry.resource.relation === "sales.accounts",
    );
    expectOk(
      await MapResources({
        module: MODULE,
        connection: "erp",
        resources: [
          { ...asMapped(accounts!), title: "Customers", writable: true },
        ],
      }),
      "MapResources with a new title",
    );
    expect(projectFile(app.root, file)).to.include(
      "displayName: ACCOUNTS_TITLE",
    );
  });

  it("records relations decided against, and forgets one once it is mapped", async () => {
    const manifest = () => builderRecord(app.root, MODULE);
    const excluded = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [],
      excluded: [
        { relation: "sales.audit", reason: "a log" },
        { relation: "sales.products", reason: "not needed" },
      ],
    });
    expectOk(excluded, "MapResources exclusions");
    expect(manifest().database?.excludedTables).to.deep.equal({
      "sales.audit": "a log",
      "sales.products": "not needed",
    });
    const mapped = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [
        {
          relation: "sales.products",
          label: "label",
          tableView: true,
          writable: true,
          fields: [{ column: "label" }, { column: "count" }],
        },
      ],
    });
    expectOk(mapped, "MapResources of an excluded relation");
    expect(manifest()).to.deep.equal({
      database: {
        connection: "erp",
        excludedTables: { "sales.audit": "a log" },
      },
    });
  });

  it("reads the record dms-builder 0.6 wrote, and saves it under the new names", async () => {
    setBuilderRecord(app.root, MODULE, {
      mapped: "erp",
      excluded: { "sales.audit": "a log" },
    });
    const saved = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [],
    });
    expectOk(saved, "MapResources over a 0.6 record");
    expect(builderRecord(app.root, MODULE)).to.deep.equal({
      database: {
        connection: "erp",
        excludedTables: { "sales.audit": "a log" },
      },
    });
  });

  it("refuses a connection the builder does not declare, saying where to declare it", async () => {
    const refused = await MapResources({ ...INPUT, connection: "crm" });
    expect(refused.ok).to.equal(false);
    expect(JSON.stringify(refused)).to.include("importOverrides");
  });
});
