// @vitest-environment jsdom
/**
 * The PageToolbar block: its LiveToggle on a live page, at the toolbar's
 * size; "updated N s ago" and a refresh button where there is no toggle to
 * show (a page without `live`), counted from the page's last read; and every
 * preset of a period selector with a short code, `all` included.
 */
import { createApp, h, nextTick, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineShortcuts } from "@nuxt/ui/runtime/composables/defineShortcuts.js";
import {
  createPageLiveController,
  type PageLiveController,
} from "../layers/dms-ui/app/build/composables/live/pageLiveController";
import {
  setCurrentPageLive,
  useLiveGate,
} from "../layers/dms-ui/app/build/composables/live/currentPageLive";
import {
  markPageRead,
  pageReadAt,
} from "../layers/dms-ui/app/build/composables/live/pageReadClock";
import {
  onPageBlocksRefresh,
  refreshPageBlocks,
  waitForPageBlocksRefresh,
} from "../layers/dms-ui/app/utils/blockRefresh";
import { PRESET_SHORT_LABELS } from "../layers/dms-ui/app/build/composables/period/periodShortLabels";
import { PERIOD_PRESETS } from "@antelopejs/interface-dms/base/period-selector";

let app: App | undefined;
let host: HTMLDivElement;
let live: PageLiveController | undefined;

const t = (key: string, params?: { count?: number }) =>
  params?.count === undefined ? key : `${key}:${params.count}`;

interface ToolbarSetup {
  toolbar?: Record<string, unknown>;
  toggle?: Record<string, unknown> | false;
}

async function mountToolbar(setup: ToolbarSetup = {}): Promise<void> {
  const [{ default: PageToolbarBlock }, { default: LiveToggleBlock }] =
    await Promise.all([
      import("../layers/dms-ui/app/components/blocks/PageToolbarBlock.vue"),
      import("../layers/dms-ui/app/components/blocks/LiveToggleBlock.vue"),
    ]);
  const block = { pageId: "api.logs" };
  app = createApp({
    render: () =>
      h(
        PageToolbarBlock,
        { componentId: "toolbar", ...block, ...setup.toolbar },
        () => [
          h("span", { class: "scope" }, "scope"),
          setup.toggle === false
            ? null
            : h(LiveToggleBlock, {
                componentId: "toolbar.live",
                variant: "pill",
                ...block,
                ...setup.toggle,
              }),
        ],
      ),
  });
  app.component("UIcon", () => h("i"));
  app.component(
    "UButton",
    (props: { label?: string; size?: string }, { attrs }) =>
      h(
        "button",
        { ...attrs, type: "button", "data-size": props.size },
        props.label,
      ),
  );
  app.mount(host);
  await nextTick();
}

// The refresh resolves through a few promise hops; the ticker must not move.
async function flushPromises(): Promise<void> {
  for (let hop = 0; hop < PROMISE_HOPS; hop += 1) await Promise.resolve();
  await nextTick();
}
const PROMISE_HOPS = 5;

const status = () => host.querySelector(".dms-page-toolbar__status");
const refreshButton = () =>
  host.querySelector<HTMLButtonElement>('[data-action="refresh"]');

function installLive() {
  live = createPageLiveController("api.logs", { maxRate: 2 });
  setCurrentPageLive(live);
  return live;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("useI18n", () => ({ t }));
  vi.stubGlobal("defineShortcuts", defineShortcuts);
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useWatch", () => ({}));
  host = document.createElement("div");
  document.body.append(host);
  window.localStorage.clear();
  markPageRead();
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  live?.dispose();
  live = undefined;
  setCurrentPageLive(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("on a page without live", () => {
  it("shows when the page was read, and a refresh button", async () => {
    await mountToolbar();
    expect(host.querySelector(".dms-live-toggle")).toBeNull();
    expect(status()?.textContent).toContain("dms.live.updated_seconds:0");
    expect(refreshButton()?.getAttribute("aria-label")).toBe(
      "dms.live.refresh",
    );

    vi.advanceTimersByTime(65_000);
    await nextTick();
    expect(status()?.textContent).toContain("dms.live.updated_minutes:1");
  });

  it("reads the page again on refresh, and counts from there", async () => {
    let resolveRead!: () => void;
    const stop = onPageBlocksRefresh((event) =>
      waitForPageBlocksRefresh(
        event,
        new Promise<void>((resolve) => (resolveRead = resolve)),
      ),
    );
    await mountToolbar();
    vi.advanceTimersByTime(30_000);
    await nextTick();
    expect(status()?.textContent).toContain("dms.live.updated_seconds:30");

    refreshButton()?.click();
    expect(resolveRead).toBeTypeOf("function");
    resolveRead();
    await flushPromises();
    expect(status()?.textContent).toContain("dms.live.updated_seconds:0");
    stop();
  });

  it("leaves out what it is asked to", async () => {
    await mountToolbar({ toolbar: { refresh: false } });
    expect(refreshButton()).toBeNull();
    expect(status()?.textContent).toContain("dms.live.updated_seconds:0");
    app?.unmount();

    await mountToolbar({ toolbar: { showUpdatedAt: false } });
    expect(status()?.textContent).not.toContain("dms.live.updated");
    expect(refreshButton()).not.toBeNull();
    app?.unmount();

    await mountToolbar({ toolbar: { showUpdatedAt: false, refresh: false } });
    expect(status()).toBeNull();
  });
});

describe("on a live page", () => {
  it("leaves the updated label to its live toggle", async () => {
    installLive();
    await mountToolbar();
    expect(host.querySelector(".dms-live-toggle")).not.toBeNull();
    expect(status()).toBeNull();
    expect(host.textContent).toContain("dms.live.updated_seconds:0");
  });

  it("shows it itself without a toggle, from the page's live clock", async () => {
    installLive();
    await mountToolbar({ toggle: false });
    expect(status()?.textContent).toContain("dms.live.updated_seconds:0");
  });

  it("draws its toggle at its size, unless the toggle sets one", async () => {
    installLive();
    await mountToolbar({ toolbar: { size: "md" } });
    const pill = () =>
      host.querySelector<HTMLButtonElement>('button[data-value="direct"]');
    expect(pill()?.className).toContain("text-[13px]");
    app?.unmount();

    await mountToolbar({ toolbar: { size: "md" }, toggle: { size: "xs" } });
    expect(pill()?.className).toContain("text-[11px]");
  });
});

describe("the page's read clock", () => {
  it("moves when a block reads outside a live gate", () => {
    const refresh = vi.fn();
    const gate = useLiveGate(refresh);
    const before = pageReadAt.value ?? 0;
    vi.advanceTimersByTime(5_000);
    gate.trigger({ type: "updated" });
    expect(refresh).toHaveBeenCalledOnce();
    expect(pageReadAt.value).toBe(before + 5_000);
  });

  it("moves once refreshPageBlocks() is done", async () => {
    const before = pageReadAt.value ?? 0;
    vi.advanceTimersByTime(2_000);
    await refreshPageBlocks();
    expect(pageReadAt.value).toBe(before + 2_000);
  });
});

it("gives every preset but custom a short code", () => {
  const missing = PERIOD_PRESETS.filter(
    (preset) => preset !== "custom" && !PRESET_SHORT_LABELS[preset],
  );
  expect(missing).toEqual([]);
  expect(PRESET_SHORT_LABELS.all).toBe("ALL");
});
