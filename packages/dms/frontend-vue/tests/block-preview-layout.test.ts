/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  provide,
  ref,
  useTemplateRef,
  watch,
  type App,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_CHANNEL } from "../layers/dms-ui/app/entries/utils/blockPreview";
import type { PreviewBlockTypes } from "../layers/dms-ui/app/entries/utils/blockPreview";
import type { JsonValue } from "../layers/dms-core/app/types/json";
import { useRealDataEngine } from "./fixtures/dataEngine";

const BLOCK_TYPES: PreviewBlockTypes = {
  Early: { componentName: "dms-early" },
  Late: { componentName: "dms-late" },
};

const TREE = [{ type: "Early" }, { type: "Late" }];

const SIZE = { width: 200, height: 80 };
const NO_SIZE = { width: 0, height: 0 };

interface SentMessage {
  channel: string;
  type: string;
  blocks?: Array<{ path: string }>;
}

const parentWindow = { postMessage: vi.fn<(message: SentMessage) => void>() };
const isLateDrawn = ref(false);
let app: App | undefined;
let host: HTMLElement;
const resizeCallbacks: Array<() => void> = [];

class FakeResizeObserver {
  constructor(callback: () => void) {
    resizeCallbacks.push(callback);
  }
  observe(): void {}
  disconnect(): void {}
}

const Early = defineComponent({
  render: () => h("div", { class: "early" }, "Early"),
});

/** A block whose content arrives after the first draw: a lazy chunk, data that loads. */
const Late = defineComponent({
  render: () =>
    isLateDrawn.value ? h("div", { class: "late" }, "Late") : null,
});

const BLOCKS = new Map([
  ["dms-early", Early],
  ["dms-late", Late],
]);

function resolveBlock(name: string) {
  return BLOCKS.get(name);
}

function postFromParent(data: JsonValue): void {
  window.dispatchEvent(
    new MessageEvent("message", { data, source: window.parent }),
  );
}

const render = () =>
  postFromParent({ channel: PREVIEW_CHANNEL, type: "render", tree: TREE });

const SETTLE_MS = 120;
const POLL_MS = 10;
const PATIENCE_MS = 3000;

const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

/** Waits, a frame at a time, for what the preview reports once a frame has drawn. */
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + PATIENCE_MS;
  while (!check() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

const layouts = () =>
  parentWindow.postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type === "layout");

const lastPaths = () =>
  layouts()
    .at(-1)
    ?.blocks?.map((block) => block.path);

async function mountInspected(): Promise<void> {
  const { default: BlockPreview } = await import(
    "../layers/dms-ui/app/components/block-preview/BlockPreview.vue"
  );
  const { default: RecursiveComponent } = await import(
    "../layers/dms-ui/app/components/RecursiveComponent.vue"
  );
  app = createApp(BlockPreview, { embed: true, blockTypes: BLOCK_TYPES });
  app.component("DmsRecursiveComponent", RecursiveComponent);
  app.mount(host);
  render();
  postFromParent({ channel: PREVIEW_CHANNEL, type: "inspect", enabled: true });
  await nextTick();
  await until(() => layouts().length > 0);
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
  vi.stubGlobal("resolveDmsComponent", resolveBlock);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function boxOf(this: Element) {
      const { width, height } = this.matches(".early, .late") ? SIZE : NO_SIZE;
      return new DOMRect(0, 0, width, height);
    },
  );
  Object.defineProperty(window, "parent", {
    value: parentWindow,
    configurable: true,
  });
  parentWindow.postMessage.mockClear();
  resizeCallbacks.length = 0;
  isLateDrawn.value = false;
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

describe("the layout a mockup preview reports while inspecting", () => {
  it("lists the blocks that are drawn at the first draw", async () => {
    await mountInspected();
    expect(lastPaths()).toEqual(["block-0"]);
  });

  it("adds a block that draws after the first report (fails when the parent keeps the first layout, so a selected block gets no toolbar)", async () => {
    await mountInspected();

    isLateDrawn.value = true;
    await until(() => lastPaths()?.length === 2);

    expect(lastPaths()).toEqual(["block-0", "block-1"]);
  });

  it("sends nothing while the blocks sit where they did", async () => {
    await mountInspected();
    const before = layouts().length;

    resizeCallbacks.forEach((callback) => callback());
    await settle();

    expect(layouts().length).toBe(before);
  });

  it("sends the layout again on each render, so the parent knows which draw it holds", async () => {
    await mountInspected();
    const before = layouts().length;

    render();
    await until(() => layouts().length > before);
    await settle();

    expect(layouts().length).toBe(before + 1);
  });
});
