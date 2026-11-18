/** @vitest-environment jsdom */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import {
  MOCKUP_ASSISTANT_PROMPT_EVENT,
  type MockupAssistantPrompt,
  type MockupAssistantPromptSource,
} from "../layers/dms-ui/app/utils/mockupAssistant";
import type { MockupBlockType } from "../layers/dms-ui/app/entries/utils/mockupCatalog";
import type { MockupAnnotation } from "../layers/dms-ui/app/entries/utils/mockup";
import {
  annotation,
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
let received: unknown[];
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

const CUSTOM_ZONE: MockupAssistantPrompt = {
  prompt: "dms.mockup.prompt_custom_zone demo,Orders,sketch,Calendar",
  block: { mockup: "demo", page: "orders", path: "block-1", type: "sketch" },
  source: "custom-zone",
};

describe("handing a block to the AI", () => {
  it("types the sources a request can come from without connect-data (fails when the source returns)", () => {
    expectTypeOf<MockupAssistantPromptSource>().toEqualTypeOf<
      "custom-zone" | "build" | "resolve-comments" | "new-mockup"
    >();
  });

  it("offers no connect-data request on a data block, only the sample-data hint (fails when a button comes back)", async () => {
    await viewer.say({ type: "select", path: "block-0.revenue" });
    expect(
      viewer.host.querySelector("[data-dms-mockup-connect-data]"),
    ).toBeNull();
    expect(
      viewer.host.querySelector("[data-dms-mockup-data-hint]")?.textContent,
    ).toContain("dms.mockup.data_hint");
    expect(received).toEqual([]);
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

  it("adds the mockup's title when it differs from its name, in the event and in the copy, and keeps the name as the prompt (fails when the request names the folder alone)", async () => {
    await viewer.publish("state", mockupState({ title: "Shop admin" }));

    await click("[data-dms-mockup-build]");

    expect(received).toEqual([
      { prompt: "demo", title: "Shop admin", source: "build" },
    ]);
    expect(modal()?.textContent?.trim()).toBe(
      "dms.mockup.prompt_build dms.mockup.prompt_mockup_titled Shop admin,demo",
    );
  });

  it("leaves the title out when it is the name (fails when the request repeats the name as its title)", async () => {
    await viewer.publish("state", mockupState({ title: "demo" }));

    await click("[data-dms-mockup-build]");

    expect(received).toEqual([{ prompt: "demo", source: "build" }]);
  });
});

describe("Resolve with AI", () => {
  const OPEN = annotation({ id: "a1" });

  async function withNotes(notes: MockupAnnotation[]): Promise<void> {
    await viewer.publish("annotations", { annotations: notes });
  }

  const bar = () => viewer.host.querySelector("[data-dms-mockup-resolve-bar]");
  const button = () =>
    viewer.host.querySelector("[data-dms-mockup-resolve]")?.textContent?.trim();

  it("shows no bar while no comment is open (fails when the bar offers to resolve nothing)", async () => {
    await withNotes([{ ...OPEN, status: "resolved" }]);
    expect(bar()).toBeNull();
  });

  it("hands the assistant the mockup's name and the page in view as resolve-comments, and opens no modal once claimed (fails when the request names a comment or a sentence)", async () => {
    claim = true;
    await withNotes([OPEN, { ...OPEN, id: "a2" }]);
    expect(bar()?.textContent).toContain("dms.mockup.open_comments 2");

    await click("[data-dms-mockup-resolve]");

    expect(received).toEqual([
      { prompt: "demo", source: "resolve-comments", page: "orders" },
    ]);
    expect(modal()).toBeNull();
    expect(button()).toBe("dms.mockup.resolve_ai");
  });

  it("shows the prompt to copy when nobody claims it, and reads Copy the prompt from then on (fails when an unclaimed request is lost)", async () => {
    await withNotes([OPEN]);

    await click("[data-dms-mockup-resolve]");

    expect(received).toEqual([
      { prompt: "demo", source: "resolve-comments", page: "orders" },
    ]);
    expect(modal()?.textContent?.trim()).toBe(
      "dms.mockup.prompt_resolve_comments demo",
    );
    expect(button()).toBe("dms.mockup.copy_prompt");
  });

  it("adds the mockup's title when it differs from its name, in the event and in the copy (fails when the request names the folder alone)", async () => {
    await viewer.publish("state", mockupState({ title: "Shop admin" }));
    await withNotes([OPEN]);

    await click("[data-dms-mockup-resolve]");

    expect(received).toEqual([
      {
        prompt: "demo",
        title: "Shop admin",
        source: "resolve-comments",
        page: "orders",
      },
    ]);
    expect(modal()?.textContent?.trim()).toBe(
      "dms.mockup.prompt_resolve_comments dms.mockup.prompt_mockup_titled Shop admin,demo",
    );
  });
});
