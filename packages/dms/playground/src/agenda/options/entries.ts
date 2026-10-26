import { AGENDA_BOXED_SLUG } from "../boxed/page";
import { AGENDA_EMBEDDED_SLUG } from "../embedded/page";
import { AGENDA_LEAVE_SLUG } from "../leave/page";
import { AGENDA_PLANNING_SLUG } from "../planning/page";
import { AGENDA_ROSTER_SLUG } from "../roster/page";
import { AGENDA_SCHEDULE_SLUG } from "../schedule/page";
import { AGENDA_TEAM_SLUG } from "../team/page";

export const AGENDA_OPTIONS_SLUG = "agenda-options";

/** A FullAgenda option and the demo page that shows it. */
export interface OptionEntry {
  option: string;
  text: string;
  /** The demo page's slug; none for an option no page sets. */
  page?: string;
}

/** A name for each demo page, by slug. */
export interface PageNames {
  [slug: string]: string;
}

/** The demo pages' names, as the overview links them. */
export const PAGE_NAMES: PageNames = {
  [AGENDA_OPTIONS_SLUG]: "This page",
  [AGENDA_TEAM_SLUG]: "Team calendar",
  [AGENDA_BOXED_SLUG]: "Sales agenda",
  [AGENDA_PLANNING_SLUG]: "Resource planning",
  [AGENDA_SCHEDULE_SLUG]: "Store schedule",
  [AGENDA_ROSTER_SLUG]: "Staff roster",
  [AGENDA_LEAVE_SLUG]: "Leave",
  [AGENDA_EMBEDDED_SLUG]: "In containers",
};

export const DATA_OPTIONS: OptionEntry[] = [
  {
    option: "fetchUrl / staticData",
    text: "A route answering AgendaData (events, calendars, resources, groups, backgrounds, unscheduled, notices), read with from, to, view, tz; or the data in the options.",
    page: AGENDA_TEAM_SLUG,
  },
  {
    option: "staticData without saveUrl",
    text: "A read-only agenda without a route, its data fixed when the page is declared.",
    page: AGENDA_OPTIONS_SLUG,
  },
  {
    option: "periodScope",
    text: "Follows a PeriodSelector of the page; ‹ › and Today move it.",
    page: AGENDA_ROSTER_SLUG,
  },
  {
    option: "realtimeTopic",
    text: "Reads the route again on each event of the topics.",
  },
  {
    option: "calendars",
    text: "Colour, legend line, group, hidden, editable, details per calendar; the route's win for an id both declare.",
    page: AGENDA_TEAM_SLUG,
  },
  {
    option: "resources (+ the route's resourceGroups)",
    text: "The columns of resources, the rows of timeline: avatar, description, business hours, editable.",
    page: AGENDA_PLANNING_SLUG,
  },
  {
    option: "search / facets",
    text: "Sent as q and facet_<id>=a,b; the route filters.",
    page: AGENDA_BOXED_SLUG,
  },
  {
    option: "legend.serverFilter",
    text: "Hidden calendars left out by the route (calendars=a,b), not only on screen.",
  },
  {
    option: "backgrounds (answered)",
    text: "Closed days hatched, public holidays tinted and labelled, highlights.",
    page: AGENDA_LEAVE_SLUG,
  },
  {
    option: "urlState",
    text: "View, day, search, facets, hidden calendars and the open event in the page URL (on by default).",
    page: AGENDA_TEAM_SLUG,
  },
];

export const VIEW_OPTIONS: OptionEntry[] = [
  {
    option: "views: month, week, day, list",
    text: "The default set; strings are views of that type.",
    page: AGENDA_TEAM_SLUG,
  },
  {
    option: "views: days (duration)",
    text: "A time grid of N days.",
    page: AGENDA_BOXED_SLUG,
  },
  {
    option: "views: timeline (scale slot / day)",
    text: "A row per resource, by named slot or by day, grouped and folding.",
    page: AGENDA_PLANNING_SLUG,
  },
  {
    option: "views: resources (resourceLayout)",
    text: "A column per resource, per resource and day over several days (daysFirst).",
    page: AGENDA_SCHEDULE_SLUG,
  },
  {
    option: "views: year (yearLayout)",
    text: "A planner (a row per month) or twelve small months.",
    page: AGENDA_LEAVE_SLUG,
  },
  {
    option: "slots",
    text: "Named parts of the day; a long task runs on into the next day's slots.",
    page: AGENDA_PLANNING_SLUG,
  },
  {
    option: "hiddenDays / weekStartsOn",
    text: "A working week; the first day of the week (else the reader's).",
    page: AGENDA_PLANNING_SLUG,
  },
  {
    option: "minDate / maxDate / initialDate",
    text: "Navigation bounded to a period; the first day shown.",
    page: AGENDA_ROSTER_SLUG,
  },
  {
    option: "timeZone",
    text: "Draws in a fixed zone (a store's hours), else the reader's.",
    page: AGENDA_SCHEDULE_SLUG,
  },
  {
    option: "dayStart / dayEnd / hourHeight / scrollTime",
    text: "The hours a time grid shows, its scale, where it opens.",
    page: AGENDA_TEAM_SLUG,
  },
  {
    option: "businessHours",
    text: "Shades outside opening hours; per resource too.",
    page: AGENDA_SCHEDULE_SLUG,
  },
  {
    option: "weekNumbers / overlap / tooltips",
    text: "Week numbers; overlapping events stacked instead of side by side; info-bubbles.",
    page: AGENDA_BOXED_SLUG,
  },
  {
    option: "recurrence (events) / recurrence.timeZone",
    text: "A repeating event expanded by the agenda, kept at its wall clock in its own zone (09:00 in Brussels across clock changes); recurringEdit asks occurrence or series.",
    page: AGENDA_TEAM_SLUG,
  },
  {
    option: "short (events)",
    text: "What a year planner cell shows (7,6).",
    page: AGENDA_LEAVE_SLUG,
  },
  {
    option: "eventContent",
    text: "Time, subtitle, place, icon, badges, avatar, resource, description on the chips.",
    page: AGENDA_PLANNING_SLUG,
  },
];

export const EDITING_OPTIONS: OptionEntry[] = [
  {
    option: "saveUrl / editable / dragMove / dragResize",
    text: "Drag to move and resize, saved through the route (on with saveUrl).",
    page: AGENDA_TEAM_SLUG,
  },
  {
    option: "create",
    text: "A click, a double click or a drag on an empty slot, and a toolbar button.",
    page: AGENDA_PLANNING_SLUG,
  },
  {
    option: "rangeSelect / selectAction",
    text: "Two clicks on days (or a drag) open the form of a new event, or a target.",
    page: AGENDA_LEAVE_SLUG,
  },
  {
    option: "saveMode: staged / review",
    text: "Changes kept, ghosted, saved together after a before → after review.",
    page: AGENDA_SCHEDULE_SLUG,
  },
  {
    option: "Cleared fields (null in a patch)",
    text: "A place, an end or a data field emptied in the form is sent as null; the route clears it.",
    page: AGENDA_PLANNING_SLUG,
  },
  {
    option: "conflicts: detect",
    text: "Each change sends previous; a conflict offers Overwrite (posted with overwrite) or Discard.",
    page: AGENDA_PLANNING_SLUG,
  },
  {
    option: "confirm (answered)",
    text: "The route asks before writing; the user's yes posts the changes again with force.",
    page: AGENDA_PLANNING_SLUG,
  },
  {
    option: "constraints",
    text: "Within business hours, no overlap, minimum and maximum lengths, refused while dragging.",
    page: AGENDA_SCHEDULE_SLUG,
  },
  {
    option: "allowedResourceIds (events, pending items)",
    text: "The only rows or columns an event may be dropped on.",
    page: AGENDA_PLANNING_SLUG,
  },
  {
    option: "unscheduled (sidebar)",
    text: "Pending items dragged in (schedule), events dragged back (unschedule).",
    page: AGENDA_PLANNING_SLUG,
  },
  {
    option: "undoSeconds / copyOnAltDrag",
    text: "An Undo after each write (6 s by default); Alt while dropping copies.",
    page: AGENDA_TEAM_SLUG,
  },
];

export const DETAILS_OPTIONS: OptionEntry[] = [
  {
    option: "details.container: drawer",
    text: "The read view and the form in a drawer, kept in the URL.",
    page: AGENDA_TEAM_SLUG,
  },
  {
    option: "details.container: panel / editDirectly",
    text: "A column beside the views (a drawer when narrow); the form at once.",
    page: AGENDA_BOXED_SLUG,
  },
  {
    option: "details.container: modal / popover",
    text: "A modal, or a popover on the chip.",
    page: AGENDA_LEAVE_SLUG,
  },
  {
    option: "fields",
    text: "Built-in fields ordered, relabelled or hidden, and fields of the event's data (select, longText, number…).",
    page: AGENDA_PLANNING_SLUG,
  },
  {
    option: "eventActions",
    text: "Actions in the details and the right-click menu, shown by visibleWhen.",
    page: AGENDA_BOXED_SLUG,
  },
  {
    option: "eventAction",
    text: "A target opened instead of the built-in details.",
  },
  {
    option: "toolbarActions",
    text: "Buttons receiving the range shown ({{row.from}}, {{row.to}}).",
    page: AGENDA_SCHEDULE_SLUG,
  },
];

export const LAYOUT_OPTIONS: OptionEntry[] = [
  {
    option: "sidebar (left)",
    text: "Mini calendar, legend, upcoming, tip; folds away.",
    page: AGENDA_TEAM_SLUG,
  },
  {
    option: "sidebar (right) / width",
    text: "On the other side, narrower.",
    page: AGENDA_BOXED_SLUG,
  },
  {
    option: "notices (answered)",
    text: "The route's checks in the sidebar, errors first; a click opens the event or the day.",
    page: AGENDA_SCHEDULE_SLUG,
  },
  {
    option: "legend.position: toolbar",
    text: "The legend above the views, without a sidebar.",
    page: AGENDA_ROSTER_SLUG,
  },
  {
    option: "toolbar",
    text: "Each part of the toolbar, or none at all (toolbar: false).",
    page: AGENDA_EMBEDDED_SLUG,
  },
  {
    option: "height: fill",
    text: "The height left on a fillHeight page, or a modal's or drawer's body.",
    page: AGENDA_TEAM_SLUG,
  },
  {
    option: "responsive",
    text: "Compact under a container width: sidebar folded, compactView.",
    page: AGENDA_EMBEDDED_SLUG,
  },
  {
    option: "In a modal or a drawer",
    text: "A FullAgenda as the component of a modal or drawer action target.",
    page: AGENDA_EMBEDDED_SLUG,
  },
  {
    option: "shortcuts / density / emptyLabel",
    text: "T, ← →, M W D L Y, N, Del; row density; the words of an empty agenda.",
    page: AGENDA_TEAM_SLUG,
  },
];
