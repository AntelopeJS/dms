/** @vitest-environment jsdom */
import { defineAsyncComponent, h, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import { registerHeaderAction } from "../layers/dms-layout/app/composables/useHeaderActions";
import {
  action,
  AnimatedIcon,
  button,
  hydrateHeader,
  hydrationWarnings,
  PANEL_ID,
  registeredComponents,
  settle,
  useHeaderActionsRuntime,
} from "./helpers/header-actions-runtime";

useHeaderActionsRuntime();

describe("header action hydration", () => {
  it("hydrates a server-rendered icon component without a mismatch", async () => {
    const spies = [
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    registerHeaderAction(
      action("state", { sidePanelId: PANEL_ID, iconComponent: "StateIcon" }),
    );
    const { host, serverHtml } = await hydrateHeader(() => undefined);
    expect(serverHtml).toContain('data-icon="i-ph-star"');
    expect(serverHtml).not.toContain("<svg");
    await nextTick();
    expect(
      button(host, "state")?.querySelector("[data-animated-icon]"),
    ).not.toBeNull();
    expect(button(host, "state")?.querySelector("[data-icon]")).toBeNull();
    expect(hydrationWarnings(spies)).toEqual([]);
    spies.forEach((spy) => spy.mockRestore());
  });

  it("leaves exactly one icon when the client chunk of a server-rendered component rejects", async () => {
    const spies = [
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    registeredComponents.set(
      "Slow",
      defineAsyncComponent(async () => AnimatedIcon),
    );
    registerHeaderAction(
      action("slow", { sidePanelId: PANEL_ID, iconComponent: "Slow" }),
    );
    const { host } = await hydrateHeader(() => {
      registeredComponents.set(
        "Slow",
        defineAsyncComponent(() => Promise.reject(new Error("chunk failed"))),
      );
    });
    await settle();
    const slow = button(host, "slow");
    expect(slow?.querySelectorAll("[data-icon]")).toHaveLength(1);
    expect(slow?.querySelector("svg")).toBeNull();
    expect(hydrationWarnings(spies)).toEqual([]);
    spies.forEach((spy) => spy.mockRestore());
  });

  it("draws icon on the server and hydrates cleanly a component that throws only there", async () => {
    const spies = [
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    let onServer = true;
    registeredComponents.set("ServerOnlyFailure", () => {
      if (onServer) throw new Error("window is not defined");
      return h("svg", { "data-animated-icon": "" });
    });
    registerHeaderAction(
      action("state", {
        sidePanelId: PANEL_ID,
        iconComponent: "ServerOnlyFailure",
      }),
    );
    const { host, serverHtml } = await hydrateHeader(() => {
      onServer = false;
    });
    expect(serverHtml).toContain('data-icon="i-ph-star"');
    await nextTick();
    expect(
      button(host, "state")?.querySelector("[data-animated-icon]"),
    ).not.toBeNull();
    expect(hydrationWarnings(spies)).toEqual([]);
    spies.forEach((spy) => spy.mockRestore());
  });

  it("hydrates a server-rendered async icon component without a mismatch or a lost icon", async () => {
    const spies = [
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    registeredComponents.set(
      "Slow",
      defineAsyncComponent(async () => AnimatedIcon),
    );
    registerHeaderAction(
      action("slow", { sidePanelId: PANEL_ID, iconComponent: "Slow" }),
    );
    const { host } = await hydrateHeader(() => undefined);
    await settle();
    expect(
      button(host, "slow")?.querySelector("[data-animated-icon]"),
    ).not.toBeNull();
    expect(button(host, "slow")?.querySelector("[data-icon]")).toBeNull();
    expect(hydrationWarnings(spies)).toEqual([]);
    spies.forEach((spy) => spy.mockRestore());
  });

  it("draws a client-only action once mounted, not over the server markup", async () => {
    const spies = [
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    registerHeaderAction(action("panel", { sidePanelId: PANEL_ID }));
    const { host } = await hydrateHeader(() =>
      registerHeaderAction(action("client", { onSelect: vi.fn() })),
    );
    expect(hydrationWarnings(spies)).toEqual([]);
    expect(button(host, "panel")).not.toBeNull();
    await nextTick();
    expect(button(host, "client")).not.toBeNull();
    spies.forEach((spy) => spy.mockRestore());
  });
});
