import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CodeBlock, KeyValueList } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { FullAgenda } from "@antelopejs/interface-dms/base/full-agenda";
import type { AgendaData } from "@antelopejs/interface-dms/base/full-agenda-types";
import { agendaCategory, agendaPagePath } from "../category";
import { stepList } from "../guide";
import { AGENDA_PLANNING_SLUG, PLANNING_STEPS } from "../planning/page";
import { AGENDA_TEAM_SLUG, TEAM_STEPS } from "../team/page";
import {
  addDays,
  DEMO_TIME_ZONE,
  mondayOf,
  todayKey,
  zonedInstant,
} from "../time";
import {
  AGENDA_OPTIONS_SLUG,
  DATA_OPTIONS,
  DETAILS_OPTIONS,
  EDITING_OPTIONS,
  LAYOUT_OPTIONS,
  type OptionEntry,
  PAGE_NAMES,
  VIEW_OPTIONS,
} from "./entries";

function optionList(title: string, entries: OptionEntry[]) {
  return KeyValueList({
    title,
    dense: true,
    items: entries.map(({ option, text, page }) => ({
      label: option,
      value: text,
      detail: page ? PAGE_NAMES[page] : "Not shown in a demo",
      to: page ? agendaPagePath(page) : undefined,
    })),
  });
}

/** A week of a small office, computed when the playground starts. */
function officeWeek(): AgendaData {
  const monday = mondayOf(todayKey());
  const at = (day: number, time: string) =>
    zonedInstant(addDays(monday, day), time);
  return {
    calendars: [
      { id: "clients", label: "Clients", color: "primary" },
      { id: "team", label: "Équipe", color: "success" },
    ],
    events: [
      {
        id: "o1",
        title: "Point d'équipe",
        calendarId: "team",
        start: at(0, "09:00"),
        end: at(0, "09:30"),
        recurrence: {
          frequency: "weekly",
          weekdays: [1, 3, 5],
          timeZone: DEMO_TIME_ZONE,
        },
      },
      {
        id: "o2",
        title: "Démo client",
        calendarId: "clients",
        start: at(1, "14:00"),
        end: at(1, "15:00"),
        location: "Visio",
      },
      {
        id: "o3",
        title: "Visite chantier",
        calendarId: "clients",
        start: at(3, "10:00"),
        end: at(3, "12:00"),
        location: "Namur",
      },
      {
        id: "o4",
        title: "Séminaire",
        calendarId: "team",
        allDay: true,
        start: addDays(monday, 4),
        end: addDays(monday, 4),
      },
    ],
  };
}

const DECLARATION = `static agenda = FullAgenda({
  title: "Agenda",
  staticData: WEEK, // or fetchUrl: "/api/…" answering AgendaData
  views: ["week", "month", "list"],
  dayStart: "08:00",
  dayEnd: "19:00",
});

// Editable: add a route receiving
//   { changes: [{ kind, id?, tempId?, patch?, previous?, occurrence?, scope? }],
//     force?, overwrite?, conflicts, from, to, view }
// (a patch's null clears a field; force: the user confirmed the route's
// question; overwrite: the user chose Overwrite on a conflict)
// and answering { events?, removed?, errors?, confirm?, message?,
//                 unscheduled?, notices?, backgrounds? }.
static planning = FullAgenda({ fetchUrl, saveUrl, conflicts: "detect" });`;

@RegisterPage()
export class PageAgendaOptions extends PageController(
  AGENDA_OPTIONS_SLUG,
  {
    displayName: "Agenda — overview",
    icon: "i-ph-calendar-dots",
    category: agendaCategory,
    order: 0,
    description:
      "The FullAgenda block: a calendar by month, week, day, list, year, resource columns or resource timeline, edited by dragging. A small read-only one from static data, its declaration, and every option with the page that demonstrates it.",
  },
  DefaultLayout(),
) {
  static week = FullAgenda({
    title: "Semaine du bureau",
    description:
      "staticData: no route, nothing to save. A recurring point three days a week, an all-day seminar. Given in the options, its days are computed once, when the playground starts: they stay on that week until a restart.",
    staticData: officeWeek(),
    views: ["week", "month", "list"],
    weekStartsOn: 1,
    dayStart: "08:00",
    dayEnd: "19:00",
    sidebar: false,
    height: "30rem",
  });

  static declaration = CodeBlock({
    title: "Declaring it",
    language: "typescript",
    code: DECLARATION,
  });

  // The full-page demos keep one guide line, so their agenda keeps the
  // height: their steps are listed here.
  static teamSteps = stepList(
    "Team calendar — what to try",
    AGENDA_TEAM_SLUG,
    TEAM_STEPS,
  );
  static planningSteps = stepList(
    "Resource planning — what to try",
    AGENDA_PLANNING_SLUG,
    PLANNING_STEPS,
  );

  static data = optionList("Data", DATA_OPTIONS);
  static views = optionList("Views and time", VIEW_OPTIONS);
  static editing = optionList("Editing and saving", EDITING_OPTIONS);
  static details = optionList("Details and actions", DETAILS_OPTIONS);
  static layout = optionList("Layout and containers", LAYOUT_OPTIONS);
}
