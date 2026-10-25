import type {
  AgendaEvent,
  AgendaEventPatch,
} from "@antelopejs/interface-dms/base/full-agenda-types";

/**
 * The data of an event with a patch's data merged: a key the patch sets to
 * `null` is cleared, a `null` the event already held is kept.
 */
function mergeData(
  data: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...data, ...patch };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
  }
  return merged;
}

// The fields a patch may clear with `null`.
const CLEARABLE_FIELDS = [
  "end",
  "calendarId",
  "location",
  "description",
] as const;

/**
 * The fields of a patch set on an event: an absent field is kept, `null`
 * clears it; its `data` is merged, a key set to `null` cleared.
 */
export function applyPatch(
  event: AgendaEvent,
  patch: AgendaEventPatch = {},
): AgendaEvent {
  const { data, ...fields } = patch;
  const defined = Object.fromEntries(
    Object.entries(fields).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
  const next: AgendaEvent = {
    ...event,
    ...defined,
    ...(data && { data: mergeData(event.data, data) }),
  };
  for (const field of CLEARABLE_FIELDS) {
    if (fields[field] === null) delete next[field];
  }
  return next;
}
