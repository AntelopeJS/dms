import type {
  AgendaBusinessHours,
  AgendaCalendar,
  AgendaEvent,
  AgendaFieldOption,
  AgendaResource,
  AgendaResourceGroup,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import type { AgendaState } from "../store";
import { addDays, mondayOf, todayKey, zonedInstant } from "../time";

/** A store: its opening hours and the staff it needs on the floor. */
export interface Store {
  id: string;
  label: string;
  hours: AgendaBusinessHours[];
  /** People needed per day of the week, 0 Sunday … 6 Saturday. */
  need: number[];
}

const WEEKDAY_HOURS = { start: "09:30", end: "18:30" };
const SATURDAY_HOURS = { start: "10:00", end: "18:00" };
const SATURDAY = 6;

/**
 * The prototype's stores (RH-Planning), each closed on Sunday; the two
 * Ardennes stores are closed on Monday too.
 */
export const STORES: Store[] = [
  {
    id: "NE1",
    label: "NE1 · Neupré",
    hours: [
      { days: [2, 3, 4, 5], ...WEEKDAY_HOURS },
      { days: [SATURDAY], ...SATURDAY_HOURS },
    ],
    need: [0, 0, 3, 3, 3, 3, 4],
  },
  {
    id: "SPA",
    label: "SPA · Spa",
    hours: [
      { days: [2, 3, 4, 5], ...WEEKDAY_HOURS },
      { days: [SATURDAY], ...SATURDAY_HOURS },
    ],
    need: [0, 0, 2, 2, 2, 2, 3],
  },
  {
    id: "LG4",
    label: "LG4 · Liège",
    hours: [
      { days: [1, 2, 3, 4, 5], ...WEEKDAY_HOURS },
      { days: [SATURDAY], ...SATURDAY_HOURS },
    ],
    need: [0, 2, 2, 2, 2, 2, 3],
  },
];

export const STORE_OPTIONS: AgendaFieldOption[] = STORES.map(
  ({ id, label }) => ({ value: id, label }),
);

/** A store by id. */
export function storeOf(id: string): Store | undefined {
  return STORES.find((store) => store.id === id);
}

/** The roles: label and colour. */
interface Roles {
  [role: string]: [string, AgendaCalendar["color"]];
}

const ROLES: Roles = {
  responsable: ["Responsable", "#1a3d99"],
  vendeuse: ["Vendeuse", "#14606b"],
  volante: ["Volante", "#5b3aa6"],
  interim: ["Intérim", "#9a3412"],
};

/** The roles, the calendars of the legend. */
export const ROLE_CALENDARS: AgendaCalendar[] = Object.entries(ROLES).map(
  ([id, [label, color]]) => ({ id, label, color }),
);

/** A person of the staff. */
export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  home: string;
  hours: number;
  /** The stores the person may work in. */
  stores: string[];
}

/** One person: id, first name, last name, role, home store, hours, other stores. */
type PersonSeed = [string, string, string, string, string, number, string[]];

const PEOPLE_SEEDS: PersonSeed[] = [
  ["delforge", "Bénédicte", "Delforge", "responsable", "NE1", 38, []],
  ["hubert", "Charlotte", "Hubert", "vendeuse", "NE1", 38, []],
  ["gillet", "Fanny", "Gillet", "vendeuse", "NE1", 30, []],
  ["leroy", "Noémie", "Leroy", "vendeuse", "NE1", 24, []],
  ["remacle", "Hélène", "Remacle", "responsable", "SPA", 38, []],
  ["smets", "Jessica", "Smets", "vendeuse", "SPA", 30, []],
  ["willems", "Lisa", "Willems", "vendeuse", "SPA", 19, []],
  ["defays", "Virginie", "Defays", "responsable", "LG4", 38, []],
  ["bertrand", "Manon", "Bertrand", "vendeuse", "LG4", 32, []],
  ["lecomte", "Pauline", "Lecomte", "vendeuse", "LG4", 24, []],
  ["henrotte", "Sandrine", "Henrotte", "volante", "NE1", 38, ["SPA"]],
  ["piette", "Emma", "Piette", "interim", "NE1", 16, ["SPA", "LG4"]],
];

export const PEOPLE: Person[] = PEOPLE_SEEDS.map(
  ([id, firstName, lastName, role, home, hours, others]) => ({
    id,
    firstName,
    lastName,
    role,
    home,
    hours,
    stores: [home, ...others],
  }),
);

/** A person by id. */
export function personOf(id: string | undefined): Person | undefined {
  return PEOPLE.find((person) => person.id === id);
}

/** "Charlotte Hubert". */
export function fullName(person: Person): string {
  return `${person.firstName} ${person.lastName}`;
}

/** The people who may work in a store: its staff, the floaters and temps sent there. */
export function staffOf(storeId: string): string[] {
  return PEOPLE.filter((person) => person.stores.includes(storeId)).map(
    (person) => person.id,
  );
}

const INITIALS_LENGTH = 1;

/** The people, the columns of the resources views, grouped by home store. */
export const SCHEDULE_RESOURCES: AgendaResource[] = PEOPLE.map((person) => ({
  id: person.id,
  label: fullName(person),
  description: `${ROLES[person.role]?.[0] ?? ""} · ${person.hours} h`,
  group: person.home,
  avatar: {
    initials: `${person.firstName.slice(0, INITIALS_LENGTH)}${person.lastName.slice(0, INITIALS_LENGTH)}`,
  },
  businessHours: storeOf(person.home)?.hours,
}));

export const SCHEDULE_GROUPS: AgendaResourceGroup[] = STORES.map(
  ({ id, label }) => ({ id, label }),
);

/**
 * One shift of the seed: person, day (0 Monday … 6 Sunday), start, end,
 * pause in minutes, store (the person's home store when empty), note.
 */
type ShiftSeed = [string, number, string, string, number, string, string];

const FULL: [string, string, number] = ["09:30", "18:30", 60];
const SAT: [string, string, number] = ["10:00", "18:00", 60];
const MORNING: [string, string, number] = ["09:30", "14:00", 0];
const AFTERNOON: [string, string, number] = ["14:00", "18:30", 0];

function shifts(
  person: string,
  days: [number, [string, string, number], string?][],
): ShiftSeed[] {
  return days.map(([day, [start, end, pause], store]) => [
    person,
    day,
    start,
    end,
    pause,
    store ?? "",
    "",
  ]);
}

/**
 * The week drafted from the stores' template, with the four things the
 * checks are meant to catch: Noémie Leroy's Tuesday without a break, Virginie
 * Defays' inventory Thursday past 9 hours, Manon Bertrand back at 7:30 the
 * morning after a late inventory, and two people for NE1's Saturday.
 */
const SHIFT_SEEDS: ShiftSeed[] = [
  ...shifts("delforge", [
    [1, FULL],
    [2, FULL],
    [3, FULL],
    [4, ["09:30", "17:30", 60]],
    [5, SAT],
  ]),
  ...shifts("hubert", [
    [1, FULL],
    [2, FULL],
    [4, FULL],
    [5, SAT],
  ]),
  ...shifts("gillet", [
    [1, AFTERNOON],
    [2, FULL],
    [3, FULL],
    [4, FULL],
  ]),
  ...shifts("leroy", [
    [1, ["09:30", "16:30", 0]],
    [3, FULL],
  ]),
  ...shifts("remacle", [
    [1, FULL],
    [2, FULL],
    [3, FULL],
    [4, FULL],
    [5, SAT],
  ]),
  ...shifts("smets", [
    [1, AFTERNOON],
    [2, FULL],
    [3, FULL],
    [5, SAT],
  ]),
  ...shifts("willems", [
    [4, MORNING],
    [5, SAT],
  ]),
  ...shifts("defays", [
    [0, FULL],
    [1, FULL],
    [3, ["09:00", "19:00", 30]],
    [4, FULL],
    [5, SAT],
  ]),
  ...shifts("bertrand", [
    [0, FULL],
    [1, ["15:00", "22:00", 30]],
    [2, ["07:30", "12:00", 0]],
    [4, FULL],
    [5, SAT],
  ]),
  ...shifts("lecomte", [
    [0, AFTERNOON],
    [2, FULL],
    [3, FULL],
    [5, SAT],
  ]),
  ...shifts("henrotte", [
    [1, FULL, "SPA"],
    [2, FULL],
    [3, FULL],
    [4, FULL, "SPA"],
  ]),
  ...shifts("piette", [[4, AFTERNOON]]),
];

/** A shift's note, by `<person>-<day offset>`. */
interface ShiftNotes {
  [shift: string]: string;
}

const NOTES: ShiftNotes = {
  "bertrand-1": "Inventaire",
  "bertrand-2": "Réception livraison",
  "defays-3": "Inventaire",
};

function shiftFromSeed(monday: string, seed: ShiftSeed): AgendaEvent {
  const [personId, offset, start, end, pause, store] = seed;
  const person = personOf(personId);
  const day = addDays(monday, offset);
  const key = `${personId}-${offset}`;
  const homeStore = store || person?.home;
  return {
    id: `shift-${key}`,
    title: person ? fullName(person) : personId,
    calendarId: person?.role,
    resourceIds: [personId],
    start: zonedInstant(day, start),
    end: zonedInstant(day, end),
    data: {
      ...(homeStore && { store: homeStore }),
      pause,
      note: NOTES[key] ?? "",
    },
  };
}

/** The current week's shifts. */
export function seedSchedule(): AgendaState {
  const monday = mondayOf(todayKey());
  return {
    events: SHIFT_SEEDS.map((seed) => shiftFromSeed(monday, seed)),
    pending: [],
  };
}
