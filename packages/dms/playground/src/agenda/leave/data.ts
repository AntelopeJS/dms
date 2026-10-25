import type {
  AgendaBackground,
  AgendaBadge,
  AgendaCalendar,
  AgendaEvent,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import type { AgendaState } from "../store";
import { addDays, mondayOf, todayKey, weekdayOf } from "../time";

/** The absence types, with the prototype's colours. */
export const LEAVE_CALENDARS: AgendaCalendar[] = [
  { id: "conge", label: "Congé", color: "#1a3d99" },
  { id: "maladie", label: "Maladie", color: "#1d6a2a" },
  { id: "recup", label: "Récup", color: "#5b3aa6" },
  { id: "formation", label: "Formation", color: "#14606b" },
  { id: "petit-chomage", label: "Petit chômage", color: "#9a3412" },
];

/** The label of an absence type. */
export function leaveLabel(type: string | undefined): string {
  const label = LEAVE_CALENDARS.find((calendar) => calendar.id === type)?.label;
  return typeof label === "string" ? label : "Absence";
}

/** The person whose year this is: a 38-hour week over five days. */
export const LEAVE_PERSON = "Charlotte Hubert";
/** Hours of one working day, as a cell of the year shows them. */
export const DAY_HOURS = "7,6";
/** Legal leave: four weeks of a five-day week. */
export const LEAVE_ENTITLEMENT_DAYS = 20;

export const REQUEST_BADGE: AgendaBadge = {
  label: "À valider",
  tone: "warning",
  icon: "i-ph-hourglass",
};

const EASTER_MONDAY = 1;
const ASCENSION = 39;
const WHIT_MONDAY = 50;

/** Easter Sunday of a year (the anonymous Gregorian computus). */
function easterOf(year: number): string {
  const golden = year % 19;
  const century = Math.floor(year / 100);
  const yearOfCentury = year % 100;
  const leapCorrection = Math.floor(century / 4);
  const moonCorrection = Math.floor((century + 8) / 25);
  const epact =
    (19 * golden +
      century -
      leapCorrection -
      Math.floor((century - moonCorrection + 1) / 3) +
      15) %
    30;
  const weekday =
    (32 +
      2 * (century % 4) +
      2 * Math.floor(yearOfCentury / 4) -
      epact -
      (yearOfCentury % 4)) %
    7;
  const shift = Math.floor((golden + 11 * epact + 22 * weekday) / 451);
  const month = Math.floor((epact + weekday - 7 * shift + 114) / 31);
  const day = ((epact + weekday - 7 * shift + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Belgium's ten public holidays of a year. */
export function belgianHolidays(year: number): AgendaBackground[] {
  const easter = easterOf(year);
  const holidays: [string, string][] = [
    [`${year}-01-01`, "Nouvel An"],
    [addDays(easter, EASTER_MONDAY), "Lundi de Pâques"],
    [`${year}-05-01`, "Fête du Travail"],
    [addDays(easter, ASCENSION), "Ascension"],
    [addDays(easter, WHIT_MONDAY), "Lundi de Pentecôte"],
    [`${year}-07-21`, "Fête nationale"],
    [`${year}-08-15`, "Assomption"],
    [`${year}-11-01`, "Toussaint"],
    [`${year}-11-11`, "Armistice"],
    [`${year}-12-25`, "Noël"],
  ];
  return holidays.map(([day, label]) => ({
    id: `holiday-${day}`,
    start: day,
    allDay: true,
    kind: "holiday",
    label,
  }));
}

const SATURDAY = 6;
const SUNDAY = 0;

/** The working days of a range: weekdays that are not public holidays. */
export function workingDays(from: string, to: string): string[] {
  const holidays = new Set(
    [Number(from.slice(0, 4)), Number(to.slice(0, 4))].flatMap((year) =>
      belgianHolidays(year).map((holiday) => holiday.start),
    ),
  );
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const weekday = weekdayOf(day);
    if (weekday !== SATURDAY && weekday !== SUNDAY && !holidays.has(day)) {
      days.push(day);
    }
  }
  return days;
}

/** An absence: type, first day (MM-DD of the year), last day, note. */
type AbsenceSeed = [string, string, string, string];

// The prototype's year blocks for one person: winter, Easter and summer
// leave (15 working days of 20, the 21st of July being a holiday), a
// sickness, a recovery day, a training.
const TAKEN: AbsenceSeed[] = [
  ["conge", "02-16", "02-17", ""],
  ["conge", "04-07", "04-10", "Vacances de Pâques"],
  ["maladie", "05-12", "05-14", "Certificat médical"],
  ["recup", "06-05", "06-05", "Heures de la braderie"],
  ["conge", "07-13", "07-24", "Vacances d'été"],
  ["formation", "09-17", "09-17", "Formation caisse"],
];

function absence(
  year: number,
  [type, from, to, note]: AbsenceSeed,
  index: number,
): AgendaEvent {
  return {
    id: `leave-${index + 1}`,
    title: leaveLabel(type),
    calendarId: type,
    allDay: true,
    start: `${year}-${from}`,
    end: `${year}-${to}`,
    short: DAY_HOURS,
    subtitle: note || undefined,
    data: { note, request: false },
  };
}

/** A request waiting for the manager: drawn dashed, with a badge. */
export function asRequest(event: AgendaEvent): AgendaEvent {
  return {
    ...event,
    status: "tentative",
    badges: [REQUEST_BADGE],
    data: { ...event.data, request: true },
  };
}

// The pending requests, from the prototype's: autumn leave next week, a
// recovery day in two weeks.
function requests(monday: string): AgendaEvent[] {
  return [
    asRequest({
      id: "leave-request-1",
      title: leaveLabel("conge"),
      calendarId: "conge",
      allDay: true,
      start: addDays(monday, 7),
      end: addDays(monday, 12),
      short: DAY_HOURS,
      subtitle: "Vacances de Toussaint",
      data: { note: "Vacances de Toussaint" },
    }),
    asRequest({
      id: "leave-request-2",
      title: leaveLabel("recup"),
      calendarId: "recup",
      allDay: true,
      start: addDays(monday, 18),
      end: addDays(monday, 18),
      short: DAY_HOURS,
      subtitle: "Récupération des heures de septembre",
      data: { note: "Récupération des heures de septembre" },
    }),
  ];
}

/** The year of today: its absences, and next weeks' requests. */
export function seedLeave(): AgendaState {
  const today = todayKey();
  const year = Number(today.slice(0, 4));
  return {
    events: [
      ...TAKEN.map((seed, index) => absence(year, seed, index)),
      ...requests(mondayOf(today)),
    ],
    pending: [],
  };
}
