/** @vitest-environment jsdom */
import { h, nextTick, type Component } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { RowNavigation } from "../layers/dms-ui/app/types/row-navigation";
import RowHeader from "../layers/dms-ui/app/entries/components/containers/row/RowHeader";
import RowNotFound from "../layers/dms-ui/app/entries/components/containers/row/RowNotFound";
import {
  deepLinkOutcome,
  isDeepLinkAction,
} from "../layers/dms-ui/app/entries/composables/table-view/utils/recordLink";
import {
  PANEL_COMPONENT,
  app,
  opened,
  drawerAction,
  mountTargets,
  latest,
  headerOf,
  press,
  openOn,
  mountHeader,
} from "./row-drawer-runtime";

describe("a row drawer's header", () => {
  it("draws the row header with the row's title and position", async () => {
    const { drawer } = await openOn(
      drawerAction({ rowTitle: "{name}", positionLabel: "$orders.position" }),
    );
    expect(drawer.options.headerComponent).toBe(RowHeader);
    expect(drawer.options.title).toBe("First");
    const header = headerOf(drawer)!;
    expect(header.heading).toBe("First");
    expect(header.positionLabel).toBe("$orders.position");
    expect(header.navigation).toMatchObject({ index: 0, total: 3 });
  });

  it("is drawn with the defaults on `rowHeader: true`", async () => {
    const { drawer } = await openOn(drawerAction({ rowHeader: true }));
    expect(headerOf(drawer)?.heading).toBe("Order details");
  });

  it("leaves the drawer's own header without row options", async () => {
    const { drawer } = await openOn(drawerAction());
    expect(drawer.options.headerComponent).toBeUndefined();
    expect(drawer.options.title).toBe("Order details");
  });

  it("is not drawn on `rowHeader: false`, the title still naming the row", async () => {
    const { drawer } = await openOn(
      drawerAction({ rowTitle: "{name}", rowHeader: false }),
    );
    expect(drawer.options.headerComponent).toBeUndefined();
    expect(drawer.options.title).toBe("First");
  });

  it("steps to the next and previous rows in place with J and K", async () => {
    const { drawer } = await openOn(
      drawerAction({ rowTitle: "{name}", positionLabel: "$orders.position" }),
    );
    press("j");
    expect(latest(drawer).title).toBe("Second");
    expect(headerOf(drawer)?.navigation).toMatchObject({ index: 1 });
    expect(latest(drawer).componentKey).toBe("r2");
    press("k");
    expect(headerOf(drawer)?.heading).toBe("First");
    expect(opened).toHaveLength(1);
  });

  it("steps with the header's buttons", async () => {
    const { drawer } = await openOn(drawerAction({ positionLabel: "$p" }));
    headerOf(drawer)!.navigation!.next();
    expect(headerOf(drawer)?.navigation).toMatchObject({ index: 1 });
  });

  it("passes the size, and remembers it per table and component", async () => {
    const { drawer } = await openOn(drawerAction({ size: "3xl" }));
    expect(drawer.options.size).toBe("3xl");
    expect(drawer.options.sizeKey).toBe(
      `orders-page-orders-${PANEL_COMPONENT}`,
    );
  });
});

describe("the row header", () => {
  const navigation = (index: number, next = vi.fn()): RowNavigation => ({
    index,
    total: 50,
    hasPrev: index > 0,
    hasNext: index < 49,
    prev: vi.fn(),
    next,
  });

  it("words the position with the label, else the default", async () => {
    let host = mountHeader({
      part: "dms-row-drawer",
      heading: "Request",
      positionLabel: "$api.request.position",
      navigation: navigation(3),
    });
    expect(
      host.querySelector("[data-dms-row-drawer-position]")?.textContent?.trim(),
    ).toBe("$api.request.position(4/50)");
    app!.unmount();
    host = mountHeader({ part: "dms-row-drawer", navigation: navigation(0) });
    expect(
      host.querySelector("[data-dms-row-drawer-position]")?.textContent?.trim(),
    ).toBe("side_panel.position(1/50)");
    expect(
      host.querySelector<HTMLButtonElement>("[data-dms-row-drawer-prev]")
        ?.disabled,
    ).toBe(true);
  });

  it("groups the figures as the locale does", () => {
    const host = mountHeader({
      part: "dms-row-drawer",
      navigation: { ...navigation(26_119), total: 26_120 },
    });
    expect(
      host
        .querySelector("[data-dms-row-drawer-position]")
        ?.textContent?.trim()
        .replace(/\s/g, " "),
    ).toBe("side_panel.position(26 120/26 120)");
  });

  it("moves to the next row from its button", async () => {
    const next = vi.fn();
    const host = mountHeader({
      part: "dms-row-drawer",
      navigation: navigation(3, next),
    });
    host.querySelector<HTMLElement>("[data-dms-row-drawer-next]")!.click();
    await nextTick();
    expect(next).toHaveBeenCalledOnce();
  });

  it("wraps a long title onto two lines before cutting it", () => {
    const heading = "Inverter offline since the storm, site 26 (north roof)";
    const host = mountHeader({ part: "dms-row-drawer", heading });
    const title = host.querySelector("h2")!;
    expect(title.className).toContain("line-clamp-2");
    expect(title.className).not.toContain("truncate");
    expect(title.title).toBe(heading);
  });

  it("draws no position nor buttons without navigation", () => {
    const host = mountHeader({ part: "dms-row-drawer", heading: "Request" });
    expect(host.querySelector("[data-dms-row-drawer-position]")).toBeNull();
    expect(host.querySelector("[data-dms-row-drawer-next]")).toBeNull();
  });

  it("wraps a title only after its separator when asked", () => {
    const host = mountHeader({
      part: "dms-row-drawer",
      heading: "billing.invoice.title",
      headingBreakAfter: ".",
    });
    const title = host.querySelector("h2")!;
    expect(
      [...title.querySelectorAll("span")].map((s) => s.textContent),
    ).toEqual(["billing.", "invoice.", "title"]);
    expect(title.querySelectorAll("wbr")).toHaveLength(3);
    expect(title.title).toBe("billing.invoice.title");
  });

  it("follows the position with the subtitle, cut on its line", () => {
    const host = mountHeader({
      part: "dms-row-drawer",
      navigation: navigation(11),
      subtitle: "helio › catalog",
      subtitleClass: "font-mono",
    });
    const subtitle = host.querySelector<HTMLElement>(
      "[data-dms-row-drawer-subtitle]",
    )!;
    const line = subtitle.parentElement!;
    expect([...line.children].map((part) => part.textContent?.trim())).toEqual([
      "side_panel.position(12/50)",
      "·",
      "helio › catalog",
    ]);
    expect(line.className).toContain("flex");
    expect(subtitle.className).toContain("truncate");
    expect(subtitle.className).toContain("font-mono");
    expect(subtitle.title).toBe("helio › catalog");
  });

  it("draws its component under the position line", () => {
    const Pills: Component = {
      props: { count: Number },
      setup: (props: { count?: number }) => () =>
        h("span", { "data-pills": "" }, `${props.count} missing`),
    };
    const host = mountHeader({
      part: "dms-row-drawer",
      heading: "Key",
      navigation: navigation(0),
      component: Pills,
      componentOptions: { count: 2 },
    });
    const pills = host.querySelector("[data-pills]")!;
    expect(pills.textContent).toBe("2 missing");
    const column = host.querySelector("h2")!.parentElement!.parentElement!;
    expect(pills.parentElement).toBe(column);
    expect(column.className).toContain("space-y-1.5");
  });
});

describe("a row drawer's deep link", () => {
  it("is opted into on the target, the action's own setting winning", () => {
    expect(isDeepLinkAction(drawerAction())).toBe(false);
    expect(isDeepLinkAction(drawerAction({ deepLink: true }))).toBe(true);
    expect(
      isDeepLinkAction(drawerAction({ deepLink: true }, { deepLink: false })),
    ).toBe(false);
    expect(isDeepLinkAction(drawerAction({}, { deepLink: true }))).toBe(true);
  });

  it("keeps the open row in the URL, follows J, and removes it on close", async () => {
    const action = drawerAction({ deepLink: true });
    const { drawer } = await openOn(action);
    expect(window.location.search).toBe("?record=r1");
    press("j");
    expect(window.location.search).toBe("?record=r2");
    drawer.close();
    await vi.waitFor(() => expect(window.location.search).toBe(""));
  });
});

describe("a row drawer's not-found state", () => {
  it("shows the drawer's state on a missing row once the target words it", () => {
    const found = { isMissing: true } as const;
    expect(deepLinkOutcome(found, drawerAction())).toBe("notify");
    expect(
      deepLinkOutcome(found, drawerAction({ notFound: { title: "Gone" } })),
    ).toBe("missingPanel");
  });

  it("opens the state under the target's title, and closing it removes the link", async () => {
    const targets = mountTargets();
    const action = drawerAction({
      deepLink: true,
      notFound: { title: "$orders.gone", description: "$orders.gone_text" },
    });
    targets.handleMissingRow(action, "r9");
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    expect(drawer.options.component).toBe(RowNotFound);
    expect(drawer.options.title).toBe("Order details");
    expect(drawer.options.componentOptions).toMatchObject({
      title: "$orders.gone",
      description: "$orders.gone_text",
    });
    expect(window.location.search).toBe("?record=r9");
    // SAFETY: handleMissingRow supplies the RowNotFound component's onClose callback in componentOptions.
    (drawer.options.componentOptions as { onClose: () => void }).onClose();
    await vi.waitFor(() => expect(window.location.search).toBe(""));
  });

  it("opens nothing for a drawer without a not-found state", () => {
    const targets = mountTargets();
    targets.handleMissingRow(drawerAction({ deepLink: true }), "r9");
    expect(opened).toHaveLength(0);
  });
});
