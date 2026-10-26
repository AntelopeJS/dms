/**
 * Edges of the time grid and month layouts (critic round 1): zero-length
 * events keep a sliver (#12), the "No resource" column (#14), week numbers
 * counted from the week start (#34), the all-day row decided on the wall
 * clock across DST (#37), overnight business hours (#38), deep stacks that
 * keep stepping (#56), every background of a day (#57), bars that do not
 * "continue" into a hidden weekend (#58).
 */
import { describe, expect, it } from "vitest";
import {
  buildGridColumns,
  buildGridHeaders,
  inColumn,
  isAllDayRowItem,
  layoutAllDayRow,
  layoutOverlaps,
  timedSegment,
} from "../layers/dms-ui/app/build/composables/agenda/agendaTimeGridLayout";
import {
  closedPieces,
  dayBackground,
} from "../layers/dms-ui/app/build/composables/agenda/agendaTimeGridParts";
import { openIntervals } from "../layers/dms-ui/app/build/composables/agenda/agendaOpenHours";
import {
  layoutMonthWeek,
  monthWeeks,
  weekNumberOf,
} from "../layers/dms-ui/app/build/composables/agenda/agendaMonthLayout";
import { backgroundSpans } from "../layers/dms-ui/app/build/composables/agenda/agendaBackgroundSpans";
import {
  BRUSSELS,
  agendaDay,
  agendaDays,
  occurrence,
} from "./fixtures/agendaOccurrences";

const MIN = 15;

describe("zero-length events (#12)", () => {
  const [monday] = buildGridColumns({ days: [agendaDay("2026-10-26")] });

  it("keeps a sliver for an event ending when it starts", () => {
    const at10 = occurrence("z", "2026-10-26T10:00", "2026-10-26T10:00");
    expect(timedSegment(at10, monday!, 0, 1440, MIN)).toMatchObject({
      top: 600,
      bottom: 615,
    });
  });

  it("does not fill the column with an event at midnight", () => {
    const atMidnight = occurrence("z", "2026-10-26T00:00", "2026-10-26T00:00");
    expect(timedSegment(atMidnight, monday!, 0, 1440, MIN)).toMatchObject({
      top: 0,
      bottom: 15,
    });
  });
});

describe("events on no resource (#14)", () => {
  const resources = [
    { id: "ana", label: "Ana" },
    { id: "bob", label: "Bob" },
  ];
  const days = agendaDays("2026-10-26", 2);

  it("get a column per day after the resources, or closing each day", () => {
    const first = buildGridColumns({ days, resources, withUnassigned: true });
    expect(first.map((column) => column.key).slice(-2)).toEqual([
      "unassigned|2026-10-26",
      "unassigned|2026-10-27",
    ]);
    const daysFirst = buildGridColumns({
      days,
      resources,
      withUnassigned: true,
      layout: "daysFirst",
    });
    expect(daysFirst.map((column) => column.key)).toEqual([
      "ana|2026-10-26",
      "bob|2026-10-26",
      "unassigned|2026-10-26",
      "ana|2026-10-27",
      "bob|2026-10-27",
      "unassigned|2026-10-27",
    ]);
    const [, resourceRow] = buildGridHeaders(daysFirst, {
      days,
      resources,
      layout: "daysFirst",
    });
    expect(resourceRow).toHaveLength(6);
  });

  it("hold only the events planned on no resource", () => {
    const columns = buildGridColumns({
      days: [days[0]!],
      resources,
      withUnassigned: true,
    });
    const free = occurrence("f", "2026-10-26T09:00", "2026-10-26T10:00");
    const anas = occurrence("a", "2026-10-26T09:00", "2026-10-26T10:00", {
      resourceIds: ["ana"],
    });
    expect(columns.map((column) => inColumn(free, column))).toEqual([
      false,
      false,
      true,
    ]);
    expect(columns.map((column) => inColumn(anas, column))).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe("week numbers from the week start (#34)", () => {
  it("numbers a week by its Thursday, whichever day weeks start on", () => {
    // Sunday 25 – Saturday 31 October 2026: six of its days are ISO week 44.
    expect(weekNumberOf("2026-10-25", 0)).toBe(44);
    expect(weekNumberOf("2026-10-26", 1)).toBe(44);
    expect(weekNumberOf("2026-10-24", 6)).toBe(44);
    // Sunday 27 December 2026 – Saturday 2 January 2027: week 53 of 2026.
    expect(weekNumberOf("2026-12-27", 0)).toBe(53);
  });

  it("gives each month row its own number with Sunday weeks", () => {
    const rows = monthWeeks(agendaDays("2026-08-30", 42), 0);
    expect(rows.map((row) => row.week)).toEqual([36, 37, 38, 39, 40, 41]);
  });
});

describe("the all-day row on DST days (#37)", () => {
  it("takes a midnight-to-midnight event of the 23 h day", () => {
    expect(
      isAllDayRowItem(occurrence("s", "2026-03-29T00:00", "2026-03-30T00:00")),
    ).toBe(true);
  });

  it("leaves a 24 h event of the 25 h day that stops at 23:00 in the grid", () => {
    const span = occurrence("f", "2026-10-25T00:00", "2026-10-25T23:00");
    expect(span.end - span.start).toBe(24 * 3_600_000);
    expect(isAllDayRowItem(span)).toBe(false);
  });
});

describe("overnight business hours (#38)", () => {
  const nights = [{ days: [5], start: "22:00", end: "06:00" }];

  it("shades the day before 22:00 and the next morning after 06:00 only", () => {
    expect(closedPieces(openIntervals(nights, []), 0, 1440)).toEqual([
      { top: 0, bottom: 1320 },
    ]);
    expect(closedPieces(openIntervals([], nights), 0, 1440)).toEqual([
      { top: 360, bottom: 1440 },
    ]);
  });
});

describe("deep stacks (#56)", () => {
  it("keeps every level a step further in", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      key: `e${index}`,
      top: 540 + index * 5,
      bottom: 720,
    }));
    const boxes = layoutOverlaps(items, "stack");
    const lefts = items.map((item) => boxes.get(item.key)!.left);
    for (let index = 1; index < lefts.length; index += 1) {
      expect(lefts[index]!).toBeGreaterThan(lefts[index - 1]!);
    }
    expect(lefts.at(-1)!).toBeCloseTo(0.6);
    expect(boxes.get("e7")).toMatchObject({ level: 7, depth: 8 });
  });
});

describe("backgrounds of a day (#57)", () => {
  it("lays every background of the day and keeps every name", () => {
    const spans = backgroundSpans(
      [
        { start: "2026-11-01", kind: "holiday", label: "Toussaint" },
        { start: "2026-11-01", kind: "closed", label: "Closed" },
      ],
      BRUSSELS,
    );
    const found = dayBackground(spans, "2026-11-01", null);
    expect(found?.labels).toEqual(["Toussaint", "Closed"]);
    expect(
      found?.style.backgroundImage?.split("gradient(").length,
    ).toBeGreaterThan(2);
  });
});

describe("bars towards a hidden weekend (#58)", () => {
  const weekdays = agendaDays("2026-10-26", 7, [0, 6]);

  it("does not continue past Friday into a hidden Saturday", () => {
    const layout = layoutMonthWeek(
      weekdays,
      [occurrence("l", "2026-10-29", "2026-10-31")],
      3,
      [0, 6],
    );
    expect(layout.segments[0]).toMatchObject({
      first: 3,
      last: 4,
      continuesAfter: false,
    });
  });

  it("still continues when the event runs on to a shown Monday", () => {
    const layout = layoutMonthWeek(
      weekdays,
      [occurrence("l", "2026-10-29", "2026-11-02")],
      3,
      [0, 6],
    );
    expect(layout.segments[0]).toMatchObject({ continuesAfter: true });
    const columns = buildGridColumns({ days: weekdays });
    const row = layoutAllDayRow(
      [occurrence("l", "2026-10-29", "2026-10-31")],
      columns,
      [0, 6],
    );
    expect(row.bars[0]).toMatchObject({ continuesAfter: false });
  });
});
