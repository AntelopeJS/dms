import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSidebarWidgetVisible,
  resolveSidebarWidgetPosition,
  type SidebarWidget,
  SidebarWidgetPosition,
  useSidebarWidgets,
} from "../layers/dms-layout/app/composables/useSidebarWidgets";

const UNKNOWN_POSITION = "top" as SidebarWidgetPosition;

const widget = (extra: Partial<SidebarWidget> = {}): SidebarWidget => ({
  id: "widget",
  component: "Widget",
  ...extra,
});

describe("resolveSidebarWidgetPosition", () => {
  it("keeps the pre-position placement of an unscoped widget", () => {
    expect(resolveSidebarWidgetPosition(widget())).toBe(
      SidebarWidgetPosition.ABOVE_SEARCH_BAR,
    );
  });

  it("keeps the pre-position placement of a module-scoped widget", () => {
    expect(resolveSidebarWidgetPosition(widget({ module: "demo" }))).toBe(
      SidebarWidgetPosition.BELOW_SEARCH_BAR,
    );
  });

  it("honors a declared position over the module-derived default", () => {
    expect(
      resolveSidebarWidgetPosition(
        widget({
          module: "demo",
          position: SidebarWidgetPosition.ABOVE_SEARCH_BAR,
        }),
      ),
    ).toBe(SidebarWidgetPosition.ABOVE_SEARCH_BAR);
    expect(
      resolveSidebarWidgetPosition(
        widget({ position: SidebarWidgetPosition.BELOW_SEARCH_BAR }),
      ),
    ).toBe(SidebarWidgetPosition.BELOW_SEARCH_BAR);
  });

  it("falls back to the default rather than dropping an unknown position", () => {
    expect(
      resolveSidebarWidgetPosition(widget({ position: UNKNOWN_POSITION })),
    ).toBe(SidebarWidgetPosition.ABOVE_SEARCH_BAR);
    expect(
      resolveSidebarWidgetPosition(
        widget({ module: "demo", position: UNKNOWN_POSITION }),
      ),
    ).toBe(SidebarWidgetPosition.BELOW_SEARCH_BAR);
  });
});

describe("isSidebarWidgetVisible", () => {
  it("shows a global widget outside modules and hides it inside one", () => {
    const global = widget();
    expect(isSidebarWidgetVisible(global, null)).toBe(true);
    expect(isSidebarWidgetVisible(global, undefined)).toBe(true);
    expect(isSidebarWidgetVisible(global, "demo")).toBe(false);
  });

  it("shows a scoped widget only inside its own module", () => {
    const scoped = widget({ module: "demo" });
    expect(isSidebarWidgetVisible(scoped, "demo")).toBe(true);
    expect(isSidebarWidgetVisible(scoped, "other")).toBe(false);
    expect(isSidebarWidgetVisible(scoped, null)).toBe(false);
  });
});

describe("useSidebarWidgets registration order", () => {
  beforeEach(() => {
    // The composable reads its store through the DMS app's injected `useDmsState`;
    // a fresh array per call keeps each spec isolated.
    vi.stubGlobal("useDmsState", (_key: string, init: () => SidebarWidget[]) => ({
      value: init(),
    }));
  });

  // The config sets no `unstubGlobals`, and file isolation is the pool's
  // default rather than something this suite should rely on.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ids = (widgets: readonly SidebarWidget[]) => widgets.map((w) => w.id);

  it("sorts by order and keeps registration order within a tie", () => {
    const { widgets, register } = useSidebarWidgets();
    register(widget({ id: "a" }));
    register(widget({ id: "b", order: -1 }));
    register(widget({ id: "c" }));
    expect(ids(widgets.value)).toEqual(["b", "a", "c"]);
  });

  it("upserts in place, so re-registering keeps the widget's rank", () => {
    const { widgets, register } = useSidebarWidgets();
    register(widget({ id: "a" }));
    register(widget({ id: "b" }));
    register(widget({ id: "a", component: "Replaced" }));
    expect(ids(widgets.value)).toEqual(["a", "b"]);
    expect(widgets.value[0]?.component).toBe("Replaced");
  });

  it("treats unregister then register as a new arrival, landing last in its tie", () => {
    const { widgets, register, unregister } = useSidebarWidgets();
    register(widget({ id: "a" }));
    register(widget({ id: "b" }));
    unregister("a");
    register(widget({ id: "a" }));
    expect(ids(widgets.value)).toEqual(["b", "a"]);
  });
});
