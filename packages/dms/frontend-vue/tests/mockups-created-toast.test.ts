/**
 * A mockup that gets created opens by itself from the Mockups page, and is
 * offered in a toast from anywhere else.
 */
import { computed, nextTick, reactive, ref } from "vue";
import { createI18n } from "vue-i18n";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import en from "../layers/dms-layout/app/entries/i18n/locales/layout-en-GB.json";
import fr from "../layers/dms-layout/app/entries/i18n/locales/layout-fr-FR.json";
import { dmsAppContext, emptyApp } from "./fixtures/dmsAppContext";

const BASE = "http://backend.test";
const REOPEN_WAIT_MS = 2500;

class FakeEventSource {
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 1;
  private readonly listeners = new Map<string, Array<(event: Event) => void>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  send(data: string): void {
    const event = new MessageEvent("created", { data });
    for (const listener of this.listeners.get("created") ?? []) {
      listener(event);
    }
  }

  refuse(): void {
    this.readyState = FakeEventSource.CLOSED;
    for (const listener of this.listeners.get("error") ?? []) {
      listener(new Event("error"));
    }
  }
}

interface RaisedToast {
  title: string;
  actions: Array<{ label: string; onClick: () => void }>;
}

/** Fresh for each test, so a plugin set up by an earlier one watches state nobody changes. */
let route = reactive({ path: "/mockups" });
let isOwner = ref(true);
const locale = ref<"en" | "fr">("en");
const push = vi.fn(async () => undefined);
const toasts: RaisedToast[] = [];

const i18n = createI18n({
  legacy: false,
  locale: "en",
  fallbackLocale: "en",
  messages: { en, fr },
});

/** Stubs what the plugin reads from the dashboard, after the suite's own setup has stubbed its. */
function stubDashboard(): void {
  vi.stubGlobal("defineDmsPlugin", <T>(setup: T) => setup);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { baseURL: `${BASE}/` } },
  }));
  vi.stubGlobal("useIsOwner", () => isOwner);
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useDmsRouter", () => ({ push }));
  vi.stubGlobal("useToast", () => ({
    add: (toast: RaisedToast) => toasts.push(toast),
  }));
  vi.stubGlobal("getAppTranslation", () => ({
    t: (key: string, params?: Record<string, string>) =>
      i18n.global.t(key, params ?? {}, { locale: locale.value }),
  }));
  vi.stubGlobal("EventSource", FakeEventSource);
}

stubDashboard();

const { default: plugin } = await import(
  "../layers/dms-layout/app/entries/mockups/created-toast"
);

function latestSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error("No stream was opened");
  return source;
}

beforeEach(async () => {
  FakeEventSource.instances = [];
  toasts.length = 0;
  push.mockClear();
  route = reactive({ path: "/mockups" });
  isOwner = ref(true);
  locale.value = "en";
  stubDashboard();
  await plugin(dmsAppContext(emptyApp()));
});

afterEach(() => {
  vi.useRealTimers();
});

const created = (name: string, title?: string) =>
  JSON.stringify(title === undefined ? { name } : { name, title });

/**
 * Fails an implementation that toasts from the Mockups page, or that opens
 * the stream somewhere other than the created-mockups endpoint.
 */
it("opens the viewer of a mockup created while the Mockups page is shown, with no toast", () => {
  expect(latestSource().url).toBe(`${BASE}/api/mockup/events/created`);

  latestSource().send(created("orders", "Orders desk"));

  expect(push).toHaveBeenCalledExactlyOnceWith("/mockup?name=orders");
  expect(toasts).toEqual([]);
});

/**
 * Fails an implementation that navigates from any page: it would pull the
 * user out of what they are doing.
 */
it("offers a mockup created anywhere else in a toast with an Open action, and moves nowhere until it is used", () => {
  route.path = "/orders";

  latestSource().send(created("orders", "Orders desk"));

  expect(push).not.toHaveBeenCalled();
  expect(toasts).toHaveLength(1);
  expect(toasts[0].title).toBe('Mockup "Orders desk" created');
  expect(toasts[0].actions.map(({ label }) => label)).toEqual(["Open"]);

  toasts[0].actions[0].onClick();

  expect(push).toHaveBeenCalledExactlyOnceWith("/mockup?name=orders");
});

/**
 * Fails an implementation that reads the page once, when the plugin starts,
 * instead of when the mockup arrives: the user left the page in the meantime.
 */
it("toasts instead of navigating when the user left the Mockups page before the mockup was created", () => {
  route.path = "/orders";

  latestSource().send(created("later"));

  expect(push).not.toHaveBeenCalled();
  expect(toasts[0].title).toBe('Mockup "later" created');
});

it("reads the Mockups page with a trailing slash too, and names the mockup by its folder when its spec has no title", () => {
  route.path = "/mockups/";
  latestSource().send(created("untitled"));
  route.path = "/dashboard";
  latestSource().send(created("second"));

  expect(push).toHaveBeenCalledExactlyOnceWith("/mockup?name=untitled");
  expect(toasts[0].title).toBe('Mockup "second" created');
});

it("writes the toast in the viewer's language", () => {
  locale.value = "fr";
  route.path = "/orders";

  latestSource().send(created("orders", "Commandes"));

  expect(toasts[0].title).toBe("Maquette « Commandes » créée");
  expect(toasts[0].actions[0].label).toBe("Ouvrir");
});

it("encodes the mockup's name in the viewer's path and ignores an event that names none", () => {
  latestSource().send(created("a b&c"));
  latestSource().send("not json");
  latestSource().send(JSON.stringify({ title: "No name" }));
  latestSource().send(JSON.stringify({ name: 3 }));

  expect(push).toHaveBeenCalledExactlyOnceWith("/mockup?name=a%20b%26c");
  expect(toasts).toEqual([]);
});

/**
 * Fails an implementation that streams for any user: only the platform owner
 * reaches the mockup API.
 */
it("streams only while the viewer owns the platform", async () => {
  const first = latestSource();

  isOwner.value = false;
  await nextTick();
  expect(first.readyState).toBe(FakeEventSource.CLOSED);
  const opened = FakeEventSource.instances.length;

  isOwner.value = true;
  await nextTick();
  expect(FakeEventSource.instances).toHaveLength(opened + 1);
  expect(latestSource().readyState).toBe(1);
});

it("opens no stream for a viewer who is not the owner", async () => {
  FakeEventSource.instances = [];
  isOwner = ref(false);

  await plugin(dmsAppContext(emptyApp()));

  expect(FakeEventSource.instances).toEqual([]);
});

it("opens the stream again after the backend refused it", () => {
  vi.useFakeTimers();
  const first = latestSource();

  first.refuse();
  vi.advanceTimersByTime(REOPEN_WAIT_MS);

  expect(FakeEventSource.instances.length).toBeGreaterThan(1);
  expect(latestSource()).not.toBe(first);
});
