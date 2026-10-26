// A change made while the write of its event runs waits; once that write
// settles it goes, addressed to the event as the route now knows it: a new
// event by the id the route gave it, a detached occurrence by its own id
// (or detached again from its series with every field).

import type {
  AgendaChange,
  AgendaSaveResponse,
} from "../../../types/full-agenda";
import { mergePatch, type AgendaEdit } from "./agendaChanges";
import { occurrenceKey } from "./agendaRecurrence";

/** The id each local id of the written changes has on the route. */
export function answeredIds(
  written: AgendaChange[],
  response: AgendaSaveResponse,
): Map<string, string> {
  const answered = response.events ?? [];
  const ids = new Map<string, string>();
  for (const change of written) {
    if (change.tempId) {
      const created = answered.find((event) => event.tempId === change.tempId);
      if (created) ids.set(change.tempId, created.id);
    }
    if (change.scope !== "occurrence" || !change.id || !change.occurrence)
      continue;
    // The one answered event that is not the series is the detached occurrence.
    const others = answered.filter(
      (event) => event.id !== change.id && !event.tempId,
    );
    if (others.length === 1)
      ids.set(occurrenceKey(change.id, change.occurrence), others[0]!.id);
  }
  return ids;
}

/** The local id the event of a written change had: its `tempId`, or `<series>@<day>`. */
function localIdOf(change: AgendaChange): string | undefined {
  if (change.tempId) return change.tempId;
  if (change.scope === "occurrence" && change.id && change.occurrence)
    return occurrenceKey(change.id, change.occurrence);
  return undefined;
}

/** Whether a change makes a new event (its key is a temporary id the route never knew). */
export const makesNewEvent = (change: AgendaChange) =>
  change.kind === "create" || change.kind === "schedule";

/**
 * The change queued behind a refused one, sent on its own: for the fields
 * both set, it reads from what the route still stores (the refused
 * change's `previous`), not from the refused place it was drawn over.
 */
export function afterRefused(
  refused: AgendaChange,
  queued: AgendaChange,
): AgendaChange {
  // Through another occurrence of a series, `previous` names that
  // occurrence's own times: nothing of the refused change applies.
  if (
    refused.occurrence &&
    queued.occurrence &&
    refused.occurrence !== queued.occurrence
  )
    return queued;
  const stored = refused.previous ?? {};
  const shared = Object.keys(queued.patch ?? {}).filter(
    (key) => key in stored,
  ) as Array<keyof typeof stored>;
  if (!shared.length) return queued;
  return {
    ...queued,
    previous: {
      ...queued.previous,
      ...Object.fromEntries(shared.map((key) => [key, stored[key]])),
    },
  };
}

/**
 * Whether the change queued behind a written create names an event the
 * route answered no id for: it cannot be sent (the route never knew its
 * temporary id).
 */
export function isUnaddressed(
  edit: Pick<AgendaEdit, "change" | "queued">,
  ids: Map<string, string>,
): boolean {
  const { queued, change } = edit;
  if (!queued || !change.tempId) return false;
  return queued.id === change.tempId && !ids.has(change.tempId);
}

/**
 * The change queued behind a written one, addressed as the route now knows
 * the event. An occurrence detached without an answered id is detached
 * again from its series, with the fields of both changes: the route keeps
 * the day and the times the user sees.
 */
export function readdressQueued(
  edit: Pick<AgendaEdit, "change" | "queued">,
  ids: Map<string, string>,
): AgendaChange | undefined {
  const { queued, change } = edit;
  if (!queued) return undefined;
  const localId = localIdOf(change);
  if (!localId || queued.id !== localId) return queued;
  const id = ids.get(localId);
  if (id) return { ...queued, id };
  if (change.scope !== "occurrence") return queued;
  if (queued.kind === "delete" || queued.kind === "unschedule")
    return {
      ...queued,
      id: change.id,
      occurrence: change.occurrence,
      scope: "occurrence",
    };
  return {
    ...queued,
    kind: "update",
    id: change.id,
    occurrence: change.occurrence,
    scope: "occurrence",
    patch: mergePatch(change.patch, queued.patch),
    previous: change.previous,
  };
}
