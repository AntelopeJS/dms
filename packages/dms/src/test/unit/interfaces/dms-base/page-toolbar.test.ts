import { expect } from "chai";
import { GetBlockType } from "@antelopejs/interface-dms/base/block-types";
import {
  PAGE_TOOLBAR_LIVE_DEFAULTS,
  PAGE_TOOLBAR_PERIOD_DEFAULTS,
  PageToolbar,
  pageToolbar,
} from "@antelopejs/interface-dms/base/page-toolbar";
import { Spacer } from "@antelopejs/interface-dms/base/stack";

/**
 * A page's context bar: the `PageToolbar` container, and `pageToolbar()`
 * filling it with real `LiveToggle` / `PeriodSelector` blocks over the
 * defaults every module shares.
 */
describe("[unit] interfaces/dms-base — page toolbar", () => {
  const childOf = (
    serialized: ReturnType<ReturnType<typeof pageToolbar>["serializeSync"]>,
    id: string,
  ) => serialized.children?.find((child) => child.id === id)?.component;

  it("serializes the PageToolbar block under its block component name", () => {
    const serialized = PageToolbar({ size: "md" }).serializeSync();
    expect(serialized.componentName).to.equal("dms-page-toolbar-block");
    expect(serialized.options).to.deep.equal({ size: "md" });
    expect(PageToolbar().serializeSync().options).to.deep.equal({});
  });

  it("lists it in the catalog as a container", () => {
    const block = GetBlockType("PageToolbar");
    expect(block?.componentName).to.equal("dms-page-toolbar-block");
    expect(block?.container).to.equal(true);
    expect(block?.config.size?.enum).to.deep.equal(["xs", "sm", "md"]);
    expect(GetBlockType("LiveToggle")?.config.size?.enum).to.deep.equal([
      "xs",
      "sm",
      "md",
    ]);
  });

  it("puts the leading blocks first, then the live toggle and the period", () => {
    const serialized = pageToolbar({
      leading: { scope: Spacer(), badge: Spacer() },
    }).serializeSync();
    expect(serialized.children?.map((child) => child.id)).to.deep.equal([
      "scope",
      "badge",
      "live",
      "period",
    ]);
    expect(childOf(serialized, "live")?.componentName).to.equal(
      "dms-live-toggle-block",
    );
    expect(childOf(serialized, "period")?.componentName).to.equal(
      "dms-period-selector",
    );
  });

  it("gives the toggle and the selector the shared defaults", () => {
    const serialized = pageToolbar().serializeSync();
    expect(childOf(serialized, "live")?.options).to.deep.equal(
      PAGE_TOOLBAR_LIVE_DEFAULTS,
    );
    expect(childOf(serialized, "period")?.options).to.deep.equal({
      ...PAGE_TOOLBAR_PERIOD_DEFAULTS,
      id: "page",
    });
    expect(PAGE_TOOLBAR_LIVE_DEFAULTS).to.include({ variant: "pill" });
    expect(PAGE_TOOLBAR_PERIOD_DEFAULTS).to.include({
      variant: "segmented",
      rangeLabel: "relative",
      defaultPreset: "last-24h",
    });
  });

  it("lets a page override them, or leave a control out", () => {
    const serialized = pageToolbar({
      size: "xs",
      refresh: false,
      live: { missedLabel: "$api.live.new_requests" },
      period: { id: "api", presets: ["last-24h", "all"] },
    }).serializeSync();
    expect(serialized.options).to.deep.equal({ size: "xs", refresh: false });
    expect(childOf(serialized, "live")?.options).to.deep.include({
      variant: "pill",
      missedLabel: "$api.live.new_requests",
    });
    expect(childOf(serialized, "period")?.options).to.deep.include({
      id: "api",
      presets: ["last-24h", "all"],
      variant: "segmented",
    });

    const periodOnly = pageToolbar({ live: false }).serializeSync();
    expect(periodOnly.children?.map((child) => child.id)).to.deep.equal([
      "period",
    ]);
    const liveOnly = pageToolbar({ period: false }).serializeSync();
    expect(liveOnly.children?.map((child) => child.id)).to.deep.equal(["live"]);
  });
});
