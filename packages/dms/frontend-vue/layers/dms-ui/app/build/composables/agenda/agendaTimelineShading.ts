// What a timeline row shades behind its events: the hours outside business
// hours (per resource, or the agenda's) and the backgrounds that apply to
// it, as stretches of fractional column positions.

import type {
  AgendaBusinessHours,
  AgendaTimelineScale,
} from "../../../types/full-agenda";
import type { AgendaDay } from "./agendaModel";
import {
  type AgendaBackgroundSpan,
  backgroundAppliesTo,
  CLOSED_HOURS_STYLE,
} from "./agendaBackgroundSpans";
import { openIntervals } from "./agendaOpenHours";
import { zonedEpoch } from "./agendaTime";
import { columnPosition, type TimelineColumn } from "./agendaTimelineLayout";

const EPSILON = 1e-6;

/** A shaded stretch of a row. */
export interface TimelineShade {
  key: string;
  from: number;
  to: number;
  style: Record<string, string>;
  /** The background's label, shown on hover. */
  label?: AgendaBackgroundSpan["background"]["label"];
}

/** Business hours of a weekday (empty: closed all day). */
export type HoursOfWeekday = (weekday: number) => AgendaBusinessHours[];

interface EpochInterval {
  start: number;
  end: number;
}

const DAYS_PER_WEEK = 7;

/**
 * The open parts of a day as instants: `openIntervals` (shared with the time
 * grid and the drop rules) reads its own hours and the morning the previous
 * weekday's overnight hours run into.
 */
function openEpochs(
  day: AgendaDay,
  hoursOf: HoursOfWeekday,
  timeZone: string,
): EpochInterval[] {
  const previous = (day.weekday + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  return openIntervals(hoursOf(day.weekday), hoursOf(previous)).map(
    (interval) => ({
      start: zonedEpoch(day.key, interval.start, timeZone),
      end: zonedEpoch(day.key, interval.end, timeZone),
    }),
  );
}

/** The parts of a day outside its open intervals. */
function closedIntervals(
  day: AgendaDay,
  open: readonly EpochInterval[],
): EpochInterval[] {
  const closed: EpochInterval[] = [];
  let cursor = day.start;
  for (const interval of open) {
    if (interval.start > cursor) {
      closed.push({ start: cursor, end: interval.start });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < day.end) closed.push({ start: cursor, end: day.end });
  return closed;
}

/** The closed parts of a day: by day, the whole day when it is never open. */
function closedOfDay(
  day: AgendaDay,
  hoursOf: HoursOfWeekday,
  scale: AgendaTimelineScale,
  timeZone: string,
): EpochInterval[] {
  const open = openEpochs(day, hoursOf, timeZone);
  if (scale !== "day") return closedIntervals(day, open);
  return open.length ? [] : [{ start: day.start, end: day.end }];
}

/**
 * The stretches of a row outside business hours. By day, a closed day is
 * shaded whole and a day with hours not at all; by hour or slot, the hours
 * outside the day's ranges. A range ending before it starts (22:00–06:00)
 * runs overnight into the next day.
 */
export function businessHourShades(
  columns: readonly TimelineColumn[],
  days: readonly AgendaDay[],
  scale: AgendaTimelineScale,
  hoursOf: HoursOfWeekday,
  timeZone: string,
): TimelineShade[] {
  const shades: TimelineShade[] = [];
  const shownDays = new Set(columns.map((column) => column.dayIndex));
  for (const dayIndex of shownDays) {
    const day = days[dayIndex]!;
    const closed = closedOfDay(day, hoursOf, scale, timeZone);
    closed.forEach((interval, index) => {
      const from = columnPosition(columns, interval.start);
      const to = columnPosition(columns, interval.end);
      if (to - from <= EPSILON) return;
      shades.push({
        key: `h:${day.key}:${index}`,
        from,
        to,
        style: CLOSED_HOURS_STYLE,
      });
    });
  }
  return shades;
}

/** The backgrounds behind a row (`null`: the row of no resource). */
export function backgroundShades(
  columns: readonly TimelineColumn[],
  spans: readonly AgendaBackgroundSpan[],
  resourceId: string | null,
): TimelineShade[] {
  const shades: TimelineShade[] = [];
  spans.forEach((span, index) => {
    if (!backgroundAppliesTo(span, resourceId)) return;
    const from = columnPosition(columns, span.start);
    const to = columnPosition(columns, span.end);
    if (to - from <= EPSILON) return;
    shades.push({
      key: `b:${span.background.id ?? index}`,
      from,
      to,
      style: span.style,
      label: span.background.label,
    });
  });
  return shades;
}
