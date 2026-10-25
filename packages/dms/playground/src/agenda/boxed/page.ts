import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { FullAgenda } from "@antelopejs/interface-dms/base/full-agenda";
import { demoGuide } from "../../table-view/guide";
import { AGENDA_API, agendaCategory } from "../category";
import { DEMO_TIME_ZONE } from "../time";
import { BOXED_CALENDARS, BOXED_LOCATIONS } from "./data";

export const AGENDA_BOXED_SLUG = "agenda-boxed";
export const AGENDA_BOXED_API = `${AGENDA_API}/boxed`;

/** The facet ids of the page, mapped by the route to the event fields they filter. */
export const BOXED_FACET_FIELDS: Record<string, string> = {
  location: "location",
  calendar: "calendarId",
};

const THREE_DAYS = 3;
const SIDEBAR_WIDTH = 240;

@RegisterPage()
export class PageAgendaBoxed extends PageController(
  AGENDA_BOXED_SLUG,
  {
    displayName: "Sales agenda (boxed page)",
    icon: "i-ph-briefcase",
    category: agendaCategory,
    order: 20,
    description:
      "The same kind of agenda in a boxed page: the sidebar on the right, the details in a panel beside the views, filters by place and calendar, tooltips, actions on each meeting and in the toolbar, overlapping meetings stacked.",
  },
  DefaultLayout({
    fullWidth: false,
    headerActions: [
      {
        label: "Reset the agenda",
        icon: "i-ph-arrow-counter-clockwise",
        target: {
          type: "api",
          url: `${AGENDA_BOXED_API}/reset`,
          method: "POST",
          successMessage: "The agenda is back as it started",
        },
      },
    ],
  }),
) {
  static guide = demoGuide([
    {
      label: "Click a meeting",
      text: 'details: { container: "panel", editDirectly: true }: the form opens at once in a column beside the views (a drawer once the agenda is narrow). Save writes it through saveUrl.',
    },
    {
      label: "Run a meeting's action",
      text: 'eventActions: "Marquer comme fait" (an api target, offered while data.done is false: visibleWhen) dims the meeting and adds a badge; "Dupliquer la semaine suivante" copies it seven days later. Both are in the details and the right-click menu.',
    },
    {
      label: "Filter by place or calendar",
      text: "facets: the toolbar's selects send facet_location=Namur,Visio and facet_calendar=demo to the route, which filters on the server.",
    },
    {
      label: "Look at Tuesday and Thursday",
      text: 'overlap: "stack": overlapping meetings are stacked with an offset instead of side by side; hover one for its tooltip (time, place, client).',
    },
    {
      label: "Send the week's summary",
      text: "toolbarActions: an api target receiving the range shown ({{row.from}}, {{row.to}}); the route answers how many meetings it summed up.",
    },
    {
      label: "Read the week numbers",
      text: "weekNumbers: in the month view, the week view's header and the mini calendar. views: week, month, 3 days, list.",
    },
  ]);

  static agenda = FullAgenda({
    title: "Agenda commercial",
    description: "Équipe vente — agence de Liège",
    fetchUrl: `${AGENDA_BOXED_API}/events`,
    saveUrl: `${AGENDA_BOXED_API}/save`,
    calendars: BOXED_CALENDARS,
    views: [
      "week",
      "month",
      { id: "three", type: "days", duration: THREE_DAYS, label: "3 jours" },
      "list",
    ],
    weekStartsOn: 1,
    // The agency's hours and Sundays are Brussels ones.
    timeZone: DEMO_TIME_ZONE,
    hiddenDays: [0],
    dayStart: "08:00",
    dayEnd: "19:00",
    weekNumbers: true,
    overlap: "stack",
    tooltips: true,
    height: "40rem",
    details: { container: "panel", editDirectly: true },
    fields: [
      { id: "title", label: "Objet", required: true },
      { id: "client", label: "Client", kind: "text" },
      { id: "calendarId", label: "Type" },
      { id: "start", label: "Début" },
      { id: "end", label: "Fin" },
      {
        id: "location",
        label: "Lieu",
        kind: "select",
        options: BOXED_LOCATIONS,
      },
      { id: "description", label: "Notes", kind: "longText" },
    ],
    eventActions: [
      {
        id: "done",
        label: "Marquer comme fait",
        icon: "i-ph-check-circle",
        tone: "success",
        visibleWhen: { field: "done", in: [false] },
        target: {
          type: "api",
          url: `${AGENDA_BOXED_API}/done?id={{row.id}}`,
          method: "POST",
          successMessage: "« {title} » marqué comme fait",
        },
      },
      {
        id: "duplicate",
        label: "Dupliquer la semaine suivante",
        icon: "i-ph-copy",
        target: {
          type: "api",
          url: `${AGENDA_BOXED_API}/duplicate?id={{row.id}}`,
          method: "POST",
          successMessage: "« {title} » copié sept jours plus tard",
        },
      },
    ],
    toolbarActions: [
      {
        id: "recap",
        label: "Envoyer le récap",
        icon: "i-ph-paper-plane-tilt",
        target: {
          type: "api",
          url: `${AGENDA_BOXED_API}/recap?from={{row.from}}&to={{row.to}}`,
          method: "POST",
          successMessage: "Récapitulatif envoyé à l'équipe",
        },
      },
    ],
    facets: [
      {
        id: "location",
        label: "Lieu",
        field: "location",
        options: BOXED_LOCATIONS,
        multiple: true,
      },
      {
        id: "calendar",
        label: "Type",
        field: "calendarId",
        options: BOXED_CALENDARS.map(({ id, label }) => ({
          value: id,
          label,
        })),
        multiple: true,
      },
    ],
    sidebar: {
      position: "right",
      width: SIDEBAR_WIDTH,
      sections: ["miniCalendar", "calendars", "upcoming"],
    },
    legend: { title: "Types de rendez-vous" },
  });
}
