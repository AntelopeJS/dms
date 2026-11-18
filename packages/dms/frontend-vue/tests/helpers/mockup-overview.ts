import { vi } from "vitest";
import {
  parsePreviewMessage,
  PREVIEW_CHANNEL,
  type PreviewInboundMessage,
  type PreviewOutboundMessage,
} from "../../layers/dms-ui/app/entries/utils/blockPreview";
import type {
  MockupAnnotation,
  MockupPageState,
} from "../../layers/dms-ui/app/entries/utils/mockup";
import {
  FakeEventSource,
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  stubMockupRuntime,
  type MockupRuntime,
  type MountedViewer,
} from "./mockup-runtime";

type SizeCallback = (entries: unknown[]) => void;

const sizeCallbacks: SizeCallback[] = [];

class FakeResizeObserver {
  constructor(callback: SizeCallback) {
    sizeCallbacks.push(callback);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** The size the browser reports for the overview's viewport. */
export const VIEWPORT = { width: 1200, height: 800 };

type WithoutChannel<Message> = Message extends unknown
  ? Omit<Message, "channel">
  : never;

/** `count` pages, each one KPI card titled after it, with ids `p1`, `p2`… or another prefix. */
export function overviewPages(count: number, prefix = "p") {
  return Array.from({ length: count }, (_, index) =>
    mockupPage({
      id: `${prefix}${index + 1}`,
      title: `Page ${index + 1}`,
      tree: [{ type: "KpiCard", options: { title: `KPI ${index + 1}` } }],
      paths: { "block-0": `/pages/${index}/tree/0` },
    }),
  );
}

/**
 * Mounts the viewer on a mockup of `count` pages, motion reduced so the camera
 * jumps where it is sent, on the URL `query`: by default its page `p1` open.
 */
export async function mountOverviewViewer(
  count: number,
  notes: MockupAnnotation[] = [],
  query: Record<string, string> = { name: "demo", page: "p1" },
  pages: MockupPageState[] = overviewPages(count),
): Promise<{ viewer: MountedViewer; runtime: MockupRuntime }> {
  sizeCallbacks.length = 0;
  const runtime = stubMockupRuntime({ notes, query });
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce"),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const viewer = await mountViewer();
  await viewer.publish("state", mockupState({ pages }));
  await viewer.say({ type: "ready" });
  return { viewer, runtime };
}

/**
 * Unmounts `viewer` and mounts a new one on the URL and the runtime it left,
 * as the dashboard rebuilds the page on a step of the browser's history.
 */
export async function remountOverviewViewer(
  viewer: MountedViewer,
  count: number,
): Promise<MountedViewer> {
  viewer.unmount();
  sizeCallbacks.length = 0;
  FakeEventSource.instances = [];
  const next = await mountViewer();
  await next.publish("state", mockupState({ pages: overviewPages(count) }));
  await next.say({ type: "ready" });
  return next;
}

function pointer(
  type: string,
  at: { x: number; y: number },
  init: MouseEventInit = {},
): MouseEvent {
  return new MouseEvent(type, {
    clientX: at.x,
    clientY: at.y,
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

type Find = (selector: string) => HTMLElement | null;
type FindAll = (selector: string) => HTMLElement[];

/** The live frames of the overview, and what their previews say and are told. */
function liveFrames(find: Find, findAll: FindAll) {
  const live = (page: string) =>
    find(`[data-dms-mockup-overview-slot="${page}"]`);
  const windowOf = (page: string): Window => {
    const target = live(page)?.querySelector("iframe")?.contentWindow;
    if (!target) throw new Error(`${page} is not drawn live`);
    return target;
  };
  const say = (
    source: Window,
    message: WithoutChannel<PreviewOutboundMessage>,
  ) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { channel: PREVIEW_CHANNEL, ...message },
        source,
      }),
    );

  return {
    live,
    /** Has every live frame's preview say it is ready, as each boots, until no new one appears. */
    bootLive: async (): Promise<void> => {
      const told = new Set<Window>();
      for (;;) {
        const fresh = findAll("[data-dms-mockup-overview-preview]").flatMap(
          (iframe) =>
            iframe instanceof HTMLIFrameElement &&
            iframe.contentWindow &&
            !told.has(iframe.contentWindow)
              ? [iframe.contentWindow]
              : [],
        );
        if (!fresh.length) return;
        for (const source of fresh) {
          told.add(source);
          say(source, { type: "ready" });
        }
        await flush();
      }
    },
    /** What the live frame of `page` posts its preview from now on. */
    spyOn: (page: string): PreviewInboundMessage[] => {
      const posted: PreviewInboundMessage[] = [];
      vi.spyOn(windowOf(page), "postMessage").mockImplementation((message) => {
        const parsed = parsePreviewMessage(message);
        if (parsed) posted.push(parsed);
      });
      return posted;
    },
    /** Has the live frame of `page` say something, as its own window. */
    sayFrom: async (
      page: string,
      message: WithoutChannel<PreviewOutboundMessage>,
    ): Promise<void> => {
      say(windowOf(page), message);
      await flush();
    },
  };
}

/** Where the canvas looks from and where each frame is on the screen, as their styles draw them. */
function canvasGeometry(find: Find) {
  function camera() {
    const style =
      find("[data-dms-mockup-overview-world]")?.style.transform ?? "";
    const [, x, y, zoom] =
      /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\) scale\(([\d.e-]+)\)/.exec(
        style,
      ) ?? [];
    return { x: Number(x), y: Number(y), zoom: Number(zoom) };
  }

  function frameRect(id: string) {
    const style = find(`[data-dms-mockup-overview-frame="${id}"]`)?.style;
    return {
      x: parseFloat(style?.left ?? "NaN"),
      y: parseFloat(style?.top ?? "NaN"),
      width: parseFloat(style?.width ?? "NaN"),
      height: parseFloat(style?.height ?? "NaN"),
    };
  }

  /** The point of the screen over `point` of the frame of `id`. */
  function onScreen(id: string, point: { x: number; y: number }) {
    const { x, y, zoom } = camera();
    const rect = frameRect(id);
    return {
      x: x + (rect.x + point.x) * zoom,
      y: y + (rect.y + point.y) * zoom,
    };
  }

  return {
    camera,
    frameRect,
    onScreen,
    isInView: (id: string) => {
      const rect = frameRect(id);
      const topLeft = onScreen(id, { x: 0, y: 0 });
      const bottomRight = onScreen(id, { x: rect.width, y: rect.height });
      return (
        topLeft.x >= 0 &&
        topLeft.y >= 0 &&
        bottomRight.x <= VIEWPORT.width &&
        bottomRight.y <= VIEWPORT.height
      );
    },
  };
}

/** Drives the overview of the viewer `current` returns, and reads it back. */
export function overviewDriver(current: () => MountedViewer) {
  const find: Find = (selector) =>
    current().host.querySelector<HTMLElement>(selector);
  const findAll: FindAll = (selector) => [
    ...current().host.querySelectorAll<HTMLElement>(selector),
  ];
  const overview = () => find("[data-dms-mockup-overview]");
  const frames = liveFrames(find, findAll);

  async function measure(): Promise<void> {
    for (const callback of sizeCallbacks) {
      callback([{ contentRect: VIEWPORT }]);
    }
    await flush();
  }

  /** Presses a key where the focus is, Space on the window; true when the viewer held back the browser's own action. */
  async function press(key: string, init: KeyboardEventInit = {}) {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    (init.code === "Space"
      ? window
      : (document.activeElement ?? window)
    ).dispatchEvent(event);
    await flush();
    return event.defaultPrevented;
  }

  return {
    ...frames,
    ...canvasGeometry(find),
    find,
    findAll,
    overview,
    press,
    pointer,
    /**
     * Closes the page with its ✕, back to the Overview, has the browser report
     * its viewport's size, as it does once it is drawn, and boots its live
     * frames unless told not to.
     */
    openOverview: async (options: { boot?: boolean } = {}): Promise<void> => {
      find("[data-dms-mockup-close-page]")?.click();
      await flush();
      await measure();
      if (options.boot ?? true) await frames.bootLive();
    },
    /** Has the browser report the Overview's viewport size, as it does once the Overview is drawn. */
    measure,
    frameIds: () =>
      findAll("[data-dms-mockup-overview-frame]").map((frame) =>
        frame.getAttribute("data-dms-mockup-overview-frame"),
      ),
    wheel: async (init: WheelEventInit): Promise<void> => {
      overview()?.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init }),
      );
      await flush();
    },
    click: async (selector: string): Promise<void> => {
      find(selector)?.click();
      await flush();
    },
  };
}
