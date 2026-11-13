import { expect } from "chai";
import type {
  MapResourcesInput,
  MappedResource,
} from "@antelopejs/interface-dms-builder";
import {
  ListPages,
  MapResources,
  PreviewMapResources,
} from "../../../implementations/dms-builder";
import {
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../implementations/dms-builder/engine";
import { createFixture, destroyFixture, expectOk } from "./harness";
import {
  ERP_WRITES,
  FAKE_CATALOG,
  INPUT,
  MODULE,
  OP_TIMEOUT,
} from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

function countries(
  tableView: boolean,
  approvedPageRemovals?: string[],
): MapResourcesInput {
  const resource: MappedResource = {
    relation: "sales.countries",
    tableView,
    writable: false,
    fields: [{ column: "name" }],
  };
  return {
    module: MODULE,
    connection: "erp",
    resources: [resource],
    ...(approvedPageRemovals && { approvedPageRemovals }),
  };
}

async function pageIds(): Promise<string[]> {
  return (await ListPages()).map((page) => page.id).sort();
}

/** A mapping that removes a page only writes when the person approved that page. */
describe("mapping with approved page removals", function () {
  this.timeout(OP_TIMEOUT);

  before(async () => {
    createFixture({ modules: [MODULE], connectionAccess: ERP_WRITES });
    setCatalogConnectionsForTests({ erp: FAKE_CATALOG });
    setModuleReloadForTests(reloadedAtOnce);
    expectOk(await MapResources(INPUT), "MapResources");
  });

  after(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  beforeEach(async () => {
    expectOk(await MapResources(countries(true)), "restore the TableView");
  });

  it("refuses and writes nothing when the page was recreated after the preview", async () => {
    expectOk(await MapResources(countries(false)), "remove the page first");
    const previewed = await PreviewMapResources(countries(false));
    expectOk(previewed, "PreviewMapResources");
    const approved = previewed.ok ? previewed.data.pagesToRemove : ["unset"];
    expect(approved).to.deep.equal([]);
    expectOk(await MapResources(countries(true)), "the page comes back");
    const before = await pageIds();
    expect(before).to.include("sales-countries");

    const refused = await MapResources(countries(false, approved));

    expect(refused.ok).to.equal(false);
    expect(
      !refused.ok &&
        refused.error.code === "invalid_config" &&
        refused.error.issues[0]?.message,
    )
      .to.include("pages not approved")
      .and.to.include("sales-countries");
    expect(await pageIds()).to.deep.equal(before);
  });

  it("writes when the approved pages are exactly the ones removed", async () => {
    const previewed = await PreviewMapResources(countries(false));
    const approved = previewed.ok ? previewed.data.pagesToRemove : [];
    expect(approved).to.have.length(1);

    expectOk(
      await MapResources(countries(false, approved)),
      "MapResources with the exact approval",
    );

    expect(await pageIds()).to.not.include("sales-countries");
  });

  it("writes when the approval lists more pages than the plan removes", async () => {
    const previewed = await PreviewMapResources(countries(false));
    const approved = previewed.ok ? previewed.data.pagesToRemove : [];

    expectOk(
      await MapResources(countries(false, [...approved, "sales-elsewhere"])),
      "MapResources with a wider approval",
    );

    expect(await pageIds()).to.not.include("sales-countries");
  });

  it("writes a mapping that removes no page under an empty approval", async () => {
    expectOk(
      await MapResources(countries(true, [])),
      "MapResources keeping the page",
    );

    expect(await pageIds()).to.include("sales-countries");
  });

  it("keeps removing the page when no approval list is sent", async () => {
    expectOk(
      await MapResources(countries(false)),
      "MapResources without approvedPageRemovals",
    );

    expect(await pageIds()).to.not.include("sales-countries");
  });
});
