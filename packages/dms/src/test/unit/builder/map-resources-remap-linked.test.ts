import fs from "node:fs";
import { expect } from "chai";
import { ListPages, MapResources } from "../../../implementations/dms-builder";
import {
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../implementations/dms-builder/engine";
import { createFixture, destroyFixture, expectOk } from "./harness";
import { ERP_WRITES, FAKE_CATALOG, INPUT, OP_TIMEOUT } from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

/**
 * An app that resolves the DMS interface through its real path, as a workspace link does without
 * `preserveSymlinks`: the root category a mapped connection's category sits in is then a
 * declaration outside `node_modules`.
 */
describe("mapping again a database in an app that follows the interface's symlink", function () {
  this.timeout(OP_TIMEOUT);

  before(() => {
    createFixture({
      modules: [INPUT.module],
      connectionAccess: ERP_WRITES,
      compilerOptions: { preserveSymlinks: false },
    });
    setCatalogConnectionsForTests({ erp: FAKE_CATALOG });
    setModuleReloadForTests(reloadedAtOnce);
  });

  after(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  it("reuses the connection's category and writes the TableView page on the second mapping", async () => {
    expectOk(await MapResources(INPUT), "first MapResources");
    const result = await MapResources(INPUT);
    const remapped = expectOk(result, "second MapResources");
    const warnings = (result.ok && result.warnings) || [];
    expect(
      warnings.filter((warning) => warning.code === "page_not_written"),
    ).to.deep.equal([]);
    expect(remapped.category).to.equal("pages.erp");
    const accounts = remapped.resources.find(
      (resource) => resource.relation === "sales.accounts",
    );
    expect(accounts?.page).to.be.a("string");
    const page = (await ListPages()).find(
      (candidate) => candidate.ref === accounts?.page,
    );
    expect(page?.category).to.equal("pages.erp");
    expect(page && fs.existsSync(page.filepath)).to.equal(true);
  });
});
