// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type App,
  createApp,
  defineComponent,
  h,
  nextTick,
  shallowRef,
} from "vue";
import {
  useBlockPreviewEmbed,
  type BlockPreviewEmbed,
} from "../layers/dms-ui/app/build/composables/block-preview/useBlockPreviewEmbed";
import {
  PREVIEW_CHANNEL,
  type PreviewState,
} from "../layers/dms-ui/app/build/utils/blockPreview";

const parentWindow = { postMessage: vi.fn() };
const setLocale = vi.fn();
let resizeCallback: (() => void) | undefined;
let app: App | undefined;
let embed: BlockPreviewEmbed;

class FakeResizeObserver {
  constructor(callback: () => void) {
    resizeCallback = callback;
  }
  observe(): void {}
  disconnect(): void {}
}

function mount(initialState?: PreviewState): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp(
    defineComponent({
      setup() {
        const root = shallowRef<HTMLElement | null>(null);
        embed = useBlockPreviewEmbed({ root, initialState, setLocale });
        return () => h("div", { ref: root });
      },
    }),
  );
  app.mount(host);
  return host;
}

function postFromParent(data: unknown): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data,
      source: parentWindow as unknown as Window,
    }),
  );
}

const sent = () =>
  parentWindow.postMessage.mock.calls.map(([message]) => message);

beforeEach(() => {
  parentWindow.postMessage.mockClear();
  setLocale.mockClear();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  Object.defineProperty(window, "parent", {
    value: parentWindow,
    configurable: true,
  });
  document.documentElement.className = "light";
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  Object.defineProperty(window, "parent", {
    value: window,
    configurable: true,
  });
  vi.unstubAllGlobals();
});

describe("embedded block preview", () => {
  it("starts from ?state= and tells the parent it is ready", () => {
    mount({ tree: { type: "KpiCard" }, theme: "dark", locale: "fr-FR" });
    expect(embed.tree.value).toEqual({ type: "KpiCard" });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(setLocale).toHaveBeenCalledWith("fr-FR");
    expect(sent()).toContainEqual({ channel: PREVIEW_CHANNEL, type: "ready" });
  });

  it("draws the tree of a render message and remounts the blocks", async () => {
    mount();
    postFromParent({
      channel: PREVIEW_CHANNEL,
      type: "render",
      tree: [{ type: "Banner" }],
      theme: "dark",
    });
    await nextTick();
    expect(embed.tree.value).toEqual([{ type: "Banner" }]);
    expect(embed.revision.value).toBe(1);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("keeps the transparent flag of ?state= until a render changes it", async () => {
    mount({ tree: { type: "KpiCard" }, transparent: true });
    expect(embed.transparent.value).toBe(true);
    postFromParent({ channel: PREVIEW_CHANNEL, type: "render", tree: [] });
    await nextTick();
    expect(embed.transparent.value).toBe(true);
    postFromParent({
      channel: PREVIEW_CHANNEL,
      type: "render",
      tree: [],
      transparent: false,
    });
    await nextTick();
    expect(embed.transparent.value).toBe(false);
  });

  it("switches the theme on a theme message", async () => {
    mount({ tree: { type: "KpiCard" }, theme: "dark" });
    postFromParent({ channel: PREVIEW_CHANNEL, type: "theme", theme: "light" });
    await nextTick();
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("ignores messages from another window or another channel", async () => {
    mount({ tree: { type: "KpiCard" } });
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { channel: PREVIEW_CHANNEL, type: "render", tree: [] },
      }),
    );
    postFromParent({ channel: "other", type: "render", tree: [] });
    await nextTick();
    expect(embed.tree.value).toEqual({ type: "KpiCard" });
    expect(embed.revision.value).toBe(0);
  });

  it("reports each height change and each error to the parent", () => {
    mount({ tree: { type: "KpiCard" } });
    resizeCallback?.();
    embed.reportError("Nope is not a registered block type.");
    expect(sent()).toContainEqual({
      channel: PREVIEW_CHANNEL,
      type: "resize",
      height: 0,
    });
    expect(sent()).toContainEqual({
      channel: PREVIEW_CHANNEL,
      type: "error",
      message: "Nope is not a registered block type.",
    });
  });
});
