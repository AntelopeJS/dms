// @vitest-environment jsdom
/**
 * The header bell's counts as the dashboard frame reads them with the page,
 * through the runtime's real async data: a server render shows the badge,
 * and the browser's bell, and whatever else shows the counts, start from the
 * same counts without asking again. A signed-out visit reads nothing.
 */
import { defineComponent, h, nextTick, ref, type App } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  hydrate,
  mountInBrowser,
  serverRender,
  stubApiData,
} from "./helpers/api-data-runtime";

const COUNTS = { all: 5, unread: 3, unreadTone: "warning" };
const authFetch = vi.fn(async () => structuredClone(COUNTS));
const loggedIn = ref(true);
const mounted: App[] = [];

stubApiData(authFetch as never);
vi.stubGlobal("useDmsUserSession", () => ({ loggedIn }));
vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent: vi.fn() }));
const { useNotifications, useRenderedBellCounts } = await import(
  "../layers/dms-layout/app/composables/notification/useNotifications"
);
vi.stubGlobal("useNotifications", useNotifications);

/** The bell's badge, or the profile's summary: the shared counts. */
const Counts = defineComponent({
  setup() {
    const { unreadCount, unreadTone, areCountsLoaded } = useNotifications();
    return () =>
      h(
        "span",
        areCountsLoaded.value
          ? `${unreadCount.value}:${unreadTone.value}`
          : "unknown",
      );
  },
});
// As the dashboard frame: in the persistent layout, outside the page's
// <Suspense>, around the header and the page.
const Frame = defineComponent({
  setup() {
    useRenderedBellCounts();
    return () => h("div", [h(Counts), h(Counts)]);
  },
});

beforeEach(() => {
  loggedIn.value = true;
  authFetch.mockClear();
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.unstubAllEnvs();
});

it("renders the bell's counts on the server, and the browser starts from them without asking", async () => {
  vi.stubEnv("SSR", true);
  const { html, payload } = await serverRender(Frame);
  vi.stubEnv("SSR", false);
  expect(html).toBe("<div><span>3:warning</span><span>3:warning</span></div>");
  expect(authFetch).toHaveBeenCalledTimes(1);

  authFetch.mockClear();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { app, container } = hydrate(Frame, html, payload);
  mounted.push(app);
  await nextTick();
  await new Promise((done) => setTimeout(done, 0));
  expect(authFetch).not.toHaveBeenCalled();
  expect(container.innerHTML).toBe(html);
  expect(warn.mock.calls.flat().join(" ")).not.toMatch(/hydration/i);
  warn.mockRestore();
});

it("reads nothing for a signed-out visit", async () => {
  loggedIn.value = false;
  const { app, container } = mountInBrowser(Frame);
  mounted.push(app);
  await nextTick();
  expect(authFetch).not.toHaveBeenCalled();
  expect(container.textContent).toBe("unknownunknown");
});
