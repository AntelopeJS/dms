import type {
  AgendaBadge,
  AgendaCalendar,
  AgendaEvent,
  AgendaFieldOption,
  AgendaMark,
  AgendaResource,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import type { JsonValue } from "@antelopejs/interface-dms/base/types/json";
import type { AgendaState } from "../store";
import { addDays, currentWeek, zonedInstant } from "../time";

/** The hosts who run the bookings, one calendar each. */
export const BOOKING_HOSTS: AgendaCalendar[] = [
  { id: "ana", label: "Ana Lopez", color: "oklch(0.62 0.15 258)" },
  { id: "ben", label: "Ben Okafor", color: "oklch(0.65 0.13 165)" },
  { id: "cleo", label: "Cleo Martin", color: "oklch(0.64 0.16 330)" },
];

/** The rooms booked, each with the host who usually runs it. */
const ROOMS = [
  { id: "room-a", label: "Room A", description: "12 seats", calendarId: "ana" },
  { id: "room-b", label: "Room B", description: "8 seats", calendarId: "ben" },
  {
    id: "room-c",
    label: "Room C",
    description: "20 seats",
    calendarId: "cleo",
  },
  {
    id: "room-d",
    label: "Room D",
    description: "Closed for works",
    editable: false,
  },
] satisfies AgendaResource[];

export const BOOKING_ROOMS: AgendaResource[] = ROOMS;

/** The name of a room, for the route's messages. */
export const roomLabel = (id: string | undefined): string =>
  ROOMS.find((room) => room.id === id)?.label ?? "The room";

/** The guests a booking is for, as the relation field searches them. */
export interface BookingGuest {
  value: string;
  label: string;
  description: string;
}

export const BOOKING_GUESTS: BookingGuest[] = [
  { value: "g-acme", label: "Acme Ltd", description: "Ann Ward" },
  { value: "g-birch", label: "Birch & Co", description: "Tom Birch" },
  { value: "g-cobalt", label: "Cobalt Studio", description: "Mia Chen" },
  { value: "g-delta", label: "Delta Freight", description: "Omar Ali" },
  { value: "g-ember", label: "Ember Books", description: "Lea Roy" },
  { value: "g-fjord", label: "Fjord Travel", description: "Nils Berg" },
  { value: "g-grove", label: "Grove School", description: "Sara Diaz" },
  { value: "g-harbor", label: "Harbor Bank", description: "Ivan Petrov" },
];

/** The kinds of booking, answered by the route with the length each presets. */
const KINDS = [
  { value: "meeting", label: "Meeting", durationMinutes: 30 },
  { value: "interview", label: "Interview", durationMinutes: 60 },
  { value: "workshop", label: "Workshop", durationMinutes: 90 },
  { value: "training", label: "Training", durationMinutes: 120 },
] satisfies AgendaFieldOption[];

export const BOOKING_KINDS: AgendaFieldOption[] = KINDS;

/** The steps of a booking, drawn on every chip. */
const BOOKING_MARKS = new Map<JsonValue | undefined, AgendaMark>([
  ["booked", { label: "Booked", icon: "i-ph-calendar-check", tone: "neutral" }],
  ["checkedIn", { label: "Checked in", icon: "i-ph-door-open", tone: "info" }],
  ["started", { label: "In progress", icon: "i-ph-play", tone: "success" }],
]);

const STEP_FREE: AgendaBadge = {
  label: "Needs step-free access",
  tone: "warning",
  icon: "i-ph-person-simple-walk",
  alert: true,
};
const OVERBOOKED: AgendaBadge = {
  label: "Overbooked",
  tone: "error",
  icon: "i-ph-users-three",
  pinned: true,
};

interface SeedBooking {
  id: string;
  day: number;
  start: string;
  end: string;
  room: string;
  host: string;
  guest: string;
  kind: string;
  status?: "booked" | "checkedIn" | "started";
  badges?: AgendaBadge[];
}

const SEED: SeedBooking[] = [
  {
    id: "b1",
    day: 0,
    start: "09:00",
    end: "10:00",
    room: "room-a",
    host: "ana",
    guest: "g-acme",
    kind: "interview",
    status: "checkedIn",
  },
  {
    id: "b2",
    day: 0,
    start: "10:30",
    end: "12:00",
    room: "room-c",
    host: "cleo",
    guest: "g-grove",
    kind: "workshop",
    badges: [STEP_FREE],
  },
  {
    id: "b3",
    day: 1,
    start: "14:00",
    end: "14:30",
    room: "room-b",
    host: "ben",
    guest: "g-delta",
    kind: "meeting",
    badges: [OVERBOOKED],
  },
  {
    id: "b4",
    day: 1,
    start: "09:00",
    end: "11:00",
    room: "room-a",
    host: "ana",
    guest: "g-cobalt",
    kind: "training",
    status: "started",
  },
  {
    id: "b5",
    day: 2,
    start: "13:00",
    end: "14:00",
    room: "room-c",
    host: "cleo",
    guest: "g-ember",
    kind: "interview",
  },
  {
    id: "b6",
    day: 3,
    start: "15:00",
    end: "16:30",
    room: "room-b",
    host: "ben",
    guest: "g-fjord",
    kind: "workshop",
    badges: [STEP_FREE, OVERBOOKED],
  },
  {
    id: "b7",
    day: 4,
    start: "10:00",
    end: "10:30",
    room: "room-a",
    host: "ana",
    guest: "g-harbor",
    kind: "meeting",
  },
];

export const guestOf = (id: JsonValue | undefined) =>
  BOOKING_GUESTS.find((guest) => guest.value === id);

const kindOf = (id: JsonValue | undefined) =>
  KINDS.find((kind) => kind.value === id);

function seedEvent(seed: SeedBooking, monday: string): AgendaEvent {
  const day = addDays(monday, seed.day);
  const guest = guestOf(seed.guest);
  return {
    id: seed.id,
    title: guest?.label ?? "Booking",
    start: zonedInstant(day, seed.start),
    end: zonedInstant(day, seed.end),
    calendarId: seed.host,
    resourceIds: [seed.room],
    status: "confirmed",
    badges: seed.badges,
    revision: "1",
    data: {
      guestId: seed.guest,
      guestIdLabel: guest?.label ?? null,
      kind: seed.kind,
      step: seed.status ?? "booked",
      equipment: [],
    },
  };
}

/** The weekly cleaning of Room C, which a change alters from this week on. */
function cleaningSeries(monday: string): AgendaEvent {
  return {
    id: "cleaning",
    title: "Cleaning",
    start: zonedInstant(addDays(monday, -14), "18:00"),
    end: zonedInstant(addDays(monday, -14), "19:00"),
    calendarId: "cleo",
    resourceIds: ["room-c"],
    recurrence: { frequency: "weekly", weekdays: [5] },
    changeableFrom: monday,
    revision: "1",
    data: { step: "booked", equipment: [] },
  };
}

/** The week's bookings, seeded around the current week. */
export function seedRoomBookings(): AgendaState {
  const monday = currentWeek();
  return {
    events: [
      ...SEED.map((seed) => seedEvent(seed, monday)),
      cleaningSeries(monday),
    ],
    pending: [],
  };
}

/**
 * What the route derives on each answer: the step drawn as the chip's
 * mark, the kind and length as its subtitle, the guest's label kept with
 * its id, and a no-show named as such.
 */
export function decorateBooking(event: AgendaEvent): AgendaEvent {
  const step = event.data?.step;
  const kind = kindOf(event.data?.kind);
  const guest = guestOf(event.data?.guestId);
  const minutes = event.end
    ? Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60_000)
    : 0;
  return {
    ...event,
    title: guest?.label ?? event.title,
    mark: BOOKING_MARKS.get(step),
    subtitle: kind ? `${kind.label} · ${minutes} min` : event.subtitle,
    statusLabel: event.status === "cancelled" ? "No-show" : undefined,
    data: { ...event.data, guestIdLabel: guest?.label ?? null },
  };
}
