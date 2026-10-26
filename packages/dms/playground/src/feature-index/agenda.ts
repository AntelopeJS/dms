import { FEATURE_AREAS, type PlaygroundFeature } from "./types";

const AREA = FEATURE_AREAS.agenda;
const ROOT = "/agenda";

/** The release the FullAgenda block ships in, with the Matrix. */
const AGENDA_RELEASE = "0.12.0";

const PAGES = {
  overview: `${ROOT}/agenda-options`,
  team: `${ROOT}/agenda-team`,
  boxed: `${ROOT}/agenda-boxed`,
  planning: `${ROOT}/agenda-planning`,
  schedule: `${ROOT}/agenda-schedule`,
  roster: `${ROOT}/agenda-roster`,
  leave: `${ROOT}/agenda-leave`,
  embedded: `${ROOT}/agenda-embedded`,
};

function feature(name: string, api: string, demo: string): PlaygroundFeature {
  return { area: AREA, feature: name, api, demo, since: AGENDA_RELEASE };
}

/** The FullAgenda block's features, page by page. */
export const AGENDA_FEATURES: PlaygroundFeature[] = [
  feature(
    "A read-only agenda from static data",
    "FullAgenda({ staticData })",
    PAGES.overview,
  ),
  feature(
    "An agenda filling a full page",
    'DefaultLayout({ fullWidth: true, fillHeight: true }), height: "fill"',
    PAGES.team,
  ),
  feature(
    "Month, week, day and list views",
    'views: ["month", "week", "day", "list"]',
    PAGES.team,
  ),
  feature(
    "Events dragged and resized, saved at once, with an undo",
    "saveUrl, dragMove, dragResize, undoSeconds",
    PAGES.team,
  ),
  feature(
    "A click on an empty slot creates an event",
    'create: { trigger: "click" }',
    PAGES.team,
  ),
  feature(
    "Event details in a drawer, kept in the URL",
    'details: { container: "drawer", deepLink }',
    PAGES.team,
  ),
  feature(
    "A recurring event, an occurrence or the series edited",
    'events[].recurrence, recurringEdit: "ask"',
    PAGES.team,
  ),
  feature(
    "A series kept at its wall clock in its own zone",
    'events[].recurrence.timeZone: "Europe/Brussels"',
    PAGES.team,
  ),
  feature(
    "A field emptied in the form is cleared by the route",
    "AgendaEventPatch: null clears end, calendarId, location, description, data keys",
    PAGES.planning,
  ),
  feature(
    "Sidebar: mini calendar, legend with toggles and counts, tip",
    "sidebar: { sections, tip }, legend: { toggles, counts }",
    PAGES.team,
  ),
  feature(
    "Search on the server, ICS export",
    "search (q), toolbar.exportIcs",
    PAGES.team,
  ),
  feature(
    "An agenda in a boxed page, the sidebar on the right",
    'DefaultLayout({ fullWidth: false }), sidebar: { position: "right" }',
    PAGES.boxed,
  ),
  feature(
    "Details in a panel beside the views, the form at once",
    'details: { container: "panel", editDirectly: true }',
    PAGES.boxed,
  ),
  feature(
    "Toolbar facets filtered on the server",
    "facets [{ id, field, options }] (facet_<id>=a,b)",
    PAGES.boxed,
  ),
  feature(
    "Actions on an event and in the toolbar",
    "eventActions [{ target, visibleWhen }], toolbarActions",
    PAGES.boxed,
  ),
  feature(
    "Stacked overlaps, week numbers, tooltips",
    'overlap: "stack", weekNumbers, tooltips',
    PAGES.boxed,
  ),
  feature(
    "A resource timeline by named slot",
    'views: [{ type: "timeline", scale: "slot" }], slots, resources',
    PAGES.planning,
  ),
  feature(
    "A task spilling over to the next working day",
    "slots, hiddenDays: [0, 6]",
    PAGES.planning,
  ),
  feature(
    "Pending items dragged onto a resource, and back",
    "AgendaData.unscheduled, unscheduled: { search, acceptDrop } (schedule / unschedule)",
    PAGES.planning,
  ),
  feature(
    "A question of the save route before it writes",
    "AgendaSaveResponse.confirm → AgendaSaveRequest.force",
    PAGES.planning,
  ),
  feature(
    "Conflicts detected on events moved meanwhile",
    'conflicts: "detect" (previous → errors[{ code: "conflict", current }] → overwrite)',
    PAGES.planning,
  ),
  feature(
    "Events allowed on some resources only",
    "events[].allowedResourceIds",
    PAGES.planning,
  ),
  feature(
    "Status as calendars, frozen tasks dimmed and dashed, badges",
    "calendars, events[].muted / style / icon / badges / issues",
    PAGES.planning,
  ),
  feature(
    "Custom fields in the details form",
    'fields [{ id, kind: "select" | "longText", options }]',
    PAGES.planning,
  ),
  feature(
    "Staged changes, reviewed, saved together",
    'saveMode: "staged", review: true',
    PAGES.schedule,
  ),
  feature(
    "Checks answered by the save route in the sidebar",
    "AgendaData.notices / AgendaSaveResponse.notices",
    PAGES.schedule,
  ),
  feature(
    "Opening hours per resource, drops kept within them",
    "resources[].businessHours, constraints: { withinBusinessHours, allowOverlap: false }",
    PAGES.schedule,
  ),
  feature(
    "Resources over a week, days first",
    'views: [{ type: "resources", duration: 7, resourceLayout: "daysFirst" }]',
    PAGES.schedule,
  ),
  feature(
    "An agenda in a fixed time zone",
    'timeZone: "Europe/Brussels"',
    PAGES.schedule,
  ),
  feature(
    "A timeline by day driven by a period selector",
    'periodScope, views: [{ type: "timeline", scale: "day" }]',
    PAGES.roster,
  ),
  feature(
    "Navigation bounded to fixed weeks",
    "minDate, maxDate, initialDate",
    PAGES.roster,
  ),
  feature(
    "Read-only resources, the legend in the toolbar",
    'resources[].editable: false, legend: { position: "toolbar" }',
    PAGES.roster,
  ),
  feature(
    "A year planner, two clicks pick a range",
    'views: [{ type: "year", yearLayout: "planner" }], rangeSelect: "twoClicks"',
    PAGES.leave,
  ),
  feature(
    "Public holidays as backgrounds",
    'AgendaData.backgrounds [{ kind: "holiday", label }]',
    PAGES.leave,
  ),
  feature(
    "Tentative requests accepted or refused",
    'events[].status: "tentative", eventActions visibleWhen',
    PAGES.leave,
  ),
  feature(
    "An agenda in a narrow grid column",
    "Grid › GridRow, responsive: { compactBelow, compactView }",
    PAGES.embedded,
  ),
  feature(
    "An agenda in a modal and in a drawer",
    'target: { type: "modal" | "drawer", component: FullAgenda(…) }',
    PAGES.embedded,
  ),
  feature("An agenda without a toolbar", "toolbar: false", PAGES.embedded),
  feature(
    "A read-only agenda from a route",
    "FullAgenda({ fetchUrl }) without saveUrl",
    PAGES.embedded,
  ),
];
