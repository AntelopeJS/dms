// @vitest-environment jsdom
/**
 * The time grid and the month view mounted over a fake context: columns and
 * headers (days, resources days first under groups, a folded group, a
 * read-only resource), overlapping events side by side, the all-day row with
 * its bars and a holiday, business hours shaded, week numbers, the drop
 * surfaces they register, the drag preview with its refusal; the month's
 * weeks, bars over weeks, "+N more", a day number and an empty day; the
 * chip's styles, states, content toggles, click and keyboard.
 */
import { computed, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { occurrence } from "./fixtures/agendaOccurrences";
import {
  contextFor,
  mount,
  mounted,
  translate,
} from "./fixtures/agendaGridMount";
import AgendaTimeGrid from "../layers/dms-ui/app/build/components/agenda/AgendaTimeGrid.vue";
import AgendaMonthView from "../layers/dms-ui/app/build/components/agenda/AgendaMonthView.vue";
import AgendaEventChip from "../layers/dms-ui/app/build/components/agenda/AgendaEventChip.vue";

vi.mock("../layers/dms-ui/app/build/composables/agenda/useAgenda", async () => {
  const fixture = await import("./fixtures/agendaGridMount");
  return { useAgendaContext: () => fixture.mounted.ctx! };
});
vi.mock(
  "../layers/dms-core/app/composables/translation/useComposedText",
  () => ({
    useComposedText: () => ({
      processText: (value: unknown) => (typeof value === "string" ? value : ""),
    }),
  }),
);

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t: translate, locale: ref("en-GB") }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  mounted.ctx = null;
});

const HOLIDAY = {
  start: "2026-11-01",
  kind: "holiday" as const,
  label: "Toussaint",
};

describe("the time grid", () => {
  it("draws a week: days, overlapping events side by side, the all-day row, a holiday", async () => {
    const ctx = contextFor({
      raw: {
        weekNumbers: true,
        staticData: { events: [], backgrounds: [HOLIDAY] },
      },
      occurrences: [
        occurrence("sprint", "2026-10-26T09:00", "2026-10-26T11:00"),
        occurrence("sync", "2026-10-26T10:00", "2026-10-26T10:30"),
        occurrence("leave", "2026-10-28", "2026-10-29"),
      ],
    });
    const root = await mount(AgendaTimeGrid);
    const html = root.innerHTML;
    expect(root.querySelector('[role="grid"]')).not.toBeNull();
    expect(html.match(/weekdayShort:/g)).toHaveLength(7);
    expect(html).toContain('dms.agenda.grid.week_short{"week":44}');
    const boxOf = (key: string) =>
      root
        .querySelector(
          `[data-agenda-day="2026-10-26"] [data-agenda-occurrence="${key}"]`,
        )!
        .closest("div")!
        .getAttribute("style");
    expect(boxOf("sprint")).toContain("left: calc(0% + 1px)");
    expect(boxOf("sync")).toContain("left: calc(50% + 1px)");
    expect(
      root.querySelector(
        '[data-agenda-all-day] [data-agenda-occurrence="leave"]',
      ),
    ).not.toBeNull();
    expect(root.querySelector("[data-agenda-all-day]")!.textContent).toContain(
      "Toussaint",
    );
    expect(vi.mocked(ctx.drag.registerSurface)).toHaveBeenCalledTimes(2);
  });

  it("shades the hours outside business hours and scrolls sideways under columnMinWidth", async () => {
    const ctx = contextFor({ raw: { columnMinWidth: 120 } });
    const base = ctx.options;
    ctx.options = computed(() => ({
      ...base.value,
      businessHours: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }],
    }));
    ctx.hoursOn = (weekday) =>
      weekday === 0 || weekday === 6
        ? []
        : [{ days: [weekday], start: "09:00", end: "18:00" }];
    const root = await mount(AgendaTimeGrid);
    const monday = root.querySelector('[data-agenda-day="2026-10-26"]')!;
    const sunday = root.querySelector('[data-agenda-day="2026-11-01"]')!;
    // Before 09:00 and after 18:00 on Monday; all day on Sunday.
    expect(monday.querySelectorAll('[style*="--ui-bg-elevated"]')).toHaveLength(
      2,
    );
    expect(sunday.querySelectorAll('[style*="--ui-bg-elevated"]')).toHaveLength(
      1,
    );
    expect(root.innerHTML).toContain(`min-width: ${56 + 7 * 120}px`);
  });
});

describe("the time grid over resources and while dragging", () => {
  it("lays resources days first under their groups, folds a group, locks a read-only resource", async () => {
    const ctx = contextFor({
      view: "resources",
      dayCount: 2,
      raw: {
        resources: [
          { id: "ana", label: "Ana", group: "ne1" },
          { id: "bob", label: "Bob", group: "ne1", editable: false },
          { id: "cid", label: "Cid", group: "lg4" },
        ],
        staticData: {
          events: [],
          resourceGroups: [
            { id: "ne1", label: "NE1" },
            { id: "lg4", label: "LG4" },
          ],
        },
      },
      occurrences: [
        occurrence("shift", "2026-10-27T09:00", "2026-10-27T17:00", {
          resourceIds: ["bob"],
        }),
      ],
    });
    const base = ctx.view;
    ctx.view = computed(() => ({ ...base.value, resourceLayout: "daysFirst" }));
    ctx.foldedGroups.value = new Set(["lg4"]);
    const root = await mount(AgendaTimeGrid);
    const columns = [
      ...root.querySelectorAll("[data-agenda-grid-body] [role=gridcell]"),
    ];
    // Each day: Ana, Bob, then LG4 folded into one placeholder.
    expect(
      columns.map((column) => column.getAttribute("data-agenda-resource")),
    ).toEqual(["ana", "bob", null, "ana", "bob", null]);
    expect(
      root.querySelector(
        '[data-agenda-resource="bob"][data-agenda-day="2026-10-27"] [data-agenda-occurrence="shift"]',
      ),
    ).not.toBeNull();
    const unfold = root.querySelector(
      '[aria-label^="dms.agenda.grid.group_unfold"]',
    );
    expect(unfold?.getAttribute("aria-label")).toBe(
      'dms.agenda.grid.group_unfold{"group":"LG4"}',
    );
    expect(unfold?.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector('[data-name="i-ph-lock-simple"]')).not.toBeNull();
  });

  it("draws the drag preview over the columns it crosses, with the refusal", async () => {
    const ctx = contextFor({});
    const root = await mount(AgendaTimeGrid);
    ctx.drag.preview.value = {
      kind: "create",
      start: Date.parse("2026-10-27T08:00:00Z"),
      end: Date.parse("2026-10-27T09:00:00Z"),
      allDay: false,
      resourceIds: [],
      valid: false,
      reason: "outside opening hours",
      copy: false,
      toPending: false,
    };
    await nextTick();
    const ghost = root.querySelector(
      "[data-agenda-grid-body] [data-agenda-ghost]",
    );
    expect(ghost).not.toBeNull();
    expect(ghost!.textContent).toContain("outside opening hours");
    expect(ghost!.textContent).toContain("dms.agenda.grid.new_event");
  });
});

describe("the month view", () => {
  it("draws six weeks, bars over weeks, +N more, and opens a day", async () => {
    const busy = ["a", "b", "c", "d", "e"].map((key, index) =>
      occurrence(
        key,
        `2026-10-28T0${index + 8}:00`,
        `2026-10-28T0${index + 8}:30`,
      ),
    );
    const ctx = contextFor({
      view: "month",
      from: "2026-09-28",
      dayCount: 42,
      raw: { weekNumbers: true },
      occurrences: [...busy, occurrence("leave", "2026-10-23", "2026-10-27")],
    });
    const root = await mount(AgendaMonthView);
    expect(root.querySelectorAll("[data-agenda-week]")).toHaveLength(6);
    expect(
      root.querySelectorAll('[data-agenda-occurrence="leave"]'),
    ).toHaveLength(2);
    expect(root.innerHTML).toContain('dms.agenda.month.more{"count":3}');
    expect(root.innerHTML).toContain('dms.agenda.grid.week_short{"week":40}');
    const day = root.querySelector(
      '[data-agenda-day="2026-10-29"]',
    ) as HTMLElement;
    (day.querySelector("button") as HTMLButtonElement).click();
    expect(ctx.goTo).toHaveBeenCalledWith("2026-10-29", "day");
    day.click();
    expect(ctx.clickEmpty).toHaveBeenCalledWith(
      { day: "2026-10-29", allDay: true },
      false,
    );
    expect(vi.mocked(ctx.drag.registerSurface)).toHaveBeenCalledTimes(1);
  });
});

describe("the event chip", () => {
  it("shows its status, its save state and its issues, and hides what eventContent turns off", async () => {
    contextFor({ raw: { eventContent: { time: false } } });
    const tentative = occurrence("t", "2026-10-26T09:00", "2026-10-26T10:00", {
      status: "tentative",
      issues: [{ tone: "error", message: "Overlaps" }],
    });
    const root = await mount(AgendaEventChip, {
      occurrence: { ...tentative, state: "saving" },
      height: 60,
    });
    const chip = root.querySelector("button")!;
    expect(chip.className).toContain("outline-dashed");
    expect(chip.className).toContain("var(--ui-error)");
    expect(chip.getAttribute("aria-label")).toContain(
      "dms.agenda.grid.tentative",
    );
    expect(root.querySelector(".animate-spin")).not.toBeNull();
    expect(chip.textContent).not.toContain("–");
  });

  it("opens on click and moves with Alt and an arrow", async () => {
    const ctx = contextFor({});
    const cancelled = occurrence("c", "2026-10-26T09:00", "2026-10-26T10:00", {
      status: "cancelled",
    });
    const root = await mount(AgendaEventChip, {
      occurrence: cancelled,
      layout: "bar",
    });
    const chip = root.querySelector("button")!;
    expect(chip.className).toContain("line-through");
    chip.click();
    expect(ctx.open).toHaveBeenCalledWith(cancelled);
    chip.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        altKey: true,
        bubbles: true,
      }),
    );
    expect(ctx.drag.nudge).toHaveBeenCalled();
  });
});

describe("round 1: focus, roving, short blocks, stacks, no resource", () => {
  it("clears the focused event when focus leaves a chip, and follows a keyboard move (#9)", async () => {
    const ctx = contextFor({});
    const a = occurrence("a", "2026-10-26T09:00", "2026-10-26T10:00");
    const b = occurrence("b", "2026-10-26T11:00", "2026-10-26T12:00");
    const root = await mount(
      defineComponent({
        setup: () => () => [
          h(AgendaEventChip, { occurrence: a }),
          h(AgendaEventChip, { occurrence: b }),
        ],
      }),
    );
    const [chipA, chipB] = [...root.querySelectorAll("button")];
    chipA!.focus();
    expect(ctx.focusedKey.value).toBe("a");
    ctx.focusedKey.value = "b";
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(chipB);
    chipB!.blur();
    chipB!.dispatchEvent(new FocusEvent("focusout"));
    expect(ctx.focusedKey.value).toBeNull();
  });

  it("puts each month chip in its day's cell and one of them in the tab order (#50)", async () => {
    contextFor({
      view: "month",
      from: "2026-09-28",
      dayCount: 42,
      occurrences: [
        occurrence("x", "2026-10-26T09:00", "2026-10-26T10:00"),
        occurrence("y", "2026-10-27T09:00", "2026-10-27T10:00"),
      ],
    });
    const root = await mount(AgendaMonthView);
    const chips = [
      ...root.querySelectorAll<HTMLElement>("[data-agenda-occurrence]"),
    ];
    expect(
      chips.map((chip) => chip.closest('[role="gridcell"]')).every(Boolean),
    ).toBe(true);
    // One tab stop in the whole month: with no focused event, the first day number.
    const stops = [...root.querySelectorAll<HTMLElement>("button")].filter(
      (button) => button.tabIndex >= 0,
    );
    expect(stops).toHaveLength(1);
    expect(
      stops[0]!.closest("[data-agenda-day]")?.getAttribute("data-agenda-day"),
    ).toBe("2026-09-28");
  });

  it("writes a short block's title first, its start time after (lead #1)", async () => {
    contextFor({});
    const standup = occurrence("s", "2026-10-26T09:00", "2026-10-26T09:15", {
      title: "Design standup",
    });
    const root = await mount(AgendaEventChip, {
      occurrence: standup,
      height: 18,
    });
    const spans = [...root.querySelectorAll("button > span > span > span")].map(
      (span) => span.textContent!.trim(),
    );
    expect(spans[0]).toBe("Design standup");
    expect(spans[1]).not.toContain("–");
  });

  it("stacks overlapping events with a capped step and a shadow (lead #2, #56)", async () => {
    contextFor({
      raw: { overlap: "stack" },
      occurrences: [
        occurrence("p", "2026-10-27T10:00", "2026-10-27T11:00"),
        occurrence("q", "2026-10-27T10:00", "2026-10-27T11:00"),
      ],
    });
    const root = await mount(AgendaTimeGrid);
    const top = root.querySelector('[data-agenda-occurrence="q"]')!;
    // jsdom rewrites `min()`: the step is min(14px, 25%) in a browser.
    const style = top.closest("div")!.getAttribute("style")!;
    expect(style).toContain("14px");
    expect(style).toContain("25%");
    expect(top.className).toContain("shadow-md");
  });

  it("draws a No resource column in a resources view (#14) and compact chips (#51)", async () => {
    contextFor({
      view: "resources",
      dayCount: 1,
      raw: { density: "compact", resources: [{ id: "ana", label: "Ana" }] },
      occurrences: [occurrence("free", "2026-10-26T09:00", "2026-10-26T10:00")],
    });
    const root = await mount(AgendaTimeGrid);
    expect(root.textContent).toContain("dms.agenda.grid.unassigned");
    const chip = root.querySelector('[data-agenda-occurrence="free"]')!;
    expect(
      chip.closest("[role=gridcell]")!.getAttribute("aria-label"),
    ).toContain("dms.agenda.grid.unassigned");
    expect(chip.className).toContain("text-[11px]");
  });
});
