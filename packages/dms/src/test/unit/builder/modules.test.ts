import path from "node:path";
import { expect } from "chai";
import {
  CreateCategory,
  CreatePage,
  CreateResource,
  ListPages,
  ListResources,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import {
  configuredModuleIds,
  isInsideFolder,
} from "../../../implementations/dms-builder/engine";
import { projectFile, withFileEdited } from "./helpers/project-files";

const OP_TIMEOUT = 120_000;
const ERP = "erp";

let app: Fixture;

function NameField() {
  return [{ name: "name", label: "Name", dataType: { $dataType: "string" } }];
}

/**
 * A project can hold more than one local module, each bound to its own providers. The builder
 * writes into whichever one an operation names, and never lets one module's sources reach into
 * another's, since a module loads only its own.
 */
describe("a project with more than one local module", function () {
  this.timeout(OP_TIMEOUT);

  before(() => {
    app = createFixture({ modules: [ERP] });
  });

  after(destroyFixture);

  it("writes a resource into the module named, and lists it with that module", async () => {
    expectOk(
      await CreateResource({
        name: "ledger",
        module: ERP,
        fields: NameField(),
      }),
      "CreateResource ledger",
    );
    const ledger = (await ListResources()).find(
      (resource) => resource.ref === "ledger",
    );
    expect(ledger?.sourceModule).to.equal(ERP);
    expect(path.resolve(ledger?.files.database ?? "")).to.equal(
      path.join(app.root, "modules", ERP, "src", "ledger", "database.ts"),
    );
    const barrel = projectFile(
      app.root,
      path.join("modules", ERP, "src", "index.ts"),
    );
    expect(barrel).to.include("./ledger");
  });

  it("writes a category and a page into the module named, and lists the page with it", async () => {
    const { ref } = expectOk(
      await CreateCategory({ name: "erp", displayName: "ERP", module: ERP }),
      "CreateCategory erp",
    );
    expectOk(
      await CreatePage({
        name: "ledgers",
        displayName: "Ledgers",
        category: ref,
        module: ERP,
      }),
      "CreatePage ledgers",
    );
    const page = (await ListPages()).find(
      (candidate) => candidate.id === "ledgers",
    );
    expect(page?.sourceModule).to.equal(ERP);
    expect(
      isInsideFolder(
        path.join(app.root, "modules", ERP, "src"),
        page?.filepath ?? "",
      ),
    ).to.equal(true);
  });

  it("refuses a page in one module under a category declared in another, naming both", async () => {
    const { ref } = expectOk(
      await CreateCategory({ name: "local", displayName: "Local" }),
      "CreateCategory local",
    );
    const result = await CreatePage({
      name: "crossing",
      displayName: "Crossing",
      category: ref,
      module: ERP,
    });
    expect(result.ok).to.equal(false);
    expect(JSON.stringify(result))
      .to.include('module \\"app\\"')
      .and.to.include(ERP);
  });

  it("refuses a module the project does not have, listing the ones it has", async () => {
    const result = await CreateResource({
      name: "orphan",
      module: "nope",
      fields: NameField(),
    });
    expect(result.ok).to.equal(false);
    expect(JSON.stringify(result)).to.include("nope").and.to.include(ERP);
  });

  it("lists the modules of a configuration that quotes its keys", async () => {
    await withFileEdited(
      app.root,
      "antelope.config.ts",
      (config) => config.replace(/\bmodules:/, '"modules":'),
      () => {
        expect(configuredModuleIds()).to.include(ERP);
      },
    );
  });

  it("writes into the project's own module when no module is named, as before", async () => {
    expectOk(
      await CreateResource({ name: "customer", fields: NameField() }),
      "CreateResource customer",
    );
    const customer = (await ListResources()).find(
      (resource) => resource.ref === "customer",
    );
    expect(customer?.sourceModule).to.equal(undefined);
    expect(app.exists("customer/database.ts")).to.equal(true);
  });
});
