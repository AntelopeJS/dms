/**
 * The month view's pure layout: whole weeks per row (hidden days left out),
 * events in lanes with multi-day bars first, bars cut at week ends and at a
 * crowded day, and the "+N more" of each day.
 */
import { describe, expect, it } from "vitest";
import {
  layoutMonthWeek,
  monthWeeks,
  packLanes,
} from "../layers/dms-ui/app/build/composables/agenda/agendaMonthLayout";
import { agendaDays, occurrence } from "./fixtures/agendaOccurrences";

describe("weeks", () => {
  it("splits six weeks starting on Monday", () => {
    const rows = monthWeeks(agendaDays("2026-09-28", 42), 1);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ key: "2026-09-28", week: 40 });
    expect(rows[0]!.days).toHaveLength(7);
    // The row holding the DST Sunday 25 October.
    expect(rows[3]!.days.at(-1)!.key).toBe("2026-10-25");
  });

  it("splits weeks starting on Sunday and leaves hidden days out", () => {
    const rows = monthWeeks(agendaDays("2026-09-27", 14, [0, 6]), 0);
    expect(rows.map((row) => row.key)).toEqual(["2026-09-27", "2026-10-04"]);
    expect(rows[0]!.days.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("lanes", () => {
  it("takes the lowest free lane", () => {
    const lanes = packLanes([
      { key: "a", first: 0, last: 3 },
      { key: "b", first: 1, last: 1 },
      { key: "c", first: 2, last: 4 },
      { key: "d", first: 4, last: 6 },
      { key: "e", first: 5, last: 5 },
    ]);
    expect(Object.fromEntries(lanes)).toEqual({ a: 0, b: 1, c: 1, d: 0, e: 1 });
  });
});

describe("a week row", () => {
  const week = agendaDays("2026-10-26", 7);

  it("draws bars first, cut at the week's edges, and dots for timed events", () => {
    const layout = layoutMonthWeek(
      week,
      [
        occurrence("standup", "2026-10-27T09:00", "2026-10-27T09:15"),
        occurrence("leave", "2026-10-22", "2026-10-28"),
        occurrence("fair", "2026-11-01", "2026-11-03"),
      ],
      3,
    );
    const byKey = Object.fromEntries(
      layout.segments.map((segment) => [segment.occurrence.key, segment]),
    );
    expect(byKey.leave).toMatchObject({
      lane: 0,
      first: 0,
      last: 2,
      continuesBefore: true,
      layout: "bar",
    });
    expect(byKey.standup).toMatchObject({
      lane: 1,
      first: 1,
      last: 1,
      layout: "dot",
    });
    expect(byKey.fair).toMatchObject({
      first: 6,
      last: 6,
      continuesAfter: true,
      layout: "bar",
    });
    expect(layout.more).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(layout.lanes).toBe(2);
  });

  it("keeps maxEventsPerDay chips, the last place to +N more", () => {
    const busy = ["a", "b", "c", "d", "e"].map((key, index) =>
      occurrence(
        key,
        `2026-10-28T0${index + 8}:00`,
        `2026-10-28T0${index + 8}:30`,
      ),
    );
    const layout = layoutMonthWeek(week, busy, 3);
    const drawn = layout.segments.filter((segment) => segment.first === 2);
    expect(drawn.map((segment) => segment.occurrence.key)).toEqual(["a", "b"]);
    expect(layout.more[2]).toBe(3);
    expect(layout.dayEvents[2]).toHaveLength(5);
    expect(layout.lanes).toBe(3);
  });

  it("cuts a bar where it crosses a crowded day", () => {
    const bars = ["b0", "b1", "b2"].map((key) =>
      occurrence(key, "2026-10-26", "2026-10-29"),
    );
    const fits = layoutMonthWeek(week, bars, 3);
    expect(
      fits.segments.map((segment) => [
        segment.occurrence.key,
        segment.lane,
        segment.first,
        segment.last,
      ]),
    ).toEqual([
      ["b0", 0, 0, 3],
      ["b1", 1, 0, 3],
      ["b2", 2, 0, 3],
    ]);

    const crowded = layoutMonthWeek(
      week,
      [...bars, occurrence("p", "2026-10-27T08:00", "2026-10-27T09:00")],
      3,
    );
    const pieces = crowded.segments.filter(
      (segment) => segment.occurrence.key === "b2",
    );
    // Tuesday holds four events: its last lane gives way to "+2 more", so b2 is cut around it.
    expect(
      pieces.map((segment) => [
        segment.first,
        segment.last,
        segment.continuesBefore,
        segment.continuesAfter,
      ]),
    ).toEqual([
      [0, 0, false, true],
      [2, 3, true, false],
    ]);
    expect(crowded.more).toEqual([0, 2, 0, 0, 0, 0, 0]);
  });
});
