// @vitest-environment jsdom
/**
 * The LiveToggle block: Direct / Pause as a two-segment toggle, "updated N s
 * ago" counted every second in the browser, L switching the page outside a
 * text field, and nothing at all on a page without `live`.
 */
import { createApp, h, nextTick, type App } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineShortcuts } from "@nuxt/ui/runtime/composables/defineShortcuts.js";
import {
  createPageLiveController,
  type PageLiveController,
} from "../layers/dms-ui/app/build/composables/live/pageLiveController";
import { setCurrentPageLive } from "../layers/dms-ui/app/build/composables/live/currentPageLive";
import { formatElapsed } from "../layers/dms-ui/app/build/composables/live/formatElapsed";

let app: App | undefined;
let host: HTMLDivElement;
let live: PageLiveController | undefined;

const t = (key: string, params?: { count?: number }) =>
  params?.count === undefined ? key : `${key}:${params.count}`;

async function createToggle(
  target: HTMLElement,
  props: Record<string, unknown> = {},
): Promise<App> {
  const { default: LiveToggleBlock } = await import(
    "../layers/dms-ui/app/components/blocks/LiveToggleBlock.vue"
  );
  const toggle = createApp({
    render: () =>
      h(LiveToggleBlock, { componentId: "live", pageId: "api.logs", ...props }),
  });
  toggle.component("UIcon", () => h("i"));
  toggle.mount(target);
  await nextTick();
  return toggle;
}

async function mountToggle(props: Record<string, unknown> = {}) {
  app = await createToggle(host, props);
}

const segment = (value: string) =>
  host.querySelector<HTMLButtonElement>(
    `[role="radio"][data-value="${value}"]`,
  ) ??
  [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
    (button) => button.textContent?.includes(`dms.live.${value}`),
  );

const pressL = (target: EventTarget = document) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: "l", bubbles: true }),
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("useI18n", () => ({ t }));
  vi.stubGlobal("defineShortcuts", defineShortcuts);
  host = document.createElement("div");
  document.body.append(host);
  window.localStorage.clear();
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

function installLive() {
  live = createPageLiveController("api.logs", { maxRate: 2 });
  setCurrentPageLive(live);
  return live;
}

it("renders nothing on a page without live", async () => {
  await mountToggle();
  expect(host.querySelector(".dms-live-toggle")).toBeNull();
});

it("shows the page's state and switches it", async () => {
  const controller = installLive();
  await mountToggle();
  expect(segment("direct")?.getAttribute("aria-checked")).toBe("true");

  segment("pause")?.click();
  await nextTick();
  expect(controller.isPaused.value).toBe(true);
  expect(segment("pause")?.getAttribute("aria-checked")).toBe("true");

  segment("direct")?.click();
  await nextTick();
  expect(controller.isPaused.value).toBe(false);
});

it("counts the seconds since the last update, every second", async () => {
  installLive();
  await mountToggle();
  expect(host.textContent).toContain("dms.live.updated_seconds:0");

  vi.advanceTimersByTime(3000);
  await nextTick();
  expect(host.textContent).toContain("dms.live.updated_seconds:3");

  vi.advanceTimersByTime(60_000);
  await nextTick();
  expect(host.textContent).toContain("dms.live.updated_minutes:1");
});

it("hides the time when asked to", async () => {
  installLive();
  await mountToggle({ showUpdatedAt: false });
  expect(host.textContent).not.toContain("dms.live.updated");
});

it("switches on L, but not while typing", async () => {
  const controller = installLive();
  await mountToggle();

  pressL();
  expect(controller.isPaused.value).toBe(true);
  pressL();
  expect(controller.isPaused.value).toBe(false);

  const field = document.createElement("input");
  document.body.append(field);
  field.focus();
  await nextTick();
  pressL(field);
  expect(controller.isPaused.value).toBe(false);
  field.remove();
});

it("reads elapsed times in seconds, minutes, then hours", () => {
  expect(formatElapsed(-5)).toEqual({ unit: "seconds", count: 0 });
  expect(formatElapsed(59_999)).toEqual({ unit: "seconds", count: 59 });
  expect(formatElapsed(60_000)).toEqual({ unit: "minutes", count: 1 });
  expect(formatElapsed(2 * 3_600_000 + 1)).toEqual({ unit: "hours", count: 2 });
});

it("switches once per L with two toggles on the page", async () => {
  const controller = installLive();
  await mountToggle();
  const second = await createToggle(document.createElement("div"));

  pressL();
  expect(controller.isPaused.value).toBe(true);

  app?.unmount();
  app = undefined;
  pressL();
  expect(controller.isPaused.value).toBe(false);
  second.unmount();
});
