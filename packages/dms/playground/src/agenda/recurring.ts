import type {
  AgendaChange,
  AgendaEvent,
} from "@antelopejs/interface-dms/base/full-agenda-types";
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

const DAYS_PER_WEEK = 7;
const DEFAULT_MINUTES = 60;

/** The start and end of one occurrence of a series. */
interface Occurrence {
  start: string;
  end: string;
}

/** The occurrence of a series on a day: the series' times, on that day. */
export function occurrenceOn(series: AgendaEvent, day: string): Occurrence {
  if (series.allDay || isDayKey(series.start)) {
    const length = daysBetween(series.start, series.end ?? series.start);
    return { start: day, end: addDays(day, length) };
  }
  const minutes = series.end
    ? minutesBetween(series.start, series.end)
    : DEFAULT_MINUTES;
  const start = zonedInstant(day, timeOf(series.start));
  return { start, end: addMinutes(start, minutes) };
}

/** How far a change moved a start or an end, in minutes or in days. */
function shift(allDay: boolean, from: string, to: string | undefined): number {
  if (!to) return 0;
  return allDay ? daysBetween(from, to) : minutesBetween(from, to);
}

function shifted(allDay: boolean, value: string, amount: number): string {
  return allDay ? addDays(value, amount) : addMinutes(value, amount);
}

function rotateWeekdays(weekdays: number[], days: number): number[] {
  return weekdays.map(
    (weekday) =>
      (((weekday + days) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK,
  );
}

/**
 * The series moved as its occurrence was: the start and the end shift by
 * what the occurrence's did, a weekly series' weekdays follow a move to
 * another day, the other fields are set as sent.
 */
function seriesChanged(series: AgendaEvent, change: AgendaChange): AgendaEvent {
  const day = change.occurrence ?? dayOf(series.start);
  const occurrence = occurrenceOn(series, day);
  const { start, end, ...fields } = change.patch ?? {};
  const allDay = !!series.allDay || isDayKey(series.start);
  const startShift = shift(allDay, occurrence.start, start);
  const endShift = shift(allDay, occurrence.end, end);
  const movedDays = start ? daysBetween(day, dayOf(start)) : 0;
  const recurrence = series.recurrence && {
    ...series.recurrence,
    ...(series.recurrence.weekdays &&
      movedDays && {
        weekdays: rotateWeekdays(series.recurrence.weekdays, movedDays),
      }),
  };
  return {
    ...series,
    ...fields,
    data: fields.data ? { ...series.data, ...fields.data } : series.data,
    start: shifted(allDay, series.start, startShift),
    end: series.end && shifted(allDay, series.end, endShift),
    recurrence,
  };
}

/**
 * The events a change of one occurrence writes: the series moved as a whole
 * (`scope: "series"`), or the series with that day left out and the
 * occurrence as an event of its own, changed as sent.
 */
export function recurringChange(
  series: AgendaEvent,
  change: AgendaChange,
  detachedId: string,
): AgendaEvent[] {
  if (change.scope === "series") return [seriesChanged(series, change)];
  const day = change.occurrence ?? dayOf(series.start);
  const { recurrence, ...single } = series;
  const occurrence = occurrenceOn(series, day);
  const { data, ...fields } = change.patch ?? {};
  const detached: AgendaEvent = {
    ...single,
    ...occurrence,
    ...Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    ),
    id: detachedId,
    data: data ? { ...series.data, ...data } : series.data,
  };
  const exceptions = [...(recurrence?.exceptions ?? []), day];
  return [
    { ...series, recurrence: recurrence && { ...recurrence, exceptions } },
    detached,
  ];
}
