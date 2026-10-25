// Pure layout of the `month` view: the weeks of the range, the events of a
// week as bars in lanes, and the "+N more" left over on a crowded day. The
// lane packing also lays out the all-day row of the time grid.

import type { AgendaDay, AgendaOccurrence } from "./agendaModel";
import { addDays, isoWeekOf, startOfWeek } from "./agendaTime";
import { shiftShownDay } from "./agendaSlots";

/** A row of the month: the shown days of one week. */
export interface AgendaWeekRow {
  /** The week's first day (shown or not). */
  key: string;
  days: AgendaDay[];
  /** ISO week number of the row, counted from its first day (see {@link weekNumberOf}). */
  week: number;
}

const THURSDAY = 4;
const DAYS_PER_WEEK = 7;

/**
 * The ISO number of a week that starts on `weekStart`: the number of its
 * Thursday, whichever day the weeks start on. A Sunday-start week 25–31
 * October 2026 is week 44, not the 43 of its Sunday.
 */
export function weekNumberOf(weekStart: string, weekStartsOn: number): number {
  const toThursday = (THURSDAY - weekStartsOn + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return isoWeekOf(addDays(weekStart, toThursday));
}

/** Something to lay out over consecutive columns, `first` to `last` inclusive. */
export interface AgendaLaneInput {
  key: string;
  first: number;
  last: number;
}

/** How a chip of the month is drawn: a bar over days, or a dot and a time. */
export type AgendaMonthChipLayout = "bar" | "dot";

/** A piece of an event in a week row, on one lane. */
export interface AgendaMonthSegment {
  occurrence: AgendaOccurrence;
  lane: number;
  /** Day columns of the row, inclusive. */
  first: number;
  last: number;
  /** The event runs on before / after this piece (a square edge). */
  continuesBefore: boolean;
  continuesAfter: boolean;
  layout: AgendaMonthChipLayout;
}

/** A week row laid out. */
export interface AgendaMonthWeekLayout {
  segments: AgendaMonthSegment[];
  /** Per day column: how many of its events are not drawn ("+N more"). */
  more: number[];
  /** Per day column: every event of the day, in drawing order (the popover). */
  dayEvents: AgendaOccurrence[][];
  /** Lanes drawn in the tallest cell of the row. */
  lanes: number;
}

/** Splits the days of a month range into week rows. */
export function monthWeeks(
  days: AgendaDay[],
  weekStartsOn: number,
): AgendaWeekRow[] {
  const rows: AgendaWeekRow[] = [];
  for (const day of days) {
    const key = startOfWeek(day.key, weekStartsOn);
    const current = rows.at(-1);
    if (current?.key === key) current.days.push(day);
    else rows.push({ key, days: [day], week: weekNumberOf(key, weekStartsOn) });
  }
  return rows;
}

/**
 * The lowest free lane of each item, in the order given: sort by first
 * column, longest first, for the classic calendar packing.
 */
export function packLanes(items: AgendaLaneInput[]): Map<string, number> {
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const item of items) {
    let lane = laneEnds.findIndex((end) => end < item.first);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.last;
    lanes.set(item.key, lane);
  }
  return lanes;
}

interface WeekItem extends AgendaLaneInput {
  occurrence: AgendaOccurrence;
}

/** The columns of `days` an occurrence covers, or `null` when none. */
export function coveredColumns(
  occurrence: Pick<AgendaOccurrence, "startDay" | "endDay">,
  days: Pick<AgendaDay, "key">[],
): AgendaLaneInput | null {
  let first = -1;
  let last = -1;
  days.forEach((day, index) => {
    if (day.key < occurrence.startDay || day.key > occurrence.endDay) return;
    if (first === -1) first = index;
    last = index;
  });
  return first === -1 ? null : { key: "", first, last };
}

/** Multi-day and all-day events first, then by start: the order of a day cell. */
export function compareDayItems(a: WeekItem, b: WeekItem): number {
  return (
    a.first - b.first ||
    b.last - b.first - (a.last - a.first) ||
    Number(b.occurrence.allDay) - Number(a.occurrence.allDay) ||
    a.occurrence.start - b.occurrence.start ||
    a.occurrence.key.localeCompare(b.occurrence.key)
  );
}

function weekItems(
  days: AgendaDay[],
  occurrences: AgendaOccurrence[],
): WeekItem[] {
  const items: WeekItem[] = [];
  for (const occurrence of occurrences) {
    const span = coveredColumns(occurrence, days);
    if (span) items.push({ ...span, key: occurrence.key, occurrence });
  }
  return items.sort(compareDayItems);
}

function chipLayout(item: WeekItem): AgendaMonthChipLayout {
  const { occurrence } = item;
  return occurrence.allDay || occurrence.startDay !== occurrence.endDay
    ? "bar"
    : "dot";
}

/** Cuts an item into the runs of days where its lane is drawn. */
function itemSegments(
  item: WeekItem,
  lane: number,
  visibleLanes: number[],
  days: AgendaDay[],
  hiddenDays: readonly number[],
): AgendaMonthSegment[] {
  const segments: AgendaMonthSegment[] = [];
  let runStart = -1;
  const close = (end: number) => {
    if (runStart === -1) return;
    segments.push({
      occurrence: item.occurrence,
      lane,
      first: runStart,
      last: end,
      // It continues only towards a shown day, not into a hidden weekend.
      continuesBefore:
        item.occurrence.startDay <=
        shiftShownDay(days[runStart]!.key, -1, hiddenDays),
      continuesAfter:
        item.occurrence.endDay >= shiftShownDay(days[end]!.key, 1, hiddenDays),
      layout: chipLayout(item),
    });
    runStart = -1;
  };
  for (let column = item.first; column <= item.last; column += 1) {
    if (lane < visibleLanes[column]!) {
      if (runStart === -1) runStart = column;
    } else close(column - 1);
  }
  close(item.last);
  return segments;
}

/**
 * Lays out a week row: each event on the lowest free lane over its days; a
 * day holding more than `maxEventsPerDay` draws one lane less and a "+N
 * more" in its place, and a bar crossing it is cut there.
 */
export function layoutMonthWeek(
  days: AgendaDay[],
  occurrences: AgendaOccurrence[],
  maxEventsPerDay: number,
  hiddenDays: readonly number[] = [],
): AgendaMonthWeekLayout {
  const limit = Math.max(1, maxEventsPerDay);
  const items = weekItems(days, occurrences);
  const lanes = packLanes(items);
  const dayEvents: AgendaOccurrence[][] = days.map(() => []);
  for (const item of items) {
    for (let column = item.first; column <= item.last; column += 1) {
      dayEvents[column]!.push(item.occurrence);
    }
  }
  const visibleLanes = dayEvents.map((events) =>
    events.length > limit ? limit - 1 : limit,
  );
  const segments = items.flatMap((item) =>
    itemSegments(item, lanes.get(item.key)!, visibleLanes, days, hiddenDays),
  );
  const drawn = days.map(() => 0);
  for (const segment of segments) {
    for (let column = segment.first; column <= segment.last; column += 1) {
      drawn[column]! += 1;
    }
  }
  const more = dayEvents.map(
    (events, column) => events.length - drawn[column]!,
  );
  const usedLanes = segments.reduce(
    (max, segment) => Math.max(max, segment.lane + 1),
    0,
  );
  const hasMore = more.some((count) => count > 0);
  return {
    segments,
    more,
    dayEvents,
    lanes: Math.min(limit, usedLanes + (hasMore ? 1 : 0)),
  };
}

/**
 * The names of the month's roving elements: a day number, a piece of an
 * event (a week, the event, its first column), a day's "+N more".
 */
export const rovingToken = {
  day: (day: string) => `day:${day}`,
  chip: (
    weekKey: string,
    segment: Pick<AgendaMonthSegment, "occurrence" | "first">,
  ) => `chip:${weekKey}:${segment.occurrence.key}:${segment.first}`,
  more: (day: string) => `more:${day}`,
};
