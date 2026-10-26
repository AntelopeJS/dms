import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { FullAgenda } from "@antelopejs/interface-dms/base/full-agenda";
import { demoGuide } from "../../table-view/guide";
import { AGENDA_API, agendaCategory } from "../category";
import { DEMO_TIME_ZONE } from "../time";
import {
  PEOPLE,
  ROLE_CALENDARS,
  SCHEDULE_RESOURCES,
  STORE_OPTIONS,
  fullName,
} from "./data";

export const AGENDA_SCHEDULE_SLUG = "agenda-schedule";
export const AGENDA_SCHEDULE_API = `${AGENDA_API}/schedule`;

const ONE_WEEK = 7;
/** Wide enough for a first name and most of a last name under a column. */
const COLUMN_MIN_WIDTH = 96;
const SNAP_MINUTES = 30;
const SHIFT_MINUTES = 540;
const HOUR_HEIGHT = 40;

@RegisterPage()
export class PageAgendaSchedule extends PageController(
  AGENDA_SCHEDULE_SLUG,
  {
    displayName: "Store schedule (staged, checks)",
    icon: "i-ph-storefront",
    category: agendaCategory,
    order: 40,
    description:
      "Three stores' week of shifts, a column per person: drafted with every change kept until Save, reviewed before → after, checked against the labour rules by the route (breaks, 9 hours, 11 hours of rest, under-staffing), then published to the staff.",
  },
  DefaultLayout({
    fullWidth: true,
    headerActions: [
      {
        label: "Reset the week",
        icon: "i-ph-arrow-counter-clockwise",
        target: {
          type: "api",
          url: `${AGENDA_SCHEDULE_API}/reset`,
          method: "POST",
          successMessage: "The week is back as it started",
        },
      },
    ],
  }),
) {
  static guide = demoGuide([
    {
      label: "Move a few shifts, then save",
      text: 'saveMode: "staged": each move is drawn at its new place with the old one ghosted, the save bar counts the changes (Discard / Save, Ctrl+S); review: true lists them before → after first. Nothing reaches the route before Save.',
    },
    {
      label: "Read the checks",
      text: "A shift's own problems are its issues (red edge, listed in the sidebar's checks): Noémie Leroy's Tuesday without a break, Virginie Defays past 9 hours, Manon Bertrand back after less than 11 hours of rest. The agenda's own problems are the route's notices: NE1 two people short on Saturday. The route computes both again on each save: give NE1 a third person on Saturday, save, the line goes.",
    },
    {
      label: "Try Monday at NE1",
      text: "businessHours per person (their home store's): NE1 and SPA are closed on Monday, every store on Sunday (hatched); constraints.withinBusinessHours refuses a drop there while dragging, and the route refuses a closed store too.",
    },
    {
      label: "Drop a shift on someone else",
      text: "allowedResourceIds: a shift goes only to the people who may work in its store (its staff, plus Sandrine Henrotte and Emma Piette who float); constraints.allowOverlap: false refuses a person's two shifts at once.",
    },
    {
      label: "Publish the week",
      text: "toolbarActions: Publier le planning calls an api route with the range shown, which answers the number of people it was sent to.",
    },
    {
      label: "Switch views",
      text: 'resources over a week with resourceLayout "resourcesFirst" (each person over their seven days, the name readable above them) or "daysFirst" (each day, then each person), one day per person, or the plain week grid; columnMinWidth: 96 keeps the names readable, the view scrolling sideways past it; timeZone: "Europe/Brussels" draws the stores\' hours whatever the reader\'s zone.',
    },
  ]);

  static agenda = FullAgenda({
    title: "Horaires des magasins",
    description:
      "Brouillon modifié · non publié tant que le planning n'est pas envoyé",
    fetchUrl: `${AGENDA_SCHEDULE_API}/events`,
    saveUrl: `${AGENDA_SCHEDULE_API}/save`,
    calendars: ROLE_CALENDARS,
    resources: SCHEDULE_RESOURCES,
    views: [
      {
        id: "staff-week",
        type: "resources",
        duration: ONE_WEEK,
        resourceLayout: "resourcesFirst",
        label: "Semaine par personne",
      },
      {
        id: "days-week",
        type: "resources",
        duration: ONE_WEEK,
        resourceLayout: "daysFirst",
        label: "Semaine par jour",
      },
      { id: "staff-day", type: "resources", duration: 1, label: "Jour" },
      "week",
    ],
    weekStartsOn: 1,
    timeZone: DEMO_TIME_ZONE,
    dayStart: "07:00",
    dayEnd: "23:00",
    scrollTime: "09:00",
    hourHeight: HOUR_HEIGHT,
    snapMinutes: SNAP_MINUTES,
    defaultDurationMinutes: SHIFT_MINUTES,
    columnMinWidth: COLUMN_MIN_WIDTH,
    businessHours: [
      { days: [1, 2, 3, 4, 5], start: "09:30", end: "18:30" },
      { days: [6], start: "10:00", end: "18:00" },
    ],
    constraints: { withinBusinessHours: true, allowOverlap: false },
    saveMode: "staged",
    review: true,
    create: { trigger: "drag", buttonLabel: "Nouvel horaire" },
    details: { container: "drawer", size: "sm" },
    fields: [
      {
        id: "resourceIds",
        label: "Collaborateur",
        kind: "select",
        options: PEOPLE.map((person) => ({
          value: person.id,
          label: fullName(person),
        })),
        required: true,
      },
      {
        id: "store",
        label: "Magasin",
        kind: "select",
        options: STORE_OPTIONS,
        required: true,
      },
      { id: "start", label: "Début" },
      { id: "end", label: "Fin" },
      { id: "pause", label: "Pause (min)", kind: "number" },
      { id: "note", label: "Note" },
      { id: "title", visible: false },
      { id: "calendarId", visible: false },
      { id: "allDay", visible: false },
      { id: "location", visible: false },
      { id: "description", visible: false },
    ],
    toolbarActions: [
      {
        id: "publish",
        label: "Publier le planning",
        icon: "i-ph-paper-plane-tilt",
        tone: "primary",
        target: {
          type: "api",
          url: `${AGENDA_SCHEDULE_API}/publish?from={{row.from}}&to={{row.to}}`,
          method: "POST",
          successMessage: "Planning publié",
        },
      },
    ],
    sidebar: {
      position: "left",
      sections: ["notices", "miniCalendar", "calendars"],
    },
    legend: { title: "Fonctions", counts: false },
    eventContent: { subtitle: true, resource: false },
    height: "48rem",
  });
}
