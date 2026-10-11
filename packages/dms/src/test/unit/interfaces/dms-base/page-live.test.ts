import { GetMetadata } from "@antelopejs/interface-core";
import { expect } from "chai";
import { LiveToggle } from "@antelopejs/interface-dms/base/live-toggle";
import { GetBlockType } from "@antelopejs/interface-dms/base/block-types";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  TableView,
  type TableViewOptionsSerialized,
} from "@antelopejs/interface-dms/base/table-view";
import {
  PageController,
  PageMetadata,
  pagesCategory,
} from "@antelopejs/interface-dms/page";

const STRING = new DefaultDataTypes.StringType();

/**
 * A page declared with `live` hands its Direct / Pause valve to the browser,
 * the `LiveToggle()` block switches it, and a table's `liveHold` reaches its
 * renderer.
 */
describe("[unit] interfaces/dms-base — page live mode", () => {
  it("carries the page's live option to the browser", () => {
    const page = PageController("live-page", {
      displayName: "Live page",
      category: pagesCategory,
      live: { maxRate: 5 },
    });
    expect(GetMetadata(page, PageMetadata).pageInfo?.live).to.deep.equal({
      maxRate: 5,
    });
  });

  it("refuses a maxRate that is not a positive number of seconds", () => {
    for (const maxRate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        PageController(`live-page-bad-${maxRate}`, {
          displayName: "Live page",
          category: pagesCategory,
          live: { maxRate },
        }),
      ).to.throw(/live\.maxRate/);
    }
  });

  it("accepts live without a rate", () => {
    const page = PageController("live-page-uncapped", {
      displayName: "Live page",
      category: pagesCategory,
      live: {},
    });
    expect(GetMetadata(page, PageMetadata).pageInfo?.live).to.deep.equal({});
  });

  it("serializes the LiveToggle block under its block component name", () => {
    const serialized = LiveToggle({ align: "left" }).serializeSync();
    expect(serialized.componentName).to.equal("dms-live-toggle-block");
    expect(serialized.options).to.deep.equal({ align: "left" });
    expect(LiveToggle().serializeSync().options).to.deep.equal({});
  });

  it("lists the LiveToggle block in the catalog", () => {
    const block = GetBlockType("LiveToggle");
    expect(block?.componentName).to.equal("dms-live-toggle-block");
    expect(block?.config.align?.enum).to.deep.equal([
      "left",
      "center",
      "right",
    ]);
    expect(block?.config.showUpdatedAt?.type).to.equal("boolean");
  });

  it("hands a source table's liveHold to its renderer", () => {
    const options = TableView.fromSource({
      fetchUrl: "/api/request-log",
      columns: { path: { name: "Path", type: STRING } },
      realtimeTopic: "api:requests",
      liveHold: true,
    }).serializeSync().options as TableViewOptionsSerialized;
    expect(options.liveHold).to.equal(true);
    expect(options.realtimeTopic).to.equal("api:requests");
  });
});
