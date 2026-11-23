/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import { nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  BUILDER_ACTION_ID,
  registerHeaderAction,
  useHeaderActions,
} from "../layers/dms-layout/app/composables/useHeaderActions";
import { useSidePanel } from "../layers/dms-ui/app/composables/useSidePanel";
import {
  ACTIVE_COLOR,
  action,
  button,
  IDLE_COLOR,
  mountHeader,
  PANEL_ID,
  useHeaderActionsRuntime,
} from "./helpers/header-actions-runtime";

useHeaderActionsRuntime();

describe("header action registry", () => {
  it("keeps an action linked to a side panel without any callable", () => {
    registerHeaderAction(action("panel", { sidePanelId: PANEL_ID }));
    registerHeaderAction(action("stripped"));
    const { actions } = useHeaderActions();
    expect(actions.value.map((entry) => entry.id)).toEqual(["panel"]);
  });
});

describe("header action buttons", () => {
  it("renders the active state of every action, not only the builder's", async () => {
    const isOn = ref(false);
    registerHeaderAction(
      action("toggle", { onSelect: vi.fn(), isActive: () => isOn.value }),
    );
    registerHeaderAction(action("plain", { onSelect: vi.fn() }));
    const host = await mountHeader();
    const toggle = button(host, "toggle");
    expect(toggle?.dataset.color).toBe(IDLE_COLOR);
    expect(toggle?.getAttribute("aria-pressed")).toBe("false");
    isOn.value = true;
    await nextTick();
    expect(toggle?.dataset.color).toBe(ACTIVE_COLOR);
    expect(toggle?.getAttribute("aria-pressed")).toBe("true");
    expect(button(host, "plain")?.hasAttribute("aria-pressed")).toBe(false);
  });

  it("toggles a linked side panel and derives its state from it", async () => {
    registerHeaderAction(
      action("panel", { label: "$panel.toggle", sidePanelId: PANEL_ID }),
    );
    const host = await mountHeader();
    const toggle = button(host, "t:panel.toggle");
    const { isOpen } = useSidePanel(PANEL_ID);
    toggle?.click();
    await nextTick();
    expect(isOpen.value).toBe(true);
    expect(toggle?.dataset.color).toBe(ACTIVE_COLOR);
    toggle?.click();
    await nextTick();
    expect(isOpen.value).toBe(false);
    expect(toggle?.dataset.color).toBe(IDLE_COLOR);
  });

  it("keeps the builder action in its slot, running its own callables", async () => {
    const onSelect = vi.fn();
    registerHeaderAction(
      action(BUILDER_ACTION_ID, {
        label: "Edit",
        onSelect,
        isActive: () => true,
      }),
    );
    const host = await mountHeader();
    const builder = button(host, "Edit");
    builder?.click();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(builder?.dataset.color).toBe(ACTIVE_COLOR);
  });
});

describe("header action icon component", () => {
  it("draws the registered component inside the button instead of the icon", async () => {
    registerHeaderAction(
      action("state", { sidePanelId: PANEL_ID, iconComponent: "StateIcon" }),
    );
    const host = await mountHeader();
    const state = button(host, "state");
    expect(state?.querySelector("[data-animated-icon]")).not.toBeNull();
    expect(state?.querySelector("[data-icon]")).toBeNull();
  });

  it("draws icon while the name resolves to no component", async () => {
    registerHeaderAction(
      action("state", { sidePanelId: PANEL_ID, iconComponent: "Missing" }),
    );
    const host = await mountHeader();
    const state = button(host, "state");
    expect(state?.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe(
      "i-ph-star",
    );
    expect(state?.querySelector("[data-animated-icon]")).toBeNull();
  });

  it("draws icon for an action that names no component", async () => {
    registerHeaderAction(action("plain", { sidePanelId: PANEL_ID }));
    const host = await mountHeader();
    expect(button(host, "plain")?.querySelector("[data-icon]")).not.toBeNull();
  });

  it("gives only the action naming a component its component", async () => {
    registerHeaderAction(
      action("state", { sidePanelId: PANEL_ID, iconComponent: "StateIcon" }),
    );
    registerHeaderAction(action("plain", { onSelect: vi.fn() }));
    const host = await mountHeader();
    expect(button(host, "plain")?.querySelector("[data-icon]")).not.toBeNull();
    expect(
      button(host, "plain")?.querySelector("[data-animated-icon]"),
    ).toBeNull();
  });

  it("draws the component on the builder button too", async () => {
    registerHeaderAction(
      action(BUILDER_ACTION_ID, {
        label: "Edit",
        onSelect: vi.fn(),
        iconComponent: "StateIcon",
      }),
    );
    const host = await mountHeader();
    expect(
      button(host, "Edit")?.querySelector("[data-animated-icon]"),
    ).not.toBeNull();
  });

  it("keeps the click, label and pressed state of the button", async () => {
    registerHeaderAction(
      action("state", {
        label: "$state.toggle",
        sidePanelId: PANEL_ID,
        iconComponent: "StateIcon",
      }),
    );
    const host = await mountHeader();
    const state = button(host, "t:state.toggle");
    state?.click();
    await nextTick();
    expect(useSidePanel(PANEL_ID).isOpen.value).toBe(true);
    expect(state?.getAttribute("aria-pressed")).toBe("true");
    expect(state?.dataset.color).toBe(ACTIVE_COLOR);
  });
});
