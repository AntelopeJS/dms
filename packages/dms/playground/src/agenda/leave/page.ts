import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { FullAgenda } from "@antelopejs/interface-dms/base/full-agenda";
import type { AgendaEventAction } from "@antelopejs/interface-dms/base/full-agenda-types";
import { demoGuide } from "../../table-view/guide";
import { AGENDA_API, agendaCategory } from "../category";
import { DEMO_TIME_ZONE } from "../time";
import { LEAVE_CALENDARS, LEAVE_ENTITLEMENT_DAYS, LEAVE_PERSON } from "./data";

export const AGENDA_LEAVE_SLUG = "agenda-leave";
export const AGENDA_LEAVE_API = `${AGENDA_API}/leave`;

function decision(
  id: string,
  label: string,
  icon: string,
  tone: AgendaEventAction["tone"],
): AgendaEventAction {
  return {
    id,
    label,
    icon,
    tone,
    visibleWhen: { field: "request", in: [true] },
    target: {
      type: "api",
      url: `${AGENDA_LEAVE_API}/decide?id={{row.id}}&decision=${id}`,
      method: "POST",
      successMessage: `${label} : {title}`,
    },
  };
}

@RegisterPage()
export class PageAgendaLeave extends PageController(
  AGENDA_LEAVE_SLUG,
  {
    displayName: "Leave (year planner)",
    icon: "i-ph-airplane-tilt",
    category: agendaCategory,
    order: 60,
    description:
      "A person's year of absences as a planner, a row per month and a cell per day, with Belgium's public holidays shaded: a new absence is picked with two clicks and written as a request, which the manager accepts or refuses.",
  },
  DefaultLayout({
    fullWidth: true,
    headerActions: [
      {
        label: "Reset the year",
        icon: "i-ph-arrow-counter-clockwise",
        target: {
          type: "api",
          url: `${AGENDA_LEAVE_API}/reset`,
          method: "POST",
          successMessage: "The year is back as it started",
        },
      },
    ],
  }),
) {
  static guide = demoGuide([
    {
      label: "Click a first day, then a last day",
      text: 'rangeSelect: "twoClicks" in the year planner: the form of a new absence opens on those days (type, note). The route writes it as a request (status "tentative", dashed, badge À valider) and refuses it on public holidays or a weekend only, over another absence, or past the leave balance.',
    },
    {
      label: "Accept or refuse a request",
      text: "The two requests (autumn leave next week, a recovery day) carry eventActions Accepter / Refuser, offered on requests only (visibleWhen data.request). The balance in the sidebar follows.",
    },
    {
      label: "Read a cell",
      text: `short: each day of an absence shows the hours it counts (7,6: a 38-hour week over five days). The legal balance is ${LEAVE_ENTITLEMENT_DAYS} days.`,
    },
    {
      label: "Find the public holidays",
      text: 'The route answers Belgium\'s ten public holidays of the years shown as backgrounds (kind: "holiday", tinted, labelled); weekends are shaded by the business hours.',
    },
    {
      label: "Switch to the month, or to 12 months",
      text: 'views: the planner (yearLayout "planner"), the month with its multi-day bars, twelve small months (yearLayout "months").',
    },
  ]);

  static agenda = FullAgenda({
    title: "Congés et absences",
    description: `${LEAVE_PERSON} — vendeuse, NE1 · Neupré, 38 h sur 5 jours`,
    fetchUrl: `${AGENDA_LEAVE_API}/events`,
    saveUrl: `${AGENDA_LEAVE_API}/save`,
    calendars: LEAVE_CALENDARS,
    views: [
      { id: "year", type: "year", yearLayout: "planner", label: "Année" },
      "month",
      { id: "months", type: "year", yearLayout: "months", label: "12 mois" },
    ],
    weekStartsOn: 1,
    /** Days of the Belgian calendar, whatever the reader's zone. */
    timeZone: DEMO_TIME_ZONE,
    businessHours: [{ days: [1, 2, 3, 4, 5], start: "09:30", end: "18:30" }],
    rangeSelect: "twoClicks",
    create: {
      button: true,
      buttonLabel: "Encoder une absence",
      calendarId: "conge",
    },
    dragMove: false,
    dragResize: false,
    details: { container: "modal" },
    fields: [
      { id: "calendarId", label: "Type", required: true },
      { id: "start", label: "Du" },
      { id: "end", label: "Au" },
      {
        id: "note",
        label: "Note",
        kind: "longText",
        placeholder: "Motif, remarque…",
      },
      { id: "title", visible: false },
      { id: "allDay", visible: false },
      { id: "location", visible: false },
      { id: "description", visible: false },
    ],
    eventActions: [
      decision("accept", "Accepter", "i-ph-check", "success"),
      decision("refuse", "Refuser", "i-ph-x", "error"),
    ],
    sidebar: {
      position: "left",
      sections: ["notices", "calendars", "upcoming"],
    },
    legend: { title: "Types d'absence" },
    eventContent: { time: false },
    height: "44rem",
  });
}
