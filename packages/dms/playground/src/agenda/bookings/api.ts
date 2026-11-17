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
  AgendaProposal,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";
import { eventsFor, readAgendaQuery } from "../query";
import { actionId, missing, readAgendaSave } from "../save";
import { AgendaStore, type AgendaRefusal, type RuleContext } from "../store";
import {
  addDays,
  currentWeek,
  dayOf,
  isoInstant,
  minutesOfDay,
  todayKey,
  zonedInstant,
} from "../time";
import {
  BOOKING_GUESTS,
  BOOKING_KINDS,
  BOOKING_ROOMS,
  decorateBooking,
  guestOf,
  roomLabel,
  seedRoomBookings,
} from "./data";
import {
  AGENDA_BOOKINGS_API,
  BOOKINGS_CLOSE,
  BOOKINGS_OPEN,
  BOOKINGS_TOPIC,
  PageAgendaBookings,
} from "./page";

const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const MIN_SEARCH = 2;
const PROPOSAL_DAYS = 14;
const STEP_MINUTES = 30;

const minutesOf = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * HOUR_MINUTES + minutes;
};
const OPENS = minutesOf(BOOKINGS_OPEN);
const CLOSES = minutesOf(BOOKINGS_CLOSE);

const overlaps = (a: AgendaEvent, b: AgendaEvent) =>
  Date.parse(a.start) < Date.parse(b.end ?? b.start) &&
  Date.parse(b.start) < Date.parse(a.end ?? a.start);

function roomTaken(next: AgendaEvent, events: AgendaEvent[]) {
  const room = next.resourceIds?.[0];
  return events.find(
    (other) =>
      other.id !== next.id &&
      !other.recurrence &&
      other.resourceIds?.[0] === room &&
      overlaps(other, next),
  );
}

/**
 * Why a booking may not be written: it needs a room (said under the room
 * field, with no Retry), it must be the version the user saw, sit within
 * opening hours, and keep its room free.
 */
function refuseBooking(
  next: AgendaEvent,
  context: RuleContext,
): AgendaRefusal | undefined {
  if (!next.resourceIds?.length) {
    return {
      message: "Pick a room for this booking.",
      field: "resourceIds",
      retryable: false,
    };
  }
  const seen = context.change.revision;
  if (seen && context.before?.revision && seen !== context.before.revision) {
    return {
      message:
        "Someone changed this booking since you opened it. Read it again.",
      retryable: false,
    };
  }
  if (next.recurrence) return undefined;
  const start = minutesOfDay(next.start);
  const end = next.end ? minutesOfDay(next.end) : start;
  if (
    start < OPENS ||
    end > CLOSES ||
    dayOf(next.start) !== dayOf(next.end ?? next.start)
  ) {
    return {
      message: `Rooms open from ${BOOKINGS_OPEN} to ${BOOKINGS_CLOSE}.`,
    };
  }
  const taken = roomTaken(next, context.state.events);
  if (taken) {
    return {
      message: `${roomLabel(next.resourceIds?.[0])} is taken by ${store.decorate(taken).title} at that time.`,
      field: "resourceIds",
    };
  }
  return undefined;
}

const nextRevision = (event: AgendaEvent) =>
  String(Number(event.revision ?? "0") + 1);

const store = new AgendaStore(seedRoomBookings, {
  idPrefix: "booking",
  anchor: currentWeek,
  refuseWith: refuseBooking,
  complete: (event) => ({
    ...event,
    title: event.title || guestOf(event.data?.guestId)?.label || "Booking",
    status: event.status ?? "confirmed",
    data: { step: "booked", equipment: [], ...event.data },
  }),
  decorate: (event) =>
    decorateBooking({ ...event, revision: event.revision ?? "1" }),
});

/** The first free hour of a room, from the next half hour on, within opening hours. */
function firstFreeHour(): AgendaProposal | undefined {
  const now = Date.now();
  const today = todayKey();
  for (let offset = 0; offset < PROPOSAL_DAYS; offset++) {
    const day = addDays(today, offset);
    for (
      let minute = OPENS;
      minute + HOUR_MINUTES <= CLOSES;
      minute += STEP_MINUTES
    ) {
      const time = `${String(Math.floor(minute / HOUR_MINUTES)).padStart(2, "0")}:${String(minute % HOUR_MINUTES).padStart(2, "0")}`;
      const start = zonedInstant(day, time);
      if (Date.parse(start) < now) continue;
      const end = isoInstant(Date.parse(start) + HOUR_MINUTES * MINUTE_MS);
      for (const room of BOOKING_ROOMS) {
        if (room.editable === false) continue;
        const probe: AgendaEvent = {
          id: "probe",
          title: "",
          start,
          end,
          resourceIds: [room.id],
        };
        if (roomTaken(probe, store.events)) continue;
        return {
          start,
          end,
          resourceIds: [room.id],
          calendarId: room.calendarId,
          title: "Interview",
          data: { kind: "interview" },
          message: `Proposed: the first free hour, in ${roomLabel(room.id)}.`,
        };
      }
    }
  }
  return undefined;
}

/** The guests matching a search, or the one an id names. */
function guestsFor(params: URLSearchParams) {
  const id = params.get("id");
  if (id)
    return { items: BOOKING_GUESTS.filter((guest) => guest.value === id) };
  const text = (params.get("q") ?? "").trim().toLowerCase();
  if (text.length < MIN_SEARCH) return { items: [] };
  return {
    items: BOOKING_GUESTS.filter((guest) =>
      `${guest.label} ${guest.description}`.toLowerCase().includes(text),
    ),
  };
}

/**
 * The routes of the "Room bookings" demo: the bookings of four rooms,
 * filtered by the hosts the legend shows, the kinds the form offers with
 * their lengths, a guest search for the relation field, the first free
 * hour for booking mode, a check-in action, and a save that refuses a
 * booking without a room under its field and tells the other tabs.
 */
export class AgendaBookingsController extends Controller(AGENDA_BOOKINGS_API) {
  @AuthUserWithPermission(PageAgendaBookings)
  declare user: User;

  @Get("events")
  list(@Context() ctx: RequestContext): AgendaData {
    const query = readAgendaQuery(ctx.url.searchParams);
    return {
      events: store.answer(eventsFor(store.events, query)),
      fieldOptions: { kind: BOOKING_KINDS },
    };
  }

  @Get("guests")
  guests(@Context() ctx: RequestContext) {
    return guestsFor(ctx.url.searchParams);
  }

  @Get("proposal")
  proposal(): AgendaProposal {
    return (
      firstFreeHour() ?? {
        start: zonedInstant(todayKey(), BOOKINGS_OPEN),
        end: zonedInstant(todayKey(), BOOKINGS_OPEN),
        message: "No room is free in the next two weeks.",
      }
    );
  }

  @Post("save")
  async save(@JSONBody() body: AgendaSaveRequest): Promise<AgendaSaveResponse> {
    const answer = store.save(readAgendaSave(body));
    for (const event of answer.events ?? []) {
      const stored = store.find(event.id);
      if (stored) store.put({ ...stored, revision: nextRevision(stored) });
    }
    await PublishMessage(BOOKINGS_TOPIC, "changed");
    return {
      ...answer,
      events: (answer.events ?? []).map((event) => ({
        ...store.decorate(store.find(event.id) ?? event),
        tempId: event.tempId,
      })),
    };
  }

  @Post("check-in")
  async checkIn(@Context() ctx: RequestContext) {
    const booking = store.find(actionId(ctx.url.searchParams));
    if (!booking) return missing("This booking is gone.");
    store.put({
      ...booking,
      revision: nextRevision(booking),
      data: { ...booking.data, step: "checkedIn" },
    });
    await PublishMessage(BOOKINGS_TOPIC, "changed");
    return {
      message: `${guestOf(booking.data?.guestId)?.label ?? booking.title} is checked in.`,
    };
  }

  @Post("reset")
  async reset() {
    store.reset();
    await PublishMessage(BOOKINGS_TOPIC, "changed");
    return { message: "The bookings are back as they started" };
  }
}
