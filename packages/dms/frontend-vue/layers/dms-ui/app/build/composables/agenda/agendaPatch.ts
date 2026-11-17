import { copyField, PATCH_FIELDS } from "./agendaPatchFields";
import type { AgendaEvent, AgendaEventPatch } from "../../../types/full-agenda";

/** `next` over `patch`, their `data` merged field by field. */
export function mergePatch(
  patch: AgendaEventPatch | undefined,
  next: AgendaEventPatch | undefined,
): AgendaEventPatch {
  const merged: AgendaEventPatch = { ...patch, ...next };
  if (patch?.data || next?.data)
    merged.data = { ...patch?.data, ...next?.data };
  return merged;
}

/** A patch without its `undefined` entries: an absent value never overrides one given. */
export function withoutAbsent(
  patch: AgendaEventPatch | undefined,
): AgendaEventPatch {
  const result: AgendaEventPatch = {};
  if (!patch) return result;
  for (const key of PATCH_FIELDS)
    if (patch[key] !== undefined) copyField(result, patch, key);
  if (patch.data !== undefined) result.data = patch.data;
  return result;
}

const CLEARABLE_EVENT_FIELDS = [
  "end",
  "calendarId",
  "location",
  "description",
] as const;

/** An event with a patch's fields over its own; a field (or `data` key) set to `null` is cleared. */
export function patchEvent(
  event: AgendaEvent,
  patch: AgendaEventPatch | undefined,
): AgendaEvent {
  if (!patch) return event;
  const merged: AgendaEvent = { ...event };
  if (patch.title !== undefined) merged.title = patch.title;
  if (patch.start !== undefined) merged.start = patch.start;
  if (patch.allDay !== undefined) merged.allDay = patch.allDay;
  if (patch.resourceIds !== undefined) merged.resourceIds = patch.resourceIds;
  for (const key of CLEARABLE_EVENT_FIELDS)
    if (Object.hasOwn(patch, key)) merged[key] = patch[key] ?? undefined;
  if (!patch.data) return merged;
  return {
    ...merged,
    data: Object.fromEntries(
      Object.entries({ ...event.data, ...patch.data }).filter(
        ([, value]) => value !== null,
      ),
    ),
  };
}
