// The shapes the parts of a FullAgenda share: the occurrences the views draw,
// the drag the views feed, and the context `useAgenda` provides. Types only.

import type { ComputedRef, Ref } from "vue";
import type { BlockText } from "#dms-core/app/types/composed-text";
import type {
  AgendaBackground,
  AgendaBusinessHours,
  AgendaCalendar,
  AgendaCalendarGroup,
  AgendaChange,
  AgendaDetailsContainer,
  AgendaEvent,
  AgendaEventAction,
  AgendaField,
  AgendaNotice,
  AgendaPendingItem,
  AgendaResource,
  AgendaResourceGroup,
  AgendaSlot,
  AgendaToolbarAction,
  AgendaView,
  AgendaViewType,
  FullAgendaOptions,
} from "../../../types/full-agenda";

/** A day of the zone the agenda draws in, `YYYY-MM-DD`. */
export type AgendaDayKey = string;

/** A day of the range shown. */
export interface AgendaDay {
  key: AgendaDayKey;
  /** Epoch ms of the day's midnight in the agenda's zone. */
  start: number;
  /** Epoch ms of the next day's midnight (23 or 25 h later on a DST change). */
  end: number;
  /** 0 Sunday … 6 Saturday. */
  weekday: number;
  /** 1–31. */
  dayOfMonth: number;
  /** 0–11. */
  month: number;
  year: number;
  isToday: boolean;
  /** `month` view: the day belongs to the month shown. */
  inMonth: boolean;
  /** ISO week number. */
  week: number;
}

/** A view with its defaults applied. */
export interface ResolvedAgendaView
  extends Required<
    Pick<
      AgendaView,
      "id" | "type" | "hiddenDays" | "dayStart" | "dayEnd" | "slotMinutes"
    >
  > {
  label: string;
  duration: number;
  scale: NonNullable<AgendaView["scale"]>;
  resourceLayout: NonNullable<AgendaView["resourceLayout"]>;
  yearLayout: NonNullable<AgendaView["yearLayout"]>;
}

/** The range a view shows around its anchor day. */
export interface AgendaRange {
  /** First day shown. */
  from: AgendaDayKey;
  /** Last day shown, inclusive. */
  to: AgendaDayKey;
  /** The days shown, hidden days left out (a `month` view keeps whole weeks). */
  days: AgendaDay[];
  /** Epoch ms bounds: start of `from`, end of `to`. */
  start: number;
  end: number;
}

/** The CSS an event is painted with, from its colour or its calendar's. */
export interface AgendaPaint {
  /** Tint behind the text. */
  background: string;
  /** The solid edge / the fill of a `solid` event. */
  bar: string;
  /** Text on the tint. */
  text: string;
  /** Text on the solid fill. */
  onBar: string;
}

/** Where a change of an occurrence stands. */
export type AgendaOccurrenceState = "staged" | "saving" | "error" | "conflict";

/**
 * An event as the views draw it: normalized (end filled in, colour and
 * permissions resolved), a recurring event expanded into one occurrence per
 * repetition, staged and in-flight changes applied.
 */
export interface AgendaOccurrence {
  /** The event id, or `<event id>@<day>` for an occurrence of a recurring event. */
  key: string;
  /** The event as read (with staged changes applied). */
  event: AgendaEvent;
  allDay: boolean;
  /** Epoch ms. All-day: midnight of the first day; end: midnight after the last day. */
  start: number;
  end: number;
  startDay: AgendaDayKey;
  /** Last day it covers, inclusive (a timed event ending at midnight ends the day before). */
  endDay: AgendaDayKey;
  /** Minutes from midnight in the agenda's zone, of `start` and `end`. */
  startMinutes: number;
  endMinutes: number;
  calendar?: AgendaCalendar;
  resourceIds: string[];
  paint: AgendaPaint;
  canMove: boolean;
  canResize: boolean;
  canDelete: boolean;
  /** Where a click opens it; `false` nothing. */
  details: AgendaDetailsContainer | false;
  /** Set while it has a change not written, being written, or refused. */
  state?: AgendaOccurrenceState;
  /** `staged`: where it was before the change, drawn as a ghost. */
  ghost?: Pick<AgendaOccurrence, "start" | "end" | "allDay" | "resourceIds">;
  /** The refusal or conflict message. */
  stateMessage?: string;
  /** For an occurrence of a recurring event. */
  recurring?: AgendaRecurringRef;
}

export interface AgendaRecurringRef {
  seriesId: string;
  /** Day of the occurrence's start. */
  occurrence: AgendaDayKey;
}

/** Where the pointer is over a view, snapped. */
export interface AgendaDropTarget {
  day: AgendaDayKey;
  /** Minutes from midnight; absent over a day cell (month, year, all-day row, timeline by day). */
  minutes?: number;
  resourceId?: string;
  /** Over the all-day row or a day cell. */
  allDay?: boolean;
  /** Over a named slot (timeline by slot). */
  slotIndex?: number;
  /** Over the sidebar's pending items (unschedule). */
  pending?: boolean;
  /**
   * Over the time grid's all-day row: a timed event dropped here becomes an
   * all-day one. Over any other day alone (a month or year cell, a timeline
   * by day) an event keeps its kind and its time of day.
   */
  asAllDay?: boolean;
  /**
   * Over the row of the events planned on no resource (a timeline's "No
   * resource" row): a drop there clears the event's resources.
   */
  unassigned?: true;
  /**
   * The instant under the pointer, epoch ms, where the view knows it (a
   * timeline by hour). It tells apart the two 02:30 of a fall-back day,
   * which `day` + `minutes` cannot; snapped like `minutes` on a click.
   */
  instant?: number;
}

/** What a view reports a point is over. Each view registers one surface per scrolling area. */
export interface AgendaDropSurface {
  el: HTMLElement;
  /**
   * Where the pointer is. Report the raw time under it (`minutes` need not
   * be snapped: the drag engine snaps, and keeps the grab point of a move).
   */
  resolve: (clientX: number, clientY: number) => AgendaDropTarget | null;
  /** The element that scrolls near its edges while dragging. Defaults to `el` or its first scrolling ancestor. */
  scroller?: HTMLElement;
  /**
   * The part of the scroller where the surface shows, in client pixels (the
   * time grid's body under its sticky header, beside its sticky gutter):
   * dragging near its edges scrolls. Defaults to the scroller's box.
   */
  viewport?: () => AgendaSurfaceViewport;
}

/** A visible box, in client pixels. */
export interface AgendaSurfaceViewport {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export type AgendaDragKind =
  | "move"
  | "resizeStart"
  | "resizeEnd"
  | "create"
  | "select"
  | "external";

/** The placement a drag would give, drawn by the views while dragging. */
export interface AgendaDragPreview {
  kind: AgendaDragKind;
  /** The occurrence moved or resized. */
  occurrenceKey?: string;
  /** The pending item dragged in. */
  itemId?: string;
  start: number;
  end: number;
  allDay: boolean;
  resourceIds: string[];
  /** A drop here is refused (constraints, allowed resources, read-only resource). */
  valid: boolean;
  /** Why, shown next to the preview. */
  reason?: string;
  /** Alt held with `copyOnAltDrag`. */
  copy: boolean;
  /** Over the pending items: the drop unschedules. */
  toPending: boolean;
}

/** The pointer drags of the agenda (move, resize, create, range select, pending items). */
export interface AgendaDragController {
  preview: Ref<AgendaDragPreview | null>;
  /** A drag is past its threshold (a click is not a drag). */
  active: ComputedRef<boolean>;
  registerSurface: (surface: AgendaDropSurface) => () => void;
  /** pointerdown on an event's body (`move`) or edge (`resizeStart` / `resizeEnd`). */
  startOccurrence: (
    event: PointerEvent,
    occurrence: AgendaOccurrence,
    kind: "move" | "resizeStart" | "resizeEnd",
  ) => void;
  /** pointerdown on an empty spot: creates (`create.trigger: "drag"`) or selects a range. */
  startEmpty: (event: PointerEvent, target: AgendaDropTarget) => void;
  /** pointerdown on a pending item of the sidebar. */
  startPending: (event: PointerEvent, item: AgendaPendingItem) => void;
  cancel: () => void;
  /**
   * The keyboard alternative on a focused event: Alt+↑/↓ moves it by the
   * snap, Alt+←/→ by a day, Alt+Shift+↑/↓ changes its end. True when the
   * key was one of them (the caller prevents its default).
   */
  nudge: (event: KeyboardEvent, occurrence: AgendaOccurrence) => boolean;
  /** The last drag result or refusal, for a polite live region of the block. */
  announcement: Ref<string>;
  /**
   * The occurrence being moved or resized, from the threshold to the drop:
   * its chip dims. Changes twice per drag, so chips read it, not `preview`.
   */
  draggingKey: ComputedRef<string | null>;
}

/** A pending range of a `twoClicks` selection: the first day picked. */
export interface AgendaRangeAnchor {
  day: AgendaDayKey;
  resourceId?: string;
}

/** A placement to create an event on. */
export interface AgendaPlacement {
  start: number;
  end: number;
  allDay: boolean;
  resourceIds: string[];
}

/** What the details show and edit. */
export interface AgendaDetailsState {
  /** The occurrence open, `null` for a new event. */
  occurrence: AgendaOccurrence | null;
  /** A new event's placement. */
  placement?: AgendaPlacement;
  mode: "view" | "edit";
  container: AgendaDetailsContainer;
}

/** Formatting in the agenda's zone and the reader's locale. */
export interface AgendaFormat {
  locale: ComputedRef<string>;
  /** "09:30" / "9:30 AM". */
  time: (epochMs: number) => string;
  /** "09:30 – 10:15", or the start alone when `end` is absent. */
  timeRange: (start: number, end?: number) => string;
  /** A day key in the given style ("Mon 28", "Monday 28 September 2026"). */
  day: (
    key: AgendaDayKey,
    style: "short" | "medium" | "long" | "weekday" | "weekdayShort",
  ) => string;
  /** "September 2026". */
  month: (year: number, month: number) => string;
  /** The toolbar's period ("28 Sep – 4 Oct 2026"). */
  title: ComputedRef<string>;
  /** "1 h 30". */
  duration: (minutes: number) => string;
}

/** The resolved options: every default applied. */
export interface ResolvedAgendaOptions {
  raw: FullAgendaOptions;
  editable: boolean;
  dragMove: boolean;
  dragResize: boolean;
  canCreate: boolean;
  createTrigger: "click" | "doubleClick" | "drag";
  dayStartMinutes: number;
  dayEndMinutes: number;
  slotMinutes: number;
  snapMinutes: number;
  hourHeight: number;
  scrollMinutes: number;
  defaultDurationMinutes: number;
  maxEventsPerDay: number;
  weekStartsOn: 0 | 1 | 6;
  hiddenDays: number[];
  timeZone: string;
  slots: AgendaSlot[];
  businessHours: AgendaBusinessHours[];
  fields: AgendaField[];
  eventActions: AgendaEventAction[];
  toolbarActions: AgendaToolbarAction[];
  urlState: boolean;
  shortcuts: boolean;
  compactBelow: number;
}

/** What `useAgenda` provides to every part of the block (`useAgendaContext()`). */
export interface AgendaContext {
  componentId: string;
  pageId: string;
  options: ComputedRef<ResolvedAgendaOptions>;
  format: AgendaFormat;

  /** Navigation. */
  views: ComputedRef<ResolvedAgendaView[]>;
  /** The view drawn (the compact one in a narrow container). */
  view: ComputedRef<ResolvedAgendaView>;
  /** The view picked in the switcher. */
  pickedViewId: Ref<string>;
  setView: (id: string) => void;
  /** The day the range is built around. */
  anchor: Ref<AgendaDayKey>;
  range: ComputedRef<AgendaRange>;
  today: ComputedRef<AgendaDayKey>;
  go: (step: 1 | -1) => void;
  goToday: () => void;
  goTo: (day: AgendaDayKey, viewType?: AgendaViewType) => void;
  canGoPrevious: ComputedRef<boolean>;
  canGoNext: ComputedRef<boolean>;

  /** Layout. */
  rootEl: Ref<HTMLElement | null>;
  width: Ref<number>;
  compact: ComputedRef<boolean>;
  sidebarOpen: Ref<boolean>;

  /** Data. */
  loading: ComputedRef<boolean>;
  error: ComputedRef<unknown>;
  refresh: () => Promise<void>;
  calendars: ComputedRef<AgendaCalendar[]>;
  calendarGroups: ComputedRef<AgendaCalendarGroup[]>;
  /** Every resource, filters applied, in order. */
  resources: ComputedRef<AgendaResource[]>;
  resourceGroups: ComputedRef<AgendaResourceGroup[]>;
  foldedGroups: Ref<Set<string>>;
  toggleGroup: (groupId: string) => void;
  backgrounds: ComputedRef<AgendaBackground[]>;
  pending: ComputedRef<AgendaPendingItem[]>;
  notices: ComputedRef<AgendaNotice[]>;
  /** The occurrences in range, after the legend, search and facets. */
  occurrences: ComputedRef<AgendaOccurrence[]>;
  /** Occurrences of the range per calendar id, before the legend hides any. */
  calendarCounts: ComputedRef<Record<string, number>>;
  hiddenCalendars: Ref<Set<string>>;
  toggleCalendar: (calendarId: string) => void;
  search: Ref<string>;
  facetValues: Ref<Record<string, string[]>>;
  /** Business hours of a resource (or the agenda's) on a weekday; empty: closed. */
  hoursOn: (weekday: number, resourceId?: string) => AgendaBusinessHours[];

  /** Editing. */
  drag: AgendaDragController;
  /**
   * Places a change (optimistic; staged or written at once). Resolves
   * `false` when it was not placed (editing off, the scope prompt abandoned)
   * or the route refused it.
   */
  apply: (
    change: AgendaChange,
    occurrence?: AgendaOccurrence,
  ) => Promise<boolean>;
  /** The staged changes (`saveMode: "staged"`). */
  staged: ComputedRef<AgendaChange[]>;
  saving: ComputedRef<boolean>;
  saveStaged: () => Promise<void>;
  discardStaged: () => void;
  /** The first day of a `twoClicks` range while the second is awaited. */
  rangeAnchor: Ref<AgendaRangeAnchor | null>;
  /** A click on an empty spot (create with `click`, a `twoClicks` range step). */
  clickEmpty: (target: AgendaDropTarget, double: boolean) => void;
  /** Opens the form of a new event on a placement (or `selectAction`). */
  createAt: (placement: AgendaPlacement) => void;
  remove: (occurrence: AgendaOccurrence) => Promise<void>;

  /** Details. */
  details: Ref<AgendaDetailsState | null>;
  open: (occurrence: AgendaOccurrence) => void;
  closeDetails: () => void;
  runEventAction: (
    action: AgendaEventAction,
    occurrence: AgendaOccurrence,
  ) => void;
  runToolbarAction: (action: AgendaToolbarAction) => void;
  /** Keyboard focus among occurrences (arrows, Enter). */
  focusedKey: Ref<string | null>;

  /** Added by the engine (dev A). */
  /** A block text (`BlockText`) as a string, composed and translated. */
  text: (value: BlockText | undefined) => string;
  /** The current instant, moved every minute (the now line, "upcoming"). */
  now: Ref<number>;
  /** Something was read (or given): an empty agenda is not one still loading. */
  hasData: ComputedRef<boolean>;
  /** Editing is on (a `saveUrl`, `editable` not off). */
  editable: ComputedRef<boolean>;
  /** The polite live region's message: save results, a range step, a navigation. */
  liveMessage: Ref<string>;
  announce: (message: string) => void;
  /** "Design standup, Monday 26 October 09:00 to 09:15, calendar Design": a chip's aria-label. */
  describe: (occurrence: AgendaOccurrence) => string;
  /** The toolbar's "+ New": a new event at the next hour of today (or of the range's first day). */
  createNew: () => void;
  /** Downloads the occurrences shown as an `.ics` file. */
  exportIcs: () => void;
  /** The changes not written yet with the event they change (`base`), for the review and the save bar. */
  stagedEdits: ComputedRef<AgendaStagedEdit[]>;
  /** Writes a refused change again (by its `AgendaStagedEdit.key`). */
  retry: (key: string) => Promise<boolean>;
  /** After a conflict: write over the route's version, or take it. */
  resolveConflict: (
    key: string,
    choice: "overwrite" | "discard",
  ) => Promise<unknown>;
  /** How the last write went: "Saving…", then "Saved" for a moment, or "error" until the next write. */
  saveStatus: ComputedRef<"idle" | "saving" | "saved" | "error">;
  /** What the save bar's Save writes: staged and refused changes, conflicts and writes running aside. */
  sendableCount: ComputedRef<number>;
  /**
   * The next occurrences from now, from the data in hand (series expanded
   * ahead, legend, search and facets applied), soonest first. A route that
   * answers only the range shown gives only that range's events.
   */
  upcoming: ComputedRef<AgendaOccurrence[]>;
  /** The occurrences of any days (the mini calendar's month), from the data in hand, filters applied. */
  occurrencesIn: (from: AgendaDayKey, to: AgendaDayKey) => AgendaOccurrence[];
}

/** A change not written yet, as the review lists it. */
export interface AgendaStagedEdit {
  key: string;
  change: AgendaChange;
  status: "staged" | "saving" | "error" | "conflict";
  /** The event before the change (absent for a new one). */
  base?: AgendaEvent;
  message?: string;
  /** After a conflict: the event as the route stores it. */
  current?: AgendaEvent;
}
