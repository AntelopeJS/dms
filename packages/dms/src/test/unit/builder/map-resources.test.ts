import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import type { ResourceLocation } from "@antelopejs/interface-dms-builder";
import {
  AddField,
  AddQuery,
  CreatePage,
  CreateResource,
  DeleteResource,
  ListPages,
  ListResources,
  MapResources,
} from "../../../implementations/dms-builder";
import {
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../implementations/dms-builder/engine";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { projectFile } from "./helpers/project-files";
import {
  ERP_WRITES,
  FAKE_CATALOG,
  INPUT,
  MODULE,
  OP_TIMEOUT,
} from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

let app: Fixture;

function moduleFile(relative: string): string {
  return projectFile(app.root, path.join("modules", MODULE, "src", relative));
}

/**
 * A client's tables mapped into a module bound to their database: the schema mirrors the catalog
 * verbatim, `_id` exists only where a key does, nothing would create or alter a table, and the
 * pages are generated over what has a key.
 */
describe("mapping a database the project does not own", function () {
  this.timeout(OP_TIMEOUT);

  let result: Awaited<ReturnType<typeof MapResources>>;

  before(async () => {
    app = createFixture({ modules: [MODULE], connectionAccess: ERP_WRITES });
    setCatalogConnectionsForTests({ erp: FAKE_CATALOG });
    setModuleReloadForTests(reloadedAtOnce);
    result = await MapResources(INPUT);
  });

  after(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  it("writes a module that typechecks, with every TableView page", async () => {
    expectOk(result, "MapResources");
    const refs = (await ListResources()).map((resource) => resource.ref);
    expect(refs).to.include.members([
      "erp/sales/accounts",
      "erp/sales/contacts",
      "erp/sales/products",
    ]);
    const pages = (await ListPages()).filter(
      (page) => page.sourceModule === MODULE,
    );
    expect(pages.map((page) => page.id)).to.have.members([
      "sales-accounts",
      "sales-contacts",
      "sales-countries",
      "sales-products",
    ]);
  });

  it("mirrors the catalog's names verbatim, with _id beside the key column", () => {
    const accounts = moduleFile("sales/accounts/database.ts");
    expect(accounts).to.include('const tableName = "accounts";');
    expect(accounts).to.include('@RegisterTable(tableName, "sales")');
    expect(accounts).to.include('@Field("string") declare _id: string;');
    expect(accounts).to.include('@Field("number") declare id: number;');
    expect(accounts).to.include('@Field("date") declare "Order Date": Date;');
    expect(accounts).to.not.include("@Index");
  });

  it("registers the mapped schema in the module's start", () => {
    expect(moduleFile("index.ts")).to.match(
      /export async function start\(\)[^}]*await RegisterSchema\("sales"\);/s,
    );
  });

  it("makes a foreign key a relation column onto the target's key, showing its label", () => {
    const contacts = moduleFile("sales/contacts/data-api.ts");
    expect(contacts).to.include("dataApiController: accountDataAPI");
    expect(contacts).to.include('keyMapping: { label: "name", value: "_id" }');
    expect(moduleFile("sales/contacts/database.ts")).to.include(
      '@Field("string") declare account_id: string;',
    );
    expect(moduleFile("sales/accounts/data-api.ts")).to.match(
      /@Select\(\)[\s\S]*declare name: string;/,
    );
  });

  it("keeps generated and key columns read-only, and a read-only resource without writes", () => {
    const accounts = moduleFile("sales/accounts/data-api.ts");
    expect(accounts).to.match(
      /@Access\(AccessMode\.ReadWrite\)\s*declare name: string;/,
    );
    const contacts = moduleFile("sales/contacts/data-api.ts");
    expect(contacts).to.not.include("ReadWrite");
    expect(contacts).to.not.include("TableViewRoutes.All");
  });

  it("keeps a column off the list but on the controller when it is not listable", () => {
    const accounts = moduleFile("sales/accounts/data-api.ts");
    expect(accounts).to.match(
      /@Access\(AccessMode\.ReadWrite\)\s*declare revenue: /,
    );
    const at = accounts.indexOf("declare revenue:");
    const decorators = accounts.slice(
      accounts.lastIndexOf("declare ", at - 1),
      at,
    );
    expect(decorators).to.include("@Column(");
    expect(decorators).to.not.include("@Listable()");
  });

  it("lets a writable TableView set a key the database does not fill in, and no other key", () => {
    expect(moduleFile("sales/countries/data-api.ts")).to.match(
      /@Access\(AccessMode\.ReadWrite\)\s*declare code: string;/,
    );
    expect(moduleFile("sales/accounts/data-api.ts")).to.not.match(
      /declare id:/,
    );
  });

  it("gives a relation without a key no _id, no route and no page", async () => {
    expect(moduleFile("sales/raw-log/database.ts")).to.not.include("_id");
    expect(moduleFile("sales/raw-log/data-api.ts")).to.include(
      "DataController(RawLog, {  },",
    );
    const pages = (await ListPages()).map((page) => page.id);
    expect(pages).to.not.include("sales-raw-log");
  });

  it("lets a stats query read a relation mapped without a TableView, under the connection's category", async () => {
    expectOk(result, "MapResources");
    if (!result.ok) {
      return;
    }
    expect(result.data.category).to.equal("pages.erp");
    const page = expectOk(
      await CreatePage({
        name: "log-stats",
        displayName: "Log stats",
        category: "pages.erp",
        module: MODULE,
      }),
      "CreatePage",
    );
    expectOk(
      await AddQuery(page.ref, {
        name: "logLines",
        resource: "erp/sales/raw-log",
        template: "count",
      }),
      "AddQuery over a stats-only relation",
    );
  });

  it("declares a column named like a controller member on the table only, and reports it", () => {
    expectOk(result, "MapResources");
    if (!result.ok) {
      return;
    }
    expect(moduleFile("sales/products/database.ts")).to.include(
      "declare count: number;",
    );
    expect(moduleFile("sales/products/data-api.ts")).to.not.include(
      "declare count",
    );
    const reasons = result.data.leftOut.map(
      (entry) => `${entry.relation}.${entry.column}`,
    );
    expect(reasons).to.include.members([
      "sales.products.count",
      "sales.accounts.Order Date",
      "sales.accounts.meta",
    ]);
  });

  it("refuses a declaration the column does not accept, naming the column", async () => {
    const refused = await MapResources({
      ...INPUT,
      resources: [
        {
          relation: "sales.raw_log",
          tableView: false,
          writable: false,
          fields: [{ column: "msg", declared: "number" }],
        },
      ],
    });
    expect(refused.ok).to.equal(false);
    expect(JSON.stringify(refused)).to.include("raw_log.msg");
  });

  it("refuses to create a table or add a column in a mapped module, however the table is placed", async () => {
    const created = await CreateResource({
      name: "ledger",
      module: MODULE,
      fields: [
        { name: "name", label: "Name", dataType: { $dataType: "string" } },
      ],
    });
    expect(created.ok).to.equal(false);
    const ok = expectOk(result, "MapResources");
    const page = ok.resources.find((resource) => resource.page)?.page;
    const locations: ResourceLocation[] = [
      { category: ok.category! },
      { page: page! },
    ];
    for (const location of locations) {
      const placed = await CreateResource({
        name: "ledger",
        location,
        fields: [
          { name: "name", label: "Name", dataType: { $dataType: "string" } },
        ],
      });
      expect(placed.ok, JSON.stringify(location)).to.equal(false);
    }
    expect(
      fs.existsSync(path.join(app.root, "modules", MODULE, "src", "ledger")),
    ).to.equal(false);
    const added = await AddField("erp/sales/accounts", {
      name: "nickname",
      label: "Nickname",
      dataType: { $dataType: "string" },
    });
    expect(added.ok).to.equal(false);
  });

  it("never empties a mapped table when its resource is deleted", async () => {
    const deleted = await DeleteResource("erp/sales/products");
    expect(deleted.ok).to.equal(true);
    expect(JSON.stringify(deleted)).to.include("data_kept");
  });
});
