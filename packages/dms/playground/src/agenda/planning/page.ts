import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { FullAgenda } from "@antelopejs/interface-dms/base/full-agenda";
import type { AgendaEventAction } from "@antelopejs/interface-dms/base/full-agenda-types";
import type { DemoStep } from "../../table-view/guide";
import { AGENDA_API, agendaCategory } from "../category";
import { compactGuide } from "../guide";
import { DEMO_TIME_ZONE } from "../time";
import {
  PLANNING_CALENDARS,
  PLANNING_RESOURCES,
  PLANNING_SLOTS,
  STATUS_OPTIONS,
  TASK_TYPE_OPTIONS,
} from "./data";

export const AGENDA_PLANNING_SLUG = "agenda-planning";
export const AGENDA_PLANNING_API = `${AGENDA_API}/planning`;

const ONE_WEEK = 7;
const TWO_WEEKS = 14;
const RESOURCE_AREA_WIDTH = 210;
const SIDEBAR_WIDTH = 260;

/** A status action: id, label, icon, the status it sets, the ones it is offered on. */
type StatusAction = [string, string, string, string, string[]];

function statusAction([
  id,
  label,
  icon,
  statut,
  from,
]: StatusAction): AgendaEventAction {
  return {
    id,
    label,
    icon,
    visibleWhen: { field: "statut", in: from },
    target: {
      type: "api",
      url: `${AGENDA_PLANNING_API}/status?id={{row.id}}&statut=${statut}`,
      method: "POST",
      successMessage: `{title} : ${label.toLowerCase()}`,
    },
  };
}

const STATUS_ACTIONS: StatusAction[] = [
  [
    "done",
    "Marquer terminée",
    "i-ph-check-circle",
    "termine",
    ["en-planning", "hors-planning", "stand-by"],
  ],
  [
    "hold",
    "Mettre en stand by",
    "i-ph-pause-circle",
    "stand-by",
    ["en-planning", "hors-planning"],
  ],
  [
    "resume",
    "Remettre en planning",
    "i-ph-play-circle",
    "en-planning",
    ["stand-by", "hors-planning"],
  ],
];

/** What to try on the page, listed in full on the overview page. */
export const PLANNING_STEPS: DemoStep[] = [
  {
    label: "Drag Client_1 onto a draughtsman's slot",
    text: "The sidebar's pending items (unscheduled, with a search) are dossiers waiting for their first drawing: a drop on QVerschelden, ACarré or JCGobbe plans it (schedule). Their allowedResourceIds refuse any other row while dragging.",
  },
  {
    label: "Drag a task back to the list",
    text: "unscheduled.acceptDrop: a task dropped on the pending list is unplanned (unschedule); the route answers the list again.",
  },
  {
    label: "Move Peters' Devis Recap to Wednesday S1",
    text: 'It would start before its predecessor (Dessin AP1) ends: the route answers confirm ("Peters : Devis Recap avant Dessin AP1 ?"); Planifier quand même posts it again with force, and the task then carries an issue, listed in the sidebar\'s checks.',
  },
  {
    label: "Move Musin's Validation (Friday S1, Torrekens L.)",
    text: 'conflicts: "detect": each change sends previous. A colleague moves that task meanwhile (the route simulates it on its first change): the save answers a conflict, Overwrite posts yours with force, Discard takes theirs.',
  },
  {
    label: "Look at Lemaire (Monday S3, six slots)",
    text: "A task longer than the day has left runs on into the next working day's first slots (slots, timeline by slot). Saturday and Sunday are left out (hiddenDays: [0, 6]).",
  },
  {
    label: "Read the chips",
    text: "The status is the calendar (En planning, Terminé, Stand by, Hors planning, Annulé); frozen tasks are dimmed and dashed (muted, style); 🔗 a predecessor is not finished (icon); ⚡ Délégué: a validation given to a draughtsman (badges).",
  },
  {
    label: "Double-click an empty slot, open a task",
    text: 'create: { trigger: "doubleClick" } creates a task there; a click opens the drawer: dossier, commune, type, status, remark (fields), and the status actions (eventActions, shown by status: visibleWhen).',
  },
  {
    label: "Switch to Day",
    text: 'The second view is "resources": a column per person for one day, the same tasks and slots.',
  },
];

@RegisterPage()
export class PageAgendaPlanning extends PageController(
  AGENDA_PLANNING_SLUG,
  {
    displayName: "Resource planning (slots)",
    icon: "i-ph-users-four",
    category: agendaCategory,
    order: 30,
    description:
      "A design office's planning: a row per architect, draughtsman, estimator, coordinator, salesperson and driver, four slots a day, tasks chained to their predecessor, dossiers waiting in the sidebar to be dragged onto a slot.",
  },
  DefaultLayout({
    fullWidth: true,
    fillHeight: true,
    headerActions: [
      {
        label: "Reset the planning",
        icon: "i-ph-arrow-counter-clockwise",
        target: {
          type: "api",
          url: `${AGENDA_PLANNING_API}/reset`,
          method: "POST",
          successMessage: "The planning is back as it started",
        },
      },
    ],
  }),
) {
  static guide = compactGuide(
    "Drag Client_1 from the sidebar onto a draughtsman's slot; move Peters' Devis Recap to Wednesday S1 (the route asks); move Musin's Validation (a colleague moved it: conflict).",
  );

  static agenda = FullAgenda({
    title: "Planning des ressources",
    description: "Bureau d'études — dessins, devis, validations, remises",
    fetchUrl: `${AGENDA_PLANNING_API}/events`,
    saveUrl: `${AGENDA_PLANNING_API}/save`,
    calendars: PLANNING_CALENDARS,
    resources: PLANNING_RESOURCES,
    slots: PLANNING_SLOTS,
    views: [
      {
        id: "week",
        type: "timeline",
        scale: "slot",
        duration: ONE_WEEK,
        label: "Semaine",
      },
      {
        id: "two-weeks",
        type: "timeline",
        scale: "slot",
        duration: TWO_WEEKS,
        label: "2 semaines",
      },
      { id: "day", type: "resources", duration: 1, label: "Jour" },
    ],
    weekStartsOn: 1,
    hiddenDays: [0, 6],
    // The office plans in its own hours, whatever the reader's zone.
    timeZone: DEMO_TIME_ZONE,
    dayStart: "08:00",
    dayEnd: "17:00",
    resourceAreaWidth: RESOURCE_AREA_WIDTH,
    create: { trigger: "doubleClick", button: false },
    conflicts: "detect",
    details: { container: "drawer", size: "md" },
    fields: [
      { id: "title", label: "Client", required: true },
      { id: "dossier", label: "Dossier", readOnly: true },
      { id: "commune", label: "Commune" },
      {
        id: "tache",
        label: "Type de tâche",
        kind: "select",
        options: TASK_TYPE_OPTIONS,
      },
      {
        id: "statut",
        label: "Statut",
        kind: "select",
        options: STATUS_OPTIONS,
      },
      { id: "resourceIds", label: "Ressource" },
      { id: "start", label: "Début" },
      { id: "end", label: "Fin" },
      { id: "remarque", label: "Remarque", kind: "longText" },
      { id: "calendarId", visible: false },
      { id: "allDay", visible: false },
      { id: "location", visible: false },
      { id: "description", visible: false },
    ],
    eventActions: STATUS_ACTIONS.map(statusAction),
    sidebar: {
      position: "right",
      width: SIDEBAR_WIDTH,
      sections: ["unscheduled", "notices", "calendars"],
    },
    unscheduled: {
      title: "À planifier",
      search: true,
      acceptDrop: true,
      emptyLabel: "Tous les dossiers sont planifiés",
    },
    legend: { title: "Statuts" },
    eventContent: { subtitle: true, icon: true, badges: true },
  });
}
