// Recurring events expanded into the days they fall on, for the range shown.
// A series keeps its wall-clock times across DST (a 09:00 standup stays at
// 09:00), and follows RFC 5545: weeks start on Monday, a monthly series on
// the 31st skips the months without one, excluded days still count.

import type { AgendaRecurrence } from "../../../types/full-agenda";
import type { AgendaDayKey } from "./agendaModel";
import {
  addDays,
  addMonths,
  DAYS_PER_WEEK,
  daysInMonth,
  dayKeyOf,
  parseDayKey,
  startOfWeek,
  weekdayOf,
} from "./agendaTime";

/** RFC 5545's default week start (WKST=MO): a series never depends on the reader. */
const SERIES_WEEK_START = 1;
const MONTHS_PER_YEAR = 12;
/** A walk stops after this many candidates (a series with no end, read far ahead). */
const MAX_CANDIDATES = 20_000;

/** The days a series falls on within a window, and the day it ends. */
export interface RecurrenceWindow {
  /** First day shown: an occurrence starting earlier and still running is kept. */
  from: AgendaDayKey;
  /** Last day shown, inclusive. */
  to: AgendaDayKey;
  /** Days an occurrence covers past its first (0 for a one-day event). */
  spanDays: number;
}

/** Calls `visit` with each day of the series in order, until it returns `false`. */
type DayWalk = (visit: (day: AgendaDayKey) => boolean) => void;

const interval = (rule: AgendaRecurrence) =>
  Math.max(1, Math.floor(rule.interval ?? 1));

function walkDaily(start: AgendaDayKey, rule: AgendaRecurrence): DayWalk {
  return (visit) => {
    for (let index = 0; index < MAX_CANDIDATES; index++) {
      if (!visit(addDays(start, index * interval(rule)))) return;
    }
  };
}

function walkWeekly(start: AgendaDayKey, rule: AgendaRecurrence): DayWalk {
  const weekdays = rule.weekdays?.length ? rule.weekdays : [weekdayOf(start)];
  // The offsets of the days in a week starting on Monday, in order.
  const offsets = [...new Set(weekdays)]
    .map(
      (weekday) =>
        (weekday - SERIES_WEEK_START + DAYS_PER_WEEK) % DAYS_PER_WEEK,
    )
    .sort((a, b) => a - b);
  const firstWeek = startOfWeek(start, SERIES_WEEK_START);
  return (visit) => {
    for (let week = 0; week < MAX_CANDIDATES; week++) {
      const monday = addDays(firstWeek, week * DAYS_PER_WEEK * interval(rule));
      for (const offset of offsets) {
        const day = addDays(monday, offset);
        if (day >= start && !visit(day)) return;
      }
    }
  };
}

/** Every `step` months from the start, on its day of the month when the month has it. */
function walkMonths(start: AgendaDayKey, step: number): DayWalk {
  const { year, month: startMonth, day } = parseDayKey(start);
  const first = dayKeyOf(year, startMonth, 1);
  return (visit) => {
    for (let index = 0; index < MAX_CANDIDATES; index++) {
      const month = parseDayKey(addMonths(first, index * step));
      if (day > daysInMonth(month.year, month.month)) continue;
      if (!visit(dayKeyOf(month.year, month.month, day))) return;
    }
  };
}

const WALKS: Record<
  AgendaRecurrence["frequency"],
  (start: AgendaDayKey, rule: AgendaRecurrence) => DayWalk
> = {
  daily: walkDaily,
  weekly: walkWeekly,
  monthly: (start, rule) => walkMonths(start, interval(rule)),
  yearly: (start, rule) => walkMonths(start, interval(rule) * MONTHS_PER_YEAR),
};

/**
 * The days a series starting on `start` falls on within the window: an
 * occurrence counts while it covers a day of it. `count` counts every
 * occurrence from the start, excluded ones included; `until` is the last day
 * an occurrence may start on.
 */
export function expandRecurrence(
  start: AgendaDayKey,
  rule: AgendaRecurrence,
  window: RecurrenceWindow,
): AgendaDayKey[] {
  const walk = WALKS[rule.frequency]?.(start, rule);
  if (!walk) return [start];
  const exceptions = new Set(rule.exceptions ?? []);
  const limit =
    rule.count && rule.count > 0 ? Math.floor(rule.count) : Infinity;
  const days: AgendaDayKey[] = [];
  let seen = 0;
  walk((day) => {
    if (rule.until && day > rule.until) return false;
    if (day > window.to) return false;
    if (seen >= limit) return false;
    seen += 1;
    const lastDay = addDays(day, window.spanDays);
    if (lastDay >= window.from && !exceptions.has(day)) days.push(day);
    return seen < limit;
  });
  return days;
}

/** The key of an occurrence of a series: `<event id>@<day of its start>`. */
export function occurrenceKey(seriesId: string, day: AgendaDayKey): string {
  return `${seriesId}@${day}`;
}
