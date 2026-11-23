import path from "node:path";
import { expect } from "chai";
import type { RelationDescription } from "@antelopejs/interface-database-catalog";
import { MapResources } from "../../../implementations/dms-builder";
import {
  type CatalogConnection,
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
  DESCRIPTIONS,
  ERP_WRITES,
  INPUT,
  MODULE,
  OP_TIMEOUT,
} from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

const WRITES_BY_RELATION = new Map([
  ["accounts", { insert: false, update: false, delete: false }],
  ["products", { insert: true, update: false, delete: false }],
]);

/**
 * The catalog of an account that may create tables, writes no row of `sales.accounts` and may
 * only insert into `sales.products`.
 */
const DESCRIBED: RelationDescription[] = DESCRIPTIONS.map((description) => ({
  ...description,
  writes: WRITES_BY_RELATION.get(description.name) ?? description.writes,
}));

const CATALOG: Partial<CatalogConnection> = {
  async ListRelations() {
    return DESCRIBED;
  },
  async DescribeRelations(relations: string[]) {
    return DESCRIBED.filter((description) =>
      relations.includes(`${description.schema}.${description.name}`),
    );
  },
};

let app: Fixture;
let result: Awaited<ReturnType<typeof MapResources>>;

function dataApi(relation: string): string {
  return projectFile(
    app.root,
    path.join("modules", MODULE, "src", "sales", relation, "data-api.ts"),
  );
}

describe("mapping a relation the database account may not write (fails on a mapping that trusts the connection's `\"read-write\"` access alone: the account's catalog says it may not write the rows of `sales.accounts`, so its TableView must serve no write)", function () {
  this.timeout(OP_TIMEOUT);

  before(async () => {
    app = createFixture({ modules: [MODULE], connectionAccess: ERP_WRITES });
    setCatalogConnectionsForTests({ erp: CATALOG });
    setModuleReloadForTests(reloadedAtOnce);
    result = await MapResources(INPUT);
  });

  after(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  it("maps it read-only although asked writable, and says so", () => {
    expectOk(result, "MapResources");
    const accounts = dataApi("accounts");
    expect(accounts).to.not.include("TableViewRoutes.All");
    expect(accounts).to.not.include("AccessMode.ReadWrite");
    expect(result.ok && result.warnings).to.deep.include({
      code: "relation_read_only",
      message:
        "sales.accounts: mapped read-only, since the database account may not insert, update or delete its rows",
    });
  });

  it("keeps the write routes of a relation the account may write in part", () => {
    expect(dataApi("products")).to.include("TableViewRoutes.All");
  });
});
