import { expect } from "chai";
import { ListDataSources } from "../../../implementations/dms-builder";
import { createFixture, destroyFixture } from "./harness";

/**
 * Sources a developer declared beside their own routes, offered next to the
 * calculations the builder generates.
 *
 * The installed DMS decides what there is to list; what matters here is that the
 * builder asks for them and survives a DMS that has never heard of them — the
 * version it is running against is not the one this repository builds.
 */
describe("declared data sources", () => {
  before(() => createFixture());
  after(() => destroyFixture());

  it("answers a list, whatever the installed DMS knows about them", async () => {
    const sources = await ListDataSources();
    expect(sources).to.be.an("array");
  });

  it("narrows to what a block can read", async () => {
    const forCharts = await ListDataSources("series");
    expect(forCharts).to.be.an("array");
    for (const source of forCharts) {
      expect(source.responseKind).to.equal("series");
    }
  });
});
