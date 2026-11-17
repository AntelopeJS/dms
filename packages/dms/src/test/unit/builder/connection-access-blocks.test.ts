import { expect } from "chai";
import type { ResourceRoute } from "@antelopejs/interface-dms-builder";
import {
  AddBlock,
  ConfigureBlock,
  ConfigureResource,
  CreateResource,
  MapResources,
} from "../../../implementations/dms-builder";
import { expectOk, setConnectionAccess } from "./harness";
import {
  COUNTRIES,
  COUNTRIES_API,
  countries,
  countriesPage,
  form,
  formMode,
  READ_ONLY,
  refusalOf,
  useErpFixture,
} from "./helpers/connection-access";
import { OP_TIMEOUT } from "./mapped-database";

const CREATING = {
  routes: ["list", "get", "create"],
} satisfies { routes: ResourceRoute[] };

/** Maps `sales.countries` writable while `erp` allows it, then sets `erp` back to read. */
async function mappedWritableThenRead(): Promise<string> {
  setConnectionAccess({ erp: "read-write" });
  expectOk(await MapResources(countries(true)), "writable mapping");
  const page = await countriesPage();
  setConnectionAccess({ erp: "read" });
  return page;
}

describe("[unit] a form over a mapped table follows its connection's access", function () {
  this.timeout(OP_TIMEOUT);
  useErpFixture();
  let page: string;

  before(async () => {
    page = await mappedWritableThenRead();
  });

  it("is refused when it creates or edits rows on a read connection, and added when it only shows one", async () => {
    expect(refusalOf(await form(page, "createForm", "new"))).to.include(
      `refused to add a form that creates rows of "${COUNTRIES}": ${READ_ONLY}`,
    );
    expect(refusalOf(await form(page, "editForm", "edit"))).to.include(
      `refused to add a form that edits rows of "${COUNTRIES}": ${READ_ONLY}`,
    );
    expectOk(await form(page, "showForm", "view"), "a form that shows a row");
  });

  it("is refused when its mode is an expression the builder cannot read, on a read connection", async () => {
    const added = await AddBlock({
      page,
      name: "builtForm",
      type: "ResourceForm",
      controller: COUNTRIES,
      config: { mode: { $expr: '"ed" + "it"' } },
    });
    expect(refusalOf(added)).to.include(
      `refused to add a form that may create or edit rows of "${COUNTRIES}": ${READ_ONLY}`,
    );
  });

  it("is refused, and left as it was, when a patch turns it into one that edits rows", async () => {
    expect(
      refusalOf(await ConfigureBlock(`${page}#showForm`, { mode: "edit" })),
    ).to.include(READ_ONLY);
    expect(await formMode(page, "showForm")).to.equal("view");
  });

  it("is added once the connection is read-write", async () => {
    setConnectionAccess({ erp: "read-write" });
    expectOk(await form(page, "createForm", "new"), "a form that creates");
    expectOk(
      await ConfigureBlock(`${page}#showForm`, { mode: "edit" }),
      "a form turned into one that edits",
    );
    expect(await formMode(page, "showForm")).to.equal("edit");
  });

  it("lets a patch through that leaves a writing form's mode as it was, on a read connection", async () => {
    setConnectionAccess({ erp: "read" });
    expectOk(
      await ConfigureBlock(`${page}#showForm`, { title: "Edit a country" }),
      "a title on a form that edits",
    );
    expect(await formMode(page, "showForm")).to.equal("edit");
  });
});

describe("[unit] a form's controller is the mapped resource its import names", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();
  let page: string;

  before(async () => {
    page = await mappedWritableThenRead();
    setConnectionAccess({ erp: "read-write" });
    expectOk(await form(page, "showForm", "view"), "a form that shows a row");
  });

  it("refuses turning it into one that edits rows when a project resource shares its class name", async () => {
    expectOk(
      await CreateResource({
        name: "country",
        fields: [{ name: "label", dataType: { $dataType: "string" } }],
      }),
      "a project resource named country",
    );
    setConnectionAccess({ erp: "read" });
    expect(
      refusalOf(await ConfigureBlock(`${page}#showForm`, { mode: "edit" })),
    ).to.include(
      `refused to turn a form into one that edits rows of "${COUNTRIES}": ${READ_ONLY}`,
    );
    expect(await formMode(page, "showForm")).to.equal("view");
  });

  it("refuses turning it into one that edits rows when its import is aliased", async () => {
    const pageFile = "../modules/erp-tables/src/sales-countries/page.ts";
    const aliased = erp
      .app()
      .read(pageFile)
      .replace(/\bcountryDataAPI\b(?= \}| ,)/, "countryDataAPI as ErpCountries")
      .replace(/ResourceForm\(countryDataAPI/g, "ResourceForm(ErpCountries");
    expect(aliased).to.include("countryDataAPI as ErpCountries");
    expect(aliased).to.include("ResourceForm(ErpCountries");
    erp.app().write(pageFile, aliased);
    setConnectionAccess({ erp: "read" });
    expect(
      refusalOf(await ConfigureBlock(`${page}#showForm`, { mode: "edit" })),
    ).to.include(READ_ONLY);
    expect(await formMode(page, "showForm")).to.equal("view");
  });
});

describe("[unit] a table or routes over a mapped table follow its connection's access", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();
  let page: string;

  before(async () => {
    page = await mappedWritableThenRead();
  });

  it("refuses a table while it still serves write routes on a read connection, and adds one once it is mapped read-only", async () => {
    const table = () =>
      AddBlock({
        page,
        name: "countriesTable",
        type: "TableView",
        controller: COUNTRIES,
        config: {},
      });
    const message = refusalOf(await table());
    expect(message).to.include(
      `refused to add a TableView over "${COUNTRIES}", whose table still serves create, edit and delete routes`,
    );
    expect(message).to.include(READ_ONLY);

    expectOk(await MapResources(countries(false)), "read-only mapping");
    expectOk(await table(), "a table over a read-only mapping");
  });

  it("refuses routes that write on its resource while the access is read, and serves them once it is read-write", async () => {
    setConnectionAccess({ erp: "read" });
    expect(refusalOf(await ConfigureResource(COUNTRIES, CREATING))).to.include(
      `refused to serve the create routes on "${COUNTRIES}": ${READ_ONLY}`,
    );
    expect(erp.moduleFile(COUNTRIES_API)).to.not.include("TableViewRoutes.New");

    setConnectionAccess({ erp: "read-write" });
    expectOk(await ConfigureResource(COUNTRIES, CREATING), "ConfigureResource");
    expect(erp.moduleFile(COUNTRIES_API)).to.include("TableViewRoutes.New");
  });

  it("marks the controller with its connection, so its write routes follow the access at runtime", () => {
    expect(erp.moduleFile(COUNTRIES_API)).to.include(
      '@ExternalConnection("erp")',
    );
  });
});
