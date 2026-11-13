/** @vitest-environment jsdom */
import "./helpers/table-runtime";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import { createI18n } from "vue-i18n";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import en from "../layers/dms-ui/app/entries/i18n/locales/ui-en-GB.json";
import { scrollAllIntoView, stubObservers } from "./helpers/fake-observers";

const { default: MockupCards } = await import(
  "../layers/dms-ui/app/entries/mockups/MockupCards"
);

const i18n = createI18n({
  legacy: false,
  locale: "en",
  messages: { en },
});

const UPDATED = "2026-11-13T10:00:00.000Z";

const built = {
  name: "bike-rental",
  title: "Bike rental",
  pages: 3,
  openComments: 0,
  source: "claude-code",
  updatedAt: UPDATED,
  status: "built",
  builtAt: UPDATED,
  builtPages: [
    { path: "/bikes", title: "Bikes" },
    { path: "/bikes/new", title: "/bikes/new" },
  ],
};

const draft = {
  name: "stations-map",
  pages: 1,
  openComments: 2,
  source: "chat",
  updatedAt: UPDATED,
  status: "draft",
};

const bare = {
  name: "staff-planning",
  title: "Staff planning",
  pages: 2,
  openComments: 0,
  updatedAt: UPDATED,
  status: "draft",
};

const DmsLink = defineComponent({
  props: { to: String },
  setup:
    (props, { slots, attrs }) =>
    () =>
      h("a", { ...attrs, href: props.to }, slots.default?.()),
});

const UBadge = defineComponent({
  props: { color: String },
  setup:
    (props, { slots, attrs }) =>
    () =>
      h("span", { ...attrs, "data-color": props.color }, slots.default?.()),
});

let app: App | undefined;
let host: HTMLElement;

const authFetch = vi.fn();

beforeEach(() => {
  stubObservers();
  authFetch.mockReset();
  authFetch.mockResolvedValue({ pages: [] });
  vi.stubGlobal("useI18n", () => i18n.global);
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
});

afterEach(() => {
  app?.unmount();
  host.remove();
  app = undefined;
  vi.unstubAllGlobals();
});

async function mountCards(
  items: unknown[],
  context: Record<string, unknown> = {},
): Promise<HTMLElement> {
  host = document.createElement("div");
  document.body.append(host);
  app = createApp(MockupCards, {
    context: { items, firstPageLoading: false, ...context },
  });
  app.component("DmsLink", DmsLink);
  app.component("UBadge", UBadge);
  app.component("USkeleton", defineComponent({ setup: () => () => h("i") }));
  app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
  app.mount(host);
  await nextTick();
  return host;
}

const card = (root: HTMLElement, name: string) => {
  const found = root.querySelector(`[data-dms-mockup-card="${name}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`no card for ${name}`);
  return found;
};

const text = (root: ParentNode, selector: string) =>
  root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();

/**
 * Fails an implementation that derives the status from the page count or the
 * source instead of the row's `status`, or that colours Draft like Built.
 */
it("badges a built mockup Built in the success colour and a draft Draft in the neutral one", async () => {
  const root = await mountCards([built, draft, bare]);

  expect(text(card(root, "staff-planning"), "[data-dms-mockup-status]")).toBe(
    "Draft",
  );
  expect(
    card(root, "staff-planning")
      .querySelector("[data-dms-mockup-status]")
      ?.getAttribute("data-color"),
  ).toBe("neutral");
  expect(text(card(root, "bike-rental"), "[data-dms-mockup-status]")).toBe(
    "Built",
  );
  expect(
    card(root, "bike-rental")
      .querySelector("[data-dms-mockup-status]")
      ?.getAttribute("data-color"),
  ).toBe("success");
  expect(text(card(root, "stations-map"), "[data-dms-mockup-status]")).toBe(
    "Draft",
  );
  expect(
    card(root, "stations-map")
      .querySelector("[data-dms-mockup-status]")
      ?.getAttribute("data-color"),
  ).toBe("neutral");
});

/**
 * Fails an implementation that prints every part even when absent ("0 open
 * comments", "from undefined"), forgets to pluralise "1 page", or reads the
 * comment count from the wrong field.
 */
it("writes the meta line from the parts a mockup has, pluralised", async () => {
  const root = await mountCards([built, draft, bare]);

  expect(text(card(root, "bike-rental"), "[data-dms-mockup-meta]")).toBe(
    "3 pages · from Claude Code",
  );
  expect(text(card(root, "stations-map"), "[data-dms-mockup-meta]")).toBe(
    "1 page · from the chat · 2 open comments",
  );
  expect(text(card(root, "staff-planning"), "[data-dms-mockup-meta]")).toBe(
    "2 pages",
  );
});

/**
 * Fails an implementation that titles a card with its name when it has a
 * title, or leaves an untitled card without any.
 */
it("titles a card with its title, or its name when it has none", async () => {
  const root = await mountCards([built, draft]);

  expect(text(card(root, "bike-rental"), "[data-dms-mockup-open]")).toBe(
    "Bike rental",
  );
  expect(text(card(root, "stations-map"), "[data-dms-mockup-open]")).toBe(
    "stations-map",
  );
});

/**
 * Fails an implementation that links a built page by its title, lists pages
 * for a draft, or nests the page links inside the card's own link (an anchor
 * in an anchor, which the browser cannot make separately clickable).
 */
it("links each built page by its stored path, the card to its viewer, and a draft to no page", async () => {
  const root = await mountCards([built, draft]);

  const pages = [
    ...card(root, "bike-rental").querySelectorAll("[data-dms-mockup-page]"),
  ];
  expect(
    pages.map((link) => [link.textContent?.trim(), link.getAttribute("href")]),
  ).toEqual([
    ["Bikes", "/bikes"],
    ["/bikes/new", "/bikes/new"],
  ]);
  expect(
    pages.every((link) => link.closest("[data-dms-mockup-open]") === null),
  ).toBe(true);
  expect(
    card(root, "bike-rental")
      .querySelector("[data-dms-mockup-open]")
      ?.getAttribute("href"),
  ).toBe("/mockup?name=bike-rental");
  expect(
    card(root, "stations-map")
      .querySelector("[data-dms-mockup-open]")
      ?.getAttribute("href"),
  ).toBe("/mockup?name=stations-map");
  expect(
    card(root, "stations-map").querySelectorAll("[data-dms-mockup-page]"),
  ).toHaveLength(0);
});

/**
 * Fails an implementation that draws a link from a built page whose path left
 * the dashboard, or that lets a malformed row throw instead of skipping it.
 */
it("draws no card for a row that is not a summary, nor for a built page that leaves the dashboard", async () => {
  const leaving = {
    ...built,
    name: "leaving",
    builtPages: [{ path: "//evil.example", title: "Evil" }],
  };
  const root = await mountCards([
    built,
    leaving,
    { name: 7 },
    null,
    "desk",
    { ...draft, name: "no-count", pages: undefined },
  ]);

  expect(
    [...root.querySelectorAll("[data-dms-mockup-card]")].map((entry) =>
      entry.getAttribute("data-dms-mockup-card"),
    ),
  ).toEqual(["bike-rental"]);
  expect(root.querySelector('a[href^="//"]')).toBeNull();
});

/**
 * Fails an implementation that shows the empty state while the first answer
 * is still on its way, or a skeleton once the list is known to be empty.
 */
it("shows a skeleton while the first answer is on its way, and the empty state once it is empty", async () => {
  const loading = await mountCards([], { firstPageLoading: true });
  expect(loading.textContent).not.toContain(en.dms.table.empty_title);
  expect(loading.querySelectorAll("li").length).toBeGreaterThan(0);
  app?.unmount();
  host.remove();

  const empty = await mountCards([]);
  expect(empty.textContent).toContain(en.dms.table.empty_title);
  expect(empty.querySelector("[data-dms-mockup-card]")).toBeNull();
});

/**
 * Fails an implementation that hands every card the same thumbnail, or draws
 * a thumbnail by something other than the mockup's name.
 */
it("reads the first page of each card's own mockup once it scrolls into view", async () => {
  await mountCards([built, draft]);
  expect(authFetch).not.toHaveBeenCalled();

  scrollAllIntoView();
  await nextTick();

  expect(authFetch.mock.calls.map(([url]) => url).sort()).toEqual([
    "/api/mockup/bike-rental",
    "/api/mockup/stations-map",
  ]);
});
