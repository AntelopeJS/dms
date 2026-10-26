// The fields of a change laid over an event, and two patches as one.

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

/** A record without its `null` entries: what a patch clears is gone. */
function withoutCleared<T extends object>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== null),
  ) as T;
}

/** A record without its `undefined` entries: an absent value never overrides one given. */
export function withoutAbsent<T extends object>(record: T | undefined): T {
  return Object.fromEntries(
    Object.entries(record ?? {}).filter(([, value]) => value !== undefined),
  ) as T;
}

/** An event with a patch's fields over its own; a field (or `data` key) set to `null` is cleared. */
export function patchEvent(
  event: AgendaEvent,
  patch: AgendaEventPatch | undefined,
): AgendaEvent {
  if (!patch) return event;
  const { data, ...fields } = patch;
  const merged = withoutCleared({ ...event, ...fields }) as AgendaEvent;
  if (!data) return merged;
  return { ...merged, data: withoutCleared({ ...event.data, ...data }) };
}
