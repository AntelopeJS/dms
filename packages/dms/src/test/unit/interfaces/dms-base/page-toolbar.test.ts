import { expect } from "chai";
import { GetBlockType } from "@antelopejs/interface-dms/base/block-types";
import {
  PAGE_TOOLBAR_LIVE_CHILD_ID,
  PAGE_TOOLBAR_LIVE_DEFAULTS,
  PAGE_TOOLBAR_PERIOD_CHILD_ID,
  PAGE_TOOLBAR_PERIOD_DEFAULTS,
  PageToolbar,
  pageToolbar,
  type PageToolbarOptions,
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
    // The selector's default comparisons: more than one choice, a menu.
    expect(childOf(serialized, "period")?.options).to.deep.equal({
      ...PAGE_TOOLBAR_PERIOD_DEFAULTS,
      comparisonControl: "menu",
      defaultComparison: "previous-period",
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

  it("offers the comparisons in a menu only when there is a choice", () => {
    const periodOf = (period: PageToolbarOptions["period"]) =>
      childOf(pageToolbar({ period }).serializeSync(), "period")?.options;

    expect(
      periodOf({ comparisons: ["previous-period", "previous-year", "none"] }),
    ).to.deep.include({
      comparisonControl: "menu",
      defaultComparison: "previous-period",
    });
    expect(
      periodOf({ comparisons: ["none", "previous-year"] }),
    ).to.deep.include({
      comparisonControl: "menu",
      defaultComparison: "previous-year",
    });
    expect(
      periodOf({
        comparisons: ["previous-period", "previous-year"],
        defaultComparison: "previous-year",
      }),
    ).to.deep.include({ defaultComparison: "previous-year" });

    // A single comparison stays on without a control; none, nothing to draw.
    const single = periodOf({ comparisons: ["previous-period"] });
    expect(single).to.deep.include({ comparisonControl: "hidden" });
    expect(single).to.not.have.property("defaultComparison");
    expect(periodOf({ comparisons: ["none"] })).to.deep.include({
      comparisonControl: "hidden",
    });

    // The page's own control wins.
    expect(
      periodOf({
        comparisons: ["previous-period", "none"],
        comparisonControl: "toggle",
      }),
    ).to.deep.include({ comparisonControl: "toggle" });
  });

  it("places each control under the id and roles-editor metadata a page gives it", () => {
    const toolbar = pageToolbar({
      live: {
        childId: "toggle",
        meta: { name: "$my.permissions.live.name", icon: "i-ph-broadcast" },
        missedLabel: "$my.new",
      },
      period: {
        id: "my-scope",
        meta: { name: "$my.permissions.period.name" },
      },
    });
    const serialized = toolbar.serializeSync();
    expect(serialized.children?.map((child) => child.id)).to.deep.equal([
      "toggle",
      PAGE_TOOLBAR_PERIOD_CHILD_ID,
    ]);
    // `childId` and `meta` place the child: they are not the control's options.
    const live = childOf(serialized, "toggle")?.options as Record<
      string,
      unknown
    >;
    expect(live).to.not.have.any.keys("childId", "meta");
    expect(live).to.include({ missedLabel: "$my.new", variant: "pill" });
    const period = childOf(serialized, PAGE_TOOLBAR_PERIOD_CHILD_ID)
      ?.options as Record<string, unknown>;
    expect(period).to.include({ id: "my-scope" });
    expect(period).to.not.have.any.keys("childId", "meta");

    const children = (
      toolbar as unknown as {
        _children: Array<{ id: string; component: { metadata: unknown } }>;
      }
    )._children;
    expect(children[0]?.component.metadata).to.deep.include({
      name: "$my.permissions.live.name",
      icon: "i-ph-broadcast",
    });
    expect(children[1]?.component.metadata).to.deep.include({
      name: "$my.permissions.period.name",
    });
    expect(PAGE_TOOLBAR_LIVE_CHILD_ID).to.equal("live");
  });

  it("lists the children pageToolbar() places in the catalog, for an editor", () => {
    const initial = GetBlockType("PageToolbar")?.initialChildren;
    expect(initial?.map((child) => [child.id, child.type])).to.deep.equal([
      ["live", "LiveToggle"],
      ["period", "PeriodSelector"],
    ]);
    const serialized = pageToolbar().serializeSync();
    expect(initial?.[0]?.options).to.deep.equal(
      childOf(serialized, "live")?.options,
    );
    const { id: _scope, ...periodOptions } = (childOf(serialized, "period")
      ?.options ?? {}) as Record<string, unknown>;
    expect(initial?.[1]?.options).to.deep.equal(periodOptions);
  });
});
