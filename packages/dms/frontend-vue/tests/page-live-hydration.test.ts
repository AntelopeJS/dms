/** @vitest-environment jsdom */
/**
 * `usePageLive` while a component hydrates. The server renders a live page
 * with no controller: it knows the page declares `live`, and reads it as
 * live, not polling, never read. In the browser the page installs its
 * controller and reads its data before the async components of the page
 * hydrate, so one of them reading the controller at once rendered "Polling"
 * and "just now" over the server's "Direct" and "—": a hydration mismatch in
 * any component showing the live state (the playground's live health card,
 * dms-api's health hero on a page reloaded paused) unless it waited for its
 * own mount, as the live toggle and dms-api's live traffic do.
 */
import {
  computed,
  defineComponent,
  h,
  nextTick,
  shallowRef,
  type Component,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  provideServerPageLive,
  setCurrentPageLive,
} from "../layers/dms-ui/app/build/composables/live/currentPageLive";
import type { PageLiveController } from "../layers/dms-ui/app/build/composables/live/pageLiveController";
import { usePageLive } from "../layers/dms-ui/app/composables/live/usePageLive";
import {
  engine,
  hydrate,
  mountInBrowser,
  serverRender,
} from "./helpers/api-data-runtime";

const LiveState = defineComponent({
  setup() {
    const live = usePageLive();
    return () =>
      h("p", [
        h("span", live.isEnabled.value ? "enabled" : "off"),
        h("span", live.isPolling.value ? "Polling" : "Direct"),
        h("span", live.lastUpdatedAt.value === null ? "—" : "read"),
      ]);
  },
});

/** A live page as the page renderer renders it on the server. */
const ServerLivePage = defineComponent({
  setup() {
    provideServerPageLive(() => true);
    return () => h(LiveState);
  },
});

/** A page's controller as the browser has it once the page has read once. */
function pollingController(): PageLiveController {
  const value = <T>(initial: T) => computed(() => shallowRef(initial).value);
  return {
    isPaused: value(false),
    pauseReason: value(null),
    lastUpdatedAt: value(Date.now()),
    missedCount: value(0),
    missedDetail: value(null),
    isPolling: value(true),
  } as unknown as PageLiveController;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("isDmsHydrating", engine.isDmsHydrating);
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  setCurrentPageLive(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/**
 * Renders as the server does, with its runtime: no `window`, so no controller
 * can be set.
 */
async function renderOnServer(component: Component) {
  const browserWindow = globalThis.window;
  vi.stubGlobal("window", undefined);
  try {
    return await serverRender(component);
  } finally {
    vi.stubGlobal("window", browserWindow);
  }
}

function hydrationWarnings(): string[] {
  return warn.mock.calls
    .map((call) => String(call[0]))
    .filter((message) => /hydration/i.test(message));
}

describe("usePageLive in a hydrating component", () => {
  it("reads the server's state until the component is mounted", async () => {
    const { html, payload } = await renderOnServer(ServerLivePage);
    expect(html).toBe(
      "<p><span>enabled</span><span>Direct</span><span>—</span></p>",
    );

    setCurrentPageLive(pollingController());
    const { app, container } = hydrate(LiveState, html, payload);

    expect(hydrationWarnings()).toEqual([]);
    await nextTick();
    expect(container.textContent).toBe("enabledPollingread");
    app.unmount();
  });

  it("reads the page's state at once in a component mounted afresh", () => {
    setCurrentPageLive(pollingController());
    const { app, container } = mountInBrowser(LiveState);
    expect(container.textContent).toBe("enabledPollingread");
    app.unmount();
  });
});
