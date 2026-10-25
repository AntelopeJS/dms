import type {
  ActionTarget,
  ActionTargetSerialized,
} from "./types/action-target";
import type { FieldCondition } from "./form-types";
import type { BlockText } from "./types/composed-text";
import type { HttpMethod } from "./types/http";
import type { Tone } from "./types/tone";
import type { BaseComponentProps, EnumOption } from "./types";

/*
 * Time model. A timed event's `start` and `end` are ISO instants
 * ("2026-07-01T09:00:00+02:00", "2026-07-01T07:00:00Z"); the agenda draws
 * them in the reader's time zone (their regional preference), or in the
 * block's `timeZone` when set (a store's schedule shown in the store's time).
 * An all-day event's `start` and `end` are days ("2026-10-26"), and its `end`
 * is the LAST day it covers, inclusive: a leave from Monday 26 to Saturday 31
 * is `{ start: "2026-10-26", end: "2026-10-31", allDay: true }`. A timed
 * event's `end` is exclusive (a 09:00–10:00 meeting ends at 10:00).
 * Times of day in the options ("07:00", "18:30") are wall-clock times in the
 * zone the agenda draws in.
 */

/**
 * What a view draws:
 * - `day`, `week`, `days`: a time grid, a column per day (`days` spans
 *   `duration` days, 3 by default);
 * - `month`: six weeks of day cells, events as chips, "+N more" past
 *   `maxEventsPerDay`;
 * - `year`: twelve months, as a planner (a row per month, a cell per day) or
 *   as twelve small months;
 * - `list`: the events of `duration` days (30 by default) listed under their
 *   day;
 * - `resources`: a time grid with a column per resource (per resource and
 *   day when it spans several days);
 * - `timeline`: a row per resource, time running left to right, by hour, by
 *   named slot (`slots`) or by day.
 */
export const AGENDA_VIEW_TYPES = [
  "day",
  "week",
  "days",
  "month",
  "year",
  "list",
  "resources",
  "timeline",
] as const;

export type AgendaViewType = (typeof AGENDA_VIEW_TYPES)[number];

/** What one column of a `timeline` stands for. */
export type AgendaTimelineScale = "hour" | "slot" | "day";

/** How a `resources` view orders its columns over several days. */
export type AgendaResourceLayout = "resourcesFirst" | "daysFirst";

/** A `year` view as a row per month (planner) or as twelve small months. */
export type AgendaYearLayout = "planner" | "months";

/**
 * The tones of the dashboard, or a CSS colour: a hex, `rgb()`, `hsl()`,
 * `oklch()` or a custom property (`var(--brand-teal)`). An event draws a tint
 * of it behind its text and a solid bar on its edge, in light and dark mode.
 */
export type AgendaColor =
  | Tone
  | `#${string}`
  | `rgb(${string}`
  | `hsl(${string}`
  | `oklch(${string}`
  | `var(--${string})`;

/** The tones of an issue, a badge or a background. */
export type AgendaTone = Extract<
  Tone,
  "neutral" | "primary" | "success" | "warning" | "error" | "info"
>;

/**
 * One way of looking at the agenda, offered in the toolbar's view switcher.
 * The options of the block (`dayStart`, `hiddenDays`...) apply to every view;
 * a view's own value wins for it.
 */
export interface AgendaView {
  /** Defaults to `type`. Two views of one type need their own ids. */
  id?: string;
  type: AgendaViewType;
  /** Defaults to the type's name ("Week", "Timeline"). */
  label?: BlockText;
  /**
   * How many days the view spans, and how far ‹ › move: `days`, `list`,
   * `resources` and `timeline` (1 by default for `resources`, 7 for
   * `timeline`). `day`, `week`, `month` and `year` ignore it.
   */
  duration?: number;
  /** Days of the week left out of this view (0 Sunday … 6 Saturday). */
  hiddenDays?: number[];
  dayStart?: string;
  dayEnd?: string;
  slotMinutes?: number;
  /** `timeline`: defaults to `slot` when the block has `slots`, else `hour` for one day, `day` past it. */
  scale?: AgendaTimelineScale;
  /** `resources` over several days. Defaults to `resourcesFirst`. */
  resourceLayout?: AgendaResourceLayout;
  /** `year`. Defaults to `planner`. */
  yearLayout?: AgendaYearLayout;
}

/**
 * A named part of the day (a quarter day "S1" 08:00–10:00, a shift
 * "Morning"). With `slots`, a `timeline` by slot has a column per slot of
 * each day, time grids draw a line at each slot's start, and a drop snaps
 * to a slot start; an event spanning more slots than the day has left runs
 * on into the next day's first slots.
 */
export interface AgendaSlot {
  id: string;
  label: BlockText;
  start: string;
  end: string;
}

/** A group of calendars in the legend ("My calendars", "Teams"). */
export interface AgendaCalendarGroup {
  id: string;
  label: BlockText;
}

/**
 * A calendar an event belongs to: its colour, a line of the legend that
 * shows or hides its events. Calendars come from the block's `calendars`,
 * from the response's, or both: the response wins for an id both declare.
 */
export interface AgendaCalendar {
  id: string;
  label: BlockText;
  color?: AgendaColor;
  description?: BlockText;
  icon?: string;
  group?: string;
  /** Starts hidden (unchecked in the legend). */
  hidden?: boolean;
  /** `false`: its events are read-only, whatever the block allows. */
  editable?: boolean;
  /** Where a click on one of its events opens; `false` opens nothing. */
  details?: AgendaDetailsContainer | false;
}

/** A group of resources, a folding header in `resources` and `timeline` ("NE1 · Neupré"). */
export interface AgendaResourceGroup {
  id: string;
  label: BlockText;
  description?: BlockText;
  /** Starts folded. */
  collapsed?: boolean;
}

/** A small round picture or initials (a person, a room). */
export interface AgendaAvatar {
  src?: string;
  initials?: string;
  color?: AgendaColor;
}

/**
 * Who or what events are planned on: a person, a room, a vehicle, a
 * machine. The columns of `resources`, the rows of `timeline`.
 */
export interface AgendaResource {
  id: string;
  label: BlockText;
  /** Dimmed line under the label ("Zone : Liège", "38 h"). */
  description?: BlockText;
  group?: string;
  avatar?: AgendaAvatar;
  color?: AgendaColor;
  /** Replaces the block's `businessHours` for this resource. */
  businessHours?: AgendaBusinessHours[];
  /** `false`: nothing can be dropped on it, its events are read-only. */
  editable?: boolean;
}

/**
 * Opening hours: outside them, time grids and timelines are shaded, and with
 * `constraints.withinBusinessHours` an event cannot be dropped there.
 */
export interface AgendaBusinessHours {
  /** Days of the week (0 Sunday … 6 Saturday). */
  days: number[];
  start: string;
  end: string;
}

/** A pill on an event ("Stand by", "⚡ Delegated"). */
export interface AgendaBadge {
  label: BlockText;
  tone?: AgendaTone;
  icon?: string;
}

/** A problem shown on an event (red or orange edge, listed in the sidebar's issues). */
export interface AgendaIssue {
  /** Defaults to `warning`. */
  tone?: AgendaTone;
  message: BlockText;
}

/**
 * A problem of the agenda itself, not of one event (under-staffing on a day),
 * listed in the sidebar's issues. A click opens `eventId`, else moves to
 * `date` (and shows `resourceId`).
 */
export interface AgendaNotice extends AgendaIssue {
  id?: string;
  eventId?: string;
  date?: string;
  resourceId?: string;
}

/** How an event is drawn. */
export type AgendaEventStyle = "soft" | "solid" | "outline" | "dashed";

/** `tentative` draws dashed, `cancelled` struck through and dimmed. */
export type AgendaEventStatus = "confirmed" | "tentative" | "cancelled";

/** How often a recurring event repeats. */
export type AgendaFrequency = "daily" | "weekly" | "monthly" | "yearly";

/**
 * A repeating event, expanded into occurrences by the agenda for the days
 * shown. An occurrence's id is `<event id>@<day of its start>`; editing one
 * asks whether to change this occurrence or the series (`recurringEdit`).
 */
export interface AgendaRecurrence {
  frequency: AgendaFrequency;
  /** Every `interval` days / weeks / months / years. Defaults to 1. */
  interval?: number;
  /** `weekly`: the days of the week it falls on (0 Sunday … 6 Saturday). Defaults to the start's. */
  weekdays?: number[];
  /** Last day it may fall on, inclusive. */
  until?: string;
  /** How many occurrences in all. */
  count?: number;
  /** Days left out of the series (moved or cancelled occurrences). */
  exceptions?: string[];
}

/** One event. See the time model at the top of this file. */
export interface AgendaEvent {
  id: string;
  title: string;
  start: string;
  /** Defaults to `start` + `defaultDurationMinutes` (timed) or to `start` (all-day). */
  end?: string;
  allDay?: boolean;
  calendarId?: string;
  /** The resources it is planned on (`resources`, `timeline`). */
  resourceIds?: string[];
  /** Replaces the calendar's colour. */
  color?: AgendaColor;
  icon?: string;
  /** Second line ("DC-Dessin-AP1", "pause 60 min · NE1"). */
  subtitle?: string;
  location?: string;
  /** Plain text or HTML, shown in the details. */
  description?: string;
  /** What a `year` planner cell shows for it ("7,6", "F"). */
  short?: string;
  avatar?: AgendaAvatar;
  badges?: AgendaBadge[];
  issues?: AgendaIssue[];
  /** Defaults to `soft`. */
  style?: AgendaEventStyle;
  /** Dimmed (a frozen task, a follow-up shown for information). */
  muted?: boolean;
  status?: AgendaEventStatus;
  /** `false`: neither moved, resized nor edited. */
  editable?: boolean;
  /** `false`: can be resized but not moved. */
  startEditable?: boolean;
  /** `false`: can be moved but not resized. */
  durationEditable?: boolean;
  deletable?: boolean;
  /** Where a click on it opens; `false` opens nothing. Replaces its calendar's. */
  details?: AgendaDetailsContainer | false;
  /** The only resources it may be dropped on (the stores a person may work in). */
  allowedResourceIds?: string[];
  recurrence?: AgendaRecurrence;
  /** The values of the block's own `fields`, and anything `{{row.X}}` tokens need. */
  data?: Record<string, unknown>;
}

/**
 * A thing to plan, not yet on the agenda: listed in the sidebar's
 * `unscheduled` section and dragged onto a day, a slot or a resource.
 */
export interface AgendaPendingItem {
  id: string;
  title: string;
  subtitle?: string;
  calendarId?: string;
  color?: AgendaColor;
  icon?: string;
  badges?: AgendaBadge[];
  /** Defaults to `defaultDurationMinutes`. */
  durationMinutes?: number;
  /** With `slots`: how many slots it takes. Wins over `durationMinutes`. */
  durationSlots?: number;
  /** Dropped as an all-day event. */
  allDay?: boolean;
  allowedResourceIds?: string[];
  data?: Record<string, unknown>;
}

/**
 * Shading behind the events: a closed day, a public holiday, a period to
 * highlight. Hatched by default when `kind` is `closed`.
 */
export interface AgendaBackground {
  id?: string;
  start: string;
  end?: string;
  allDay?: boolean;
  /** Only behind these resources; behind every one when absent. */
  resourceIds?: string[];
  /** Defaults to `highlight`. */
  kind?: "closed" | "holiday" | "highlight";
  label?: BlockText;
  color?: AgendaColor;
  hatched?: boolean;
}

/**
 * What `fetchUrl` answers. The block reads it with `from` and `to` (the first
 * and last day shown, `YYYY-MM-DD`), `view` (the view id), `tz` (the zone it
 * draws in), and with `q`, `calendars` (the shown ones, comma separated,
 * under `legend.serverFilter`) and `facet_<id>` when they are set.
 */
export interface AgendaData {
  events: AgendaEvent[];
  calendars?: AgendaCalendar[];
  calendarGroups?: AgendaCalendarGroup[];
  resources?: AgendaResource[];
  resourceGroups?: AgendaResourceGroup[];
  backgrounds?: AgendaBackground[];
  unscheduled?: AgendaPendingItem[];
  notices?: AgendaNotice[];
}

/** What a change does to the agenda. */
export type AgendaChangeKind =
  | "create"
  | "update"
  | "move"
  | "resize"
  | "delete"
  | "schedule"
  | "unschedule";

/** The fields a change sets on an event. */
export interface AgendaEventPatch {
  title?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  calendarId?: string;
  resourceIds?: string[];
  location?: string;
  description?: string;
  data?: Record<string, unknown>;
}

/** Which part of a recurring event a change applies to. */
export type AgendaRecurringScope = "occurrence" | "series";

/**
 * One change:
 * - `create`: a new event, `tempId` names it until the route answers it;
 * - `update`: the details form saved;
 * - `move` / `resize`: dragged (start, end, resources);
 * - `delete`;
 * - `schedule`: a pending item (`id`) dropped onto the agenda;
 * - `unschedule`: an event dragged back to the pending items.
 * `previous` holds the fields as they were before the change: the route
 * compares it with what it stores under `conflicts: "detect"`, and Undo
 * sends it back.
 */
export interface AgendaChange {
  kind: AgendaChangeKind;
  id?: string;
  tempId?: string;
  patch?: AgendaEventPatch;
  previous?: AgendaEventPatch;
  /** On an occurrence of a recurring event: the day of the occurrence's start. */
  occurrence?: string;
  scope?: AgendaRecurringScope;
}

/** What the block posts to `saveUrl`. */
export interface AgendaSaveRequest {
  /** One change in `immediate` mode, every staged one in `staged` mode. */
  changes: AgendaChange[];
  /** The user confirmed what a `confirm` answer asked, or chose Overwrite on a conflict. */
  force?: boolean;
  /** The block's `conflicts` mode. */
  conflicts: AgendaConflictMode;
  /** The range and view shown, so the route can answer the notices that follow. */
  from: string;
  to: string;
  view: string;
}

/** Why a change was not written. */
export interface AgendaSaveError {
  /** The change, by its place in `changes`. */
  index: number;
  message: BlockText;
  /** `conflict`: the event moved since it was read (`current`); `notFound`: it is gone. */
  code?: "refused" | "conflict" | "notFound";
  current?: AgendaEvent;
}

/** A question the route asks before it writes (a task moved before its predecessor). */
export interface AgendaConfirm {
  title: BlockText;
  message?: BlockText;
  confirmLabel?: BlockText;
}

/** An event the route wrote, with the `tempId` of the change that created it. */
export interface AgendaSavedEvent extends AgendaEvent {
  tempId?: string;
}

/**
 * What `saveUrl` answers. An answered `confirm` writes nothing: the block asks
 * the user and posts the same changes again with `force`, or puts the events
 * back. A change neither answered in `events`/`removed` nor named in `errors`
 * counts as written as sent. The optional lists replace the block's.
 */
export interface AgendaSaveResponse {
  events?: AgendaSavedEvent[];
  /** Ids of events gone (deleted, unscheduled, or removed by the change). */
  removed?: string[];
  errors?: AgendaSaveError[];
  confirm?: AgendaConfirm;
  /** A toast after the save ("Planning published to 43 people"). */
  message?: BlockText;
  unscheduled?: AgendaPendingItem[];
  notices?: AgendaNotice[];
  backgrounds?: AgendaBackground[];
}

/** When a change reaches the server. `staged` keeps them, events drawn at their new place with the old one ghosted, until Save. */
export type AgendaSaveMode = "immediate" | "staged";

/** `detect`: each change carries `previous`; the route answers a conflict when the event moved meanwhile. */
export type AgendaConflictMode = "overwrite" | "detect";

/** Where an event's details open. `panel` is a column inside the agenda, beside the views. */
export type AgendaDetailsContainer = "drawer" | "panel" | "modal" | "popover";

/** What opens an event's details. */
export type AgendaOpenTrigger = "click" | "doubleClick";

/** What creates an event: a click or a double click on an empty slot, or dragging over a range. */
export type AgendaCreateTrigger = "click" | "doubleClick" | "drag";

/** Picking a range of days or times: dragging over it, or a click on its first and its last day. */
export type AgendaRangeSelect = "drag" | "twoClicks";

/** Asks, or applies an edit of an occurrence to it alone or to its series. */
export type AgendaRecurringEdit = "ask" | "occurrence" | "series";

/** Overlapping events side by side (each narrower) or stacked with an offset. */
export type AgendaOverlap = "columns" | "stack";

export interface AgendaCreate {
  /** Defaults to `click` in time grids and `doubleClick` in a `timeline`. */
  trigger?: AgendaCreateTrigger;
  /** A "+ New" button in the toolbar. Defaults to `true`. */
  button?: boolean;
  buttonLabel?: BlockText;
  /** The calendar a new event starts in. Defaults to the first shown. */
  calendarId?: string;
}

/** Event field kinds of the details form. */
export const AGENDA_FIELD_KINDS = [
  "text",
  "longText",
  "number",
  "boolean",
  "date",
  "datetime",
  "time",
  "select",
  "tags",
  "richText",
] as const;

export type AgendaFieldKind = (typeof AGENDA_FIELD_KINDS)[number];

/**
 * The event fields the details form knows without being told. `fields` may
 * list them to order, relabel or hide them; any other id is a field of the
 * event's `data`.
 */
export const AGENDA_BUILT_IN_FIELDS = [
  "title",
  "calendarId",
  "resourceIds",
  "allDay",
  "start",
  "end",
  "location",
  "description",
] as const;

export type AgendaBuiltInField = (typeof AGENDA_BUILT_IN_FIELDS)[number];

/** A choice of a `select` or `tags` field. */
export interface AgendaFieldOption {
  value: string;
  label: BlockText;
  tone?: AgendaTone;
  icon?: string;
}

/** A field of the details form. */
export interface AgendaField {
  /** A built-in field ({@link AGENDA_BUILT_IN_FIELDS}) or a key of the event's `data`. */
  id: string;
  label?: BlockText;
  /** Defaults to the built-in field's, else `text`. */
  kind?: AgendaFieldKind;
  options?: AgendaFieldOption[];
  required?: boolean;
  /** Shown, never edited. */
  readOnly?: boolean;
  /** `false`: left out of the form (a built-in field the agenda does not use). */
  visible?: boolean;
  placeholder?: BlockText;
  hint?: BlockText;
  /** Shown only while another field of the form holds one of the values listed. */
  visibleWhen?: FieldCondition;
}

/**
 * An action on an event, in its details and its right-click menu (Mark as
 * done, Duplicate to next week, Open the record). `{{row.X}}` takes the
 * event's fields (`id`, `title`, `start`, `end`, `calendarId`, `resourceId`,
 * `location`) and its `data`.
 */
export interface AgendaEventAction {
  id: string;
  label: BlockText;
  icon?: string;
  tone?: AgendaTone;
  target: ActionTarget;
  /** Offered only on the events whose field holds one of the values listed. */
  visibleWhen?: FieldCondition;
}

/** An event action as the block receives it, its target serialized. */
export interface AgendaEventActionSerialized extends Omit<
  AgendaEventAction,
  "target"
> {
  target: ActionTargetSerialized;
}

/**
 * A button of the toolbar (Publish, Apply the template week). `{{row.from}}`,
 * `{{row.to}}` and `{{row.view}}` take the range and view shown.
 */
export interface AgendaToolbarAction {
  id: string;
  label: BlockText;
  icon?: string;
  tone?: AgendaTone;
  target: ActionTarget;
}

/** A toolbar action as the block receives it, its target serialized. */
export interface AgendaToolbarActionSerialized extends Omit<
  AgendaToolbarAction,
  "target"
> {
  target: ActionTargetSerialized;
}

/** The parts of the toolbar. Each defaults to `true` but `datePicker`, `refresh` and `exportIcs`. */
export interface AgendaToolbar {
  title?: boolean;
  today?: boolean;
  navigation?: boolean;
  /** Hidden when the block offers one view. */
  viewSwitcher?: boolean;
  /** A click on the period opens a calendar to jump to a day. */
  datePicker?: boolean;
  refresh?: boolean;
  /** Downloads the events shown as an `.ics` file. */
  exportIcs?: boolean;
}

/** The sections of the sidebar, in the order listed. */
export type AgendaSidebarSection =
  | "miniCalendar"
  | "calendars"
  | "resources"
  | "unscheduled"
  | "notices"
  | "upcoming"
  | "tip";

/**
 * A column beside the views, on the left or the right. In a narrow container
 * (below `responsive.compactBelow`) it folds into a toolbar button opening it
 * over the agenda.
 */
export interface AgendaSidebar {
  /** Defaults to `left`. */
  position?: "left" | "right";
  /** Pixels. Defaults to 264. */
  width?: number;
  /** A button folds it away. Defaults to `true`. */
  collapsible?: boolean;
  /** Starts folded. */
  collapsed?: boolean;
  /** Defaults to the sections the options feed: mini calendar, calendars, unscheduled, notices. */
  sections?: AgendaSidebarSection[];
  /** The `tip` section's text ("Drag an event to move it"). */
  tip?: BlockText;
}

/** The legend of the calendars: in the sidebar (with a `calendars` section) or above the views. */
export interface AgendaLegend {
  /** Defaults to `sidebar` when the sidebar lists `calendars`, else `toolbar`. */
  position?: "sidebar" | "toolbar" | "bottom";
  /** A click shows or hides a calendar's events. Defaults to `true`. */
  toggles?: boolean;
  /** The number of events shown per calendar. Defaults to `true`. */
  counts?: boolean;
  title?: BlockText;
  /** Hidden calendars are left out by the route (`calendars` parameter), not only on screen. */
  serverFilter?: boolean;
}

/** The pending items of the sidebar's `unscheduled` section. */
export interface AgendaUnscheduled {
  title?: BlockText;
  /** A search over the items. */
  search?: boolean;
  /** An event dragged onto the section goes back to the pending items (`unschedule`). Defaults to `true`. */
  acceptDrop?: boolean;
  emptyLabel?: BlockText;
}

/** A filter of the toolbar over one field of the events. */
export interface AgendaFacet {
  id: string;
  label: BlockText;
  /** An event field (`calendarId`, `resourceIds`, `location`) or a key of its `data`. */
  field: string;
  options: AgendaFieldOption[];
  multiple?: boolean;
}

/** Limits on what a drag may do; a drop that breaks one goes back with a hint. */
export interface AgendaConstraints {
  /** Only within `businessHours`. */
  withinBusinessHours?: boolean;
  /** `false`: no event may overlap another one of the same resource (or of the agenda, without resources). */
  allowOverlap?: boolean;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
}

/** What an event shows, beyond its title. Each defaults to `true` but `resource` and `description`. */
export interface AgendaEventContent {
  time?: boolean;
  subtitle?: boolean;
  location?: boolean;
  icon?: boolean;
  badges?: boolean;
  avatar?: boolean;
  resource?: boolean;
  description?: boolean;
}

/** The details of an event (drawer, panel, modal or popover). */
export interface AgendaDetails {
  /** Defaults to `drawer`. In a narrow container `panel` opens as a drawer. */
  container?: AgendaDetailsContainer;
  /** Defaults to `click`. */
  openOn?: AgendaOpenTrigger;
  /** Opens the form at once on an editable event, instead of the read view with Edit. */
  editDirectly?: boolean;
  /** Drawer width, as `useDrawer` takes it. */
  size?: "sm" | "md" | "lg";
  /** Deep link: the open event's id in the page URL, reopened on load. Defaults to `true`. */
  deepLink?: boolean;
}

/** How the agenda adapts to a narrow container (a grid column, a modal, a phone). */
export interface AgendaResponsive {
  /** Container width in pixels under which the agenda is compact. Defaults to 640. */
  compactBelow?: number;
  /**
   * The view a compact agenda switches to from a time grid wider than a day
   * (`week`, `days`, `resources`). Defaults to `day`; `false` keeps the view
   * and scrolls it sideways.
   */
  compactView?: string | false;
}

export interface FullAgendaProps extends BaseComponentProps {
  title?: BlockText;
  description?: BlockText;

  /** Where events are read from, answering {@link AgendaData}. Takes `{{params.X}}` and `{{query.X}}`. */
  fetchUrl?: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  /** Reads `fetchUrl` again on each event of these topics. */
  realtimeTopic?: string | string[];
  /** Events given in the options, for an agenda without a route. */
  staticData?: AgendaData;
  /**
   * Id of a `PeriodSelector` of the page: the agenda shows the period picked
   * there, and its ‹ › and Today move that selector.
   */
  periodScope?: string;

  /** Where changes are written, receiving {@link AgendaSaveRequest}. No `saveUrl`, no editing. */
  saveUrl?: string;
  /** Defaults to POST. */
  saveUrlMethod?: EnumOption<HttpMethod>;

  /** Defaults to `["month", "week", "day", "list"]`; strings are views of that type. */
  views?: (AgendaViewType | AgendaView)[];
  /** A view id. Defaults to the first view. */
  initialView?: string;
  /** `today` or a day (`YYYY-MM-DD`). Defaults to `today`. */
  initialDate?: string;
  /** Navigation stops at these days (inclusive). */
  minDate?: string;
  maxDate?: string;
  /** 0 Sunday, 1 Monday, 6 Saturday. Defaults to the reader's regional preference. */
  weekStartsOn?: 0 | 1 | 6;
  /** Days of the week left out of every view (0 Sunday … 6 Saturday): `[0, 6]` for a working week. */
  hiddenDays?: number[];
  /** An IANA zone (`Europe/Brussels`). Defaults to the reader's. */
  timeZone?: string;

  calendars?: AgendaCalendar[];
  resources?: AgendaResource[];
  slots?: AgendaSlot[];
  businessHours?: AgendaBusinessHours[];

  /** First hour of time grids. Defaults to `00:00`. */
  dayStart?: string;
  /** Last hour of time grids. Defaults to `24:00`. */
  dayEnd?: string;
  /** Grid lines every N minutes. Defaults to 30. */
  slotMinutes?: number;
  /** Drags snap to N minutes. Defaults to 15. */
  snapMinutes?: number;
  /** Pixels per hour in time grids. Defaults to 48. */
  hourHeight?: number;
  /** Where time grids open scrolled to. Defaults to `08:00`, or `dayStart` when later. */
  scrollTime?: string;
  /** The line of the current time. Defaults to `true`. */
  nowIndicator?: boolean;
  /** The all-day row above time grids. Defaults to `true`. */
  allDayRow?: boolean;
  /** Week numbers in `month`, `week` and the mini calendar. */
  weekNumbers?: boolean;
  /** Defaults to `columns`. */
  overlap?: AgendaOverlap;
  /** `month`: chips per day before "+N more". Defaults to 3. */
  maxEventsPerDay?: number;
  /** Pixels of the resource names column of a `timeline`. Defaults to 200. */
  resourceAreaWidth?: number;
  /** Pixels under which a day, slot or resource column does not shrink: the view scrolls sideways. Defaults to 72. */
  columnMinWidth?: number;
  /** The length of an event created with a click or dropped without one. Defaults to 60. */
  defaultDurationMinutes?: number;
  eventContent?: AgendaEventContent;
  /** An info-bubble on hover with the time, place and description. Defaults to `true`. */
  tooltips?: boolean;

  /** Defaults to `true` when `saveUrl` is set. */
  editable?: boolean;
  /** Dragging an event moves it. Defaults to `editable`. */
  dragMove?: boolean;
  /** Dragging an event's edge changes its length. Defaults to `editable`. */
  dragResize?: boolean;
  /** Alt while dropping copies the event instead of moving it. */
  copyOnAltDrag?: boolean;
  /** Creating events from the agenda. `true` for the defaults; `false` none. Defaults to `editable`. */
  create?: boolean | AgendaCreate;
  /**
   * Picking a range (drag over times, two clicks on days of a `year` view)
   * opens `selectAction`, or the form of a new event on that range.
   */
  rangeSelect?: AgendaRangeSelect;
  /** What a picked range opens; `{{row.from}}`, `{{row.to}}`, `{{row.resourceId}}`, `{{row.allDay}}`. */
  selectAction?: ActionTarget;
  constraints?: AgendaConstraints;
  /** Defaults to `immediate`. */
  saveMode?: AgendaSaveMode;
  /** `staged`: lists the changes, before → after, before writing them. */
  review?: boolean;
  /** Seconds an Undo stays offered after a change is written. Defaults to 6; 0 none. */
  undoSeconds?: number;
  /** Defaults to `overwrite`. */
  conflicts?: AgendaConflictMode;
  /** Defaults to `ask`. */
  recurringEdit?: AgendaRecurringEdit;

  /** The fields of the details form. Defaults to the built-in fields the agenda uses. */
  fields?: AgendaField[];
  details?: AgendaDetails;
  /** Opens this target instead of the built-in details on a click on an event. Tokens as {@link AgendaEventAction}. */
  eventAction?: ActionTarget;
  eventActions?: AgendaEventAction[];
  toolbarActions?: AgendaToolbarAction[];

  /** Defaults to every part (see {@link AgendaToolbar}); `false` hides the toolbar. */
  toolbar?: boolean | AgendaToolbar;
  sidebar?: boolean | AgendaSidebar;
  legend?: boolean | AgendaLegend;
  unscheduled?: AgendaUnscheduled;
  /** A search over titles, subtitles, places and descriptions, sent as `q`. */
  search?: boolean;
  facets?: AgendaFacet[];
  /** Keeps view, day, search, facets, hidden calendars and the open event in the page URL. Defaults to `true`. */
  urlState?: boolean;
  /** Keyboard shortcuts (T today, ← → move, M W D L Y views, N new, Del delete). Defaults to `true`. */
  shortcuts?: boolean;

  /**
   * `fill` takes the height left to it: the last block of a `fillHeight`
   * page, or a container with a height (a drawer, a modal body). Otherwise a
   * CSS length. Defaults to `fill` on a `fillHeight` page, else `44rem`.
   */
  height?: string;
  responsive?: AgendaResponsive;
  emptyLabel?: BlockText;
  density?: "compact" | "comfortable";
}

/** The options as the block receives them, its targets serialized. */
export interface FullAgendaPropsSerialized extends Omit<
  FullAgendaProps,
  "selectAction" | "eventAction" | "eventActions" | "toolbarActions"
> {
  selectAction?: ActionTargetSerialized;
  eventAction?: ActionTargetSerialized;
  eventActions?: AgendaEventActionSerialized[];
  toolbarActions?: AgendaToolbarActionSerialized[];
}
