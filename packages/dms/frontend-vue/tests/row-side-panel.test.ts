/** @vitest-environment jsdom */
import { ref } from "vue";
import { describe, expect, it } from "vitest";
import { SIDE_PANEL_COOKIE } from "../layers/dms-layout/app/build/composables/layout/sidePanelState";
import {
  ROW_SIDE_PANEL_ID,
  useRowSidePanelContent,
} from "../layers/dms-layout/app/build/composables/layout/rowSidePanel";
import { useAppSidePanels } from "../layers/dms-layout/app/composables/useAppSidePanels";
import { useSidePanel } from "../layers/dms-layout/app/composables/useSidePanel";
import {
  panelMounts,
  refreshes,
  useDmsCookie,
  openPanelId,
  rows,
  panelAction,
  mountPanel,
  settle,
  query,
  title,
  position,
  shownName,
  press,
} from "./row-side-panel-runtime";

describe("sidePanel action target", () => {
  it("opens a docked panel on the row, the DMS drawing its header", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    expect(openPanelId()).toBe(ROW_SIDE_PANEL_ID);
    expect(
      query(host, "[data-dms-side-panel]")?.getAttribute("aria-label"),
    ).toBe("Request details");
    expect(title(host)).toBe("Request details");
    expect(position(host)).toBe("side_panel.position(1/3)");
    expect(shownName(host)).toBe("First");
    expect(useRowSidePanelContent().value?.rowKey).toBe("r1");
  });

  it("hands a bulk panel run from a row the row and the selection of that row", async () => {
    const { targets } = mountPanel();
    targets.handleCustomRowAction(panelAction({}, { bulk: true }), rows[0]);
    await settle();
    const content = useRowSidePanelContent().value;
    expect(content?.rowKey).toBe("r1");
    expect(content?.componentOptions).toMatchObject({
      selection: { ids: ["r1"], count: 1 },
    });
  });

  it("words the position with the action's own label", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(
      panelAction({ positionLabel: "$api.drawer.position" }),
      rows[1],
    );
    await settle();
    expect(position(host)).toBe("$api.drawer.position(2/3)");
  });

  it("titles the panel with the action's label when the target sets none", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction({ title: undefined }), rows[0]);
    await settle();
    expect(title(host)).toBe("Request");
  });

  it("closes a module's side panel: one panel at a time", async () => {
    const { targets } = mountPanel();
    useSidePanel("assistant").open();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    expect(openPanelId()).toBe(ROW_SIDE_PANEL_ID);
  });
});

describe("row side panel navigation", () => {
  it("steps with the buttons, swapping the component in place", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    const prev = query(host, "[data-dms-row-side-panel-prev]");
    expect(prev?.hasAttribute("disabled")).toBe(true);
    query(host, "[data-dms-row-side-panel-next]")?.click();
    await settle();
    expect(shownName(host)).toBe("Second");
    expect(position(host)).toBe("side_panel.position(2/3)");
    expect(panelMounts).toBe(2);
    expect(useRowSidePanelContent().value?.rowKey).toBe("r2");
  });

  it("steps with J and K and stops at the bounds", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[1]);
    await settle();
    press("j");
    await settle();
    expect(shownName(host)).toBe("Third");
    expect(
      query(host, "[data-dms-row-side-panel-next]")?.hasAttribute("disabled"),
    ).toBe(true);
    press("j");
    await settle();
    expect(shownName(host)).toBe("Third");
    press("k");
    press("k");
    await settle();
    expect(shownName(host)).toBe("First");
    press("k");
    await settle();
    expect(position(host)).toBe("side_panel.position(1/3)");
  });

  it("ignores J and K typed into a field", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    const input = document.createElement("input");
    document.body.append(input);
    press("j", input);
    await settle();
    expect(shownName(host)).toBe("First");
  });

  it("follows the rows the table shows", async () => {
    const shown = ref([...rows]);
    const { host, targets } = mountPanel(shown);
    targets.handleCustomRowAction(panelAction(), rows[1]);
    await settle();
    shown.value = [rows[1]!];
    await settle();
    expect(position(host)).toBe("side_panel.position(1/1)");
    shown.value = [rows[0]!];
    await settle();
    expect(position(host)).toBeUndefined();
    expect(query(host, "[data-dms-row-side-panel-next]")).toBeNull();
    expect(shownName(host)).toBe("Second");
  });
});

describe("row side panel title from the row", () => {
  it("names the open row with the target's rowTitle and its fields", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(
      panelAction({ rowTitle: "{name} ({_id})" }),
      rows[0],
    );
    await settle();
    expect(title(host)).toBe("First (r1)");
    expect(
      query(host, "[data-dms-side-panel]")?.getAttribute("aria-label"),
    ).toBe("Request details");
    query(host, "[data-dms-row-side-panel-next]")?.click();
    await settle();
    expect(title(host)).toBe("Second (r2)");
  });
});

describe("closing the row side panel", () => {
  it("closes from its button, unregistering the panel", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction({ deepLink: true }), rows[0]);
    await settle();
    query(host, "[data-dms-row-side-panel-close]")?.click();
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
    expect(openPanelId()).toBeNull();
    expect(useAppSidePanels().panels.value).toEqual([]);
    expect(useRowSidePanelContent().value).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("closes on Escape, unless a field or another layer takes the key", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    const input = document.createElement("input");
    document.body.append(input);
    press("Escape", input);
    const handled = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    handled.preventDefault();
    window.dispatchEvent(handled);
    await settle();
    expect(query(host, "[data-dms-side-panel]")).not.toBeNull();
    press("Escape");
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
  });

  it("closes when another side panel opens, and when its table goes", async () => {
    const { host, targets, showTable } = mountPanel();
    targets.handleCustomRowAction(panelAction({ deepLink: true }), rows[0]);
    await settle();
    useSidePanel("assistant").open();
    await settle();
    expect(useRowSidePanelContent().value).toBeNull();
    expect(window.location.search).toBe("");
    expect(openPanelId()).toBe("assistant");

    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    showTable.value = false;
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
    expect(openPanelId()).toBeNull();
  });

  it("closes and refreshes the table once the component saved", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    query(host, "[data-save]")?.click();
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
    expect(refreshes).toBe(1);
  });

  it("shows no empty panel for a stale cookie naming it", async () => {
    useDmsCookie(SIDE_PANEL_COOKIE).value = {
      openId: ROW_SIDE_PANEL_ID,
      widths: {},
    };
    const { host } = mountPanel();
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
  });
});
