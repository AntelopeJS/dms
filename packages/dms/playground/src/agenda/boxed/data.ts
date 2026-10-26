import type {
  AgendaCalendar,
  AgendaEvent,
  AgendaFieldOption,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import type { AgendaState } from "../store";
import { addDays, mondayOf, todayKey, zonedInstant } from "../time";

/** The sales team's calendars. */
export const BOXED_CALENDARS: AgendaCalendar[] = [
  {
    id: "rdv",
    label: "Rendez-vous clients",
    color: "primary",
    icon: "i-ph-handshake",
  },
  { id: "demo", label: "Démos produit", color: "info", icon: "i-ph-desktop" },
  {
    id: "terrain",
    label: "Visites sur site",
    color: "success",
    icon: "i-ph-map-pin",
  },
  { id: "formation", label: "Formations", color: "warning" },
  { id: "interne", label: "Interne", color: "neutral", icon: "i-ph-house" },
];

/** The places a meeting takes place in, the location facet's choices. */
export const BOXED_LOCATIONS: AgendaFieldOption[] = [
  { value: "Liège", label: "Liège" },
  { value: "Namur", label: "Namur" },
  { value: "Bruxelles", label: "Bruxelles" },
  { value: "Visio", label: "Visio", icon: "i-ph-video-camera" },
];

/**
 * One meeting of the seed: calendar, title, client, day (from this Monday),
 * start, end, place.
 */
type SeedMeeting = [string, string, string, number, string, string, string];

/**
 * Two weeks of a sales team, with a few overlaps on Tuesday and Thursday so
 * the stacked layout has something to stack.
 */
const MEETINGS: SeedMeeting[] = [
  ["interne", "Point commercial du lundi", "", 0, "09:00", "09:45", "Liège"],
  [
    "rdv",
    "Découverte besoins ERP",
    "Brasserie Lefèbvre",
    0,
    "10:30",
    "12:00",
    "Namur",
  ],
  [
    "demo",
    "Démo module stock",
    "Menuiserie Collard",
    0,
    "14:00",
    "15:00",
    "Visio",
  ],
  [
    "terrain",
    "Visite entrepôt",
    "Transports Bodson",
    1,
    "09:00",
    "11:00",
    "Liège",
  ],
  [
    "rdv",
    "Revue de l'offre",
    "Transports Bodson",
    1,
    "10:00",
    "11:00",
    "Liège",
  ],
  ["demo", "Démo CRM", "Agence Immo Delvaux", 1, "10:30", "11:30", "Visio"],
  [
    "rdv",
    "Signature contrat",
    "Clinique Saint-Luc",
    1,
    "15:00",
    "16:00",
    "Bruxelles",
  ],
  [
    "formation",
    "Formation utilisateurs",
    "Brasserie Lefèbvre",
    2,
    "09:00",
    "12:30",
    "Namur",
  ],
  ["interne", "Déjeuner d'équipe", "", 2, "12:30", "13:30", "Liège"],
  [
    "rdv",
    "Atelier cahier des charges",
    "Ville de Seraing",
    3,
    "09:30",
    "11:30",
    "Liège",
  ],
  [
    "demo",
    "Démo portail client",
    "Ville de Seraing",
    3,
    "10:00",
    "11:00",
    "Liège",
  ],
  [
    "terrain",
    "Audit atelier",
    "Menuiserie Collard",
    3,
    "14:00",
    "16:30",
    "Namur",
  ],
  ["interne", "Revue du pipeline", "", 4, "11:00", "12:00", "Visio"],
  [
    "rdv",
    "Relance proposition",
    "Agence Immo Delvaux",
    4,
    "14:30",
    "15:15",
    "Visio",
  ],
  [
    "rdv",
    "Kick-off projet",
    "Clinique Saint-Luc",
    7,
    "10:00",
    "12:00",
    "Bruxelles",
  ],
  [
    "formation",
    "Formation administrateurs",
    "Transports Bodson",
    8,
    "13:30",
    "17:00",
    "Liège",
  ],
  ["demo", "Démo planning", "Garage Hennen", 9, "10:00", "11:00", "Visio"],
  [
    "terrain",
    "Relevé des besoins",
    "Garage Hennen",
    10,
    "09:00",
    "10:30",
    "Namur",
  ],
  ["interne", "Comité commercial mensuel", "", 11, "16:00", "17:30", "Liège"],
];

/** Done meetings of last week, for the "Fait" badge and the dimmed chips. */
const DONE: SeedMeeting[] = [
  ["rdv", "Premier contact", "Garage Hennen", -4, "11:00", "11:45", "Visio"],
  [
    "demo",
    "Démo facturation",
    "Brasserie Lefèbvre",
    -3,
    "14:00",
    "15:00",
    "Namur",
  ],
];

function seedMeeting(
  monday: string,
  [calendarId, title, client, offset, start, end, location]: SeedMeeting,
  id: string,
): AgendaEvent {
  const day = addDays(monday, offset);
  return {
    id,
    title,
    subtitle: client || undefined,
    calendarId,
    start: zonedInstant(day, start),
    end: zonedInstant(day, end),
    location,
    data: { client, done: false },
  };
}

/** A meeting marked as done: dimmed, with a badge. */
export function markedDone(event: AgendaEvent): AgendaEvent {
  return {
    ...event,
    muted: true,
    badges: [{ label: "Fait", tone: "success", icon: "i-ph-check" }],
    data: { ...event.data, done: true },
  };
}

/** A trade fair over two days, for the all-day row. */
function fair(monday: string): AgendaEvent {
  return {
    id: "boxed-fair",
    title: "Salon Entreprendre — stand B12",
    calendarId: "interne",
    allDay: true,
    start: addDays(monday, 9),
    end: addDays(monday, 10),
    location: "Bruxelles",
    data: { client: "", done: false },
  };
}

/** The sales agenda, its dates computed from the current week. */
export function seedBoxed(): AgendaState {
  const monday = mondayOf(todayKey());
  return {
    events: [
      ...MEETINGS.map((seed, index) =>
        seedMeeting(monday, seed, `boxed-${index + 1}`),
      ),
      ...DONE.map((seed, index) =>
        markedDone(seedMeeting(monday, seed, `boxed-done-${index + 1}`)),
      ),
      fair(monday),
    ],
    pending: [],
  };
}
