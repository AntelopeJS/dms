import type { MatrixSelectOption } from "@antelopejs/interface-dms/base/matrix-types";

/** What a person does on a day. */
export type Shift = "morning" | "afternoon" | "day" | "off" | "leave" | "sick";

export const SHIFT_OPTIONS: MatrixSelectOption[] = [
  { value: "morning", label: "Matin", tone: "info", icon: "i-ph-sun-horizon" },
  {
    value: "afternoon",
    label: "Après-midi",
    tone: "primary",
    icon: "i-ph-sun",
  },
  { value: "day", label: "Journée", tone: "success", icon: "i-ph-briefcase" },
  { value: "off", label: "Repos", tone: "neutral", icon: "i-ph-coffee" },
  {
    value: "leave",
    label: "Congé",
    tone: "warning",
    icon: "i-ph-airplane-tilt",
  },
  { value: "sick", label: "Malade", tone: "error", icon: "i-ph-first-aid" },
];

// A full-time week is 38 hours in Belgian retail: 7.6 hours a day, five days.
const FULL_DAY_HOURS = 7.6;
const HALF_DAY_HOURS = 3.8;

/** The hours a shift counts; the others count none. */
export const SHIFT_HOURS: Partial<Record<Shift, number>> = {
  morning: HALF_DAY_HOURS,
  afternoon: HALF_DAY_HOURS,
  day: FULL_DAY_HOURS,
};

/** The most days a person works in a week. */
export const MAX_WORKING_DAYS = 5;

export interface Day {
  id: string;
  label: string;
  date: string;
  /** The stores are closed: nobody is planned. */
  isClosed?: boolean;
}

export const WEEK: Day[] = [
  { id: "mon", label: "Lun 26/10", date: "2026-10-26" },
  { id: "tue", label: "Mar 27/10", date: "2026-10-27" },
  { id: "wed", label: "Mer 28/10", date: "2026-10-28" },
  { id: "thu", label: "Jeu 29/10", date: "2026-10-29" },
  { id: "fri", label: "Ven 30/10", date: "2026-10-30" },
  { id: "sat", label: "Sam 31/10", date: "2026-10-31" },
  { id: "sun", label: "Dim 01/11", date: "2026-11-01", isClosed: true },
];

export interface Person {
  id: string;
  name: string;
  role: string;
  store: string;
  contractHours: number;
  week: Partial<Record<string, Shift>>;
}

export interface StoreTeam {
  id: string;
  label: string;
  description: string;
}

export const TEAMS: StoreTeam[] = [
  {
    id: "LG4",
    label: "Liège Médiacité",
    description: "Ouvert du lundi au samedi, 10 h – 19 h",
  },
  {
    id: "NE1",
    label: "Namur Esplanade",
    description: "Ouvert du lundi au samedi, 9 h 30 – 18 h 30",
  },
];

type WeekPlan = [Shift, Shift, Shift, Shift, Shift, Shift];

function plan(days: WeekPlan): Partial<Record<string, Shift>> {
  return Object.fromEntries(
    days.map((shift, index) => [WEEK[index]!.id, shift]),
  );
}

function seedPeople(): Person[] {
  return [
    {
      id: "charlotte-hubert",
      name: "Charlotte Hubert",
      role: "Responsable magasin",
      store: "LG4",
      contractHours: 38,
      week: plan(["day", "day", "off", "day", "day", "day"]),
    },
    {
      id: "julie-lambert",
      name: "Julie Lambert",
      role: "Vendeuse",
      store: "LG4",
      contractHours: 38,
      week: plan(["off", "day", "day", "day", "day", "day"]),
    },
    {
      id: "mehdi-bensaid",
      name: "Mehdi Bensaïd",
      role: "Vendeur",
      store: "LG4",
      contractHours: 30,
      week: plan(["morning", "afternoon", "day", "off", "leave", "day"]),
    },
    {
      id: "sophie-dubois",
      name: "Sophie Dubois",
      role: "Vendeuse",
      store: "LG4",
      contractHours: 24,
      week: plan(["afternoon", "off", "morning", "afternoon", "off", "day"]),
    },
    {
      id: "lucas-martin",
      name: "Lucas Martin",
      role: "Étudiant",
      store: "LG4",
      contractHours: 12,
      week: plan(["off", "off", "afternoon", "off", "off", "day"]),
    },
    {
      id: "camille-renard",
      name: "Camille Renard",
      role: "Responsable magasin",
      store: "NE1",
      contractHours: 38,
      week: plan(["day", "day", "day", "off", "day", "day"]),
    },
    {
      id: "thomas-lejeune",
      name: "Thomas Lejeune",
      role: "Vendeur",
      store: "NE1",
      contractHours: 38,
      week: plan(["day", "off", "day", "day", "day", "day"]),
    },
    {
      id: "ines-moreau",
      name: "Inès Moreau",
      role: "Vendeuse",
      store: "NE1",
      contractHours: 30,
      week: plan(["sick", "sick", "morning", "day", "afternoon", "off"]),
    },
    {
      id: "nathalie-collard",
      name: "Nathalie Collard",
      role: "Vendeuse",
      store: "NE1",
      contractHours: 20,
      week: plan(["off", "morning", "off", "morning", "afternoon", "day"]),
    },
  ];
}

/** The team's week, kept in memory: a restart puts it back. */
export const PEOPLE: Person[] = seedPeople();

/** Puts the week back as it started. */
export function resetRoster(): void {
  PEOPLE.splice(0, PEOPLE.length, ...seedPeople());
}
