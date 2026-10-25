import { describe, expect, it } from "vitest";
import {
  buildTimelineColumns,
  buildTimelineRows,
  columnPosition,
  dayBreaks,
  effectiveScale,
  placeSpan,
  timelineHeaderGroups,
  type TimelineColumn,
  type TimelineResourceRow,
} from "../layers/dms-ui/app/build/composables/agenda/agendaTimelineLayout";
import {
  rowAt,
  timelineTargetAt,
} from "../layers/dms-ui/app/build/composables/agenda/agendaTimelineHitTest";
import {
  backgroundShades,
  businessHourShades,
} from "../layers/dms-ui/app/build/composables/agenda/agendaTimelineShading";
import { backgroundSpans } from "../layers/dms-ui/app/build/composables/agenda/agendaBackgroundSpans";
import { parseSlots } from "../layers/dms-ui/app/build/composables/agenda/agendaSlots";
import { BRUSSELS, makeDays, makeOccurrence } from "./agenda-view-fixtures";

const HOUR = 3_600_000;
const METRICS = {
  laneHeight: 30,
  rowPadding: 4,
  minRowHeight: 44,
  groupHeight: 32,
};
const SLOTS = parseSlots([
  { id: "S1", label: "S1", start: "08:00", end: "10:00" },
  { id: "S2", label: "S2", start: "10:00", end: "12:00" },
  { id: "S3", label: "S3", start: "13:00", end: "15:00" },
  { id: "S4", label: "S4", start: "15:00", end: "17:00" },
]);

function hourColumns(from: string, count: number, timeZone = BRUSSELS) {
  return buildTimelineColumns({
    days: makeDays(from, count, { timeZone }),
    scale: "hour",
    slots: [],
    dayStartMinutes: 0,
    dayEndMinutes: 1440,
    timeZone,
  });
}

function slotColumns(from: string, count: number) {
  const days = makeDays(from, count, { hiddenDays: [0, 6] });
  const columns = buildTimelineColumns({
    days,
    scale: "slot",
    slots: SLOTS,
    dayStartMinutes: 0,
    dayEndMinutes: 1440,
    timeZone: BRUSSELS,
  });
  return { days, columns };
}

function rowsOf(
  columns: TimelineColumn[],
  occurrences = [] as ReturnType<typeof makeOccurrence>[],
) {
  return buildTimelineRows({
    resources: [
      { id: "ann", label: "Ann", group: "arch" },
      { id: "bob", label: "Bob", group: "draw" },
      { id: "cid", label: "Cid" },
    ],
    groups: [
      { id: "draw", label: "Dessinateurs" },
      { id: "arch", label: "Architectes" },
    ],
    folded: new Set(["draw"]),
    occurrences,
    columns,
    breaks: dayBreaks(columns, "hour"),
    metrics: METRICS,
  });
}

describe("timeline columns", () => {
  it("has 25 hour columns, one lasting two hours, on 2026-10-25 in Brussels", () => {
    const columns = hourColumns("2026-10-25", 1);
    expect(columns).toHaveLength(24);
    const twoHours = columns.filter(
      (column) => column.end - column.start === 2 * HOUR,
    );
    expect(twoHours.map((column) => column.minutes)).toEqual([120]);
    expect(columns.at(-1)!.end - columns[0]!.start).toBe(25 * HOUR);
  });

  it("drops the hour a spring-forward day skips", () => {
    const columns = hourColumns("2026-03-29", 1);
    expect(columns).toHaveLength(23);
    expect(columns.map((column) => column.minutes)).not.toContain(120);
  });

  it("has a column per slot of each shown day", () => {
    const { days, columns } = slotColumns("2026-10-22", 3);
    expect(days.map((day) => day.key)).toEqual([
      "2026-10-22",
      "2026-10-23",
      "2026-10-26",
    ]);
    expect(columns).toHaveLength(12);
    expect(columns[4]).toMatchObject({
      day: "2026-10-23",
      slotIndex: 0,
      firstOfDay: true,
    });
    expect(dayBreaks(columns, "slot")).toEqual([4, 8]);
    expect(
      timelineHeaderGroups(columns, days, "slot").map((group) => group.count),
    ).toEqual([4, 4, 4]);
  });

  it("groups day columns by week in the header", () => {
    const days = makeDays("2026-09-28", 21);
    const columns = buildTimelineColumns({
      days,
      scale: "day",
      slots: [],
      dayStartMinutes: 0,
      dayEndMinutes: 1440,
      timeZone: BRUSSELS,
    });
    expect(columns).toHaveLength(21);
    const groups = timelineHeaderGroups(columns, days, "day");
    expect(groups.map((group) => group.day.week)).toEqual([40, 41, 42]);
    expect(dayBreaks(columns, "day")).toEqual([]);
  });

  it("falls back to hours for a slot scale without slots", () => {
    expect(effectiveScale("slot", [])).toBe("hour");
    expect(effectiveScale("slot", SLOTS)).toBe("slot");
  });
});

describe("timeline positions", () => {
  it("maps an instant inside, between and outside slot columns", () => {
    const { columns } = slotColumns("2026-10-22", 2);
    expect(
      columnPosition(columns, Date.parse("2026-10-22T09:00:00+02:00")),
    ).toBe(0.5);
    // The lunch break sits at the edge of S3.
    expect(
      columnPosition(columns, Date.parse("2026-10-22T12:30:00+02:00")),
    ).toBe(2);
    expect(
      columnPosition(columns, Date.parse("2026-10-21T12:00:00+02:00")),
    ).toBe(0);
    expect(
      columnPosition(columns, Date.parse("2026-10-24T12:00:00+02:00")),
    ).toBe(8);
  });

  it("spills a six-slot task over the next shown day as a continuation segment", () => {
    const { columns } = slotColumns("2026-10-22", 3);
    const placed = placeSpan(
      columns,
      Date.parse("2026-10-22T13:00:00+02:00"),
      Date.parse("2026-10-23T17:00:00+02:00"),
      dayBreaks(columns, "slot"),
    );
    expect(placed).toMatchObject({ from: 2, to: 8 });
    expect(placed!.segments).toEqual([
      { from: 2, to: 4, continuesBefore: false, continuesAfter: true },
      { from: 4, to: 8, continuesBefore: true, continuesAfter: false },
    ]);
  });

  it("spills a Friday task over the hidden weekend onto Monday", () => {
    const { columns } = slotColumns("2026-10-22", 3);
    const placed = placeSpan(
      columns,
      Date.parse("2026-10-23T15:00:00+02:00"),
      Date.parse("2026-10-26T12:00:00+01:00"),
      dayBreaks(columns, "slot"),
    );
    expect(
      placed!.segments.map((segment) => [segment.from, segment.to]),
    ).toEqual([
      [7, 8],
      [8, 10],
    ]);
  });

  it("marks a segment clipped by the range", () => {
    const { columns } = slotColumns("2026-10-22", 1);
    const placed = placeSpan(
      columns,
      Date.parse("2026-10-21T08:00:00+02:00"),
      Date.parse("2026-10-23T12:00:00+02:00"),
      [],
    );
    expect(placed!.segments).toEqual([
      { from: 0, to: 4, continuesBefore: true, continuesAfter: true },
    ]);
  });

  it("leaves out an event inside a gap", () => {
    const { columns } = slotColumns("2026-10-22", 1);
    const lunch = placeSpan(
      columns,
      Date.parse("2026-10-22T12:00:00+02:00"),
      Date.parse("2026-10-22T13:00:00+02:00"),
      [],
    );
    expect(lunch).toBeNull();
  });
});

describe("timeline rows", () => {
  const columns = hourColumns("2026-10-26", 1);

  it("lists ungrouped resources, then groups with counts, folded ones without their rows", () => {
    const rows = rowsOf(columns);
    expect(rows.map((row) => row.key)).toEqual([
      "r:cid",
      "g:draw",
      "g:arch",
      "r:ann",
    ]);
    expect(rows[1]).toMatchObject({
      kind: "group",
      count: 1,
      folded: true,
      height: 32,
    });
    expect(rows.map((row) => row.top)).toEqual([0, 44, 76, 108]);
  });

  it("stacks overlapping events in lanes and grows the row", () => {
    const occurrences = [
      makeOccurrence({
        key: "a",
        start: "2026-10-26T09:00:00+01:00",
        end: "2026-10-26T11:00:00+01:00",
        resourceIds: ["ann"],
      }),
      makeOccurrence({
        key: "b",
        start: "2026-10-26T10:00:00+01:00",
        end: "2026-10-26T12:00:00+01:00",
        resourceIds: ["ann"],
      }),
      makeOccurrence({
        key: "c",
        start: "2026-10-26T11:00:00+01:00",
        end: "2026-10-26T12:00:00+01:00",
        resourceIds: ["ann", "cid"],
      }),
    ];
    const rows = rowsOf(columns, occurrences);
    const ann = rows.find((row) => row.key === "r:ann") as TimelineResourceRow;
    expect(ann.laneCount).toBe(2);
    expect(
      Object.fromEntries(ann.items.map((item) => [item.key, item.lane])),
    ).toEqual({ a: 0, b: 1, c: 0 });
    expect(ann.height).toBe(2 * 30 + 2 * 4);
    const cid = rows.find((row) => row.key === "r:cid") as TimelineResourceRow;
    expect(cid.items.map((item) => item.key)).toEqual(["c"]);
  });

  it("adds a row for events of no resource, and a staged ghost beside its event", () => {
    const moved = makeOccurrence({
      key: "m",
      start: "2026-10-26T14:00:00+01:00",
      end: "2026-10-26T15:00:00+01:00",
      resourceIds: ["cid"],
    });
    moved.ghost = {
      start: Date.parse("2026-10-26T14:00:00+01:00"),
      end: Date.parse("2026-10-26T15:00:00+01:00"),
      allDay: false,
      resourceIds: ["cid"],
    };
    const loose = makeOccurrence({
      key: "x",
      start: "2026-10-26T08:00:00+01:00",
      end: "2026-10-26T09:00:00+01:00",
    });
    const rows = rowsOf(columns, [moved, loose]);
    const cid = rows.find((row) => row.key === "r:cid") as TimelineResourceRow;
    expect(cid.items.map((item) => [item.key, item.ghost, item.lane])).toEqual([
      ["m#ghost", true, 0],
      ["m", false, 1],
    ]);
    expect(rows.at(-1)).toMatchObject({ key: "r:none", resource: null });
  });

  it("finds the row at a height", () => {
    const rows = rowsOf(columns);
    expect(rowAt(rows, 0)?.key).toBe("r:cid");
    expect(rowAt(rows, 50)?.key).toBe("g:draw");
    expect(rowAt(rows, 120)?.key).toBe("r:ann");
    expect(rowAt(rows, 999)).toBeNull();
  });

  it("keeps 60 resources over a week quick to lay out", () => {
    const days = makeDays("2026-10-26", 7);
    const weekColumns = buildTimelineColumns({
      days,
      scale: "hour",
      slots: [],
      dayStartMinutes: 420,
      dayEndMinutes: 1260,
      timeZone: BRUSSELS,
    });
    const resources = Array.from({ length: 60 }, (_, index) => ({
      id: `p${index}`,
      label: `P${index}`,
    }));
    const occurrences = resources.flatMap((resource, index) =>
      days.flatMap((day) =>
        [9, 11, 14].map((hour) =>
          makeOccurrence({
            key: `${resource.id}-${day.key}-${hour}`,
            start: new Date(
              day.start + (hour + (index % 2)) * HOUR,
            ).toISOString(),
            end: new Date(day.start + (hour + 2) * HOUR).toISOString(),
            resourceIds: [resource.id],
          }),
        ),
      ),
    );
    const started = performance.now();
    const rows = buildTimelineRows({
      resources,
      groups: [],
      folded: new Set(),
      occurrences,
      columns: weekColumns,
      breaks: dayBreaks(weekColumns, "hour"),
      metrics: METRICS,
    });
    expect(rows).toHaveLength(60);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("timeline targets and shading", () => {
  it("snaps a point of an hour column to the snap minutes", () => {
    const columns = hourColumns("2026-10-26", 1);
    expect(
      timelineTargetAt({
        columns,
        position: 9.6,
        scale: "hour",
        resourceId: "ann",
        snapMinutes: 15,
        timeZone: BRUSSELS,
      }),
    ).toEqual({
      day: "2026-10-26",
      minutes: 9 * 60 + 30,
      resourceId: "ann",
    });
  });

  it("reads the repeated hour of the DST day by wall clock", () => {
    const columns = hourColumns("2026-10-25", 1);
    // Column 2 is 02:00 CEST → 03:00 CET; three quarters in is 02:30 CET.
    expect(
      timelineTargetAt({
        columns,
        position: 2.75,
        scale: "hour",
        resourceId: null,
        snapMinutes: 30,
        timeZone: BRUSSELS,
      }),
    ).toEqual({
      day: "2026-10-25",
      minutes: 150,
    });
  });

  it("answers a slot or a day cell", () => {
    const { columns } = slotColumns("2026-10-22", 2);
    expect(
      timelineTargetAt({
        columns,
        position: 6.2,
        scale: "slot",
        resourceId: "bob",
        snapMinutes: 15,
        timeZone: BRUSSELS,
      }),
    ).toEqual({
      day: "2026-10-23",
      minutes: 13 * 60,
      slotIndex: 2,
      resourceId: "bob",
    });
    const days = buildTimelineColumns({
      days: makeDays("2026-10-26", 3),
      scale: "day",
      slots: [],
      dayStartMinutes: 0,
      dayEndMinutes: 1440,
      timeZone: BRUSSELS,
    });
    expect(
      timelineTargetAt({
        columns: days,
        position: 1.5,
        scale: "day",
        resourceId: null,
        snapMinutes: 15,
        timeZone: BRUSSELS,
      }),
    ).toEqual({
      day: "2026-10-27",
      allDay: true,
    });
  });

  it("shades the hours outside business hours, a closed day whole", () => {
    const days = makeDays("2026-10-24", 2);
    const columns = buildTimelineColumns({
      days,
      scale: "hour",
      slots: [],
      dayStartMinutes: 480,
      dayEndMinutes: 1200,
      timeZone: BRUSSELS,
    });
    const saturdayOnly = (weekday: number) =>
      weekday === 6 ? [{ days: [6], start: "10:00", end: "18:00" }] : [];
    const shades = businessHourShades(
      columns,
      days,
      "hour",
      saturdayOnly,
      BRUSSELS,
    );
    expect(shades.map((shade) => [shade.from, shade.to])).toEqual([
      [0, 2],
      [10, 12],
      [12, 24],
    ]);
  });

  it("lays backgrounds behind the rows they apply to", () => {
    const days = makeDays("2026-10-26", 7);
    const columns = buildTimelineColumns({
      days,
      scale: "day",
      slots: [],
      dayStartMinutes: 0,
      dayEndMinutes: 1440,
      timeZone: BRUSSELS,
    });
    const spans = backgroundSpans(
      [
        {
          id: "toussaint",
          start: "2026-11-01",
          kind: "holiday",
          label: "Toussaint",
        },
        {
          id: "shut",
          start: "2026-10-27",
          end: "2026-10-28",
          kind: "closed",
          resourceIds: ["ann"],
        },
      ],
      BRUSSELS,
    );
    expect(
      backgroundShades(columns, spans, "bob").map((shade) => [
        shade.key,
        shade.from,
        shade.to,
      ]),
    ).toEqual([["b:toussaint", 6, 7]]);
    const ann = backgroundShades(columns, spans, "ann");
    expect(ann.map((shade) => [shade.key, shade.from, shade.to])).toEqual([
      ["b:toussaint", 6, 7],
      ["b:shut", 1, 3],
    ]);
    expect(ann[1]!.style.backgroundImage).toContain(
      "repeating-linear-gradient",
    );
  });
});
