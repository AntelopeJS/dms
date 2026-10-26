// A series changed as a whole through one of its occurrences, as the routes
// change it (the lead's rules, shared with the playground's server):
// - its start moves by zoned days plus wall-clock time, in the series' zone
//   (a 09:00 standup stays at 09:00 across a DST change); a series on
//   several weekdays keeps its days and takes only the new time;
// - its end is the new start plus the occurrence's new length in absolute
//   minutes (a 1 h meeting stays 1 h across DST); `end: null` clears it;
// - moved by days, its single weekday, its `exceptions` and its `until`
//   move with it;
// - switched to all-day, the occurrence's own days become its bounds.

import type {
  AgendaChange,
  AgendaEvent,
  AgendaEventPatch,
  AgendaRecurrence,
} from "../../../types/full-agenda";
import { mergePatch, patchEvent, withoutAbsent } from "./agendaPatch";
import {
  addDays,
  daysBetween,
  isDayKey,
  isTimeZone,
  zonedDayKey,
  zonedEpoch,
  zonedIso,
  zonedMinutes,
} from "./agendaTime";

const DAYS_PER_WEEK = 7;

/** How far an occurrence moved, in the series' zone: whole days, and wall-clock minutes. */
export interface AgendaZonedShift {
  days: number;
  minutes: number;
}

/** The day a bound falls on in the zone (a day key is its own day). */
function dayOf(value: string, timeZone: string): string | null {
  if (isDayKey(value)) return value;
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : zonedDayKey(epoch, timeZone);
}

/** The wall-clock minutes of a timed bound; `null` for a day or no date. */
function wallOf(value: string, timeZone: string): number | null {
  if (isDayKey(value)) return null;
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : zonedMinutes(epoch, timeZone);
}

/** The days and wall-clock minutes from `before` to `after`; `null` when either is not a date. */
export function zonedShift(
  before: string | null | undefined,
  after: string | null | undefined,
  timeZone: string,
): AgendaZonedShift | null {
  if (!before || !after) return null;
  const from = dayOf(before, timeZone);
  const to = dayOf(after, timeZone);
  if (!from || !to) return null;
  const minutes =
    (wallOf(after, timeZone) ?? 0) - (wallOf(before, timeZone) ?? 0);
  return { days: daysBetween(from, to), minutes };
}

/** A bound moved by a zoned shift: its day by the days, its wall clock by the minutes (DST-safe). */
export function shiftBound(
  bound: string | undefined,
  shift: AgendaZonedShift | null,
  timeZone: string,
): string | undefined {
  if (!bound || !shift) return bound;
  if (isDayKey(bound)) return addDays(bound, shift.days);
  const epoch = Date.parse(bound);
  if (Number.isNaN(epoch)) return bound;
  const day = addDays(zonedDayKey(epoch, timeZone), shift.days);
  const minutes = zonedMinutes(epoch, timeZone) + shift.minutes;
  return zonedIso(zonedEpoch(day, minutes, timeZone), timeZone);
}

/** The length from `start` to `end`: whole days between two days, else milliseconds. */
interface AgendaLength {
  days?: number;
  ms?: number;
}

function lengthOf(
  start: string | null | undefined,
  end: string | null | undefined,
  timeZone: string,
): AgendaLength | null {
  if (!start || !end) return null;
  if (isDayKey(start) || isDayKey(end)) {
    const from = dayOf(start, timeZone);
    const to = dayOf(end, timeZone);
    return from && to ? { days: daysBetween(from, to) } : null;
  }
  const ms = Date.parse(end) - Date.parse(start);
  return Number.isNaN(ms) ? null : { ms };
}

/** A bound `length` after `start`: days for an all-day start, absolute milliseconds otherwise. */
function addLength(
  start: string,
  length: AgendaLength,
  timeZone: string,
): string | undefined {
  if (isDayKey(start)) return addDays(start, length.days ?? 0);
  if (length.ms === undefined) return undefined;
  return zonedIso(Date.parse(start) + length.ms, timeZone);
}

/** The zone a series keeps its wall clock and its days in: its own, else the agenda's. */
export function seriesTimeZone(event: AgendaEvent, timeZone: string): string {
  const own = event.recurrence?.timeZone;
  return isTimeZone(own) ? own : timeZone;
}

/** A series that falls on several weekdays keeps its days when moved as a whole: only its time moves. */
const keepsItsDays = (event: AgendaEvent) =>
  event.recurrence?.frequency === "weekly" &&
  (event.recurrence.weekdays?.length ?? 0) > 1;

/** A series moved by `days`: its weekday, its excluded days and its last day follow. */
function shiftRecurrence(
  recurrence: AgendaRecurrence | undefined,
  days: number,
): AgendaRecurrence | undefined {
  if (!recurrence || !days) return recurrence;
  const turn = ((days % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return {
    ...recurrence,
    ...(recurrence.weekdays?.length && {
      weekdays: recurrence.weekdays.map(
        (weekday) => (weekday + turn) % DAYS_PER_WEEK,
      ),
    }),
    ...(recurrence.exceptions && {
      exceptions: recurrence.exceptions.map((day) => addDays(day, days)),
    }),
    ...(recurrence.until && { until: addDays(recurrence.until, days) }),
  };
}

/** What moving a series reads of its change. */
interface SeriesMove {
  zone: string;
  days: number;
  allDay: boolean;
  /** The occurrence before and after the change. */
  before?: string;
  after?: string;
}

/** The series' new start: its day moved by the days, its wall clock by the occurrence's. */
function seriesStart(event: AgendaEvent, move: SeriesMove): string {
  const { zone } = move;
  const day = dayOf(event.start, zone);
  if (!day) return event.start;
  const movedDay = addDays(day, move.days);
  if (move.allDay) return movedDay;
  const own = wallOf(event.start, zone);
  const after = move.after ? wallOf(move.after, zone) : null;
  const before = move.before ? wallOf(move.before, zone) : null;
  const minutes =
    own !== null && after !== null && before !== null
      ? own + after - before
      : (after ?? own ?? 0);
  return zonedIso(zonedEpoch(movedDay, minutes, zone), zone);
}

/**
 * The series' new end: cleared by `end: null`; else its new start plus the
 * occurrence's new length (days for all-day, absolute minutes otherwise);
 * a series stored without an end, and given none, keeps none.
 */
function seriesEnd(
  event: AgendaEvent,
  start: string,
  change: AgendaChange,
  zone: string,
): string | undefined {
  const patch = change.patch ?? {};
  const previous = change.previous ?? {};
  if (patch.end === null) return undefined;
  if (patch.end === undefined && !event.end) return undefined;
  const length =
    (patch.end !== undefined
      ? lengthOf(patch.start ?? previous.start, patch.end, zone)
      : lengthOf(previous.start, previous.end, zone)) ??
    lengthOf(event.start, event.end, zone);
  return length ? addLength(start, length, zone) : event.end;
}

/**
 * A series changed through one of its occurrences: the change's `start`
 * and `end` are the occurrence's, `previous` holds them as they were. See
 * the rules at the top of this file.
 */
export function patchSeries(
  event: AgendaEvent,
  change: AgendaChange,
  timeZone: string,
): AgendaEvent {
  const { start, end: _end, allDay, ...rest } = change.patch ?? {};
  const zone = seriesTimeZone(event, timeZone);
  const previous = {
    ...occurrenceOf(event, change.occurrence, zone),
    ...withoutAbsent(change.previous),
  };
  const asRead: AgendaChange = { ...change, previous };
  const before = previous.start ?? undefined;
  const after = start ?? before;
  const shift = zonedShift(before, after, zone);
  const move: SeriesMove = {
    zone,
    days: keepsItsDays(event) ? 0 : (shift?.days ?? 0),
    allDay: allDay ?? event.allDay ?? isDayKey(event.start),
    before,
    after,
  };
  const newStart = seriesStart(event, move);
  const { end: _oldEnd, ...kept } = event;
  const newEnd = seriesEnd(event, newStart, asRead, zone);
  const moved: AgendaEvent = {
    ...kept,
    start: newStart,
    ...(newEnd !== undefined && { end: newEnd }),
    ...(allDay !== undefined && { allDay }),
    recurrence: shiftRecurrence(event.recurrence, move.days),
  };
  return patchEvent(moved, rest);
}

/**
 * An occurrence's own bounds, as the series gives them on its day (what a
 * change that names no `previous` moved from, as the routes read it).
 */
function occurrenceOf(
  event: AgendaEvent,
  occurrence: string | undefined,
  zone: string,
): AgendaEventPatch {
  const first = dayOf(event.start, zone);
  if (!occurrence || !first) return {};
  const shift: AgendaZonedShift = {
    days: daysBetween(first, occurrence),
    minutes: 0,
  };
  return {
    start: shiftBound(event.start, shift, zone),
    ...(event.end && { end: shiftBound(event.end, shift, zone) }),
  };
}

/** Whether two changes move one series through different occurrences. */
export function isSeriesPair(
  existing: AgendaChange,
  next: AgendaChange,
): boolean {
  return (
    existing.scope === "series" &&
    next.scope === "series" &&
    Boolean(existing.occurrence && next.occurrence) &&
    existing.occurrence !== next.occurrence
  );
}

/**
 * Two series changes made through different occurrences as one, written
 * through the first: the second's move (zoned days and wall time) and new
 * length are laid onto the first's patch, so the series moves by both and
 * no week is lost.
 */
export function rebaseSeriesChange(
  existing: AgendaChange,
  next: AgendaChange,
  timeZone: string,
): AgendaChange {
  const first = existing.patch ?? {};
  const second = next.patch ?? {};
  const shift = zonedShift(next.previous?.start, second.start, timeZone);
  // The first change may keep the occurrence's start: move it from there.
  const base = first.start ?? existing.previous?.start ?? undefined;
  const start = shiftBound(base, shift, timeZone);
  const { start: _start, end: secondEnd, ...secondRest } = second;
  const patch: AgendaEventPatch = { ...mergePatch(first, secondRest), start };
  if (secondEnd === null) patch.end = null;
  else if (secondEnd !== undefined && start) {
    const length = lengthOf(
      second.start ?? next.previous?.start,
      secondEnd,
      timeZone,
    );
    patch.end = length ? addLength(start, length, timeZone) : secondEnd;
  } else
    patch.end =
      shiftBound(first.end ?? undefined, shift, timeZone) ?? first.end;
  return { ...existing, patch };
}
