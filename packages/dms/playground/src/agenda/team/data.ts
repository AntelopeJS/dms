import type {
  AgendaAvatar,
  AgendaCalendar,
  AgendaEvent,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import type { AgendaState } from "../store";
import {
  addDays,
  DEMO_TIME_ZONE,
  mondayOf,
  todayKey,
  zonedInstant,
} from "../time";

/** The team's calendars, with the prototype's colours. */
export const TEAM_CALENDARS: AgendaCalendar[] = [
  { id: "design", label: "Design", color: "oklch(0.62 0.15 258)" },
  { id: "produit", label: "Produit", color: "oklch(0.68 0.13 205)" },
  { id: "eng", label: "Ingénierie", color: "oklch(0.65 0.13 165)" },
  { id: "marketing", label: "Marketing", color: "oklch(0.64 0.16 330)" },
  { id: "direction", label: "Direction", color: "oklch(0.70 0.14 55)" },
];

// Who leads each calendar's meetings, drawn as the event's avatar.
const OWNERS: Record<string, AgendaAvatar> = {
  design: { initials: "CR", color: "oklch(0.62 0.15 258)" },
  eng: { initials: "YB", color: "oklch(0.65 0.13 165)" },
  marketing: { initials: "LM", color: "oklch(0.64 0.16 330)" },
  direction: { initials: "TD", color: "oklch(0.70 0.14 55)" },
};

/**
 * One meeting of the seed: its calendar, title, day (from the Monday of the
 * current week), start, end and place.
 */
type SeedMeeting = [string, string, number, string, string, string];

// The prototype's seed (week of Monday 29 June 2026), moved to the current
// week: day 0 is this Monday, -4 last Thursday, 7 next Monday. Its five
// "Design standup" are the weekday series below.
const MEETINGS: SeedMeeting[] = [
  ["design", "Prep atelier", -4, "14:00", "15:00", "Studio"],
  ["eng", "Infra sync", -3, "10:00", "10:45", "Visio"],
  ["produit", "Sprint planning", 0, "10:00", "11:30", "Salle Nord"],
  ["direction", "Déjeuner équipe", 0, "12:30", "13:30", "Cantine"],
  ["direction", "Comité hebdo", 0, "16:00", "17:00", "Board room"],
  ["eng", "Backend sync", 1, "10:00", "10:45", "Visio"],
  ["marketing", "Campaign kickoff", 1, "11:00", "12:00", "Salle Sud"],
  ["produit", "User interviews", 1, "15:00", "16:00", "Lab"],
  ["eng", "Bug triage", 2, "11:00", "11:30", "Visio"],
  ["design", "Design critique", 2, "14:00", "15:00", "Studio"],
  ["direction", "1:1 Manager", 2, "16:30", "17:00", "Bureau"],
  ["produit", "Roadmap review", 3, "10:30", "11:30", "Salle Nord"],
  ["marketing", "Content review", 3, "13:00", "13:45", "Visio"],
  ["eng", "Deploy window", 3, "17:00", "18:00", "Ops"],
  ["produit", "Rétro sprint", 4, "10:00", "11:00", "Salle Sud"],
  ["design", "Design system sync", 4, "14:00", "15:00", "Studio"],
  ["direction", "All-hands", 4, "15:30", "16:15", "Amphi"],
  ["direction", "Kickoff Q3", 7, "10:00", "11:30", "Amphi"],
  ["design", "Workshop mobile", 8, "14:00", "16:00", "Studio"],
  ["marketing", "Webinar produit", 9, "11:00", "12:00", "Visio"],
  ["produit", "Sprint planning", 10, "09:30", "11:00", "Salle Nord"],
  ["eng", "Demo day", 11, "16:00", "17:00", "Amphi"],
];

const WEEKDAYS = [1, 2, 3, 4, 5];
const STANDUP_ID = "team-standup";

function seedMeeting(
  monday: string,
  [calendarId, title, offset, start, end, location]: SeedMeeting,
  index: number,
): AgendaEvent {
  const day = addDays(monday, offset);
  return {
    id: `team-${index + 1}`,
    title,
    calendarId,
    start: zonedInstant(day, start),
    end: zonedInstant(day, end),
    location,
    avatar: OWNERS[calendarId],
  };
}

function standup(monday: string): AgendaEvent {
  // Started two weeks ago, so last week's days show it too.
  const first = addDays(monday, -14);
  return {
    id: STANDUP_ID,
    title: "Design standup",
    calendarId: "design",
    start: zonedInstant(first, "09:00"),
    end: zonedInstant(first, "09:15"),
    location: "Visio",
    description:
      "<p>Quinze minutes, debout : <strong>hier</strong>, <strong>aujourd'hui</strong>, ce qui bloque.</p>",
    // The standup is at 09:00 in Brussels, whatever the reader's zone.
    recurrence: {
      frequency: "weekly",
      weekdays: WEEKDAYS,
      timeZone: DEMO_TIME_ZONE,
    },
    avatar: OWNERS.design,
  };
}

// A few days off and an offsite, for the all-day row and the month bars.
function allDayEvents(monday: string): AgendaEvent[] {
  return [
    {
      id: "team-offsite",
      title: "Offsite produit — Spa",
      calendarId: "produit",
      allDay: true,
      start: addDays(monday, 9),
      end: addDays(monday, 10),
      location: "Domaine de Bronromme",
    },
    {
      id: "team-leave-camille",
      title: "Camille R. en congé",
      calendarId: "design",
      allDay: true,
      start: addDays(monday, 3),
      end: addDays(monday, 4),
    },
    {
      id: "team-release",
      title: "Release 4.2",
      calendarId: "eng",
      allDay: true,
      start: addDays(monday, 4),
    },
  ];
}

/** The team's agenda, its dates computed from the current week. */
export function seedTeam(): AgendaState {
  const monday = mondayOf(todayKey());
  return {
    events: [
      standup(monday),
      ...MEETINGS.map((seed, index) => seedMeeting(monday, seed, index)),
      ...allDayEvents(monday),
    ],
    pending: [],
  };
}
