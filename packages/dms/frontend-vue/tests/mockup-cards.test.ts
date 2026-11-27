// @vitest-environment jsdom
import { nextTick } from "vue";
import { expect, it, vi } from "vitest";
import { scrollAllIntoView } from "./helpers/fake-observers";
import {
  authFetch,
  built,
  card,
  draft,
  bare,
  en,
  mountCards,
  navigateTo,
  partial,
  text,
  UPDATED,
  unmountCards,
} from "./helpers/mockup-cards-runtime";

it("badges a draft Draft, a mockup built into only some pages with its progress, and a fully built one Built (fails on a status derived from the source instead of the row's `status`, pages a build left out counted as built, or Draft coloured like Built)", async () => {
  const root = await mountCards([built, draft, bare, partial]);

  expect(text(card(root, "bike-partial"), "[data-dms-mockup-status]")).toBe(
    "2 of 5 pages built",
  );
  expect(
    card(root, "bike-partial")
      .querySelector("[data-dms-mockup-status]")
      ?.getAttribute("data-color"),
  ).toBe("info");

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

it('writes the meta line from the parts a mockup has, pluralised (fails on printing an absent part as "from undefined", or "1 page" left unpluralised)', async () => {
  const root = await mountCards([built, draft, bare]);

  expect(text(card(root, "bike-rental"), "[data-dms-mockup-meta]")).toBe(
    "2 pages · from Claude Code",
  );
  expect(text(card(root, "stations-map"), "[data-dms-mockup-meta]")).toBe(
    "1 page · from the chat",
  );
  expect(text(card(root, "staff-planning"), "[data-dms-mockup-meta]")).toBe(
    "2 pages",
  );
});

it("badges the open comments of a mockup that has some, pluralised, and none for one that has none (fails on badging a count of zero, reading the count from the wrong field, or an unpluralised count)", async () => {
  const single = { ...draft, name: "one-note", openComments: 1 };
  const root = await mountCards([built, draft, single]);

  expect(text(card(root, "stations-map"), "[data-dms-mockup-comments]")).toBe(
    "2 open comments",
  );
  expect(text(card(root, "one-note"), "[data-dms-mockup-comments]")).toBe(
    "1 open comment",
  );
  expect(
    card(root, "bike-rental").querySelector("[data-dms-mockup-comments]"),
  ).toBeNull();
});

it("says when a mockup last changed, relative to now, with its exact time (fails on an age worded from another field than the spec's last change, or a missing machine-readable time)", async () => {
  const root = await mountCards([built]);

  const updated = card(root, "bike-rental").querySelector(
    "[data-dms-mockup-updated]",
  );
  expect(updated?.textContent).toBe("Updated 2h ago");
  expect(updated?.getAttribute("datetime")).toBe(UPDATED);
});

it("titles a card with its title, or its name when it has none (fails on a card titled with its name despite having a title, or an untitled card left without any)", async () => {
  const root = await mountCards([built, draft]);

  expect(text(card(root, "bike-rental"), "[data-dms-mockup-open]")).toBe(
    "Bike rental",
  );
  expect(text(card(root, "stations-map"), "[data-dms-mockup-open]")).toBe(
    "stations-map",
  );
});

it("opens the mockup on its Overview, its link naming no page (fails on a card opening a mockup on one of its pages, since a URL without `?page=` is the Overview)", async () => {
  const root = await mountCards([built, draft]);

  expect(
    card(root, "bike-rental")
      ?.querySelector("[data-dms-mockup-open]")
      ?.getAttribute("href"),
  ).toBe("/mockup?name=bike-rental");
});

it("links each built page by its stored path, the card to its viewer, and a draft to no page (fails on a built page linked by its title, pages listed for a draft, or page links nested in the card's own link, an anchor in an anchor the browser cannot make separately clickable)", async () => {
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

it("draws no card for a row that is not a summary, nor for a built page that leaves the dashboard (fails on a link drawn from a built page whose path left the dashboard, or a malformed row that throws instead of being skipped)", async () => {
  const leaving = {
    ...built,
    name: "leaving",
    builtPages: [{ path: "//evil.example", title: "Evil", changed: false }],
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

it("shows a skeleton while the first answer is on its way, and the empty state once it is empty (fails on the empty state shown while the first answer is still coming, or a skeleton once the list is known to be empty)", async () => {
  const loading = await mountCards([], { firstPageLoading: true });
  expect(loading.textContent).not.toContain(en.dms.table.empty_title);
  expect(loading.querySelectorAll("li").length).toBeGreaterThan(0);
  unmountCards();

  const empty = await mountCards([]);
  expect(empty.textContent).toContain(en.dms.table.empty_title);
  expect(empty.querySelector("[data-dms-mockup-card]")).toBeNull();
});

it("reads the first page of each card's own mockup once it scrolls into view (fails on every card handed the same thumbnail, or a thumbnail drawn by something other than the mockup's name)", async () => {
  await mountCards([built, draft]);
  expect(authFetch).not.toHaveBeenCalled();

  scrollAllIntoView();
  await nextTick();

  expect(authFetch.mock.calls.map(([url]) => url).sort()).toEqual([
    "/api/mockup/bike-rental",
    "/api/mockup/stations-map",
  ]);
});

it("badges a built mockup with a changed page Out of sync and updates that page's mockup from it (fails on keeping it Built, offering to update an unchanged page or one no mockup page links to, converting into another mockup, or opening the stale mockup without converting the page again)", async () => {
  const drifted = {
    ...built,
    name: "drifted",
    builtPages: [
      { path: "/bikes", title: "Bikes", pageId: "bikes", changed: true },
      {
        path: "/bikes/new",
        title: "/bikes/new",
        pageId: "new",
        changed: false,
      },
      { path: "/stock", title: "Stock", changed: true },
    ],
  };
  const root = await mountCards([built, drifted]);

  expect(text(card(root, "drifted"), "[data-dms-mockup-status]")).toBe(
    "Out of sync",
  );
  expect(
    card(root, "drifted")
      .querySelector("[data-dms-mockup-status]")
      ?.getAttribute("data-color"),
  ).toBe("warning");
  expect(
    card(root, "bike-rental").querySelector("[data-dms-mockup-resync]"),
  ).toBeNull();
  const buttons = card(root, "drifted").querySelectorAll(
    "[data-dms-mockup-resync]",
  );
  expect(buttons).toHaveLength(1);

  authFetch.mockReset();
  authFetch
    .mockResolvedValueOnce({
      url: "/mockup?name=bikes",
      stale: true,
      digest: "d1",
    })
    .mockResolvedValueOnce({ url: "/mockup?name=bikes&page=bikes" });
  buttons[0]?.dispatchEvent(new MouseEvent("click"));
  await vi.waitFor(() => expect(navigateTo).toHaveBeenCalled());

  expect(authFetch.mock.calls.map(([, options]) => options?.body)).toEqual([
    { path: "/bikes", mockup: "drifted" },
    { path: "/bikes", mockup: "drifted", replace: true, digest: "d1" },
  ]);
  expect(navigateTo).toHaveBeenCalledWith("/mockup?name=bikes&page=bikes");
});
