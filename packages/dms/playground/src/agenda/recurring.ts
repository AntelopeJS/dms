import type {
  AgendaChange,
  AgendaEvent,
  AgendaEventPatch,
  AgendaRecurrence,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import { applyPatch } from "./patch";
import {
  addDays,
  addMinutes,
  dayOf,
  daysBetween,
  DEMO_TIME_ZONE,
  isDayKey,
  minutesBetween,
  timeOf,
  zonedInstant,
} from "./time";

/*
 * A series keeps its wall clock and its days in its own zone
 * (`recurrence.timeZone`; the demos' pages draw in Europe/Brussels, so that
 * is the default here). The rules below are the block's, so the answer
 * draws what the user dropped:
 * - the series' start moves by the days and the wall time its occurrence
 *   moved (a 09:00 standup stays at 09:00 across a clock change); a weekly
 *   series on several weekdays keeps its days and takes the new time only;
 * - its end is the new start plus the occurrence's new length, in absolute
 *   minutes (a one-hour meeting stays one hour across a clock change); a
 *   series stored without an end keeps none unless the change sets one;
 * - a move by days shifts its weekdays, `exceptions` and `until` with it;
 * - switched to all-day, it takes the occurrence's own days as its bounds.
 */

const DAYS_PER_WEEK = 7;

/** The start and end of one occurrence of a series. */
interface Occurrence {
  start: string;
  end?: string;
}

/** The zone a series keeps its wall clock and its days in. */
export function seriesZone(series: AgendaEvent): string {
  return series.recurrence?.timeZone ?? DEMO_TIME_ZONE;
}

function isAllDay(event: Pick<AgendaEvent, "allDay" | "start">): boolean {
  return !!event.allDay || isDayKey(event.start);
}

/** The occurrence of a series on a day (a day of the series' zone). */
export function occurrenceOn(series: AgendaEvent, day: string): Occurrence {
  if (isAllDay(series)) {
    if (!series.end) return { start: day };
    return {
      start: day,
      end: addDays(day, daysBetween(series.start, series.end)),
    };
  }
  const zone = seriesZone(series);
  const start = zonedInstant(day, timeOf(series.start, zone), zone);
  if (!series.end) return { start };
  const length = minutesBetween(series.start, series.end);
  return { start, end: addMinutes(start, length, zone) };
}

/** A weekly series on several weekdays keeps its days when moved as a whole. */
function keepsItsDays(series: AgendaEvent): boolean {
  return (
    series.recurrence?.frequency === "weekly" &&
    (series.recurrence.weekdays?.length ?? 0) > 1
  );
}

function rotateWeekdays(weekdays: number[], days: number): number[] {
  const turn = ((days % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return weekdays.map((weekday) => (weekday + turn) % DAYS_PER_WEEK);
}

/** The recurrence of a series moved by days: its weekdays, exceptions and last day with it. */
function shiftedRecurrence(
  recurrence: AgendaRecurrence | undefined,
  days: number,
): AgendaRecurrence | undefined {
  if (!recurrence || !days) return recurrence;
  const { weekdays, exceptions, until } = recurrence;
  return {
    ...recurrence,
    ...(weekdays && { weekdays: rotateWeekdays(weekdays, days) }),
    ...(exceptions && {
      exceptions: exceptions.map((day) => addDays(day, days)),
    }),
    ...(until && { until: addDays(until, days) }),
  };
}

/** The last day an all-day bound or an (exclusive) instant end covers. */
function lastDayOf(end: string, zone: string): string {
  return isDayKey(end) ? end : dayOf(addMinutes(end, -1, zone), zone);
}

/** What an occurrence change gives the series: its bounds, its first day's shift. */
interface SeriesMove {
  start: string;
  end?: string;
  allDay?: boolean;
}

/** The days an occurrence covers once changed, for a series that is or becomes all-day. */
function allDayBounds(
  occurrence: Occurrence,
  patch: AgendaEventPatch,
  zone: string,
): [string, string | undefined] {
  const first = dayOf(patch.start ?? occurrence.start, zone);
  if (patch.end === null) return [first, undefined];
  if (patch.end) return [first, lastDayOf(patch.end, zone)];
  if (!occurrence.end) return [first, undefined];
  const length = daysBetween(
    dayOf(occurrence.start, zone),
    lastDayOf(occurrence.end, zone),
  );
  return [first, addDays(first, length)];
}

function movedSeries(
  series: AgendaEvent,
  occurrence: Occurrence,
  patch: AgendaEventPatch,
  firstDay: string,
): SeriesMove {
  const zone = seriesZone(series);
  const toAllDay =
    patch.allDay === true || (patch.allDay !== false && isAllDay(series));
  if (toAllDay) {
    const [first, last] = allDayBounds(occurrence, patch, zone);
    const end =
      last === undefined
        ? undefined
        : addDays(firstDay, daysBetween(first, last));
    return { start: firstDay, end, allDay: true };
  }
  const start = patch.start ?? occurrence.start;
  const seriesStart = zonedInstant(firstDay, timeOf(start, zone), zone);
  if (patch.end === null) return { start: seriesStart };
  const length = patch.end
    ? minutesBetween(start, patch.end)
    : occurrence.end
      ? minutesBetween(occurrence.start, occurrence.end)
      : undefined;
  return {
    start: seriesStart,
    end:
      length === undefined ? undefined : addMinutes(seriesStart, length, zone),
  };
}

/** The series changed through one of its occurrences (`scope: "series"`). */
function seriesChanged(series: AgendaEvent, change: AgendaChange): AgendaEvent {
  const zone = seriesZone(series);
  const day = change.occurrence ?? dayOf(series.start, zone);
  const occurrence = occurrenceOn(series, day);
  const { start, end, allDay, ...fields } = change.patch ?? {};
  const movedDays = start ? daysBetween(day, dayOf(start, zone)) : 0;
  const dayShift = keepsItsDays(series) ? 0 : movedDays;
  const firstDay = addDays(dayOf(series.start, zone), dayShift);
  const bounds = movedSeries(
    series,
    occurrence,
    { start, end, allDay },
    firstDay,
  );
  const { end: _end, allDay: _allDay, ...rest } = applyPatch(series, fields);
  const { end: newEnd, ...newBounds } = bounds;
  return {
    ...rest,
    ...newBounds,
    ...(newEnd !== undefined && { end: newEnd }),
    recurrence: shiftedRecurrence(series.recurrence, dayShift),
  };
}

/**
 * The events a change of one occurrence writes: the series changed as a
 * whole (`scope: "series"`), or the series with that day left out and the
 * occurrence as an event of its own, from the occurrence's bounds, changed
 * as sent.
 */
export function recurringChange(
  series: AgendaEvent,
  change: AgendaChange,
  detachedId: string,
): AgendaEvent[] {
  if (change.scope === "series") return [seriesChanged(series, change)];
  const day = change.occurrence ?? dayOf(series.start, seriesZone(series));
  const detached = applyPatch(
    occurrenceEvent(series, day, detachedId),
    change.patch,
  );
  return [withException(series, day), detached];
}

/** A series with one more day left out. */
export function withException(series: AgendaEvent, day: string): AgendaEvent {
  const recurrence = series.recurrence;
  if (!recurrence) return series;
  const exceptions = recurrence.exceptions ?? [];
  if (exceptions.includes(day)) return series;
  return {
    ...series,
    recurrence: { ...recurrence, exceptions: [...exceptions, day] },
  };
}

/** One occurrence of a series as an event of its own (unplanned alone, detached). */
export function occurrenceEvent(
  series: AgendaEvent,
  day: string,
  id: string,
): AgendaEvent {
  const { recurrence: _recurrence, end: _end, ...single } = series;
  return { ...single, ...occurrenceOn(series, day), id };
}
