/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMockupState } from "../layers/dms-ui/app/entries/utils/mockup";
import {
  mockupSpec,
  mockupState,
  mountViewer,
  stubMockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const MODULES = [
  {
    id: "mailing",
    package: "@antelopejs/dms-mailing",
    icon: "i-ph-envelope-simple",
  },
  { id: "media", package: "@antelopejs/dms-media", icon: "i-ph-images" },
];

let viewer: MountedViewer;

const strip = () =>
  viewer.host.querySelector<HTMLElement>("[data-dms-mockup-modules]");
const chips = () => [
  ...viewer.host.querySelectorAll<HTMLElement>("[data-dms-mockup-module]"),
];

async function open(modules?: typeof MODULES): Promise<void> {
  stubMockupRuntime({ spec: mockupSpec(), blocks: [] });
  viewer = await mountViewer();
  await viewer.publish("state", mockupState({ modules }));
  await viewer.say({ type: "ready" });
}

afterEach(() => {
  viewer.unmount();
  vi.unstubAllGlobals();
});

describe("the mockup's modules strip", () => {
  it("lists each module with its icon and its package, in the spec's order, outside the edit mode (fails when a module is dropped, reordered or shows no icon)", async () => {
    await open(MODULES);

    expect(strip()?.textContent).toContain("dms.mockup.modules");
    expect(chips().map((chip) => chip.dataset.dmsMockupModule)).toEqual([
      "mailing",
      "media",
    ]);
    expect(chips().map((chip) => chip.title)).toEqual([
      "@antelopejs/dms-mailing",
      "@antelopejs/dms-media",
    ]);
    expect(chips().map((chip) => chip.textContent?.trim())).toEqual([
      "mailing",
      "media",
    ]);
  });

  it("draws nothing when the state lists no module (fails when an empty strip shows)", async () => {
    await open(undefined);

    expect(strip()).toBeNull();
  });

  it("keeps a state whose modules read right and refuses one whose module lacks its package (fails when the guard skips the modules)", () => {
    expect(
      parseMockupState(mockupState({ modules: MODULES }))?.modules,
    ).toEqual(MODULES);
    expect(
      parseMockupState({
        ...mockupState(),
        modules: [{ id: "media", icon: "i-ph-images" }],
      }),
    ).toBeUndefined();
  });
});
