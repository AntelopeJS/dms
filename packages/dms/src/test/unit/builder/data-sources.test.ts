import { expect } from "chai";
import { ListDataSources } from "../../../implementations/dms-builder";
import { createFixture, destroyFixture } from "./harness";

describe("declared data sources, which a developer wrote beside their own routes and the builder offers next to the calculations it generates: it asks for them and survives a DMS that has never heard of them", () => {
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
