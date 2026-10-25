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

/** The keys of `next` that differ from `before`, and what they were. */
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
    if (sameInstant(nextFields[key], beforeFields[key])) continue;
    patch[key] = nextFields[key];
    previous[key] = beforeFields[key];
  }
  if (next.data) {
    const merged = { ...before.data, ...next.data };
    if (!sameInstant(merged, before.data ?? {})) {
      patch.data = merged;
      previous.data = before.data;
    }
  }
  return { patch, previous };
}

let tempCounter = 0;

/** A `tempId` naming a new event until the route answers it. */
export function agendaTempId(): string {
  tempCounter += 1;
  return `tmp-${Date.now().toString(36)}-${tempCounter}`;
}

/** The change that creates an event from the form. */
export function createChange(patch: AgendaEventPatch): AgendaChange {
  return { kind: "create", tempId: agendaTempId(), patch };
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
