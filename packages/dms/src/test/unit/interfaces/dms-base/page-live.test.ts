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
  it("carries the slower cadence and the shared scope to the browser", () => {
    const live = {
      maxRate: 10,
      slowRateAfter: { period: "7d" as const, maxRate: 60 },
      scope: "api",
    };
    const page = PageController("live-page-slow", {
      displayName: "Live page",
      category: pagesCategory,
      live,
    });
    expect(GetMetadata(page, PageMetadata).pageInfo?.live).to.deep.equal(live);
  });

  it("refuses a slower cadence it cannot read, and an empty scope", () => {
    const declare = (id: string, live: Record<string, unknown>) => () =>
      PageController(id, {
        displayName: "Live page",
        category: pagesCategory,
        live,
      });
    expect(
      declare("live-slow-period", {
        slowRateAfter: { period: "a week", maxRate: 60 },
      }),
    ).to.throw(/live\.slowRateAfter\.period/);
    expect(
      declare("live-slow-zero", {
        slowRateAfter: { period: "0d", maxRate: 60 },
      }),
    ).to.throw(/live\.slowRateAfter\.period/);
    expect(
      declare("live-slow-rate", {
        slowRateAfter: { period: "7d", maxRate: 0 },
      }),
    ).to.throw(/live\.slowRateAfter\.maxRate/);
    expect(declare("live-scope", { scope: " " })).to.throw(/live\.scope/);
  });

  it("serializes the pill variant and the missed label of LiveToggle", () => {
    const options = LiveToggle({
      variant: "pill",
      missedLabel: "$api.live.new_requests",
    }).serializeSync().options;
    expect(options).to.deep.equal({
      variant: "pill",
      missedLabel: "$api.live.new_requests",
    });
    const block = GetBlockType("LiveToggle");
    expect(block?.config.variant?.enum).to.deep.equal(["segmented", "pill"]);
    expect(block?.config.missedLabel?.type).to.equal("string");
  });

  it("hands a liveHold object to the renderer", () => {
    const options = TableView.fromSource({
      fetchUrl: "/api/request-log",
      columns: { path: { name: "Path", type: STRING } },
      realtimeTopic: "api:requests",
      liveHold: { whileRowOpen: true, whileScrolled: true },
    }).serializeSync().options as TableViewOptionsSerialized;
    expect(options.liveHold).to.deep.equal({
      whileRowOpen: true,
      whileScrolled: true,
    });
  });
});
