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
  PREVIEW_CHANNEL,
  type PreviewBlockTypes,
} from "../layers/dms-ui/app/entries/utils/blockPreview";
import { useRealDataEngine } from "./fixtures/dataEngine";

const BLOCK_TYPES: PreviewBlockTypes = {
  Probe: { componentName: "dms-probe" },
  Frame: { componentName: "dms-frame" },
};

const TREE = [
  { type: "Probe" },
  { type: "Frame", children: [{ id: "inner", type: "Probe" }] },
];

const parentWindow = { postMessage: vi.fn() };
const clicked = vi.fn();
let app: App | undefined;
let host: HTMLElement;

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const Probe: FunctionalComponent = () =>
  h("button", { class: "probe", onClick: clicked }, "Probe");

const Frame: FunctionalComponent = (_props, { slots }) =>
  h("section", { class: "frame" }, slots.default?.());

const BLOCKS: Record<string, Component> = {
  "dms-probe": Probe,
  "dms-frame": Frame,
};

function postFromParent(data: Parameters<typeof parsePreviewMessage>[0]): void {
  window.dispatchEvent(
    new MessageEvent("message", { data, source: window.parent }),
  );
}

const render = (tree = TREE) =>
  postFromParent({ channel: PREVIEW_CHANNEL, type: "render", tree });
const inspect = (enabled: unknown) =>
  postFromParent({ channel: PREVIEW_CHANNEL, type: "inspect", enabled });

const selections = () =>
  parentWindow.postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type === "select");

function click(element: Element): void {
  element.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

const probes = () => [...host.querySelectorAll<HTMLElement>(".probe")];
const outlined = () =>
  [...host.querySelectorAll("[data-dms-inspect-target]")].map(
    (element) => element.className,
  );

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
  render();
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
  Object.defineProperty(window, "parent", {
    value: parentWindow,
    configurable: true,
  });
  parentWindow.postMessage.mockClear();
  clicked.mockClear();
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
  vi.unstubAllGlobals();
});

describe("inspect messages", () => {
  it("accepts a boolean enabled flag and nothing else", () => {
    const parse = (enabled: unknown) =>
      parsePreviewMessage({
        channel: PREVIEW_CHANNEL,
        type: "inspect",
        enabled,
      });
    expect(parse(true)).toMatchObject({ type: "inspect", enabled: true });
    expect(parse(false)).toMatchObject({ type: "inspect", enabled: false });
    for (const enabled of ["yes", 1, null, undefined]) {
      expect(parse(enabled)).toBeUndefined();
    }
  });
});

describe("inspecting a rendered preview", () => {
  it("lets a click reach the block and posts nothing while inspect is off", async () => {
    await mountPreview();
    click(probes()[0]);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(selections()).toEqual([]);
  });

  it("posts the layout path of the innermost clicked block and keeps the click from it", async () => {
    await mountPreview();
    inspect(true);
    const [outer, inner] = probes();
    click(inner);
    const [frame] = host.querySelectorAll(".frame");
    click(frame);
    click(outer);
    expect(selections()).toEqual([
      { channel: PREVIEW_CHANNEL, type: "select", path: "block-1.inner" },
      { channel: PREVIEW_CHANNEL, type: "select", path: "block-1" },
      { channel: PREVIEW_CHANNEL, type: "select", path: "block-0" },
    ]);
    expect(clicked).not.toHaveBeenCalled();
  });

  it("outlines only the hovered block, and nothing once inspect is off", async () => {
    await mountPreview();
    inspect(true);
    const [outer, inner] = probes();
    inner.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    expect(outlined()).toEqual(["probe"]);
    expect(
      host.querySelector(".frame")?.hasAttribute("data-dms-inspect-target"),
    ).toBe(false);
    expect(inner.hasAttribute("data-dms-inspect-target")).toBe(true);
    outer.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    expect(outer.hasAttribute("data-dms-inspect-target")).toBe(true);
    expect(inner.hasAttribute("data-dms-inspect-target")).toBe(false);
    inspect(false);
    expect(outlined()).toEqual([]);
  });

  it("outlines the new block under the pointer after a render replaced it", async () => {
    await mountPreview();
    inspect(true);
    probes()[0].dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    render();
    await nextTick();
    probes()[0].dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    expect(probes()[0].hasAttribute("data-dms-inspect-target")).toBe(true);
  });

  it("stops swallowing clicks once inspect is switched off again", async () => {
    await mountPreview();
    inspect(true);
    inspect(false);
    click(probes()[0]);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(selections()).toEqual([]);
  });

  it("ignores an inspect message whose flag is not a boolean", async () => {
    await mountPreview();
    inspect("yes");
    click(probes()[0]);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(selections()).toEqual([]);
  });

  it("ignores an inspect message from another channel or window", async () => {
    await mountPreview();
    postFromParent({ channel: "other", type: "inspect", enabled: true });
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { channel: PREVIEW_CHANNEL, type: "inspect", enabled: true },
      }),
    );
    click(probes()[0]);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(selections()).toEqual([]);
  });
});
