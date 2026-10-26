// The open stretches of a day from business hours, overnight hours split at
// midnight: "22:00–06:00" on Friday opens Friday 22:00–24:00 and Saturday
// 00:00–06:00. The time grid shades the rest; the drop rules keep to them.

import type { AgendaBusinessHours } from "../../../types/full-agenda";
import { MINUTES_PER_DAY, parseTimeOfDay } from "./agendaTime";

/** An open stretch of a day, wall minutes, end exclusive. */
export interface AgendaOpenInterval {
  start: number;
  end: number;
}

/**
 * The open stretches of a day, in order: its own hours (an overnight one up
 * to midnight) and the mornings that the day before's overnight hours run
 * into.
 */
export function openIntervals(
  today: AgendaBusinessHours[],
  dayBefore: AgendaBusinessHours[],
): AgendaOpenInterval[] {
  const read = (hours: AgendaBusinessHours) => ({
    start: parseTimeOfDay(hours.start, 0),
    end: parseTimeOfDay(hours.end, MINUTES_PER_DAY),
  });
  const own = today
    .map(read)
    .map((interval) =>
      interval.end > interval.start
        ? interval
        : { start: interval.start, end: MINUTES_PER_DAY },
    );
  const carried = dayBefore
    .map(read)
    .filter((interval) => interval.end < interval.start && interval.end > 0)
    .map((interval) => ({ start: 0, end: interval.end }));
  return [...carried, ...own]
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
}

/** The piece `from`–`to` of a day lies within one open stretch. */
export function withinOpen(
  intervals: AgendaOpenInterval[],
  from: number,
  to: number,
): boolean {
  return intervals.some(
    (interval) => interval.start <= from && to <= interval.end,
  );
}
