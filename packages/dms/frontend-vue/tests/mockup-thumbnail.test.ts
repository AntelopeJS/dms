/** @vitest-environment jsdom */
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  parsePreviewMessage,
  PREVIEW_CHANNEL,
  type PreviewInboundMessage,
} from "../layers/dms-ui/app/entries/utils/blockPreview";
import {
  resizeAll,
  scrollAllIntoView,
  stubObservers,
} from "./helpers/fake-observers";
import { flush, mockupPage, mockupState } from "./helpers/mockup-runtime";

const BAND_WIDTH_PX = 320;

const { default: MockupThumbnail } = await import(
  "../layers/dms-ui/app/entries/mockups/MockupThumbnail"
);

let app: App | undefined;
let host: HTMLElement;
const authFetch = vi.fn();

beforeEach(() => {
  stubObservers();
  authFetch.mockReset();
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key} ${Object.values(params).join(",")}` : key,
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
});

afterEach(() => {
  app?.unmount();
  host.remove();
  app = undefined;
  vi.unstubAllGlobals();
});

async function mountThumbnail(): Promise<HTMLElement> {
  host = document.createElement("div");
  document.body.append(host);
  app = createApp(MockupThumbnail, { name: "demo-mockup" });
  app.component("UIcon", defineComponent({ setup: () => () => h("span") }));
  app.mount(host);
  await flush();
  resizeAll(BAND_WIDTH_PX);
  await flush();
  return host;
}

async function scrollIntoView(): Promise<void> {
  scrollAllIntoView();
  await flush();
}

/**
 * Fails an implementation that reads every mockup on mount, so a page of fifty
 * cards fetches and draws fifty previews before any is on screen.
 */
it("reads nothing until the band scrolls into view", async () => {
  authFetch.mockResolvedValue(mockupState());
  const root = await mountThumbnail();

  expect(authFetch).not.toHaveBeenCalled();
  expect(root.querySelector("iframe")).toBeNull();

  await scrollIntoView();

  expect(authFetch).toHaveBeenCalledTimes(1);
  expect(authFetch).toHaveBeenCalledWith("/api/mockup/demo-mockup");
});

/**
 * Fails an implementation that draws the frame at the band's width (so the
 * page lays out as on a phone), leaves it clickable or focusable, exposes it
 * to a screen reader, hands the preview something other than the first
 * page's tree, or posts a reactive proxy that a browser cannot clone into the
 * frame (a deep `ref` over the mockup state).
 */
it("draws the first page in an inert /dms-preview frame at desktop width scaled to the band", async () => {
  authFetch.mockResolvedValue(
    mockupState({
      pages: [
        mockupPage(),
        mockupPage({ id: "second", tree: [{ type: "Other" }] }),
      ],
    }),
  );
  const root = await mountThumbnail();
  await scrollIntoView();

  const iframe = root.querySelector("iframe");
  const frameWindow = iframe?.contentWindow;
  if (!iframe || !frameWindow) throw new Error("no frame was drawn");
  const stage = iframe.parentElement;
  const posted: PreviewInboundMessage[] = [];
  vi.spyOn(frameWindow, "postMessage").mockImplementation((message) => {
    const parsed = parsePreviewMessage(structuredClone(message));
    if (parsed) posted.push(parsed);
  });
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { channel: PREVIEW_CHANNEL, type: "ready" },
      source: frameWindow,
    }),
  );
  await flush();

  expect(iframe.getAttribute("src")).toBe("/dms-preview");
  expect(iframe.getAttribute("tabindex")).toBe("-1");
  expect(iframe.getAttribute("aria-hidden")).toBe("true");
  expect(stage?.classList.contains("pointer-events-none")).toBe(true);
  expect(stage?.style.width).toBe("1280px");
  expect(stage?.style.transform).toBe(`scale(${BAND_WIDTH_PX / 1280})`);
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({
    type: "render",
    theme: "dark",
    tree: [{ type: "KpiCard" }],
  });
});

/**
 * Fails an implementation that throws or leaves an empty frame when the
 * mockup cannot be read, or draws a frame for a spec that compiled no page.
 */
it("leaves a placeholder and no frame when the mockup cannot be read or has no page", async () => {
  authFetch.mockRejectedValue(new Error("offline"));
  const failed = await mountThumbnail();
  await scrollIntoView();

  expect(failed.querySelector("iframe")).toBeNull();
  expect(
    failed.querySelector("[data-dms-mockup-thumbnail-placeholder]"),
  ).not.toBeNull();
  app?.unmount();
  host.remove();
  stubObservers();

  authFetch.mockResolvedValue(
    mockupState({
      pages: [],
      issues: [{ path: "", message: "Unreadable JSON" }],
    }),
  );
  const empty = await mountThumbnail();
  await scrollIntoView();

  expect(empty.querySelector("iframe")).toBeNull();
  expect(
    empty.querySelector("[data-dms-mockup-thumbnail-placeholder]"),
  ).not.toBeNull();
});
