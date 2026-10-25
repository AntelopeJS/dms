// The timeline and list cases of the critic's round 2: events outside the
// shown hours on the first and last shown day (N7), slivers that must not
// take a lane (N15), a zero-length event at dayEnd (N36), business hours
// with start = end read as the time grid reads them (N30), and the list's
// midnight end as the engine really builds it (#55).

import { describe, expect, it } from "vitest";
import {
  buildTimelineColumns,
  buildTimelineRows,
  dayBreaks,
  MIN_SPAN,
  placeSpan,
  type TimelineColumn,
  type TimelineResourceRow,
} from "../layers/dms-ui/app/build/composables/agenda/agendaTimelineLayout";
import { businessHourShades } from "../layers/dms-ui/app/build/composables/agenda/agendaTimelineShading";
import { buildAgendaList } from "../layers/dms-ui/app/build/composables/agenda/agendaListLayout";
import {
  buildOccurrences,
  type AgendaNormalizeSettings,
} from "../layers/dms-ui/app/build/composables/agenda/agendaOccurrences";
import { parseSlots } from "../layers/dms-ui/app/build/composables/agenda/agendaSlots";
import { dayStartEpoch } from "../layers/dms-ui/app/build/composables/agenda/agendaTime";
import type { AgendaTimelineScale } from "../layers/dms-ui/app/types/full-agenda";
import { BRUSSELS, makeDays, makeOccurrence } from "./agenda-view-fixtures";

const at = (iso: string) => Date.parse(iso);
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

interface Window {
  from: string;
  count: number;
  scale: AgendaTimelineScale;
  dayStart?: number;
  dayEnd?: number;
  hidden?: number[];
}

/** The columns of a timeline and the instants of its range, as the view builds them. */
function timeline(window: Window) {
  const days = makeDays(window.from, window.count, {
    hiddenDays: window.hidden ?? [],
  });
  const columns = buildTimelineColumns({
    days,
    scale: window.scale,
    slots: SLOTS,
    dayStartMinutes: window.dayStart ?? 0,
    dayEndMinutes: window.dayEnd ?? 1440,
    timeZone: BRUSSELS,
  });
  const range = { rangeStart: days[0]!.start, rangeEnd: days.at(-1)!.end };
  return { days, columns, range, breaks: dayBreaks(columns, window.scale) };
}

function place(
  columns: TimelineColumn[],
  range: { rangeStart: number; rangeEnd: number },
  start: string,
  end: string,
) {
  return placeSpan(columns, at(start), at(end), [], range);
}

describe("N7 events outside the shown hours on the first and last shown day", () => {
  it("keeps a flagged sliver of an evening event on a one-day timeline 08–18", () => {
    const { columns, range } = timeline({
      from: "2026-10-26",
      count: 1,
      scale: "hour",
      dayStart: 480,
      dayEnd: 1080,
    });
    const evening = place(
      columns,
      range,
      "2026-10-26T19:00:00+01:00",
      "2026-10-26T20:00:00+01:00",
    );
    expect(evening).toMatchObject({
      from: 10 - MIN_SPAN,
      to: 10,
      sliver: true,
    });
    expect(evening?.segments[0]).toMatchObject({
      continuesBefore: true,
      continuesAfter: true,
    });
  });

  it("keeps a sliver of an early event on the first day", () => {
    const { columns, range } = timeline({
      from: "2026-10-26",
      count: 2,
      scale: "hour",
      dayStart: 480,
      dayEnd: 1080,
    });
    const early = place(
      columns,
      range,
      "2026-10-26T06:00:00+01:00",
      "2026-10-26T07:00:00+01:00",
    );
    expect(early).toMatchObject({ from: 0, to: MIN_SPAN, sliver: true });
  });

  it("keeps a sliver after the last slot of the planning week's Friday", () => {
    const { columns, range } = timeline({
      from: "2026-10-26",
      count: 5,
      scale: "slot",
      hidden: [0, 6],
    });
    const friday = place(
      columns,
      range,
      "2026-10-30T18:00:00+01:00",
      "2026-10-30T19:00:00+01:00",
    );
    expect(friday).toMatchObject({ from: 20 - MIN_SPAN, to: 20, sliver: true });
  });

  it("still leaves out an event past the range's last day", () => {
    const { columns, range } = timeline({
      from: "2026-10-26",
      count: 1,
      scale: "hour",
      dayStart: 480,
      dayEnd: 1080,
    });
    expect(
      place(
        columns,
        range,
        "2026-10-27T09:00:00+01:00",
        "2026-10-27T10:00:00+01:00",
      ),
    ).toBeNull();
  });
});

describe("N15 slivers take no lane", () => {
  it("draws a lunch-break event over an S3 event without a second lane", () => {
    const { columns, range, breaks } = timeline({
      from: "2026-10-26",
      count: 1,
      scale: "slot",
    });
    const rows = buildTimelineRows({
      resources: [{ id: "ann", label: "Ann" }],
      groups: [],
      folded: new Set(),
      occurrences: [
        makeOccurrence({
          key: "s3",
          start: "2026-10-26T13:00:00+01:00",
          end: "2026-10-26T15:00:00+01:00",
          resourceIds: ["ann"],
        }),
        makeOccurrence({
          key: "lunch",
          start: "2026-10-26T12:00:00+01:00",
          end: "2026-10-26T13:00:00+01:00",
          resourceIds: ["ann"],
        }),
      ],
      columns,
      breaks,
      metrics: METRICS,
      ...range,
    });
    const ann = rows[0] as TimelineResourceRow;
    expect(ann.laneCount).toBe(1);
    expect(ann.items.map((item) => [item.key, item.lane, item.sliver])).toEqual(
      [
        ["s3", 0, false],
        ["lunch", 0, true],
      ],
    );
  });
});

describe("N36 a zero-length event at dayEnd", () => {
  it("is shown at the edge, flagged on neither side", () => {
    const { columns, range } = timeline({
      from: "2026-10-26",
      count: 1,
      scale: "hour",
      dayStart: 480,
      dayEnd: 1080,
    });
    const atEnd = place(
      columns,
      range,
      "2026-10-26T18:00:00+01:00",
      "2026-10-26T18:00:00+01:00",
    );
    expect(atEnd?.segments).toEqual([
      {
        from: 10 - MIN_SPAN,
        to: 10,
        continuesBefore: false,
        continuesAfter: false,
      },
    ]);
  });

  it("is flagged on both sides when it falls outside the shown hours", () => {
    const { columns, range } = timeline({
      from: "2026-10-26",
      count: 1,
      scale: "hour",
      dayStart: 480,
      dayEnd: 1080,
    });
    const late = place(
      columns,
      range,
      "2026-10-26T19:00:00+01:00",
      "2026-10-26T19:00:00+01:00",
    );
    expect(late?.segments[0]).toMatchObject({
      continuesBefore: true,
      continuesAfter: true,
    });
  });
});

describe("N30 business hours with start = end", () => {
  it("open from their start to midnight, as the time grid and the drop rules read them", () => {
    const { days, columns } = timeline({
      from: "2026-10-26",
      count: 1,
      scale: "hour",
    });
    const sameTimes = () => [{ days: [1], start: "08:00", end: "08:00" }];
    const shades = businessHourShades(
      columns,
      days,
      "hour",
      sameTimes,
      BRUSSELS,
    );
    expect(shades.map((shade) => [shade.from, shade.to])).toEqual([[0, 8]]);
  });
});

describe("#55 the list with occurrences built by the engine", () => {
  function settings(from: string, to: string): AgendaNormalizeSettings {
    return {
      timeZone: BRUSSELS,
      from,
      to,
      start: dayStartEpoch(from, BRUSSELS),
      end: dayStartEpoch("2026-10-31", BRUSSELS),
      defaultDurationMinutes: 60,
      editable: true,
      dragMove: true,
      dragResize: true,
      detailsContainer: "drawer",
      calendars: new Map(),
      resources: new Map(),
    };
  }

  it("lists Tuesday whole for Mon 22:00 → Wed 00:00, not 'until 00:00'", () => {
    const occurrences = buildOccurrences(
      [
        {
          id: "night",
          title: "Night",
          start: "2026-10-26T22:00:00+01:00",
          end: "2026-10-28T00:00:00+01:00",
        },
      ],
      settings("2026-10-26", "2026-10-30"),
    );
    expect(occurrences[0]).toMatchObject({
      endDay: "2026-10-27",
      endMinutes: 1440,
    });
    const list = buildAgendaList(makeDays("2026-10-26", 5), occurrences);
    expect(list.map((entry) => [entry.day.key, entry.rows[0]!.part])).toEqual([
      ["2026-10-26", "start"],
      ["2026-10-27", "middle"],
    ]);
  });

  it("still ends a Mon 22:00 → Tue 10:00 event 'until' on Tuesday", () => {
    const occurrences = buildOccurrences(
      [
        {
          id: "late",
          title: "Late",
          start: "2026-10-26T22:00:00+01:00",
          end: "2026-10-27T10:00:00+01:00",
        },
      ],
      settings("2026-10-26", "2026-10-30"),
    );
    const list = buildAgendaList(makeDays("2026-10-26", 5), occurrences);
    expect(list.map((entry) => entry.rows[0]!.part)).toEqual(["start", "end"]);
  });
});
