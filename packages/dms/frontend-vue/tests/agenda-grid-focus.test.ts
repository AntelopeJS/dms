// @vitest-environment jsdom
/**
 * Round 2 of the grid, month and chip: the focus comes back to an event
 * drawn again elsewhere (N4); the month is one roving tab stop, a bar
 * across two weeks included, the arrows move through it (#50); timeline
 * bars write their title first, no time by slot, a subtitle on a tall bar
 * (L1); cut resource names keep their full name (L8); "+N more" plurals
 * (N33).
 */
import { computed, nextTick, ref } from "vue";
import { createI18n } from "vue-i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { occurrence } from "./fixtures/agendaOccurrences";
import {
  contextFor,
  mount,
  mounted,
  translate,
} from "./fixtures/agendaGridMount";
import AgendaMonthView from "../layers/dms-ui/app/build/components/agenda/AgendaMonthView.vue";
import AgendaTimeGrid from "../layers/dms-ui/app/build/components/agenda/AgendaTimeGrid.vue";
import AgendaEventChip from "../layers/dms-ui/app/build/components/agenda/AgendaEventChip.vue";
import enGB from "../layers/dms-ui/i18n/locales/ui-en-GB.json";

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

const MONTH = { view: "month" as const, from: "2026-09-28", dayCount: 42 };

describe("focus after a move (N4)", () => {
  it("gives the focus to the chip drawn on the new day", async () => {
    const ctx = contextFor(MONTH);
    const drawn = ref([
      occurrence("m", "2026-10-27T09:00", "2026-10-27T10:00"),
    ]);
    ctx.occurrences = computed(() => drawn.value);
    const root = await mount(AgendaMonthView);
    const chipOf = () =>
      root.querySelector<HTMLElement>('[data-agenda-occurrence="m"]')!;
    const before = chipOf();
    before.focus();
    expect(ctx.focusedKey.value).toBe("m");
    // The move is drawn: the chip remounts in Wednesday's cell, the focus is lost.
    drawn.value = [occurrence("m", "2026-10-28T09:00", "2026-10-28T10:00")];
    await nextTick();
    const after = chipOf();
    expect(after).not.toBe(before);
    // Once the change settles, the drag engine names the event to refocus.
    ctx.drag.refocusKey.value = "m";
    await nextTick();
    expect(document.activeElement).toBe(after);
    expect(ctx.drag.refocusKey.value).toBeNull();
    expect(ctx.focusedKey.value).toBe("m");
  });
});

describe("one roving tab stop in the month (#50)", () => {
  const stops = (root: HTMLElement) =>
    [...root.querySelectorAll<HTMLElement>("button")].filter(
      (button) => button.tabIndex >= 0,
    );

  it("has one tab stop in an empty month, and none on week numbers", async () => {
    contextFor({ ...MONTH, raw: { weekNumbers: true } });
    const root = await mount(AgendaMonthView);
    expect(stops(root)).toHaveLength(1);
  });

  it("keeps a bar across two weeks to one tab stop, its first piece", async () => {
    const ctx = contextFor({
      ...MONTH,
      occurrences: [occurrence("trip", "2026-10-23", "2026-10-28")],
    });
    ctx.focusedKey.value = "trip";
    const root = await mount(AgendaMonthView);
    expect(
      root.querySelectorAll('[data-agenda-occurrence="trip"]'),
    ).toHaveLength(2);
    const [only] = stops(root);
    expect(stops(root)).toHaveLength(1);
    expect(only!.dataset.agendaOccurrence).toBe("trip");
    expect(
      only!
        .closest('[role="gridcell"]')!
        .querySelector("[data-agenda-day]")!
        .getAttribute("data-agenda-day"),
    ).toBe("2026-10-23");
  });

  it("moves through day numbers, chips and +N more with the arrows", async () => {
    contextFor({
      ...MONTH,
      occurrences: [occurrence("a", "2026-09-28T09:00", "2026-09-28T10:00")],
    });
    const root = await mount(AgendaMonthView);
    const roving = [
      ...root.querySelectorAll<HTMLElement>("[data-agenda-roving]"),
    ];
    roving[0]!.focus();
    roving[0]!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(document.activeElement).toBe(roving[1]);
    expect(roving[1]!.dataset.agendaOccurrence).toBe("a");
  });
});

describe("bars in a timeline (L1)", () => {
  const task = occurrence("t", "2026-10-26T13:00", "2026-10-26T17:00", {
    title: "Lemaire",
    subtitle: "DC-Dessin-AP1",
  });

  it("writes the title before the time", async () => {
    contextFor({ view: "timeline" });
    const root = await mount(AgendaEventChip, {
      occurrence: task,
      layout: "bar",
    });
    const parts = [...root.querySelectorAll("button > span > span > span")].map(
      (span) => span.textContent!.trim(),
    );
    expect(parts[0]).toBe("Lemaire");
    expect(parts[1]).toMatch(/\d/);
  });

  it("shows no time on a timeline by slot, and the subtitle on a tall bar", async () => {
    const ctx = contextFor({ view: "timeline" });
    const base = ctx.view.value;
    ctx.view = computed(() => ({ ...base, scale: "slot" as const }));
    const root = await mount(AgendaEventChip, {
      occurrence: task,
      layout: "bar",
      height: 42,
    });
    const text = root.querySelector("button")!.textContent!;
    expect(text).toContain("Lemaire");
    expect(text).toContain("DC-Dessin-AP1");
    expect(text).not.toMatch(/\d{2}:\d{2}/);
  });
});

describe("resource names (L8)", () => {
  it("keeps a cut name readable in a tooltip", async () => {
    contextFor({
      view: "resources",
      dayCount: 1,
      raw: {
        resources: [
          {
            id: "b",
            label: "Bénédicte Vandenberghe",
            description: "NE1 · Neupré",
          },
        ],
      },
    });
    const root = await mount(AgendaTimeGrid);
    expect(
      root.querySelector('[title="Bénédicte Vandenberghe"]'),
    ).not.toBeNull();
    expect(root.querySelector('[title="NE1 · Neupré"]')).not.toBeNull();
  });
});

describe("month plurals (N33)", () => {
  it("says one more event, and two more events", () => {
    const i18n = createI18n({
      legacy: false,
      locale: "en-GB",
      messages: { "en-GB": enGB },
    });
    const t = i18n.global.t;
    expect(t("dms.agenda.month.more_label", { count: 1, day: "Mon" }, 1)).toBe(
      "1 more event on Mon",
    );
    expect(t("dms.agenda.month.more_label", { count: 2, day: "Mon" }, 2)).toBe(
      "2 more events on Mon",
    );
  });
});

describe("round 3: the roving stop and a focus elsewhere", () => {
  it("moves the month's one tab stop to a focused day number (m13)", async () => {
    contextFor({
      ...MONTH,
      occurrences: [occurrence("a", "2026-10-27T09:00", "2026-10-27T10:00")],
    });
    const root = await mount(AgendaMonthView);
    const day = root.querySelector<HTMLElement>(
      '[data-agenda-roving="day:2026-10-14"]',
    )!;
    day.focus();
    await nextTick();
    const stops = [...root.querySelectorAll<HTMLElement>("button")].filter(
      (button) => button.tabIndex >= 0,
    );
    expect(stops).toEqual([day]);
  });

  it("does not take the focus from an input when an event is named for refocus (m6)", async () => {
    const ctx = contextFor({});
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    ctx.drag.refocusKey.value = "s";
    await mount(AgendaEventChip, {
      occurrence: occurrence("s", "2026-10-26T09:00", "2026-10-26T10:00"),
    });
    expect(document.activeElement).toBe(input);
    expect(ctx.drag.refocusKey.value).toBeNull();
  });
});
