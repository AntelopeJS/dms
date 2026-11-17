import { isString } from "../../../../../dms-core/app/utils/type-check";

import type {
  AgendaChange,
  AgendaEvent,
  AgendaEventPatch,
  AgendaPendingItem,
  AgendaRecurringScope,
} from "../../../types/full-agenda";
import type { AgendaOccurrence } from "./agendaModel";
import { eventFields, previousOf, withoutAbsent } from "./agendaChanges";
import { zonedIso } from "./agendaTime";

let tempCounter = 0;

/** A temporary id for an event created here, unique in the page. */
export function agendaNewId(prefix = "tmp"): string {
  tempCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${tempCounter}`;
}

/** An occurrence's own bounds, as a change of it names them. */
export function occurrenceBounds(
  occurrence: AgendaOccurrence,
  timeZone: string,
): AgendaEventPatch {
  if (occurrence.allDay)
    return { start: occurrence.startDay, end: occurrence.endDay };
  return {
    start: zonedIso(occurrence.start, timeZone),
    end: zonedIso(occurrence.end, timeZone),
  };
}

/** The event a pending item becomes once scheduled, before the route answers it. */
export function seedOfItem(
  item: AgendaPendingItem,
  tempId: string,
): AgendaEvent {
  return {
    id: tempId,
    title: item.title,
    start: "",
    subtitle: item.subtitle,
    calendarId: item.calendarId,
    color: item.color,
    icon: item.icon,
    badges: item.badges,
    allDay: item.allDay,
    allowedResourceIds: item.allowedResourceIds,
    data: item.data,
  };
}

const isNewKind = (change: AgendaChange) =>
  change.kind === "create" || change.kind === "schedule";
const isRemoval = (change: AgendaChange) =>
  change.kind === "delete" || change.kind === "unschedule";

/** The occurrence bounds a change's `previous` takes: the ones it sets, all of them for a removal. */
function timesOf(
  bounds: AgendaEventPatch,
  change: AgendaChange,
): AgendaEventPatch {
  const patch = change.patch ?? {};
  const isWhole = isRemoval(change);
  const times: AgendaEventPatch = {};
  if ((isWhole || "start" in patch) && bounds.start !== undefined)
    times.start = bounds.start;
  if ((isWhole || "end" in patch) && bounds.end !== undefined)
    times.end = bounds.end;
  return times;
}

/** What completing a change reads. */
export interface AgendaCompleteInput {
  change: AgendaChange;
  /** The occurrence it was made on (a drag, the details). */
  occurrence?: AgendaOccurrence;
  /** The event it changes, when no occurrence is given. */
  event?: AgendaEvent;
  scope?: AgendaRecurringScope;
  timeZone: string;
}

/**
 * A change as the engine keeps it: the scope set, a `tempId` for a new
 * event, and `previous` holding every field it sets as it was (the whole
 * event for a removal). The caller's `previous` wins, but an occurrence of
 * a series keeps its own times, not the series'.
 */
export function completeChange(input: AgendaCompleteInput): AgendaChange {
  const { change, occurrence, scope } = input;
  const next: AgendaChange = { ...change, ...(scope && { scope }) };
  if (isNewKind(next)) {
    if (!next.tempId)
      next.tempId = agendaNewId(next.kind === "schedule" ? "new" : "tmp");
    return next;
  }
  const event = occurrence?.event ?? input.event;
  if (!event) return next;
  if (next.revision === undefined && event.revision !== undefined)
    next.revision = event.revision;
  const own =
    occurrence && next.occurrence
      ? occurrenceBounds(occurrence, input.timeZone)
      : undefined;
  if (own && next.scope === "occurrence" && !isRemoval(next))
    next.patch = withOwnTimes(next.patch, own, occurrence!);
  const previous = isRemoval(next)
    ? eventFields(event)
    : previousOf(event, next.patch);
  let bounds: AgendaEventPatch = {};
  if (own) bounds = next.scope === "series" ? own : timesOf(own, next);
  next.previous = { ...previous, ...withoutAbsent(next.previous), ...bounds };
  return next;
}

/**
 * The patch of an occurrence changed alone, its own times filled in where
 * the change keeps them: the event it becomes stands on its own day, not on
 * its series' first one, and a new start alone keeps its own end.
 */
function withOwnTimes(
  patch: AgendaEventPatch | undefined,
  own: AgendaEventPatch,
  occurrence: AgendaOccurrence,
): AgendaEventPatch {
  return {
    start: own.start,
    end: own.end,
    allDay: occurrence.allDay,
    ...patch,
  };
}

/**
 * Whether the occurrence of `event` on `day` is before the first day the route lets a change of its series alter
 * (`changeableFrom`): a change of that day alone corrects the past.
 */
export const isPastDay = (event: AgendaEvent, day: string): boolean =>
  isString(event.changeableFrom) && day < event.changeableFrom;

/**
 * The day a change of the series of `event` made from its occurrence on `day` applies from: that day, or the first day
 * the route still lets a change alter (`changeableFrom`) when that day is earlier; `null` when the route says the
 * series has no day left.
 */
export function seriesChangeDay(
  event: AgendaEvent,
  day: string,
): string | null | undefined {
  const from = event.changeableFrom;
  if (from === undefined || from === null) return from;
  return day < from ? from : day;
}
