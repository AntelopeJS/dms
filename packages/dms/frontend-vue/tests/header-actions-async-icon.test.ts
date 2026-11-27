// @vitest-environment jsdom
import { defineAsyncComponent, type Component } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  BUILDER_ACTION_ID,
  type HeaderAction,
  registerHeaderAction,
} from "../layers/dms-layout/app/composables/useHeaderActions";
import {
  action,
  AnimatedIcon,
  button,
  mountHeader,
  PANEL_ID,
  registeredComponents,
  settle,
  useHeaderActionsRuntime,
} from "./helpers/header-actions-runtime";

useHeaderActionsRuntime();

function registerAsyncIcon(
  loader: () => Promise<Component>,
  extra: Partial<HeaderAction> = {},
): void {
  registeredComponents.set("Slow", defineAsyncComponent(loader));
  registerHeaderAction(
    action("slow", {
      sidePanelId: PANEL_ID,
      iconComponent: "Slow",
      ...extra,
    }),
  );
}

describe("header action async icon component", () => {
  it("draws icon until the component arrives, not an empty button", async () => {
    let arrive: (component: Component) => void = () => undefined;
    registerAsyncIcon(
      () => new Promise<Component>((resolve) => (arrive = resolve)),
    );
    const host = await mountHeader();
    await settle();
    const slow = button(host, "slow");
    expect(slow?.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe(
      "i-ph-star",
    );
    expect(slow?.querySelector("[data-animated-icon]")).toBeNull();
    arrive(AnimatedIcon);
    await settle();
    expect(slow?.querySelector("[data-animated-icon]")).not.toBeNull();
    expect(slow?.querySelector("[data-icon]")).toBeNull();
  });

  it("draws icon on the builder button until its component arrives", async () => {
    let arrive: (component: Component) => void = () => undefined;
    registerAsyncIcon(
      () => new Promise<Component>((resolve) => (arrive = resolve)),
      { id: BUILDER_ACTION_ID, icon: "i-ph-hammer", label: "Edit" },
    );
    const host = await mountHeader();
    await settle();
    expect(
      button(host, "Edit")
        ?.querySelector("[data-icon]")
        ?.getAttribute("data-icon"),
    ).toBe("i-ph-hammer");
    arrive(AnimatedIcon);
    await settle();
    expect(
      button(host, "Edit")?.querySelector("[data-animated-icon]"),
    ).not.toBeNull();
  });
});

describe("header action async icon component failures", () => {
  it("keeps drawing icon when the component fails to load, without an unhandled error", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    registerAsyncIcon(() => Promise.reject(new Error("chunk failed")));
    const host = await mountHeader();
    await settle();
    const slow = button(host, "slow");
    expect(slow?.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe(
      "i-ph-star",
    );
    expect(slow?.querySelector("[data-animated-icon]")).toBeNull();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("draws the component of a re-registration after the first one failed to load", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    registerAsyncIcon(() => Promise.reject(new Error("chunk failed")));
    const host = await mountHeader();
    await settle();
    registerHeaderAction(
      action("slow", { sidePanelId: PANEL_ID, iconComponent: "StateIcon" }),
    );
    await settle();
    expect(
      button(host, "slow")?.querySelector("[data-animated-icon]"),
    ).not.toBeNull();
    expect(button(host, "slow")?.querySelector("[data-icon]")).toBeNull();
    error.mockRestore();
    warn.mockRestore();
  });

  it("keeps a re-registration's component when the load it replaced fails late, instead of drawing icon", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let fail: (reason: Error) => void = () => undefined;
    registerAsyncIcon(
      () =>
        new Promise<Component>((_, reject) => {
          fail = reject;
        }),
    );
    const host = await mountHeader();
    await settle();
    registerHeaderAction(
      action("slow", { sidePanelId: PANEL_ID, iconComponent: "StateIcon" }),
    );
    await settle();
    fail(new Error("replaced chunk failed"));
    await settle();
    expect(
      button(host, "slow")?.querySelector("[data-animated-icon]"),
    ).not.toBeNull();
    expect(button(host, "slow")?.querySelector("[data-icon]")).toBeNull();
    warn.mockRestore();
  });

  it("reports a failed load in development instead of swallowing it", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    registerAsyncIcon(() => Promise.reject(new Error("chunk failed")));
    await mountHeader();
    await settle();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("header action icon component"),
      expect.objectContaining({ message: "chunk failed" }),
    );
    error.mockRestore();
    warn.mockRestore();
  });

  it("keeps the icon at the size of the regular leading icon", async () => {
    registerAsyncIcon(() => new Promise<Component>(() => undefined));
    const host = await mountHeader();
    await settle();
    expect(button(host, "slow")?.querySelector("[data-icon]")?.className).toBe(
      "size-[18px] shrink-0",
    );
  });
});
