import type {
  AgendaEvent,
  AgendaEventPatch,
} from "@antelopejs/interface-dms/base/full-agenda-types";

function withoutNulls(
  values: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== null),
  );
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
    ...(data && { data: withoutNulls({ ...event.data, ...data }) }),
  };
  for (const field of CLEARABLE_FIELDS) {
    if (fields[field] === null) delete next[field];
  }
  return next;
}
