// The change a drop writes: a move or resize of an occurrence, a copy (Alt),
// a pending item scheduled, an event sent back to the pending items.

import type {
  AgendaChange,
  AgendaEventPatch,
  AgendaPendingItem,
} from "../../../types/full-agenda";
import type { AgendaOccurrence, AgendaPlacement } from "./agendaModel";
import { zonedDayKey, zonedIso } from "./agendaTime";
import { lastDayOf } from "./agendaDragMath";

/** The time fields of a placement, as the contract writes them. */
export function placementPatch(
  placement: AgendaPlacement,
  timeZone: string,
): AgendaEventPatch {
  const times = placement.allDay
    ? {
        start: zonedDayKey(placement.start, timeZone),
        end: lastDayOf(placement, timeZone),
      }
    : {
        start: zonedIso(placement.start, timeZone),
        end: zonedIso(placement.end, timeZone),
      };
  return {
    ...times,
    allDay: placement.allDay,
    resourceIds: [...placement.resourceIds],
  };
}

/** The fields a move or resize changes, as they were. */
function previousPatch(occurrence: AgendaOccurrence): AgendaEventPatch {
  const { event } = occurrence;
  return {
    start: event.start,
    end: event.end,
    allDay: event.allDay ?? false,
    resourceIds: [...(event.resourceIds ?? [])],
  };
}

/** The id a change names: the series of a recurring occurrence. */
const eventId = (occurrence: AgendaOccurrence) =>
  occurrence.recurring?.seriesId ?? occurrence.event.id;

let copies = 0;

/** A temporary id for a created event, unique in the page. */
function tempId(prefix: string): string {
  copies += 1;
  return `${prefix}-${Date.now().toString(36)}-${copies}`;
}

/** A move or resize of an occurrence to a placement. */
export function placementChange(
  occurrence: AgendaOccurrence,
  placement: AgendaPlacement,
  kind: "move" | "resize",
  timeZone: string,
): AgendaChange {
  const change: AgendaChange = {
    kind,
    id: eventId(occurrence),
    patch: placementPatch(placement, timeZone),
    previous: previousPatch(occurrence),
  };
  // An occurrence of a recurring event names its day; the save engine asks occurrence or series.
  if (occurrence.recurring) change.occurrence = occurrence.recurring.occurrence;
  return change;
}

/** A new event copying an occurrence at a placement (Alt held on drop). */
export function copyChange(
  occurrence: AgendaOccurrence,
  placement: AgendaPlacement,
  timeZone: string,
): AgendaChange {
  const { event } = occurrence;
  return {
    kind: "create",
    tempId: tempId(`copy-${event.id}`),
    patch: {
      title: event.title,
      calendarId: event.calendarId,
      location: event.location,
      description: event.description,
      data: event.data,
      ...placementPatch(placement, timeZone),
    },
  };
}

/** A pending item put on the agenda. */
export function scheduleChange(
  item: AgendaPendingItem,
  placement: AgendaPlacement,
  timeZone: string,
): AgendaChange {
  return {
    kind: "schedule",
    id: item.id,
    patch: placementPatch(placement, timeZone),
  };
}

/** An event sent back to the pending items. */
export function unscheduleChange(occurrence: AgendaOccurrence): AgendaChange {
  return {
    kind: "unschedule",
    id: eventId(occurrence),
    previous: previousPatch(occurrence),
  };
}
