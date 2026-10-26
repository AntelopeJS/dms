import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { FullAgenda } from "@antelopejs/interface-dms/base/full-agenda";
import type { DemoStep } from "../../table-view/guide";
import { compactGuide } from "../guide";
import { AGENDA_API, agendaCategory } from "../category";
import { DEMO_TIME_ZONE } from "../time";
import { TEAM_CALENDARS } from "./data";

export const AGENDA_TEAM_SLUG = "agenda-team";
export const AGENDA_TEAM_API = `${AGENDA_API}/team`;

/** The hours a meeting may take, as the route checks them. */
export const TEAM_DAY_START = "07:00";
export const TEAM_DAY_END = "21:00";

const HOUR_HEIGHT = 56;

/** What to try on the page, listed in full on the overview page. */
export const TEAM_STEPS: DemoStep[] = [
  {
    label: "Drag a meeting, stretch its end",
    text: 'dragMove and dragResize (on with saveUrl): a drop snaps to 15 minutes (snapMinutes) and is saved at once (saveMode "immediate"), with an Undo for 6 s. The route refuses a meeting outside 07:00–21:00: it goes back with the message.',
  },
  {
    label: "Click an empty slot",
    text: 'create: { trigger: "click" }: a one-hour meeting (defaultDurationMinutes) opens in the form, in the first calendar shown. The route answers it with its own id in place of the tempId.',
  },
  {
    label: "Open a meeting",
    text: 'details: { container: "drawer" }: the read view (time, calendar, place, description), Edit for the form (fields: title, calendar, start, end, place), Delete. The open meeting is in the URL: reload, it opens again.',
  },
  {
    label: "Move one Design standup",
    text: 'A weekly series on weekdays (recurrence), expanded by the agenda. Moving one asks this occurrence or the series (recurringEdit "ask"): the route leaves that day out of the series and writes the occurrence on its own, or shifts the whole series.',
  },
  {
    label: "Hide a calendar",
    text: "The sidebar's legend (Calendriers d'équipe) toggles each calendar and counts its meetings; the mini calendar jumps to a day and marks the days holding meetings; the tip is sidebar.tip.",
  },
  {
    label: "Search, switch views, export",
    text: 'search sends q to the route (try "sync"); the view switcher offers month, week, day and list; M W D L and T (today), ← → work from the keyboard; exportIcs downloads what is shown as an .ics file.',
  },
  {
    label: "Squeeze the window",
    text: "Below 640 px of width (responsive.compactBelow), the sidebar folds into a toolbar button and the week view becomes a day view (compactView).",
  },
];

@RegisterPage()
export class PageAgendaTeam extends PageController(
  AGENDA_TEAM_SLUG,
  {
    displayName: "Team calendar (full page)",
    icon: "i-ph-users-three",
    category: agendaCategory,
    order: 10,
    description:
      "A team's meetings by month, week, day or list, on a page that fills the window: five coloured calendars toggled from the sidebar, dragged and resized, created with a click, opened in a drawer. A weekday standup repeats.",
  },
  DefaultLayout({
    fullWidth: true,
    fillHeight: true,
    headerActions: [
      {
        label: "Reset the agenda",
        icon: "i-ph-arrow-counter-clockwise",
        target: {
          type: "api",
          url: `${AGENDA_TEAM_API}/reset`,
          method: "POST",
          successMessage: "The agenda is back as it started",
        },
      },
    ],
  }),
) {
  static guide = compactGuide(
    "Drag a meeting or stretch its end; click an empty slot to create one; move one Design standup: this occurrence or the whole series.",
  );

  static agenda = FullAgenda({
    title: "Agenda de l'équipe",
    fetchUrl: `${AGENDA_TEAM_API}/events`,
    saveUrl: `${AGENDA_TEAM_API}/save`,
    calendars: TEAM_CALENDARS,
    views: ["month", "week", "day", "list"],
    initialView: "week",
    weekStartsOn: 1,
    /**
     * A Belgian team: its office hours (the route's 07:00–21:00) are
     * Brussels hours, whatever the reader's zone.
     */
    timeZone: DEMO_TIME_ZONE,
    dayStart: TEAM_DAY_START,
    dayEnd: TEAM_DAY_END,
    hourHeight: HOUR_HEIGHT,
    scrollTime: "08:00",
    create: { trigger: "click", buttonLabel: "Nouvel événement" },
    details: { container: "drawer", size: "md" },
    fields: [
      { id: "title", label: "Titre", required: true },
      { id: "calendarId", label: "Calendrier" },
      { id: "allDay", label: "Toute la journée" },
      { id: "start", label: "Début" },
      { id: "end", label: "Fin" },
      { id: "location", label: "Lieu", placeholder: "Salle, visio…" },
      { id: "description", label: "Description", kind: "richText" },
    ],
    recurringEdit: "ask",
    sidebar: {
      position: "left",
      sections: ["miniCalendar", "calendars", "upcoming", "tip"],
      tip: "Glisse un événement pour le déplacer. Clique un créneau vide pour en créer un.",
    },
    legend: { title: "Calendriers d'équipe", toggles: true, counts: true },
    search: true,
    toolbar: { datePicker: true, exportIcs: true, refresh: true },
    eventContent: { avatar: true, location: true },
  });
}
