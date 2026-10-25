// Events as the views draw them: an end filled in, all-day and timed bounds
// as instants of the agenda's zone, a recurring event expanded into the
// occurrences of the range, its colour and permissions resolved, and the
// changes not written yet shown on it.

import type {
  AgendaCalendar,
  AgendaDetailsContainer,
  AgendaEvent,
  AgendaResource,
} from "../../../types/full-agenda";
import type { AgendaDayKey, AgendaOccurrence } from "./agendaModel";
import type { AgendaEditMark } from "./agendaChanges";
import { agendaPaint } from "./agendaPaint";
import { expandRecurrence, occurrenceKey } from "./agendaRecurrence";
import {
  addDays,
  dayStartEpoch,
  daysBetween,
  isDayKey,
  MINUTE_MS,
  MINUTES_PER_DAY,
  parseDay,
  parseInstant,
  zonedDayKey,
  zonedEpoch,
  zonedMinutes,
} from "./agendaTime";

/** What normalizing the events of a range needs. */
export interface AgendaNormalizeSettings {
  timeZone: string;
  /** The range shown: its first and last day, and their bounds. */
  from: AgendaDayKey;
  to: AgendaDayKey;
  start: number;
  end: number;
  /** The days drawn; an occurrence on none of them (a hidden day) is left out. */
  shownDays?: ReadonlySet<AgendaDayKey>;
  defaultDurationMinutes: number;
  /** The block allows editing (a `saveUrl`, `editable` not off). */
  editable: boolean;
  dragMove: boolean;
  dragResize: boolean;
  detailsContainer: AgendaDetailsContainer;
  calendars: ReadonlyMap<string, AgendaCalendar>;
  resources: ReadonlyMap<string, AgendaResource>;
  /** How the events with a change not written show it. */
  marks?: ReadonlyMap<string, AgendaEditMark>;
}

/** An event's own bounds, before any repetition. */
interface EventBounds {
  allDay: boolean;
  start: number;
  end: number;
  startDay: AgendaDayKey;
  endDay: AgendaDayKey;
}

/** An event's bounds read from its fields: `null` when its start is not a date. */
export function eventBounds(
  event: AgendaEvent,
  timeZone: string,
  defaultDurationMinutes: number,
): EventBounds | null {
  const allDay = event.allDay ?? isDayKey(event.start);
  if (allDay) {
    const startDay = parseDay(event.start, timeZone);
    if (!startDay) return null;
    const ending = parseDay(event.end, timeZone) ?? startDay;
    const endDay = ending < startDay ? startDay : ending;
    return {
      allDay,
      startDay,
      endDay,
      start: dayStartEpoch(startDay, timeZone),
      end: dayStartEpoch(addDays(endDay, 1), timeZone),
    };
  }
  const start = parseInstant(event.start, timeZone);
  if (start === null) return null;
  const read = parseInstant(event.end, timeZone);
  const end =
    read !== null && read >= start
      ? read
      : start + defaultDurationMinutes * MINUTE_MS;
  return { allDay, start, end, ...timedDays(start, end, timeZone) };
}

/** A timed span's first and last day: an end at midnight ends the day before. */
function timedDays(start: number, end: number, timeZone: string) {
  const startDay = zonedDayKey(start, timeZone);
  const endDay = end > start ? zonedDayKey(end - 1, timeZone) : startDay;
  return { startDay, endDay };
}

/** The bounds of a series' occurrence on `day`, its wall-clock times kept. */
function occurrenceBounds(
  bounds: EventBounds,
  day: AgendaDayKey,
  timeZone: string,
): EventBounds {
  const spanDays = daysBetween(bounds.startDay, bounds.endDay);
  if (bounds.allDay) {
    const endDay = addDays(day, spanDays);
    return {
      allDay: true,
      startDay: day,
      endDay,
      start: dayStartEpoch(day, timeZone),
      end: dayStartEpoch(addDays(endDay, 1), timeZone),
    };
  }
  const endOffset = daysBetween(
    bounds.startDay,
    zonedDayKey(bounds.end, timeZone),
  );
  const start = zonedEpoch(day, zonedMinutes(bounds.start, timeZone), timeZone);
  const end = Math.max(
    start,
    zonedEpoch(
      addDays(day, endOffset),
      zonedMinutes(bounds.end, timeZone),
      timeZone,
    ),
  );
  return { allDay: false, start, end, ...timedDays(start, end, timeZone) };
}

function overlapsRange(bounds: EventBounds, settings: AgendaNormalizeSettings) {
  if (bounds.end === bounds.start)
    return bounds.start >= settings.start && bounds.start < settings.end;
  return bounds.start < settings.end && bounds.end > settings.start;
}

function touchesShownDay(
  bounds: EventBounds,
  shownDays: ReadonlySet<AgendaDayKey> | undefined,
): boolean {
  if (!shownDays) return true;
  for (let day = bounds.startDay; day <= bounds.endDay; day = addDays(day, 1)) {
    if (shownDays.has(day)) return true;
  }
  return false;
}

/** What may be done with an event: the block's, its calendar's, its resources' and its own say. */
function permissionsOf(
  event: AgendaEvent,
  calendar: AgendaCalendar | undefined,
  settings: AgendaNormalizeSettings,
) {
  const resourcesEditable = (event.resourceIds ?? []).every(
    (id) => settings.resources.get(id)?.editable !== false,
  );
  const editable =
    settings.editable &&
    calendar?.editable !== false &&
    resourcesEditable &&
    event.editable !== false;
  return {
    canMove: editable && settings.dragMove && event.startEditable !== false,
    canResize:
      editable && settings.dragResize && event.durationEditable !== false,
    canDelete: editable && event.deletable !== false,
  };
}

function markOf(
  event: AgendaEvent,
  key: string,
  day: AgendaDayKey | undefined,
  marks: ReadonlyMap<string, AgendaEditMark> | undefined,
): Partial<AgendaOccurrence> {
  const mark = marks?.get(key) ?? marks?.get(event.id);
  if (!mark) return {};
  const ownsGhost = !mark.occurrence || mark.occurrence === day;
  return {
    state: mark.state,
    ...(mark.message && { stateMessage: mark.message }),
    ...(mark.ghost && ownsGhost && { ghost: mark.ghost }),
  };
}

function toOccurrence(
  event: AgendaEvent,
  bounds: EventBounds,
  settings: AgendaNormalizeSettings,
  seriesDay?: AgendaDayKey,
): AgendaOccurrence {
  const { timeZone } = settings;
  const calendar = event.calendarId
    ? settings.calendars.get(event.calendarId)
    : undefined;
  const resourceIds = event.resourceIds ?? [];
  const firstResource = resourceIds[0]
    ? settings.resources.get(resourceIds[0])
    : undefined;
  const key = seriesDay ? occurrenceKey(event.id, seriesDay) : event.id;
  const endsAtMidnight =
    !bounds.allDay && zonedDayKey(bounds.end, timeZone) !== bounds.endDay;
  return {
    key,
    event,
    allDay: bounds.allDay,
    start: bounds.start,
    end: bounds.end,
    startDay: bounds.startDay,
    endDay: bounds.endDay,
    startMinutes: bounds.allDay ? 0 : zonedMinutes(bounds.start, timeZone),
    endMinutes:
      bounds.allDay || endsAtMidnight
        ? MINUTES_PER_DAY
        : zonedMinutes(bounds.end, timeZone),
    calendar,
    resourceIds,
    paint: agendaPaint(event.color ?? calendar?.color ?? firstResource?.color),
    ...permissionsOf(event, calendar, settings),
    details: event.details ?? calendar?.details ?? settings.detailsContainer,
    ...(seriesDay && {
      recurring: { seriesId: event.id, occurrence: seriesDay },
    }),
    ...markOf(event, key, seriesDay, settings.marks),
  };
}

/** The occurrences of one event within the range. */
export function eventOccurrences(
  event: AgendaEvent,
  settings: AgendaNormalizeSettings,
): AgendaOccurrence[] {
  const bounds = eventBounds(
    event,
    settings.timeZone,
    settings.defaultDurationMinutes,
  );
  if (!bounds) return [];
  const kept = (entry: EventBounds) =>
    overlapsRange(entry, settings) &&
    touchesShownDay(entry, settings.shownDays);
  if (!event.recurrence)
    return kept(bounds) ? [toOccurrence(event, bounds, settings)] : [];
  const days = expandRecurrence(bounds.startDay, event.recurrence, {
    from: settings.from,
    to: settings.to,
    spanDays: daysBetween(bounds.startDay, bounds.endDay),
  });
  return days
    .map((day) => ({
      day,
      bounds: occurrenceBounds(bounds, day, settings.timeZone),
    }))
    .filter((entry) => kept(entry.bounds))
    .map((entry) => toOccurrence(event, entry.bounds, settings, entry.day));
}

/** Earlier first; at one start, the longer first (it takes the first column). */
export function compareOccurrences(
  a: AgendaOccurrence,
  b: AgendaOccurrence,
): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return (
    a.start - b.start ||
    b.end - b.start - (a.end - a.start) ||
    (a.event.title ?? "").localeCompare(b.event.title ?? "")
  );
}

/** Every occurrence of the events within the range, in drawing order. */
export function buildOccurrences(
  events: AgendaEvent[],
  settings: AgendaNormalizeSettings,
): AgendaOccurrence[] {
  return events
    .flatMap((event) => eventOccurrences(event, settings))
    .sort(compareOccurrences);
}
