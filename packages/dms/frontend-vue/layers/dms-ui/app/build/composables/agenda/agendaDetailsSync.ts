import type { AgendaDetailsState, AgendaOccurrence } from "./agendaModel";

/**
 * The details after the events were read again: an event open in the read view shows its fresh occurrence, so
 * an action that changed it on the server (a status) is seen without closing the drawer. The form is left alone
 * (it holds what the user typed), and so is a drawer whose event is only hidden by a filter. A read view whose event
 * left the data read (`loaded`, the ids of the events the agenda holds), as a booking sent to the waiting list
 * does, closes: its actions no longer apply.
 */
export function followRefresh(
  details: AgendaDetailsState | null,
  occurrences: readonly AgendaOccurrence[],
  loaded?: ReadonlySet<string>,
): AgendaDetailsState | null {
  const open = details?.occurrence;
  if (!details || !open || details.mode !== "view") return details;
  if (loaded !== undefined && !loaded.has(open.event.id)) return null;
  const fresh = occurrences.find(({ key }) => key === open.key);
  return fresh && fresh.event !== open.event
    ? { ...details, occurrence: fresh }
    : details;
}
