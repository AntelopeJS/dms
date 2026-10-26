// The timeline's edge cases found by the critic (round 1): slot targets as
// the hit test really answers them, zero-length and hidden events, a
// timeline by day, the repeated DST hour, the "No resource" row, weeks from
// the week start, the now line outside shown hours, overnight business
// hours. Every case runs on the real layout and hit-test functions.

import { describe, expect, it } from "vitest";
import {
  buildTimelineColumns,
  buildTimelineRows,
  dayBreaks,
  MIN_SPAN,
  placeSpan,
  shownPosition,
  timelineHeaderGroups,
  type TimelineColumn,
} from "../layers/dms-ui/app/build/composables/agenda/agendaTimelineLayout";
import { timelineTargetAt } from "../layers/dms-ui/app/build/composables/agenda/agendaTimelineHitTest";
import { businessHourShades } from "../layers/dms-ui/app/build/composables/agenda/agendaTimelineShading";
import {
  parseSlots,
  slotEpochRange,
  slotSpan,
} from "../layers/dms-ui/app/build/composables/agenda/agendaSlots";
import type { AgendaTimelineScale } from "../layers/dms-ui/app/types/full-agenda";
import { BRUSSELS, makeDays, makeOccurrence } from "./agenda-view-fixtures";

const WEEKEND = [0, 6];
const SLOTS = parseSlots([
  { id: "S1", label: "S1", start: "08:00", end: "10:00" },
  { id: "S2", label: "S2", start: "10:00", end: "12:00" },
  { id: "S3", label: "S3", start: "13:00", end: "15:00" },
  { id: "S4", label: "S4", start: "15:00", end: "17:00" },
]);
const at = (iso: string) => Date.parse(iso);

function columnsOf(
  from: string,
  count: number,
  scale: AgendaTimelineScale,
  window: { dayStart?: number; dayEnd?: number; hidden?: number[] } = {},
): TimelineColumn[] {
  return buildTimelineColumns({
    days: makeDays(from, count, { hiddenDays: window.hidden ?? [] }),
    scale,
    slots: SLOTS,
    dayStartMinutes: window.dayStart ?? 0,
    dayEndMinutes: window.dayEnd ?? 1440,
    timeZone: BRUSSELS,
  });
}

function target(
  columns: TimelineColumn[],
  position: number,
  scale: AgendaTimelineScale,
  resourceId: string | null = "ann",
) {
  return timelineTargetAt({
    columns,
    position,
    scale,
    resourceId,
    snapMinutes: 15,
    timeZone: BRUSSELS,
  });
}

describe("#1 slot targets as the hit test answers them", () => {
  // The planning week: Mon 26 – Fri 30 October 2026, weekends hidden.
  const columns = columnsOf("2026-10-26", 5, "slot", { hidden: WEEKEND });

  it("gives every slot column its slotIndex, its day and its start", () => {
    expect(columns).toHaveLength(20);
    const targets = columns.map((column) =>
      target(columns, column.index + 0.5, "slot"),
    );
    expect(targets.every((hit) => hit?.slotIndex !== undefined)).toBe(true);
    expect(targets.slice(0, 5)).toEqual([
      { day: "2026-10-26", slotIndex: 0, minutes: 480, resourceId: "ann" },
      { day: "2026-10-26", slotIndex: 1, minutes: 600, resourceId: "ann" },
      { day: "2026-10-26", slotIndex: 2, minutes: 780, resourceId: "ann" },
      { day: "2026-10-26", slotIndex: 3, minutes: 900, resourceId: "ann" },
      { day: "2026-10-27", slotIndex: 0, minutes: 480, resourceId: "ann" },
    ]);
    // Friday's last slot, then nothing past the range: the last column answers.
    expect(target(columns, 19.9, "slot")).toMatchObject({
      day: "2026-10-30",
      slotIndex: 3,
    });
    expect(target(columns, 25, "slot")).toMatchObject({
      day: "2026-10-30",
      slotIndex: 3,
    });
  });

  it("feeds the slot math the critic's cases expect", () => {
    const toPosition = (hit: ReturnType<typeof target>) => ({
      day: hit!.day,
      slotIndex: hit!.slotIndex!,
    });
    // Create S1 → S3 on Monday: ends at S3's end, 15:00.
    const s3 = toPosition(target(columns, 2.5, "slot"));
    expect(slotEpochRange(s3, SLOTS, BRUSSELS).end).toBe(
      at("2026-10-26T15:00:00+01:00"),
    );
    // A 6-slot event moved to Thursday S3 ends on Friday S4, not on Sunday.
    const thursdayS3 = toPosition(target(columns, 14.5, "slot"));
    expect(thursdayS3).toEqual({ day: "2026-10-29", slotIndex: 2 });
    expect(slotSpan(thursdayS3, 6, SLOTS, BRUSSELS, WEEKEND).end).toBe(
      at("2026-10-30T17:00:00+01:00"),
    );
    // A 2-slot event moved to S4 spills over to Tuesday's S1.
    const mondayS4 = toPosition(target(columns, 3.5, "slot"));
    expect(slotSpan(mondayS4, 2, SLOTS, BRUSSELS, WEEKEND).end).toBe(
      at("2026-10-27T10:00:00+01:00"),
    );
  });
});

describe("#12 zero-length events keep a sliver", () => {
  const columns = columnsOf("2026-10-26", 1, "hour");

  it("draws a reminder at 10:00 as a sliver from 10:00", () => {
    const reminder = placeSpan(
      columns,
      at("2026-10-26T10:00:00+01:00"),
      at("2026-10-26T10:00:00+01:00"),
      [],
    );
    expect(reminder).toMatchObject({ from: 10, to: 10 + MIN_SPAN });
  });

  it("draws one at midnight as a sliver, not the whole day", () => {
    const midnight = placeSpan(
      columns,
      at("2026-10-26T00:00:00+01:00"),
      at("2026-10-26T00:00:00+01:00"),
      [],
    );
    expect(midnight).toMatchObject({ from: 0, to: MIN_SPAN });
  });
});

describe("#13 a timeline by day draws timed events over whole days", () => {
  const columns = columnsOf("2026-10-26", 7, "day");

  it("gives a 09:30–18:30 shift its whole day", () => {
    const shift = placeSpan(
      columns,
      at("2026-10-27T09:30:00+01:00"),
      at("2026-10-27T18:30:00+01:00"),
      [],
      {
        wholeColumns: true,
      },
    );
    expect(shift).toMatchObject({ from: 1, to: 2 });
  });

  it("gives a night shift the two days it touches", () => {
    const night = placeSpan(
      columns,
      at("2026-10-27T22:00:00+01:00"),
      at("2026-10-28T06:00:00+01:00"),
      [],
      {
        wholeColumns: true,
      },
    );
    expect(night).toMatchObject({ from: 1, to: 3 });
  });
});

describe("#27 the repeated DST hour", () => {
  it("tells the first 02:30 from the second by the target's instant", () => {
    const columns = columnsOf("2026-10-25", 1, "hour");
    const first = target(columns, 2.25, "hour");
    const second = target(columns, 2.75, "hour");
    expect(first).toMatchObject({
      day: "2026-10-25",
      minutes: 150,
      instant: at("2026-10-25T02:30:00+02:00"),
    });
    expect(second).toMatchObject({
      day: "2026-10-25",
      minutes: 150,
      instant: at("2026-10-25T02:30:00+01:00"),
    });
  });
});

describe("#30 the No resource row", () => {
  it("answers an explicit unassigned marker, never a resource", () => {
    const columns = columnsOf("2026-10-26", 1, "hour");
    const hit = target(columns, 9.5, "hour", null);
    expect(hit).toMatchObject({ unassigned: true });
    expect(hit).not.toHaveProperty("resourceId");
    expect(target(columns, 9.5, "hour", "ann")).not.toHaveProperty(
      "unassigned",
    );
    expect(
      target(columnsOf("2026-10-26", 2, "slot"), 1.5, "slot", null),
    ).toMatchObject({ slotIndex: 1, unassigned: true });
  });
});

describe("#34 weeks from the week start in a timeline by day", () => {
  it("groups a Sunday-start week whole and numbers it by its Thursday", () => {
    const days = makeDays("2026-10-25", 7);
    const columns = columnsOf("2026-10-25", 7, "day");
    const groups = timelineHeaderGroups(columns, days, "day", 0);
    expect(groups.map((group) => [group.count, group.week])).toEqual([[7, 44]]);
  });

  it("keeps a week across New Year in one group", () => {
    const days = makeDays("2026-12-27", 14);
    const columns = buildTimelineColumns({
      days,
      scale: "day",
      slots: [],
      dayStartMinutes: 0,
      dayEndMinutes: 1440,
      timeZone: BRUSSELS,
    });
    const groups = timelineHeaderGroups(columns, days, "day", 0);
    expect(groups.map((group) => [group.key, group.count, group.week])).toEqual(
      [
        ["2026-12-27", 7, 53],
        ["2027-01-03", 7, 1],
      ],
    );
  });
});

describe("#35 the now line outside shown hours", () => {
  const columns = columnsOf("2026-10-26", 2, "hour", {
    dayStart: 480,
    dayEnd: 1080,
  });

  it("is not drawn after dayEnd, nor at the next day's start", () => {
    expect(shownPosition(columns, at("2026-10-26T20:00:00+01:00"))).toBeNull();
    expect(shownPosition(columns, at("2026-10-27T07:00:00+01:00"))).toBeNull();
    expect(shownPosition(columns, at("2026-10-26T10:30:00+01:00"))).toBe(2.5);
  });
});

describe("#36 events outside shown hours or slots", () => {
  const hours = columnsOf("2026-10-26", 2, "hour", {
    dayStart: 480,
    dayEnd: 1080,
  });
  const breaks = dayBreaks(hours, "hour");

  it("flags an event cut at dayEnd as continuing", () => {
    const late = placeSpan(
      hours,
      at("2026-10-26T17:00:00+01:00"),
      at("2026-10-26T20:00:00+01:00"),
      breaks,
    );
    expect(late?.segments).toEqual([
      { from: 9, to: 10, continuesBefore: false, continuesAfter: true },
    ]);
  });

  it("keeps a sliver of an evening event on its own day", () => {
    const evening = placeSpan(
      hours,
      at("2026-10-26T19:00:00+01:00"),
      at("2026-10-26T20:00:00+01:00"),
      breaks,
    );
    expect(evening).toMatchObject({ from: 10 - MIN_SPAN, to: 10 });
    expect(evening?.segments[0]).toMatchObject({
      continuesBefore: true,
      continuesAfter: true,
    });
  });

  it("keeps a sliver of an event after the last slot", () => {
    const slots = columnsOf("2026-10-26", 2, "slot");
    const overtime = placeSpan(
      slots,
      at("2026-10-26T18:00:00+01:00"),
      at("2026-10-26T20:00:00+01:00"),
      dayBreaks(slots, "slot"),
    );
    expect(overtime).toMatchObject({ from: 4 - MIN_SPAN, to: 4 });
  });
});

describe("#38 overnight business hours", () => {
  it("opens 22:00 → 06:00 across midnight instead of shading the whole day", () => {
    const days = makeDays("2026-10-26", 2);
    const columns = buildTimelineColumns({
      days,
      scale: "hour",
      slots: [],
      dayStartMinutes: 0,
      dayEndMinutes: 1440,
      timeZone: BRUSSELS,
    });
    const mondayNights = (weekday: number) =>
      weekday === 1 ? [{ days: [1], start: "22:00", end: "06:00" }] : [];
    const shades = businessHourShades(
      columns,
      days,
      "hour",
      mondayNights,
      BRUSSELS,
    );
    // Monday closed until 22:00; Tuesday open until 06:00, closed after.
    expect(shades.map((shade) => [shade.from, shade.to])).toEqual([
      [0, 22],
      [30, 48],
    ]);
  });
});

describe("timeline at scale", () => {
  const METRICS = {
    laneHeight: 30,
    rowPadding: 4,
    minRowHeight: 44,
    groupHeight: 32,
  };
  const HOUR = 3_600_000;

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
