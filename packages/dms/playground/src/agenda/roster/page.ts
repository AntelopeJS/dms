import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { PeriodSelector } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { FullAgenda } from "@antelopejs/interface-dms/base/full-agenda";
import { demoGuide } from "../../table-view/guide";
import { AGENDA_API, agendaCategory, agendaPagePath } from "../category";
import { DEMO_TIME_ZONE } from "../time";
import {
  PRESTATION_CALENDARS,
  ROSTER_FIRST_DAY,
  ROSTER_LAST_DAY,
  ROSTER_RESOURCES,
} from "./data";

export const AGENDA_ROSTER_SLUG = "agenda-roster";
export const AGENDA_ROSTER_API = `${AGENDA_API}/roster`;

/** The id of the page's period selector, which the agenda follows. */
export const ROSTER_PERIOD_SCOPE = "agenda-roster";

const ONE_WEEK = 7;
const THREE_WEEKS = 21;
const RESOURCE_AREA_WIDTH = 230;
const COLUMN_MIN_WIDTH = 88;

// The published weeks, in the period selector's URL keys.
const PUBLISHED_WEEKS = `${agendaPagePath(AGENDA_ROSTER_SLUG)}?${ROSTER_PERIOD_SCOPE}.period=custom&${ROSTER_PERIOD_SCOPE}.from=${ROSTER_FIRST_DAY}&${ROSTER_PERIOD_SCOPE}.to=${ROSTER_LAST_DAY}`;
const SECOND_WEEK = `${agendaPagePath(AGENDA_ROSTER_SLUG)}?${ROSTER_PERIOD_SCOPE}.period=custom&${ROSTER_PERIOD_SCOPE}.from=2026-10-05&${ROSTER_PERIOD_SCOPE}.to=2026-10-11`;

@RegisterPage()
export class PageAgendaRoster extends PageController(
  AGENDA_ROSTER_SLUG,
  {
    displayName: "Staff roster (timeline by day)",
    icon: "i-ph-calendar-check",
    category: agendaCategory,
    order: 50,
    description:
      "The published roster of weeks 40 to 42 of 2026, a row per person grouped by store, a column per day: shifts, leave, sickness, training and recovery as coloured prestations. A period selector above it picks the weeks shown.",
  },
  DefaultLayout({
    fullWidth: true,
    headerActions: [
      {
        label: "Weeks 40–42",
        icon: "i-ph-calendar-blank",
        target: { type: "page", url: PUBLISHED_WEEKS },
      },
      {
        label: "Reset the roster",
        icon: "i-ph-arrow-counter-clockwise",
        target: {
          type: "api",
          url: `${AGENDA_ROSTER_API}/reset`,
          method: "POST",
          successMessage: "The roster is back as it was published",
        },
      },
    ],
  }),
) {
  static guide = demoGuide([
    {
      label: "Show the three weeks",
      text: "periodScope: the agenda shows the period picked in the selector above it, and its ‹ › and Today move that selector. minDate / maxDate keep it within the published weeks.",
      to: PUBLISHED_WEEKS,
    },
    {
      label: "Show week 41 alone",
      text: "A custom range of the selector, set by a link: the timeline follows.",
      to: SECOND_WEEK,
    },
    {
      label: "Read a row",
      text: "timeline with scale \"day\": a cell per person and day. Shifts are timed (09:30–18:30), absences all-day bars over several days (Manon Bertrand's leave, Charlotte Hubert's sickness).",
    },
    {
      label: "Fold a store",
      text: "The rows are grouped by store (the route's resourceGroups), each folding with its count; Beaufays starts folded (collapsed).",
    },
    {
      label: "Try to move a Luxembourg shift",
      text: "Its rows are read-only (resource editable: false): nothing is dragged there, nothing dropped on them. The route refuses them too.",
    },
    {
      label: "Move a shift to another day",
      text: "Saved at once; the route refuses a day outside the published weeks or a second prestation the same day for that person.",
    },
    {
      label: "Read the legend",
      text: 'legend: { position: "toolbar" }: the prestation types above the timeline, toggled with a click; there is no sidebar (sidebar: false).',
    },
  ]);

  static period = PeriodSelector({
    id: ROSTER_PERIOD_SCOPE,
    presets: ["this-month", "last-month", "custom"],
    comparisons: ["none"],
    defaultPreset: "custom",
    showRangeLabel: true,
  });

  static agenda = FullAgenda({
    title: "Planning par collaborateur",
    description: "Semaines 40 à 42 — planning publié",
    fetchUrl: `${AGENDA_ROSTER_API}/events`,
    saveUrl: `${AGENDA_ROSTER_API}/save`,
    periodScope: ROSTER_PERIOD_SCOPE,
    calendars: PRESTATION_CALENDARS,
    resources: ROSTER_RESOURCES,
    views: [
      {
        id: "weeks",
        type: "timeline",
        scale: "day",
        duration: THREE_WEEKS,
        label: "3 semaines",
      },
      {
        id: "week",
        type: "timeline",
        scale: "day",
        duration: ONE_WEEK,
        label: "Semaine",
      },
    ],
    initialDate: ROSTER_FIRST_DAY,
    minDate: ROSTER_FIRST_DAY,
    maxDate: ROSTER_LAST_DAY,
    weekStartsOn: 1,
    timeZone: DEMO_TIME_ZONE,
    resourceAreaWidth: RESOURCE_AREA_WIDTH,
    columnMinWidth: COLUMN_MIN_WIDTH,
    sidebar: false,
    legend: { position: "toolbar", toggles: true, counts: false },
    details: { container: "popover" },
    create: false,
    eventContent: { time: true, subtitle: false },
    height: "40rem",
  });
}
