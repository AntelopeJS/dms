import type {
  AgendaCalendar,
  AgendaEvent,
  AgendaResource,
  AgendaResourceGroup,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import type { AgendaState } from "../store";
import { plainText } from "../text";
import { addDays, daysBetween, weekdayOf, zonedInstant } from "../time";

/** The first and last day of the published roster: weeks 40 to 42 of 2026. */
export const ROSTER_FIRST_DAY = "2026-09-28";
export const ROSTER_LAST_DAY = "2026-10-18";

/** The prestation types, with the prototype's colours. */
export const PRESTATION_CALENDARS: AgendaCalendar[] = [
  { id: "travail", label: "Travail", color: "neutral" },
  { id: "maladie", label: "Maladie", color: "#1d6a2a" },
  { id: "conge", label: "Congé", color: "#1a3d99" },
  { id: "ferie", label: "Férié", color: "#855600" },
  { id: "recup", label: "Récup", color: "#5b3aa6" },
  { id: "formation", label: "Formation", color: "#14606b" },
  { id: "petit-chomage", label: "Petit chômage", color: "#9a3412" },
];

/** The store whose roster is made by its own office: read-only here. */
export const READ_ONLY_STORE = "LUX29";

/** Opening hours of a day, or `null` when the store is closed. */
type Hours = [string, string] | null;

const D9: Hours = ["09:30", "18:30"];
const S10: Hours = ["10:00", "18:00"];
const SA: Hours = ["14:00", "18:00"];

/** A store: label, then hours from Sunday (0) to Saturday (6). */
interface StoreHours {
  [store: string]: [string, Hours[]];
}

const STORE_HOURS: StoreHours = {
  NE1: ["Neupré", [S10, null, D9, D9, D9, D9, D9]],
  LG4: ["Liège", [null, D9, D9, D9, D9, D9, D9]],
  SPA: ["Spa", [S10, null, D9, D9, D9, D9, D9]],
  BAU: ["Beaufays", [SA, null, D9, D9, D9, D9, D9]],
  LUX29: ["Luxembourg", [null, D9, D9, D9, D9, D9, D9]],
};

export const ROSTER_GROUPS: AgendaResourceGroup[] = Object.entries(
  STORE_HOURS,
).map(([id, [label]]) => ({
  id,
  label: `${id} · ${label}`,
  description:
    id === READ_ONLY_STORE ? "Planifié par le bureau de Luxembourg" : undefined,
  collapsed: id === "BAU" || undefined,
}));

/** One person: last name, first name, function, store, hours a week. */
type StaffSeed = [string, string, string, string, number];

/** The prototype's staff (RH-Planning) for five of its stores. */
const STAFF: StaffSeed[] = [
  ["Delforge", "Bénédicte", "Responsable", "NE1", 38],
  ["Hubert", "Charlotte", "Vendeuse 1", "NE1", 38],
  ["Gillet", "Fanny", "Vendeuse 2", "NE1", 30],
  ["Leroy", "Noémie", "Vendeuse 3", "NE1", 24],
  ["Henrotte", "Sandrine", "Volante 1", "NE1", 38],
  ["Defays", "Virginie", "Responsable", "LG4", 38],
  ["Bertrand", "Manon", "Vendeuse 1", "LG4", 32],
  ["Lecomte", "Pauline", "Vendeuse 3", "LG4", 24],
  ["François", "Inès", "Remplaçante", "LG4", 19],
  ["Remacle", "Hélène", "Responsable", "SPA", 38],
  ["Smets", "Jessica", "Vendeuse 2", "SPA", 30],
  ["Willems", "Lisa", "Vendeuse 3", "SPA", 19],
  ["Hardy", "Tania", "Responsable", "BAU", 32],
  ["Lhoest", "Gwendoline", "Vendeuse 2", "BAU", 30],
  ["Moreau", "Zoé", "Vendeuse 3", "BAU", 16],
  ["Englebert", "Nadia", "Responsable", "LUX29", 40],
  ["Fraipont", "Joëlle", "Vendeuse 2", "LUX29", 30],
  ["Grosjean", "Marie", "Vendeuse 3", "LUX29", 20],
];

function personId(lastName: string): string {
  return lastName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export const ROSTER_RESOURCES: AgendaResource[] = STAFF.map(
  ([lastName, firstName, role, store, hours]) => ({
    id: personId(lastName),
    label: `${firstName} ${lastName.toUpperCase()}`,
    description: `${role} · ${hours} h`,
    group: store,
    editable: store === READ_ONLY_STORE ? false : undefined,
  }),
);

/** The store a person belongs to. */
export function storeOfPerson(id: string): string | undefined {
  return ROSTER_RESOURCES.find((resource) => resource.id === id)?.group;
}

/** One absence: person, type, first day, last day, note. */
type AbsenceSeed = [string, string, string, string, string];

/**
 * The weeks' exceptions to the template, from the prototype's week 40 and
 * its pending requests.
 */
const ABSENCES: AbsenceSeed[] = [
  ["bertrand", "conge", "2026-09-28", "2026-10-03", "Vacances"],
  ["leroy", "formation", "2026-10-01", "2026-10-01", "Formation caisse"],
  ["hubert", "maladie", "2026-10-06", "2026-10-08", "Certificat 3 jours"],
  [
    "smets",
    "recup",
    "2026-10-09",
    "2026-10-09",
    "Récupération des heures de septembre",
  ],
  [
    "willems",
    "petit-chomage",
    "2026-10-17",
    "2026-10-17",
    "Mariage d'un frère",
  ],
  ["grosjean", "conge", "2026-10-12", "2026-10-16", ""],
  ["lhoest", "maladie", "2026-09-29", "2026-09-30", ""],
];

/**
 * Days worked a week by contract: 30 hours and more work five days, 24
 * hours three, less two.
 */
const FIVE_DAYS_FROM = 30;
const THREE_DAYS_FROM = 24;
const FIVE_DAYS = 5;
const THREE_DAYS = 3;
const TWO_DAYS = 2;
const DAYS_PER_WEEK = 7;
const MINUTES_PER_HOUR = 60;
/** A shift past 6 hours takes a one-hour break. */
const PAUSE_AFTER_MINUTES = 360;

function workDaysFor(hours: number): number {
  if (hours >= FIVE_DAYS_FROM) return FIVE_DAYS;
  return hours >= THREE_DAYS_FROM ? THREE_DAYS : TWO_DAYS;
}

function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

function absentOn(id: string, day: string): boolean {
  return ABSENCES.some(
    ([person, , from, to]) => person === id && day >= from && day <= to,
  );
}

/** The days a person works in a week: their store's open days, rotated per person and week. */
function workDays(
  index: number,
  monday: string,
  store: string,
  hours: number,
): string[] {
  const opening = STORE_HOURS[store]?.[1] ?? [];
  const open = Array.from({ length: DAYS_PER_WEEK }, (_, offset) =>
    addDays(monday, offset),
  ).filter((day) => opening[weekdayOf(day)]);
  const week = Math.floor(
    daysBetween(ROSTER_FIRST_DAY, monday) / DAYS_PER_WEEK,
  );
  const skip = (index + week) % open.length;
  const rotated = [...open.slice(skip), ...open.slice(0, skip)];
  return rotated.slice(0, workDaysFor(hours)).sort();
}

/** "09:30–18:30": a shift's title, as the prototype's cells read. */
export function shiftHours(start: string, end: string): string {
  return `${start}–${end}`;
}

function shift(
  id: string,
  store: string,
  day: string,
): AgendaEvent | undefined {
  const hours = STORE_HOURS[store]?.[1][weekdayOf(day)];
  if (!hours) return undefined;
  const [start, end] = hours;
  const long = minutesOf(end) - minutesOf(start) > PAUSE_AFTER_MINUTES;
  return {
    id: `roster-${id}-${day}`,
    title: shiftHours(start, end),
    calendarId: "travail",
    resourceIds: [id],
    start: zonedInstant(day, start),
    end: zonedInstant(day, end),
    subtitle: long ? "pause 60 min" : undefined,
  };
}

function absence([id, type, from, to, note]: AbsenceSeed): AgendaEvent {
  const label = PRESTATION_CALENDARS.find((calendar) => calendar.id === type);
  return {
    id: `roster-${id}-${type}-${from}`,
    title: plainText(label?.label, type),
    calendarId: type,
    resourceIds: [id],
    allDay: true,
    start: from,
    end: to,
    subtitle: note || undefined,
  };
}

const WEEKS = 3;

/** The three published weeks: the template's shifts, and the absences in their place. */
export function seedRoster(): AgendaState {
  const shifts = STAFF.flatMap(([lastName, , , store, hours], index) => {
    const id = personId(lastName);
    return Array.from({ length: WEEKS }, (_, week) =>
      workDays(
        index,
        addDays(ROSTER_FIRST_DAY, week * DAYS_PER_WEEK),
        store,
        hours,
      ),
    )
      .flat()
      .filter((day) => !absentOn(id, day))
      .flatMap((day) => shift(id, store, day) ?? []);
  });
  return { events: [...shifts, ...ABSENCES.map(absence)], pending: [] };
}
