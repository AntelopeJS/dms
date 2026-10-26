/**
 * The agenda's views and ranges: defaults applied, the days a view shows
 * around its anchor for each week start, month and year ranges, hidden
 * days, the compact view, and ‹ › within `minDate` / `maxDate`.
 */
import { describe, expect, it } from "vitest";
import {
  buildAgendaRange,
  compactAgendaView,
  navigateAnchor,
  resolveAgendaViews,
  stepAnchor,
  visibleDay,
} from "../layers/dms-ui/app/build/composables/agenda/agendaRange";
import type { ResolvedAgendaView } from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import type { FullAgendaOptions } from "../layers/dms-ui/app/types/full-agenda";

const BRUSSELS = "Europe/Brussels";
const settings = (weekStartsOn: number) => ({
  weekStartsOn,
  timeZone: BRUSSELS,
  today: "2026-10-25",
});

function views(
  list: FullAgendaOptions["views"],
  defaults: Parameters<typeof resolveAgendaViews>[1] = {},
): ResolvedAgendaView[] {
  return resolveAgendaViews(list, defaults, (view) => view.type);
}

const viewOf = (
  entry: NonNullable<FullAgendaOptions["views"]>[number],
  defaults: Parameters<typeof resolveAgendaViews>[1] = {},
) => views([entry], defaults)[0]!;

const keys = (range: { days: Array<{ key: string }> }) =>
  range.days.map((day) => day.key);

describe("views", () => {
  it("offers month, week, day and list by default", () => {
    expect(views(undefined).map((view) => view.id)).toEqual([
      "month",
      "week",
      "day",
      "list",
    ]);
  });

  it("applies the block's options under a view's own", () => {
    const [timeline, days] = views(
      [
        { type: "timeline", id: "plan", dayStart: "08:00" },
        { type: "days", duration: 5 },
      ],
      { dayStart: "07:00", dayEnd: "21:00", hiddenDays: [0, 6] },
    );
    expect(timeline).toMatchObject({
      id: "plan",
      duration: 7,
      dayStart: "08:00",
      dayEnd: "21:00",
      hiddenDays: [0, 6],
      scale: "day",
    });
    expect(days).toMatchObject({ id: "days", duration: 5, dayStart: "07:00" });
  });

  it("scales a timeline by slot when the block has slots, by hour over one day", () => {
    const slots = [{ id: "S1", label: "S1", start: "08:00", end: "10:00" }];
    expect(viewOf({ type: "timeline" }, { slots }).scale).toBe("slot");
    expect(viewOf({ type: "timeline", duration: 1 }).scale).toBe("hour");
  });

  it("keeps the first of two views with one id", () => {
    expect(views(["week", "week"]).length).toBe(1);
  });
});

describe("ranges", () => {
  it("builds the week of the anchor for each week start", () => {
    const week = viewOf("week");
    expect(keys(buildAgendaRange(week, "2026-10-25", settings(1)))).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(buildAgendaRange(week, "2026-10-25", settings(0)).from).toBe(
      "2026-10-25",
    );
    const saturday = buildAgendaRange(week, "2026-10-25", settings(6));
    expect(saturday.from).toBe("2026-10-24");
    expect(saturday.to).toBe("2026-10-30");
  });

  it("gives each day its bounds in the zone: the DST day lasts 25 h", () => {
    const range = buildAgendaRange(viewOf("week"), "2026-10-25", settings(1));
    const sunday = range.days.at(-1)!;
    expect(sunday.isToday).toBe(true);
    expect(sunday.end - sunday.start).toBe(25 * 3_600_000);
    expect(range.start).toBe(Date.parse("2026-10-18T22:00:00Z"));
    expect(range.end).toBe(Date.parse("2026-10-25T23:00:00Z"));
    expect(sunday.week).toBe(43);
  });

  it("leaves hidden days out of a working week", () => {
    const week = viewOf("week", { hiddenDays: [0, 6] });
    const range = buildAgendaRange(week, "2026-10-21", settings(1));
    expect(range.from).toBe("2026-10-19");
    expect(range.to).toBe("2026-10-23");
    expect(range.days.length).toBe(5);
  });

  it("shows six whole weeks for a month, the days of other months marked", () => {
    const range = buildAgendaRange(viewOf("month"), "2026-10-25", settings(1));
    expect(range.from).toBe("2026-09-28");
    expect(range.to).toBe("2026-11-08");
    expect(range.days.length).toBe(42);
    expect(range.days[0]!.inMonth).toBe(false);
    expect(range.days[3]!).toMatchObject({ key: "2026-10-01", inMonth: true });
    const sundayStart = buildAgendaRange(
      viewOf("month"),
      "2026-02-14",
      settings(0),
    );
    expect(sundayStart.from).toBe("2026-02-01");
    expect(sundayStart.to).toBe("2026-03-14");
  });

  it("covers the whole year, hidden days kept for the planner", () => {
    const year = viewOf("year", { hiddenDays: [0, 6] });
    const range = buildAgendaRange(year, "2026-10-25", settings(1));
    expect(range.from).toBe("2026-01-01");
    expect(range.to).toBe("2026-12-31");
    expect(range.days.length).toBe(365);
  });

  it("starts a list on its anchor and a seven-day timeline on the week", () => {
    const list = buildAgendaRange(viewOf("list"), "2026-10-25", settings(1));
    expect(list.from).toBe("2026-10-25");
    expect(list.to).toBe("2026-11-23");
    const timeline = buildAgendaRange(
      viewOf("timeline", { hiddenDays: [0, 6] }),
      "2026-10-22",
      settings(1),
    );
    expect(keys(timeline)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
    ]);
  });
});

describe("navigation", () => {
  it("steps a view by its own length", () => {
    expect(stepAnchor(viewOf("week"), "2026-10-25", 1)).toBe("2026-11-01");
    expect(stepAnchor(viewOf("month"), "2026-01-31", 1)).toBe("2026-02-28");
    expect(stepAnchor(viewOf("year"), "2026-10-25", -1)).toBe("2025-10-25");
    expect(
      stepAnchor(viewOf({ type: "days", duration: 3 }), "2026-10-25", 1),
    ).toBe("2026-10-28");
  });

  it("skips hidden days in a day view", () => {
    const day = viewOf("day", { hiddenDays: [0, 6] });
    expect(stepAnchor(day, "2026-10-23", 1)).toBe("2026-10-26");
    expect(stepAnchor(day, "2026-10-26", -1)).toBe("2026-10-23");
    expect(visibleDay("2026-10-25", [0, 6])).toBe("2026-10-26");
  });

  it("stops at minDate and maxDate", () => {
    const week = viewOf("week");
    const bounds = { min: "2026-09-28", max: "2026-10-18" };
    expect(navigateAnchor(week, "2026-10-05", -1, 1, bounds)).toBe(
      "2026-09-28",
    );
    expect(navigateAnchor(week, "2026-09-28", -1, 1, bounds)).toBeNull();
    expect(navigateAnchor(week, "2026-10-05", 1, 1, bounds)).toBe("2026-10-12");
    expect(navigateAnchor(week, "2026-10-12", 1, 1, bounds)).toBeNull();
    const days = viewOf({ type: "days", duration: 3 });
    expect(navigateAnchor(days, "2026-10-15", 1, 1, bounds)).toBe("2026-10-18");
  });
});

describe("compact view", () => {
  const offered = views([
    "week",
    "day",
    "month",
    { type: "resources", duration: 7 },
  ]);
  const byId = (id: string) => offered.find((view) => view.id === id)!;

  it("swaps a week for the day view", () => {
    expect(compactAgendaView(byId("week"), offered, undefined).id).toBe("day");
  });

  it("keeps a month, and a week with compactView false", () => {
    expect(compactAgendaView(byId("month"), offered, undefined).id).toBe(
      "month",
    );
    expect(compactAgendaView(byId("week"), offered, false).id).toBe("week");
  });

  it("takes the compactView named, and narrows resources to one day", () => {
    expect(compactAgendaView(byId("week"), offered, "month").id).toBe("month");
    const resources = compactAgendaView(byId("resources"), offered, undefined);
    expect(resources).toMatchObject({ type: "resources", duration: 1 });
  });

  it("narrows a week to a day when the block offers no day view", () => {
    const only = views(["week"]);
    expect(compactAgendaView(only[0]!, only, undefined)).toMatchObject({
      type: "day",
      duration: 1,
    });
  });
});
