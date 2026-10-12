// @vitest-environment jsdom
/**
 * The LiveToggle block: Direct / Pause as a two-segment toggle, "updated N s
 * ago" counted every second in the browser, L switching the page outside a
 * text field, and nothing at all on a page without `live`.
 */
import { createApp, h, nextTick, type App } from "vue";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePageLive } from "../layers/dms-ui/app/composables/live/usePageLive";
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
  toggle.component("UButton", (buttonProps: { label?: string }, { attrs }) =>
    h("button", { ...attrs, type: "button" }, buttonProps.label),
  );
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

describe("the pill variant and the paused state", () => {
  const pill = (value: string) =>
    host.querySelector<HTMLButtonElement>(`button[data-value="${value}"]`);
  const resumeButton = () =>
    host.querySelector<HTMLButtonElement>('[data-action="resume"]');

  it("draws a Live pill with a pulsing dot beside Pause", async () => {
    installLive();
    await mountToggle({ variant: "pill" });
    expect(pill("direct")?.getAttribute("aria-pressed")).toBe("true");
    expect(pill("direct")?.textContent).toContain("dms.live.direct");
    expect(host.querySelector(".dms-live-toggle__dot")?.className).toContain(
      "animate-pulse",
    );
    expect(host.textContent).toContain("dms.live.updated_seconds:0");
    expect(resumeButton()).toBeNull();

    pill("pause")?.click();
    await nextTick();
    expect(live?.isPaused.value).toBe(true);
    expect(resumeButton()).not.toBeNull();

    resumeButton()?.click();
    await nextTick();
    expect(live?.isPaused.value).toBe(false);
  });

  it("says what was missed, with the module's label and breakdown", async () => {
    const controller = installLive();
    await mountToggle({
      variant: "pill",
      missedLabel: "$api.live.new_requests",
    });
    controller.pause();
    const block = controller.subscribe(() => {});
    block.trigger({ topic: "api", payload: { count: 40 } });
    usePageLive().setMissedDetail({
      text: "$api.live.in_5xx",
      params: { count: 2 },
      tone: "error",
    });
    await nextTick();

    const status = host.querySelector(".dms-live-toggle__status");
    expect(status?.textContent).toContain(
      "dms.live.paused · api.live.new_requests:40",
    );
    expect(status?.querySelector(".text-error")?.textContent).toContain(
      "api.live.in_5xx:2",
    );
  });

  it("names the reason a component holds the page for", async () => {
    installLive();
    await mountToggle();
    usePageLive().hold("$api.live.typing_in_tester");
    await nextTick();
    expect(host.textContent).toContain(
      "dms.live.paused · api.live.typing_in_tester",
    );
    expect(host.textContent).not.toContain("dms.live.updated");
  });

  it("reads Live in en-GB, Direct in fr-FR", () => {
    const locale = (name: string) =>
      JSON.parse(
        readFileSync(
          resolve(__dirname, `../layers/dms-ui/i18n/locales/ui-${name}.json`),
          "utf8",
        ),
      ).dms.live;
    expect(locale("en-GB").direct).toBe("Live");
    expect(locale("fr-FR").direct).toBe("Direct");
    for (const key of ["paused", "resume", "reason_hidden", "polling"]) {
      expect(locale("en-GB")[key]).toBeTruthy();
      expect(locale("fr-FR")[key]).toBeTruthy();
    }
  });
});
