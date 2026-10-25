// The changes the details form of a FullAgenda places: an occurrence as a
// patch (what a change compares with and sends as `previous`), the create,
// update and delete changes, and the row `{{row.X}}` tokens read on an
// occurrence. No Vue here.

import type {
  AgendaChange,
  AgendaEventPatch,
  AgendaFieldCondition,
  AgendaRecurringScope,
} from "../../../types/full-agenda";
import type { AgendaOccurrence } from "./agendaModel";
import { wallClockIso, wallClockOf } from "./agendaFormTime";

/** The fields of an occurrence as a patch: what a change compares with and sends as `previous`. */
export function occurrencePatch(
  occurrence: AgendaOccurrence,
  timeZone: string,
): AgendaEventPatch {
  const { event } = occurrence;
  return {
    title: event.title,
    calendarId: event.calendarId,
    resourceIds: [...occurrence.resourceIds],
    location: event.location,
    description: event.description,
    data: event.data,
    allDay: occurrence.allDay,
    start: occurrence.allDay
      ? occurrence.startDay
      : (wallClockIso(wallClockOf(occurrence.start, timeZone), timeZone) ??
        event.start),
    end: occurrence.allDay
      ? occurrence.endDay
      : (wallClockIso(wallClockOf(occurrence.end, timeZone), timeZone) ??
        event.end),
  };
}

function sameInstant(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") {
    const left = Date.parse(a);
    const right = Date.parse(b);
    if (!Number.isNaN(left) && !Number.isNaN(right) && a.includes("T"))
      return left === right;
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Absent and `null` say the same: no value. */
const isBlank = (value: unknown) => value === undefined || value === null;

/** The data a patch writes, and what it was (`null` for a key it adds), `null` when nothing changes. */
function diffData(
  next: Record<string, unknown>,
  before: Record<string, unknown> = {},
): { data: Record<string, unknown>; previous: Record<string, unknown> } | null {
  const changed = Object.keys(next).filter(
    (key) =>
      !(isBlank(next[key]) && isBlank(before[key])) &&
      !sameInstant(next[key], before[key]),
  );
  if (changed.length === 0) return null;
  const previous = { ...before };
  for (const key of changed) previous[key] = before[key] ?? null;
  return { data: { ...before, ...next }, previous };
}

/**
 * The keys of `next` that differ from `before`, and what they were: a
 * field `next` clears is sent as `null`, and one `before` lacked comes back
 * as `null` in `previous` (Undo clears it).
 */
export function diffPatch(
  next: AgendaEventPatch,
  before: AgendaEventPatch,
): { patch: AgendaEventPatch; previous: AgendaEventPatch } {
  const patch: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  const nextFields = next as Record<string, unknown>;
  const beforeFields = before as Record<string, unknown>;
  for (const key of Object.keys(next)) {
    if (key === "data") continue;
    const value = nextFields[key];
    const was = beforeFields[key];
    if (isBlank(value) && isBlank(was)) continue;
    if (sameInstant(value, was)) continue;
    patch[key] = value ?? null;
    previous[key] = was ?? null;
  }
  const data = next.data ? diffData(next.data, before.data) : null;
  if (data) {
    patch.data = data.data;
    previous.data = data.previous;
  }
  return { patch, previous };
}

/** A patch without its `null`s: a new event has nothing to clear. */
function withoutNulls(patch: AgendaEventPatch): AgendaEventPatch {
  const fields = Object.entries(patch).filter(([, value]) => value !== null);
  const result = Object.fromEntries(fields) as AgendaEventPatch;
  if (patch.data)
    result.data = Object.fromEntries(
      Object.entries(patch.data).filter(([, value]) => value !== null),
    );
  return result;
}

let tempCounter = 0;

/** A `tempId` naming a new event until the route answers it. */
export function agendaTempId(): string {
  tempCounter += 1;
  return `tmp-${Date.now().toString(36)}-${tempCounter}`;
}

/** The change that creates an event from the form. */
export function createChange(patch: AgendaEventPatch): AgendaChange {
  return { kind: "create", tempId: agendaTempId(), patch: withoutNulls(patch) };
}

/**
 * The change that saves the form over an occurrence, `null` when nothing
 * changed. On an occurrence of a recurring event it names the series, the
 * occurrence's day and the scope picked.
 */
export function updateChange(
  occurrence: AgendaOccurrence,
  next: AgendaEventPatch,
  timeZone: string,
  scope?: AgendaRecurringScope,
): AgendaChange | null {
  const { patch, previous } = diffPatch(
    next,
    occurrencePatch(occurrence, timeZone),
  );
  if (Object.keys(patch).length === 0) return null;
  return {
    kind: "update",
    id: occurrence.recurring?.seriesId ?? occurrence.event.id,
    patch,
    previous,
    ...(occurrence.recurring && {
      occurrence: occurrence.recurring.occurrence,
      scope: scope ?? "occurrence",
    }),
  };
}

/** The change that deletes an occurrence (or its series). */
export function deleteChange(
  occurrence: AgendaOccurrence,
  timeZone: string,
  scope?: AgendaRecurringScope,
): AgendaChange {
  return {
    kind: "delete",
    id: occurrence.recurring?.seriesId ?? occurrence.event.id,
    previous: occurrencePatch(occurrence, timeZone),
    ...(occurrence.recurring && {
      occurrence: occurrence.recurring.occurrence,
      scope: scope ?? "occurrence",
    }),
  };
}

/**
 * What `{{row.X}}` reads on an occurrence: its `data`, then the event's own
 * fields (`id`, `title`, `start`, `end` of this occurrence, `calendarId`,
 * `resourceId`, `resourceIds`, `location`) and `occurrence` on a recurring one.
 */
export function agendaActionRow(
  occurrence: AgendaOccurrence,
  timeZone: string,
): Record<string, unknown> {
  const { event } = occurrence;
  const moments = occurrencePatch(occurrence, timeZone);
  return {
    ...event.data,
    id: occurrence.recurring?.seriesId ?? event.id,
    title: event.title,
    start: moments.start,
    end: moments.end,
    allDay: occurrence.allDay,
    calendarId: event.calendarId ?? occurrence.calendar?.id,
    resourceId: occurrence.resourceIds[0],
    resourceIds: occurrence.resourceIds,
    location: event.location,
    ...(occurrence.recurring && {
      occurrence: occurrence.recurring.occurrence,
    }),
  };
}

/** Whether an action or a field condition holds on an event's row. */
export function meetsRowCondition(
  condition: AgendaFieldCondition | undefined,
  row: Record<string, unknown>,
): boolean {
  if (!condition) return true;
  return condition.in.includes(row[condition.field]);
}

/** Whether the occurrence can be edited in the form. */
export function isOccurrenceEditable(
  occurrence: AgendaOccurrence,
  editable: boolean,
): boolean {
  if (!editable) return false;
  return (
    occurrence.event.editable !== false &&
    occurrence.calendar?.editable !== false
  );
}
