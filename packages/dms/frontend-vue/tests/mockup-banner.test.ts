/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockupBlockType } from "../layers/dms-ui/app/entries/utils/mockupCatalog";
import {
  flush,
  mockupSpec,
  mockupState,
  mountViewer,
  stubMockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const KPI: MockupBlockType = {
  type: "KpiCard",
  componentName: "dms-kpi-card",
  meta: { name: "KPI card", group: "visualization" },
  config: {
    title: { type: "string", ui: { label: "Title", group: "content" } },
  },
  defaults: {},
};

let viewer: MountedViewer;

const banner = () =>
  viewer.host.querySelector<HTMLElement>("[data-dms-mockup-banner]");

function press(key: string): Promise<void> {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
  return flush();
}

beforeEach(async () => {
  stubMockupRuntime({ spec: mockupSpec(), blocks: [KPI] });
  viewer = await mountViewer();
  await viewer.publish("state", mockupState());
  await viewer.say({ type: "ready" });
});

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

describe("the mode hint banner", () => {
  it("says nothing while no tool is armed", () => {
    expect(banner()).toBeNull();
  });

  it("tells a click places a comment while the comment tool is armed, with Esc as a key badge (fails when the banner is missing or has no cancel key)", async () => {
    await press("c");

    expect(banner()?.getAttribute("data-dms-mockup-banner")).toBe("comment");
    expect(banner()?.textContent).toContain("dms.mockup.banner_comment");
    expect(banner()?.textContent).toContain("dms.mockup.banner_cancel");
    expect(
      [...(banner()?.querySelectorAll("kbd") ?? [])].map(
        (key) => key.textContent,
      ),
    ).toEqual(["Esc"]);

    await press("Escape");
    expect(banner()).toBeNull();
  });

  it("names the armed block while a block is placed (fails when the banner does not name the block)", async () => {
    viewer.host
      .querySelector<HTMLElement>("[data-dms-mockup-block-type=KpiCard]")
      ?.click();
    await flush();

    expect(banner()?.getAttribute("data-dms-mockup-banner")).toBe("place");
    expect(banner()?.textContent).toContain("dms.mockup.banner_place KPI card");
    expect(
      [...(banner()?.querySelectorAll("kbd") ?? [])].map(
        (key) => key.textContent,
      ),
    ).toEqual(["Esc"]);

    await press("Escape");
    expect(banner()).toBeNull();
  });

  it("follows the one tool armed when the other takes over", async () => {
    viewer.host
      .querySelector<HTMLElement>("[data-dms-mockup-block-type=KpiCard]")
      ?.click();
    await flush();
    await press("c");
    expect(banner()?.getAttribute("data-dms-mockup-banner")).toBe("comment");
    expect(
      viewer.host.querySelectorAll("[data-dms-mockup-banner]"),
    ).toHaveLength(1);
  });
});
