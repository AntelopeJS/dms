/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MOCKUP_ASSISTANT_PROMPT_EVENT,
  type MockupAssistantPrompt,
} from "../layers/dms-ui/app/utils/mockupAssistant";
import type { MockupBlockType } from "../layers/dms-ui/app/entries/utils/mockupCatalog";
import {
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  stubMockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const KPI: MockupBlockType = {
  type: "KpiCard",
  componentName: "dms-kpi-card",
  meta: { name: "KPI card", group: "visualization" },
  config: { title: { type: "string", ui: { group: "content" } } },
  defaults: {},
};

const SPEC = {
  version: 1,
  pages: [
    {
      id: "orders",
      title: "Orders",
      tree: [
        {
          type: "GridRow",
          children: [
            { id: "revenue", type: "KpiCard", options: { title: "Revenue" } },
          ],
        },
        {
          type: "sketch",
          options: { html: "<div></div>", caption: "Calendar" },
        },
      ],
    },
  ],
};

const STATE = mockupState({
  pages: [
    mockupPage({
      options: {},
      tree: [],
      paths: {
        "block-0": "/pages/0/tree/0",
        "block-0.revenue": "/pages/0/tree/0/children/0",
        "block-1": "/pages/0/tree/1",
      },
    }),
  ],
});

let viewer: MountedViewer;
let received: MockupAssistantPrompt[];
let claim: boolean;

function listen(event: Event): void {
  if (!(event instanceof CustomEvent)) return;
  received.push(event.detail);
  if (claim) event.preventDefault();
}

const click = async (selector: string) => {
  viewer.host.querySelector<HTMLElement>(selector)?.click();
  await flush();
};
const modal = () => viewer.host.querySelector("[data-dms-mockup-prompt]");

beforeEach(async () => {
  stubMockupRuntime({ spec: SPEC, blocks: [KPI] });
  received = [];
  claim = false;
  window.addEventListener(MOCKUP_ASSISTANT_PROMPT_EVENT, listen);
  viewer = await mountViewer();
  await viewer.publish("state", STATE);
  await viewer.say({ type: "ready" });
});

afterEach(() => {
  window.removeEventListener(MOCKUP_ASSISTANT_PROMPT_EVENT, listen);
  viewer.unmount();
  vi.unstubAllGlobals();
});

const CONNECT: MockupAssistantPrompt = {
  prompt: "dms.mockup.prompt_connect_data demo,Orders,KPI card,Revenue",
  block: {
    mockup: "demo",
    page: "orders",
    path: "block-0.revenue",
    type: "KpiCard",
  },
  source: "connect-data",
};

const CUSTOM_ZONE: MockupAssistantPrompt = {
  prompt: "dms.mockup.prompt_custom_zone demo,Orders,sketch,Calendar",
  block: { mockup: "demo", page: "orders", path: "block-1", type: "sketch" },
  source: "custom-zone",
};

describe("handing a block to the AI", () => {
  it("sends the block's layout path, page id and type with connect-data, and opens no modal once claimed (fails on a spec pointer as path)", async () => {
    claim = true;
    await viewer.say({ type: "select", path: "block-0.revenue" });
    await click("[data-dms-mockup-connect-data]");
    expect(received).toEqual([CONNECT]);
    expect(modal()).toBeNull();
  });

  it("shows the prompt to copy when nobody claims connect-data (fails when an unclaimed request is lost)", async () => {
    await viewer.say({ type: "select", path: "block-0.revenue" });
    await click("[data-dms-mockup-connect-data]");
    expect(received).toEqual([CONNECT]);
    expect(modal()?.textContent?.trim()).toBe(CONNECT.prompt);
  });

  it("sends a custom zone as type sketch, claimed or shown to copy (fails when the zone's source or type drifts)", async () => {
    claim = true;
    await viewer.say({ type: "select", path: "block-1" });
    await click("[data-dms-mockup-ask-ai]");
    expect(received).toEqual([CUSTOM_ZONE]);
    expect(modal()).toBeNull();
    claim = false;
    await click("[data-dms-mockup-ask-ai]");
    expect(received).toEqual([CUSTOM_ZONE, CUSTOM_ZONE]);
    expect(modal()?.textContent?.trim()).toBe(CUSTOM_ZONE.prompt);
  });
});

describe("Build it", () => {
  it("hands the assistant the mockup's name alone, with no block, and opens no modal once claimed (fails when build sends a sentence or a block)", async () => {
    claim = true;
    await click("[data-dms-mockup-build]");
    expect(received).toEqual([{ prompt: "demo", source: "build" }]);
    expect(received[0]).not.toHaveProperty("block");
    expect(modal()).toBeNull();
  });

  it("shows the full build command, made of the name, when nobody claims it (fails when the modal shows the bare name)", async () => {
    await click("[data-dms-mockup-build]");
    expect(received).toEqual([{ prompt: "demo", source: "build" }]);
    expect(modal()?.textContent?.trim()).toBe("dms.mockup.prompt_build demo");
  });

  it("names the live page a converted mockup page updates, in the event and in the copy (fails on a build that names only the mockup)", async () => {
    await viewer.publish(
      "state",
      mockupState({
        pages: [{ ...STATE.pages[0], livePage: { ref: "/orders" } }],
      }),
    );
    await click("[data-dms-mockup-build]");
    expect(received).toEqual([
      { prompt: "demo", source: "build", target: { pageRef: "/orders" } },
    ]);
    expect(modal()?.textContent?.trim()).toBe(
      "dms.mockup.prompt_build_page demo,/orders",
    );
  });
});
