/** @vitest-environment jsdom */
import {
  computed,
  createApp,
  h,
  nextTick,
  onMounted,
  provide,
  ref,
  useTemplateRef,
  watch,
  type App,
  type Component,
  type FunctionalComponent,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parsePreviewMessage,
  parsePreviewOutboundMessage,
  PREVIEW_CHANNEL,
  type PreviewBlockTypes,
} from "../layers/dms-ui/app/entries/utils/blockPreview";
import {
  PREVIEW_NAVIGATION_ATTRIBUTE,
  previewNavigation,
} from "../layers/dms-ui/app/entries/composables/block-preview/previewNavigation";
import { useRealDataEngine } from "./fixtures/dataEngine";

const BLOCK_TYPES: PreviewBlockTypes = {
  Probe: { componentName: "dms-probe" },
  Frame: { componentName: "dms-frame" },
};
const TREE = [
  { type: "Probe" },
  { type: "Frame", children: [{ id: "inner", type: "Probe" }] },
];
const NAVIGATION = {
  title: "Order desk",
  items: [
    { id: "orders", label: "Orders", icon: "i-ph-house" },
    { id: "settings", label: "Settings" },
  ],
  active: "orders",
};
const BOXES: Record<string, [number, number, number, number]> = {
  probe: [10, 20, 100, 40],
  frame: [10, 80, 300, 120],
};

const parentWindow = { postMessage: vi.fn() };
const clicked = vi.fn();
let app: App | undefined;
let host: HTMLElement;

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const Probe: FunctionalComponent = () =>
  h("button", { class: "probe", onClick: clicked }, "Revenue");
const Frame: FunctionalComponent = (_props, { slots }) =>
  h("section", { class: "frame" }, slots.default?.());
const BLOCKS: Record<string, Component> = {
  "dms-probe": Probe,
  "dms-frame": Frame,
};

function postFromParent(data: Record<string, unknown>): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { channel: PREVIEW_CHANNEL, ...data },
      source: window.parent,
    }),
  );
}

const posted = (type: string) =>
  parentWindow.postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type === type);

function boxOf(element: Element): DOMRect {
  const [x, y, width, height] = BOXES[element.className] ?? [0, 0, 0, 0];
  return new DOMRect(x, y, width, height);
}

async function frame(): Promise<void> {
  await nextTick();
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
}

async function mountPreview(): Promise<void> {
  const { default: BlockPreview } = await import(
    "../layers/dms-ui/app/components/block-preview/BlockPreview.vue"
  );
  const { default: RecursiveComponent } = await import(
    "../layers/dms-ui/app/components/RecursiveComponent.vue"
  );
  app = createApp(BlockPreview, { embed: true, blockTypes: BLOCK_TYPES });
  app.component("DmsRecursiveComponent", RecursiveComponent);
  app.mount(host);
  postFromParent({ type: "render", tree: TREE, navigation: NAVIGATION });
  await nextTick();
}

beforeEach(() => {
  useRealDataEngine();
  for (const [name, value] of Object.entries({
    computed,
    onMounted,
    provide,
    ref,
    useTemplateRef,
    watch,
  })) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal("useI18n", () => ({
    t: String,
    locale: ref("en"),
    locales: ref([]),
    setLocale: vi.fn(),
  }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
  vi.stubGlobal("resolveDmsComponent", (name: string) => BLOCKS[name]);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return boxOf(this);
    },
  );
  Object.defineProperty(window, "parent", {
    value: parentWindow,
    configurable: true,
  });
  parentWindow.postMessage.mockClear();
  clicked.mockClear();
  previewNavigation.value = undefined;
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  Object.defineProperty(window, "parent", {
    value: window,
    configurable: true,
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("editing messages", () => {
  it("reads a sidebar on render and refuses a malformed one (fails when a bad entry reaches the layout)", () => {
    const render = (navigation: unknown) =>
      parsePreviewMessage({
        channel: PREVIEW_CHANNEL,
        type: "render",
        tree: [],
        navigation,
      });
    expect(render(NAVIGATION)).toMatchObject({ navigation: NAVIGATION });
    expect(render({ items: [{ id: "a", label: 3 }] })).toBeUndefined();
    expect(render({ items: "orders" })).toBeUndefined();
  });

  it("rebuilds layout, text and navigate reports from checked fields only (fails on a NaN box or a missing font)", () => {
    const rect = { x: 1, y: 2, width: 3, height: 4 };
    const font = {
      family: "Geist",
      size: "14px",
      weight: "600",
      lineHeight: "20px",
      letterSpacing: "normal",
      color: "rgb(0, 0, 0)",
      align: "start",
    };
    const outbound = (data: Record<string, unknown>) =>
      parsePreviewOutboundMessage({ channel: PREVIEW_CHANNEL, ...data });
    expect(
      outbound({
        type: "layout",
        blocks: [{ path: "block-0", rect, extra: 1 }],
      }),
    ).toEqual({
      channel: PREVIEW_CHANNEL,
      type: "layout",
      blocks: [{ path: "block-0", rect }],
    });
    expect(
      outbound({
        type: "layout",
        blocks: [{ path: "block-0", rect: { ...rect, x: NaN } }],
      }),
    ).toBeUndefined();
    expect(
      outbound({ type: "text", path: "block-0", text: "Revenue", rect, font }),
    ).toMatchObject({ type: "text", text: "Revenue", font });
    expect(
      outbound({
        type: "text",
        path: "block-0",
        text: "Revenue",
        rect,
        font: {},
      }),
    ).toBeUndefined();
    expect(outbound({ type: "navigate", id: "settings" })).toMatchObject({
      id: "settings",
    });
    expect(outbound({ type: "navigate", id: 4 })).toBeUndefined();
  });
});

describe("an inspected preview reports what the editor draws over it", () => {
  it("posts where each block sits once inspecting, and nothing before (fails when layout is posted while idle)", async () => {
    await mountPreview();
    await frame();
    expect(posted("layout")).toEqual([]);
    postFromParent({ type: "inspect", enabled: true });
    await frame();
    const blocks = [...(posted("layout").at(-1)?.blocks ?? [])].sort(
      (left, right) => left.path.localeCompare(right.path),
    );
    expect(blocks).toEqual([
      { path: "block-0", rect: { x: 10, y: 20, width: 100, height: 40 } },
      { path: "block-1", rect: { x: 10, y: 80, width: 300, height: 120 } },
      { path: "block-1.inner", rect: { x: 10, y: 20, width: 100, height: 40 } },
    ]);
  });

  it("reports the text a double-click lands on with its box and font, and keeps the event from the block (fails when the text is not posted)", async () => {
    await mountPreview();
    postFromParent({ type: "inspect", enabled: true });
    const [, inner] = host.querySelectorAll(".probe");
    inner?.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
    );
    expect(posted("text")).toEqual([
      expect.objectContaining({
        path: "block-1.inner",
        text: "Revenue",
        rect: { x: 10, y: 20, width: 100, height: 40 },
      }),
    ]);
  });

  it("hands the sidebar of a render to the layout, and lets its clicks through while inspecting (fails when the sidebar is swallowed)", async () => {
    await mountPreview();
    expect(previewNavigation.value).toEqual(NAVIGATION);
    postFromParent({ type: "inspect", enabled: true });
    const sidebar = document.createElement("nav");
    sidebar.setAttribute(PREVIEW_NAVIGATION_ATTRIBUTE, "");
    const entry = document.createElement("button");
    const picked = vi.fn();
    entry.addEventListener("click", picked);
    sidebar.append(entry);
    document.body.append(sidebar);
    entry.click();
    sidebar.remove();
    expect(picked).toHaveBeenCalledTimes(1);
    host.querySelector<HTMLElement>(".probe")?.click();
    expect(clicked).not.toHaveBeenCalled();
  });

  it("forgets the sidebar when a render carries none (fails when a docs embed keeps a mockup's sidebar)", async () => {
    await mountPreview();
    postFromParent({ type: "render", tree: TREE });
    expect(previewNavigation.value).toBeUndefined();
  });
});
