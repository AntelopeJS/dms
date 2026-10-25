// @vitest-environment jsdom
/**
 * The shell of a FullAgenda at a container width: at 320 px (a modal, a
 * phone) the sidebar folds into a sheet, the views into a select and the
 * details into a drawer; at 700 px (a grid column) the sidebar stays but
 * the panel has no room; at 1400 px (a full page) everything sits side by
 * side. Also its toolbar parts, sidebar sections, legend and height.
 */
import { describe, expect, it } from "vitest";
import {
  attributeSelector,
  fillPlaceOf,
  legendGroups,
  resolveAgendaHeight,
  resolveLegend,
  resolveShellLayout,
  resolveSidebar,
  resolveToolbar,
  sidebarSections,
  sortNotices,
  upcomingOccurrences,
  type AgendaShellInput,
} from "../layers/dms-ui/app/build/composables/agenda/agendaShell";
import type { AgendaOccurrence } from "../layers/dms-ui/app/build/composables/agenda/agendaModel";

const COMPACT_BELOW = 640;

function at(
  width: number,
  overrides: Partial<AgendaShellInput> = {},
): AgendaShellInput {
  return {
    width,
    compact: width < COMPACT_BELOW,
    sidebar: resolveSidebar({ sidebar: true }),
    sidebarOpen: true,
    overlayOpen: false,
    details: "panel",
    viewCount: 4,
    viewSwitcher: true,
    ...overrides,
  };
}

describe("container widths", () => {
  it("folds everything at 320 px", () => {
    expect(resolveShellLayout(at(320))).toEqual({
      sidebar: "folded",
      switcher: "select",
      details: "drawer",
    });
    expect(resolveShellLayout(at(320, { overlayOpen: true })).sidebar).toBe(
      "overlay",
    );
    expect(resolveShellLayout(at(320, { details: "popover" })).details).toBe(
      "drawer",
    );
    expect(resolveShellLayout(at(320, { details: "modal" })).details).toBe(
      "modal",
    );
  });

  it("keeps the sidebar at 700 px but opens the panel as a drawer", () => {
    expect(resolveShellLayout(at(700))).toEqual({
      sidebar: "column",
      switcher: "select",
      details: "drawer",
    });
    expect(resolveShellLayout(at(700, { details: "popover" })).details).toBe(
      "popover",
    );
  });

  it("lays everything side by side at 1400 px", () => {
    expect(resolveShellLayout(at(1400))).toEqual({
      sidebar: "column",
      switcher: "segmented",
      details: "panel",
    });
    expect(resolveShellLayout(at(1400, { sidebarOpen: false })).sidebar).toBe(
      "folded",
    );
  });

  it("offers no switcher for one view, no sidebar without one", () => {
    const layout = resolveShellLayout(
      at(1400, { viewCount: 1, sidebar: null }),
    );
    expect(layout.switcher).toBe("none");
    expect(layout.sidebar).toBe("none");
  });
});

describe("parts", () => {
  it("reads the toolbar's parts with their defaults", () => {
    expect(resolveToolbar(false)).toBeNull();
    expect(resolveToolbar(undefined)).toMatchObject({
      today: true,
      datePicker: false,
      exportIcs: false,
    });
    expect(resolveToolbar({ exportIcs: true, today: false })).toMatchObject({
      today: false,
      exportIcs: true,
      navigation: true,
    });
  });

  it("shows a sidebar when asked or when there are items to plan", () => {
    expect(resolveSidebar({})).toBeNull();
    expect(resolveSidebar({ unscheduled: {} })).toMatchObject({
      position: "left",
      width: 264,
    });
    expect(
      resolveSidebar({ sidebar: { position: "right", width: 300 } }),
    ).toMatchObject({ position: "right", width: 300, collapsible: true });
    expect(resolveSidebar({ sidebar: false, unscheduled: {} })).toBeNull();
  });

  it("lists the sections the data feeds, or the ones asked", () => {
    const sidebar = resolveSidebar({ sidebar: { tip: "Drag" } })!;
    expect(
      sidebarSections(sidebar, {
        calendars: 3,
        pending: 0,
        notices: 2,
        hasUnscheduled: false,
      }),
    ).toEqual(["miniCalendar", "calendars", "notices", "tip"]);
    expect(
      sidebarSections(
        { ...sidebar, sections: ["unscheduled"] },
        { calendars: 3, pending: 0, notices: 0, hasUnscheduled: false },
      ),
    ).toEqual(["unscheduled"]);
  });

  it("puts the legend in the sidebar when it lists the calendars", () => {
    expect(resolveLegend(undefined, 2, true)?.position).toBe("sidebar");
    expect(resolveLegend(undefined, 2, false)?.position).toBe("toolbar");
    expect(resolveLegend({ position: "bottom" }, 2, true)?.position).toBe(
      "bottom",
    );
    expect(resolveLegend(false, 2, true)).toBeNull();
    expect(resolveLegend(undefined, 0, true)).toBeNull();
  });

  it("fills a filling page, else takes 44rem or the length given", () => {
    const filling = { pageFill: true, flexColumn: true };
    const page = { pageFills: true, inContainer: false, place: filling };
    expect(resolveAgendaHeight(undefined, page)).toEqual({ fill: true });
    expect(
      resolveAgendaHeight(undefined, { ...page, pageFills: false }),
    ).toEqual({ fill: false, height: "44rem" });
    expect(resolveAgendaHeight("30rem", page)).toEqual({
      fill: false,
      height: "30rem",
    });
    // Not mounted yet (server render): it fills.
    expect(resolveAgendaHeight(undefined, { ...page, place: null })).toEqual({
      fill: true,
    });
  });

  it("N17 fills only the page's filling block or a drawer body", () => {
    const page = { pageFills: true, inContainer: false };
    // A block above the last, or one inside a stack (a flex column of no height).
    for (const place of [
      { pageFill: false, flexColumn: false },
      { pageFill: false, flexColumn: true },
    ])
      expect(resolveAgendaHeight(undefined, { ...page, place })).toEqual({
        fill: false,
        height: "44rem",
      });
    // A modal body is no flex column: bounded by the window.
    expect(
      resolveAgendaHeight("fill", {
        pageFills: false,
        inContainer: true,
        place: { pageFill: false, flexColumn: false },
      }),
    ).toEqual({ fill: false, height: "min(44rem, calc(100dvh - 12rem))" });
    // A drawer body is one: it fills.
    expect(
      resolveAgendaHeight("fill", {
        pageFills: false,
        inContainer: true,
        place: { pageFill: false, flexColumn: true },
      }),
    ).toEqual({ fill: true });
  });

  it("N17 reads the page's mark past `display: contents` wrappers (a permission veil)", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-dms-page-fill", "");
    const veil = document.createElement("div");
    veil.style.display = "contents";
    const block = document.createElement("div");
    veil.append(block);
    wrapper.append(veil);
    document.body.append(wrapper);
    expect(fillPlaceOf(block)).toMatchObject({ pageFill: true });
    // In a stack inside the filling block: the stack lays it out, unmarked.
    const stack = document.createElement("div");
    stack.style.cssText = "display: flex; flex-direction: column";
    const nested = document.createElement("div");
    stack.append(nested);
    veil.append(stack);
    expect(fillPlaceOf(nested)).toEqual({ pageFill: false, flexColumn: true });
    wrapper.remove();
  });

  it("groups the legend, sorts the notices, lists what comes next", () => {
    expect(
      legendGroups(
        [
          { id: "a", label: "A", group: "mine" },
          { id: "b", label: "B" },
          { id: "c", label: "C", group: "teams" },
        ],
        [
          { id: "teams", label: "Teams" },
          { id: "mine", label: "Mine" },
        ],
      ).map((group) => [group.id, group.calendars.map((c) => c.id)]),
    ).toEqual([
      ["", ["b"]],
      ["teams", ["c"]],
      ["mine", ["a"]],
    ]);
    expect(
      sortNotices([
        { message: "w" },
        { message: "e", tone: "error" },
        { message: "i", tone: "info" },
      ]).map((notice) => notice.message),
    ).toEqual(["e", "w", "i"]);
    const occurrences = [30, 10, 20, 5].map(
      (start) =>
        ({ key: String(start), start, end: start + 5 }) as AgendaOccurrence,
    );
    expect(
      upcomingOccurrences(occurrences, 12, 2).map((item) => item.key),
    ).toEqual(["10", "20"]);
  });

  it("builds an exact attribute selector without CSS.escape", () => {
    expect(attributeSelector("data-agenda-occurrence", 'a"b@2026-10-26')).toBe(
      '[data-agenda-occurrence="a\\"b@2026-10-26"]',
    );
  });
});
