import type {
  AgendaChange,
  AgendaEvent,
  AgendaEventPatch,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import { applyPatch } from "./patch";
import {
  addDays,
  addMinutes,
  dayOf,
  daysBetween,
  isDayKey,
  minutesBetween,
  timeOf,
  zonedInstant,
} from "./time";

/*
 * The demos' series keep their wall clock and their days in the demo zone
 * (`recurrence.timeZone: "Europe/Brussels"` on each): a 09:00 standup stays
 * at 09:00 there across clock changes, and the days below are its days.
 */

const DAYS_PER_WEEK = 7;
const DEFAULT_MINUTES = 60;

/** The start and end of one occurrence of a series. */
interface Occurrence {
  start: string;
  end: string;
}

function isAllDay(series: AgendaEvent): boolean {
  return !!series.allDay || isDayKey(series.start);
}

/** The occurrence of a series on a day: the series' wall times, on that day. */
export function occurrenceOn(series: AgendaEvent, day: string): Occurrence {
  if (isAllDay(series)) {
    const length = daysBetween(series.start, series.end ?? series.start);
    return { start: day, end: addDays(day, length) };
  }
  const minutes = series.end
    ? minutesBetween(series.start, series.end)
    : DEFAULT_MINUTES;
  const start = zonedInstant(day, timeOf(series.start));
  return { start, end: addMinutes(start, minutes) };
}

function rotateWeekdays(weekdays: number[], days: number): number[] {
  return weekdays.map(
    (weekday) =>
      (((weekday + days) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK,
  );
}

/** The bounds of a series moved or resized as its occurrence was. */
interface SeriesBounds {
  start: string;
  end?: string;
}

/**
 * New bounds of a series: its first day shifted by the days the occurrence
 * moved (in the series' zone), its start at the occurrence's new wall time,
 * its length the occurrence's new length. A move across a clock change
 * keeps the wall time: 09:00 stays 09:00.
 */
function seriesBounds(
  series: AgendaEvent,
  occurrence: Occurrence,
  patch: AgendaEventPatch,
  dayShift: number,
): SeriesBounds {
  const start = patch.start ?? occurrence.start;
  const firstDay = addDays(dayOf(series.start), dayShift);
  if (patch.end === null) {
    return {
      start: isAllDay(series)
        ? firstDay
        : zonedInstant(firstDay, timeOf(start)),
    };
  }
  if (isAllDay(series)) {
    const length = patch.end
      ? daysBetween(start, patch.end)
      : daysBetween(occurrence.start, occurrence.end);
    return { start: firstDay, end: addDays(firstDay, length) };
  }
  const length = patch.end
    ? minutesBetween(start, patch.end)
    : minutesBetween(occurrence.start, occurrence.end);
  const seriesStart = zonedInstant(firstDay, timeOf(start));
  return { start: seriesStart, end: addMinutes(seriesStart, length) };
}

/**
 * The series moved as its occurrence was. A series on one weekday (or on
 * its start's) moves by the days the occurrence moved, its weekday with it;
 * a series on several weekdays keeps its days and takes the new time only.
 * The other fields are set as sent.
 */
function seriesChanged(series: AgendaEvent, change: AgendaChange): AgendaEvent {
  const day = change.occurrence ?? dayOf(series.start);
  const occurrence = occurrenceOn(series, day);
  const { start, end, ...fields } = change.patch ?? {};
  const weekdays = series.recurrence?.weekdays;
  const movedDays = start ? daysBetween(day, dayOf(start)) : 0;
  const dayShift = weekdays && weekdays.length > 1 ? 0 : movedDays;
  const bounds = seriesBounds(series, occurrence, { start, end }, dayShift);
  const { end: _end, ...rest } = applyPatch(series, fields);
  return {
    ...rest,
    ...bounds,
    recurrence: series.recurrence && {
      ...series.recurrence,
      ...(weekdays &&
        dayShift && { weekdays: rotateWeekdays(weekdays, dayShift) }),
    },
  };
}

/**
 * The events a change of one occurrence writes: the series moved as a whole
 * (`scope: "series"`), or the series with that day left out and the
 * occurrence as an event of its own, from the occurrence's bounds, changed
 * as sent.
 */
export function recurringChange(
  series: AgendaEvent,
  change: AgendaChange,
  detachedId: string,
): AgendaEvent[] {
  if (change.scope === "series") return [seriesChanged(series, change)];
  const day = change.occurrence ?? dayOf(series.start);
  const { recurrence, ...single } = series;
  const detached = applyPatch(
    { ...single, ...occurrenceOn(series, day), id: detachedId },
    change.patch,
  );
  const exceptions = [...(recurrence?.exceptions ?? []), day];
  return [
    { ...series, recurrence: recurrence && { ...recurrence, exceptions } },
    detached,
  ];
}
