// Mirror of the FullAgenda block contract of
// @antelopejs/interface-dms/base/full-agenda-types. The frontend layer never
// imports the interface package: keep both in step.

import type { BlockText } from "#dms-core/app/types/composed-text";
import type { ActionTarget } from "../composables/table-view/types/action-target";
import type {
  AgendaBusinessHours,
  AgendaCalendar,
  AgendaConflictMode,
  AgendaData,
  AgendaDetailsContainer,
  AgendaResource,
  AgendaSaveMode,
  AgendaSlot,
  AgendaTone,
  AgendaView,
  AgendaViewType,
} from "./full-agenda-model";

export * from "./full-agenda-model";

/** Another field of the same form holds one of the values `in` lists. */
export interface AgendaFieldCondition {
  field: string;
  in: readonly unknown[];
}

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
  visibleWhen?: AgendaFieldCondition;
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
  visibleWhen?: AgendaFieldCondition;
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

/** The options of a `FullAgenda` block, as the block receives them. */
export interface FullAgendaOptions {
  title?: BlockText;
  description?: BlockText;

  /** Where events are read from, answering {@link AgendaData}. Takes `{{params.X}}` and `{{query.X}}`. */
  fetchUrl?: string;
  fetchUrlMethod?: string;
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
  saveUrlMethod?: string;

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
