// What a change does to the events on screen, before and after it is
// written: two changes of one event merged into one, a change laid over the
// events read, the pending items it takes or gives back, and the change an
// Undo writes back. Pure functions; the save engine keeps the state.

import type {
  AgendaChange,
  AgendaEvent,
  AgendaEventPatch,
  AgendaPendingItem,
  AgendaSaveMode,
} from "../../../types/full-agenda";
import type { AgendaOccurrence, AgendaOccurrenceState } from "./agendaModel";
import { occurrenceKey } from "./agendaRecurrence";
import { mergePatch, patchEvent } from "./agendaPatch";
import { isSeriesPair, patchSeries, rebaseSeriesChange } from "./agendaSeries";

export { mergePatch, patchEvent, withoutAbsent } from "./agendaPatch";
export {
  seriesTimeZone,
  zonedShift,
  type AgendaZonedShift,
} from "./agendaSeries";

/** Where a change stands. `staged` waits for Save; `error` and `conflict` were refused. */
export type AgendaEditStatus = "staged" | "saving" | "error" | "conflict";

/** Where an occurrence was before a change: drawn as a ghost while staged. */
export type AgendaGhost = NonNullable<AgendaOccurrence["ghost"]>;

/** A change not written yet, as the save engine keeps it. */
export interface AgendaEdit {
  /** What it is kept under (see {@link agendaEditKey}). */
  key: string;
  change: AgendaChange;
  status: AgendaEditStatus;
  /** The event drawn for a new one (`create`, `schedule`). */
  seed?: AgendaEvent;
  /** The event before the change, for the review and an unschedule's pending item. */
  base?: AgendaEvent;
  ghost?: AgendaGhost;
  message?: string;
  /** `conflict`: the event as the route stores it now. */
  current?: AgendaEvent;
  /** A change made while this one is being written: sent once it settles. */
  queued?: AgendaChange;
  /** It was written with `force` (a `confirm` answered): an Overwrite keeps it. */
  forced?: boolean;
  /** `false`: a refusal no Retry can fix (a change of an event the route never named). */
  retryable?: boolean;
}

/** How an occurrence shows its change. */
export interface AgendaEditMark {
  state: AgendaOccurrenceState;
  message?: string;
  ghost?: AgendaGhost;
  /** The occurrence day the ghost is of, for a change of a whole series. */
  occurrence?: string;
}

const PATCH_KEYS: Array<keyof AgendaEventPatch> = [
  "title",
  "start",
  "end",
  "allDay",
  "calendarId",
  "resourceIds",
  "location",
  "description",
  "data",
];

/** What a change is kept under: the new event's `tempId`, `<id>@<day>` for one occurrence alone, else the event id. */
export function agendaEditKey(change: AgendaChange): string {
  if (change.tempId && (change.kind === "create" || change.kind === "schedule"))
    return change.tempId;
  if (change.scope === "occurrence" && change.occurrence && change.id)
    return occurrenceKey(change.id, change.occurrence);
  return change.id ?? change.tempId ?? "";
}

const isNewKind = (change: AgendaChange) =>
  change.kind === "create" || change.kind === "schedule";
const isRemoval = (change: AgendaChange) =>
  change.kind === "delete" || change.kind === "unschedule";

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** What an absent field reads as in a `previous`: its default, else cleared (`null`). */
const ABSENT_VALUES: Partial<Record<keyof AgendaEventPatch, unknown>> = {
  allDay: false,
  resourceIds: [],
};

/**
 * The fields `patch` sets, as `event` holds them: a change's `previous`. A
 * field the event does not hold is `null` (an Undo clears it again), and so
 * is a `data` key it does not hold.
 */
export function previousOf(
  event: AgendaEvent,
  patch: AgendaEventPatch | undefined,
): AgendaEventPatch {
  const previous: Record<string, unknown> = {};
  for (const key of Object.keys(patch ?? {}) as Array<keyof AgendaEventPatch>) {
    if (key === "data") {
      const data = event.data ?? {};
      previous.data = Object.fromEntries(
        Object.keys(patch?.data ?? {}).map((field) => [
          field,
          data[field] ?? null,
        ]),
      );
      continue;
    }
    previous[key] = event[key] ?? ABSENT_VALUES[key] ?? null;
  }
  return previous as AgendaEventPatch;
}

/** Every field a change can set, as `event` holds them (what a delete's Undo re-creates). */
export function eventFields(event: AgendaEvent): AgendaEventPatch {
  const fields: AgendaEventPatch = {};
  for (const key of PATCH_KEYS) {
    if (event[key] !== undefined)
      (fields as Record<string, unknown>)[key] = event[key];
  }
  return fields;
}

/** Whether a change puts every field back as it was. */
function isNoop(change: AgendaChange): boolean {
  const patch = change.patch ?? {};
  const previous = change.previous ?? {};
  return PATCH_KEYS.every((key) => {
    if (!(key in patch)) return true;
    if (key !== "data") return sameValue(patch[key], previous[key]);
    const data = patch.data ?? {};
    return Object.keys(data).every((field) =>
      sameValue(data[field], previous.data?.[field]),
    );
  });
}

function mergedKind(
  existing: AgendaChange,
  next: AgendaChange,
): AgendaChange["kind"] {
  if (existing.kind === "update" || next.kind === "update") return "update";
  return existing.kind === next.kind ? next.kind : "move";
}

/**
 * Two changes of one event as one: a new event stays a `create` (or a
 * `schedule`) with the fields of both, and a delete of it cancels both; a
 * delete keeps the fields as they were first; two edits keep the first
 * `previous`. `null` when they cancel out, or put the event back as it was.
 */
export function mergeChanges(
  existing: AgendaChange,
  next: AgendaChange,
  /** The series' zone, for two series changes made through different occurrences. */
  timeZone = "UTC",
): AgendaChange | null {
  if (isRemoval(next)) {
    if (isNewKind(existing)) return null;
    return { ...next, previous: mergePatch(next.previous, existing.previous) };
  }
  if (isNewKind(existing))
    return { ...existing, patch: mergePatch(existing.patch, next.patch) };
  if (isRemoval(existing)) return next;
  if (isSeriesPair(existing, next))
    return {
      ...rebaseSeriesChange(existing, next, timeZone),
      kind: mergedKind(existing, next),
    };
  const merged: AgendaChange = {
    ...existing,
    kind: mergedKind(existing, next),
    patch: mergePatch(existing.patch, next.patch),
    previous: mergePatch(next.previous, existing.previous),
  };
  return isNoop(merged) ? null : merged;
}

/** The event a `create` draws before the route answers it. */
export function eventOfCreate(change: AgendaChange): AgendaEvent {
  return patchEvent(
    { title: "", start: "", id: change.tempId ?? change.id ?? "" },
    change.patch,
  );
}

/** A series with one more day left out. */
function withException(event: AgendaEvent, day: string): AgendaEvent {
  if (!event.recurrence) return event;
  const exceptions = event.recurrence.exceptions ?? [];
  if (exceptions.includes(day)) return event;
  return {
    ...event,
    recurrence: { ...event.recurrence, exceptions: [...exceptions, day] },
  };
}

/** An occurrence changed alone: left out of its series, drawn as an event of its own. */
function detachOccurrence(
  events: AgendaEvent[],
  change: AgendaChange,
  day: string,
): AgendaEvent[] {
  const series = events.find((event) => event.id === change.id);
  if (!series) return events;
  const others = events.map((event) =>
    event === series ? withException(event, day) : event,
  );
  if (isRemoval(change)) return others;
  const { recurrence: _recurrence, ...single } = series;
  return [
    ...others,
    patchEvent({ ...single, id: occurrenceKey(series.id, day) }, change.patch),
  ];
}

/**
 * The events with a change laid over them: a new event added (`seed`, or
 * the event the change describes), one removed, one patched, a series moved
 * by its occurrence, or one occurrence detached from its series.
 */
export function applyChange(
  events: AgendaEvent[],
  change: AgendaChange,
  seed?: AgendaEvent,
  /** The agenda's zone: a series without one of its own moves in it. */
  timeZone = "UTC",
): AgendaEvent[] {
  if (isNewKind(change)) {
    const created = seed
      ? patchEvent(seed, change.patch)
      : eventOfCreate(change);
    return [...events.filter((event) => event.id !== created.id), created];
  }
  if (change.scope === "occurrence" && change.occurrence)
    return detachOccurrence(events, change, change.occurrence);
  if (isRemoval(change))
    return events.filter((event) => event.id !== change.id);
  const patch = (event: AgendaEvent) =>
    change.occurrence && event.recurrence
      ? patchSeries(event, change, timeZone)
      : patchEvent(event, change.patch);
  return events.map((event) => (event.id === change.id ? patch(event) : event));
}

/** Whether an edit's change is drawn: an immediate change refused is drawn where it was. */
const isDrawn = (edit: AgendaEdit, mode: AgendaSaveMode) =>
  !(mode === "immediate" && edit.status === "error");

const STATE_OF: Record<AgendaEditStatus, AgendaOccurrenceState> = {
  staged: "staged",
  saving: "saving",
  error: "error",
  conflict: "conflict",
};

/** The event id an edit's mark is under: the event it draws. */
function markKeyOf(edit: AgendaEdit): string {
  const { change } = edit;
  if (isNewKind(change)) return change.tempId ?? edit.key;
  return edit.key;
}

/** The events read with every edit laid over them, and how each changed one shows it. */
export function overlayEdits(
  events: AgendaEvent[],
  edits: AgendaEdit[],
  mode: AgendaSaveMode,
  timeZone = "UTC",
): { events: AgendaEvent[]; marks: Map<string, AgendaEditMark> } {
  let shown = events;
  const marks = new Map<string, AgendaEditMark>();
  for (const edit of edits) {
    if (isDrawn(edit, mode)) {
      shown = applyChange(shown, edit.change, edit.seed, timeZone);
      if (edit.queued)
        shown = applyChange(shown, edit.queued, edit.seed, timeZone);
    }
    marks.set(markKeyOf(edit), {
      state: STATE_OF[edit.status],
      message: edit.message,
      ghost: mode === "staged" ? edit.ghost : undefined,
      occurrence:
        edit.change.scope === "series" ? edit.change.occurrence : undefined,
    });
  }
  return { events: shown, marks };
}

/** A pending item made of an event sent back to the list. */
export function pendingOfEvent(event: AgendaEvent): AgendaPendingItem {
  return {
    id: event.id,
    title: event.title,
    subtitle: event.subtitle,
    calendarId: event.calendarId,
    color: event.color,
    icon: event.icon,
    badges: event.badges,
    allDay: event.allDay,
    allowedResourceIds: event.allowedResourceIds,
    data: event.data,
  };
}

/** The pending items with the edits laid over them: a scheduled one leaves, an unscheduled event joins. */
export function overlayPending(
  items: AgendaPendingItem[],
  edits: AgendaEdit[],
  mode: AgendaSaveMode,
): AgendaPendingItem[] {
  const drawn = edits.filter((edit) => isDrawn(edit, mode));
  const scheduled = new Set(
    drawn
      .filter((edit) => edit.change.kind === "schedule")
      .map((edit) => edit.change.id),
  );
  const added = drawn
    .filter((edit) => edit.change.kind === "unschedule" && edit.base)
    .map((edit) => pendingOfEvent(edit.base!));
  const kept = items.filter((item) => !scheduled.has(item.id));
  const ids = new Set(kept.map((item) => item.id));
  return [...kept, ...added.filter((item) => !ids.has(item.id))];
}

/**
 * The change an Undo writes after `change` was written: the fields put back,
 * an event created removed (by the id the route gave it), one deleted
 * created again. `null` for what cannot be undone from here: a change of a
 * recurring event (the route detaches or moves occurrences its own way), or
 * an event sent back to the pending items.
 */
export function inverseChange(
  change: AgendaChange,
  answeredId: string | undefined,
  newTempId: () => string,
): AgendaChange | null {
  if (change.occurrence) return null;
  if (change.kind === "create" || change.kind === "schedule") {
    // Written without the id the route gave it: nothing to name in an Undo.
    const id = answeredId;
    if (!id) return null;
    return {
      kind: change.kind === "create" ? "delete" : "unschedule",
      id,
      previous: change.patch,
    };
  }
  if (change.kind === "delete")
    return { kind: "create", tempId: newTempId(), patch: change.previous };
  if (change.kind === "unschedule") return null;
  return {
    kind: change.kind,
    id: change.id,
    patch: change.previous,
    previous: change.patch,
  };
}
