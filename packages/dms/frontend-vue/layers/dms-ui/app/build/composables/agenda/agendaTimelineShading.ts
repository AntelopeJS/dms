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
import { MINUTES_PER_DAY, parseTimeOfDay, zonedEpoch } from "./agendaTime";
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

function openIntervals(
  day: AgendaDay,
  hours: readonly AgendaBusinessHours[],
  timeZone: string,
): EpochInterval[] {
  return hours
    .map((range) => ({
      start: zonedEpoch(day.key, parseTimeOfDay(range.start, 0), timeZone),
      end: zonedEpoch(
        day.key,
        parseTimeOfDay(range.end, MINUTES_PER_DAY),
        timeZone,
      ),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
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

/** The closed parts of a day: by day, the whole day when it has no hours. */
function closedOfDay(
  day: AgendaDay,
  hours: readonly AgendaBusinessHours[],
  scale: AgendaTimelineScale,
  timeZone: string,
): EpochInterval[] {
  if (scale !== "day") {
    return closedIntervals(day, openIntervals(day, hours, timeZone));
  }
  return hours.length ? [] : [{ start: day.start, end: day.end }];
}

/**
 * The stretches of a row outside business hours. By day, a closed day is
 * shaded whole and a day with hours not at all; by hour or slot, the hours
 * outside the day's ranges.
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
    const hours = hoursOf(day.weekday);
    const closed = closedOfDay(day, hours, scale, timeZone);
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
