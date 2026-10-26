import {
  Context,
  Controller,
  Get,
  JSONBody,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type {
  AgendaData,
  AgendaEvent,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { eventsFor, readAgendaQuery } from "../query";
import { readAgendaSave } from "../save";
import { AgendaStore, type RuleContext } from "../store";
import { currentWeek, timeOf } from "../time";
import { onCallData, roomName, seedBookings } from "./data";
import { AGENDA_EMBEDDED_API, PageAgendaEmbedded } from "./page";

function overlaps(event: AgendaEvent, other: AgendaEvent): boolean {
  if (!event.end || !other.end || other.id === event.id) return false;
  return (
    Date.parse(event.start) < Date.parse(other.end) &&
    Date.parse(other.start) < Date.parse(event.end)
  );
}

/** Why a booking may not be written: one room, free at that time. */
function refuseBooking(
  event: AgendaEvent,
  { state }: RuleContext,
): string | undefined {
  if (!event.title.trim()) return "Donnez un titre à la réservation.";
  const room = event.resourceIds?.[0];
  if (!room) return "Choisissez une salle.";
  const taken = state.events.find(
    (other) => other.resourceIds?.[0] === room && overlaps(event, other),
  );
  if (!taken?.end) return undefined;
  return `${roomName(room)} est déjà réservée de ${timeOf(taken.start)} à ${timeOf(taken.end)} (${taken.title}).`;
}

const store = new AgendaStore(seedBookings, {
  idPrefix: "room",
  anchor: currentWeek,
  refuse: refuseBooking,
  complete: (event) => ({
    ...event,
    calendarId: event.calendarId ?? "produit",
    resourceIds: event.resourceIds?.length ? event.resourceIds : ["nord"],
  }),
  decorate: (event) => ({
    ...event,
    location: roomName(event.resourceIds?.[0]),
  }),
});

/**
 * The routes of the "Containers" demo: the office's room bookings, shared by
 * the agendas of the grid column, the modal and the drawer; the save refuses
 * a room booked twice at once.
 */
export class AgendaEmbeddedController extends Controller(AGENDA_EMBEDDED_API) {
  @AuthUserWithPermission(PageAgendaEmbedded)
  declare user: User;

  @Get("events")
  list(@Context() ctx: RequestContext): AgendaData {
    const query = readAgendaQuery(ctx.url.searchParams);
    return { events: store.answer(eventsFor(store.events, query)) };
  }

  @Post("save")
  save(@JSONBody() body: AgendaSaveRequest): AgendaSaveResponse {
    return store.save(readAgendaSave(body));
  }

  /** The IT on-call turns, read-only, computed from the current week on each read. */
  @Get("on-call")
  onCall(): AgendaData {
    return onCallData();
  }

  @Post("reset")
  reset() {
    store.reset();
    return { message: "Réservations remises à zéro" };
  }
}
