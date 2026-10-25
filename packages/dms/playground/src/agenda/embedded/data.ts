import type {
  AgendaData,
  AgendaEvent,
  AgendaResource,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import type { AgendaState } from "../store";
import { addDays, mondayOf, todayKey, zonedInstant } from "../time";

/** The meeting rooms of the office: the resources of the bookings. */
export const ROOMS: AgendaResource[] = [
  { id: "nord", label: "Salle Nord", description: "8 places · écran" },
  { id: "sud", label: "Salle Sud", description: "6 places" },
  { id: "studio", label: "Studio", description: "4 places · tableau blanc" },
  { id: "board", label: "Board room", description: "12 places · visio" },
  { id: "amphi", label: "Amphi", description: "60 places" },
];

/** A room's name. */
export function roomName(id: string | undefined): string {
  const label = ROOMS.find((room) => room.id === id)?.label;
  return typeof label === "string" ? label : "Salle";
}

/**
 * One booking: room, calendar (the team booking it), title, day from this
 * Monday, start, end, who booked it.
 */
type BookingSeed = [string, string, string, number, string, string, string];

const BOOKINGS: BookingSeed[] = [
  ["nord", "produit", "Sprint planning", 0, "10:00", "11:30", "Yanis B."],
  ["board", "direction", "Comité hebdo", 0, "16:00", "17:00", "Théo D."],
  ["sud", "marketing", "Campaign kickoff", 1, "11:00", "12:00", "Léa M."],
  ["studio", "design", "Design critique", 2, "14:00", "15:00", "Camille R."],
  ["nord", "produit", "Roadmap review", 3, "10:30", "11:30", "Yanis B."],
  ["amphi", "direction", "All-hands", 4, "15:30", "16:15", "Théo D."],
  ["sud", "produit", "Rétro sprint", 4, "10:00", "11:00", "Yanis B."],
  ["studio", "design", "Design system sync", 4, "14:00", "15:00", "Camille R."],
  ["board", "eng", "Revue d'architecture", 6, "09:00", "10:30", "Yanis B."],
  ["amphi", "direction", "Kickoff Q3", 7, "10:00", "11:30", "Théo D."],
  ["studio", "design", "Workshop mobile", 8, "14:00", "16:00", "Camille R."],
  ["nord", "produit", "Sprint planning", 10, "09:30", "11:00", "Yanis B."],
];

function booking(
  monday: string,
  [room, calendarId, title, offset, start, end, owner]: BookingSeed,
  index: number,
): AgendaEvent {
  const day = addDays(monday, offset);
  return {
    id: `room-${index + 1}`,
    title,
    calendarId,
    resourceIds: [room],
    start: zonedInstant(day, start),
    end: zonedInstant(day, end),
    location: roomName(room),
    subtitle: owner,
  };
}

/** The room bookings of this week and the next. */
export function seedBookings(): AgendaState {
  const monday = mondayOf(todayKey());
  return {
    events: BOOKINGS.map((seed, index) => booking(monday, seed, index)),
    pending: [],
  };
}

/** One on-call turn: who, day from this Monday. */
type OnCallSeed = [string, number, number];

const ON_CALL: OnCallSeed[] = [
  ["Yanis B.", 0, 1],
  ["Camille R.", 2, 3],
  ["Théo D.", 4, 6],
  ["Léa M.", 7, 8],
  ["Yanis B.", 9, 10],
  ["Camille R.", 11, 13],
];

/**
 * The IT on-call turns of this week and the next, read-only: computed on
 * each read, from the current week.
 */
export function onCallData(): AgendaData {
  const monday = mondayOf(todayKey());
  return {
    calendars: [{ id: "astreinte", label: "Astreinte IT", color: "info" }],
    events: ON_CALL.map(([who, from, to], index) => ({
      id: `oncall-${index + 1}`,
      title: `Astreinte — ${who}`,
      calendarId: "astreinte",
      allDay: true,
      start: addDays(monday, from),
      end: addDays(monday, to),
    })),
  };
}
