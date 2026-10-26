// Mirror of the FullAgenda data model of
// @antelopejs/interface-dms/base/full-agenda-model. The frontend layer never
// imports the interface package: keep both in step.

import type { BlockText } from "#dms-core/app/types/composed-text";
import type { Tone } from "./tone";

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
  /** The zone the series keeps its wall clock and its days in. Defaults to the block's `timeZone`, else the reader's. */
  timeZone?: string;
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

/** The fields a change sets on an event. Absent: kept; `null`: cleared (also a `data` key set to `null`). */
export interface AgendaEventPatch {
  title?: string;
  start?: string;
  end?: string | null;
  allDay?: boolean;
  calendarId?: string | null;
  resourceIds?: string[];
  location?: string | null;
  description?: string | null;
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
  /** The user confirmed what a `confirm` answer asked: the route writes without asking again. */
  force?: boolean;
  /** The user chose Overwrite on a conflict; `confirm` questions are still asked unless `force`. */
  overwrite?: boolean;
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

/** Where an event's details open: a drawer on the right, a modal, or a popover on the event. */
export type AgendaDetailsContainer = "drawer" | "modal" | "popover";
