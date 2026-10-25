// The views of an agenda with their defaults, the range each shows around
// its anchor day, and the moves of ‹ › Today within `minDate` / `maxDate`.

import type {
  AgendaView,
  AgendaViewType,
  FullAgendaOptions,
} from "../../../types/full-agenda";
import type {
  AgendaDay,
  AgendaDayKey,
  AgendaRange,
  ResolvedAgendaView,
} from "./agendaModel";
import {
  addDays,
  addMonths,
  dayKeyOf,
  dayStartEpoch,
  DAYS_PER_WEEK,
  daysBetween,
  isoWeekOf,
  maxDayKey,
  minDayKey,
  parseDayKey,
  startOfMonth,
  startOfWeek,
  weekdayOf,
} from "./agendaTime";

export const DEFAULT_AGENDA_VIEWS: AgendaViewType[] = [
  "month",
  "week",
  "day",
  "list",
];

/** Days a view spans when it does not say (the duration-led views). */
const DEFAULT_DURATIONS: Record<AgendaViewType, number> = {
  day: 1,
  week: 7,
  days: 3,
  month: 42,
  year: 366,
  list: 30,
  resources: 1,
  timeline: 7,
};

/** Views whose length is `duration`: ‹ › move by it. */
const DURATION_VIEWS: ReadonlySet<AgendaViewType> = new Set([
  "days",
  "list",
  "resources",
  "timeline",
]);

/** Time grids wider than a day, which a compact agenda swaps for one day. */
const WIDE_GRID_VIEWS: ReadonlySet<AgendaViewType> = new Set([
  "week",
  "days",
  "resources",
]);

const MONTH_WEEKS = 6;
const MAX_DURATION = 366;
const DEFAULT_DAY_START = "00:00";
const DEFAULT_DAY_END = "24:00";
const DEFAULT_SLOT_MINUTES = 30;
const COMPACT_SUFFIX = ":compact";

/** The block options a view falls back on. */
export type AgendaViewDefaults = Pick<
  FullAgendaOptions,
  "hiddenDays" | "dayStart" | "dayEnd" | "slotMinutes" | "slots"
>;

/**
 * The views offered, each with the block's options under its own and the
 * type's defaults under both. `labelOf` names a view that gives no label.
 */
export function resolveAgendaViews(
  views: FullAgendaOptions["views"],
  defaults: AgendaViewDefaults,
  labelOf: (view: AgendaView) => string,
): ResolvedAgendaView[] {
  const list = views?.length ? views : DEFAULT_AGENDA_VIEWS;
  const seen = new Set<string>();
  const resolved: ResolvedAgendaView[] = [];
  for (const entry of list) {
    const view = typeof entry === "string" ? { type: entry } : entry;
    const result = resolveAgendaView(view, defaults, labelOf);
    if (seen.has(result.id)) continue;
    seen.add(result.id);
    resolved.push(result);
  }
  return resolved;
}

function resolveAgendaView(
  view: AgendaView,
  defaults: AgendaViewDefaults,
  labelOf: (view: AgendaView) => string,
): ResolvedAgendaView {
  const duration = Math.min(
    Math.max(Math.round(view.duration ?? DEFAULT_DURATIONS[view.type]), 1),
    MAX_DURATION,
  );
  const fixedDuration = DURATION_VIEWS.has(view.type)
    ? duration
    : DEFAULT_DURATIONS[view.type];
  return {
    id: view.id ?? view.type,
    type: view.type,
    label: labelOf(view),
    duration: fixedDuration,
    hiddenDays: view.hiddenDays ?? defaults.hiddenDays ?? [],
    dayStart: view.dayStart ?? defaults.dayStart ?? DEFAULT_DAY_START,
    dayEnd: view.dayEnd ?? defaults.dayEnd ?? DEFAULT_DAY_END,
    slotMinutes:
      view.slotMinutes ?? defaults.slotMinutes ?? DEFAULT_SLOT_MINUTES,
    scale: view.scale ?? defaultScale(defaults, fixedDuration),
    resourceLayout: view.resourceLayout ?? "resourcesFirst",
    yearLayout: view.yearLayout ?? "planner",
  };
}

function defaultScale(
  defaults: AgendaViewDefaults,
  duration: number,
): ResolvedAgendaView["scale"] {
  if (defaults.slots?.length) return "slot";
  return duration === 1 ? "hour" : "day";
}

/**
 * The view drawn: the one picked, or in a compact agenda, for a time grid
 * wider than a day, `compactView` (a view id; `day` by default). A wide
 * `resources` view keeps its columns over one day; a day view the block does
 * not offer is the picked one narrowed to a day. `false` keeps the view.
 */
export function compactAgendaView(
  picked: ResolvedAgendaView,
  views: ResolvedAgendaView[],
  compactView: string | false | undefined,
): ResolvedAgendaView {
  if (compactView === false || !WIDE_GRID_VIEWS.has(picked.type)) return picked;
  if (picked.type === "resources" && picked.duration === 1) return picked;
  if (compactView) {
    const chosen = views.find((view) => view.id === compactView);
    if (chosen) return chosen;
  }
  if (picked.type === "resources")
    return { ...picked, id: `${picked.id}${COMPACT_SUFFIX}`, duration: 1 };
  const day = views.find((view) => view.type === "day");
  if (day) return day;
  return {
    ...picked,
    id: `${picked.id}${COMPACT_SUFFIX}`,
    type: "day",
    duration: 1,
  };
}

/** What a range is built with besides the view and its anchor. */
export interface AgendaRangeSettings {
  weekStartsOn: number;
  timeZone: string;
  today: AgendaDayKey;
  /**
   * A duration-led view starts on its anchor even over whole weeks: a
   * period picked in a selector is shown from its own first day.
   */
  exactStart?: boolean;
}

/** Whether a duration-led view starts on a week's first day: a whole number of weeks. */
const startsOnWeek = (view: ResolvedAgendaView) =>
  DURATION_VIEWS.has(view.type) && view.duration % DAYS_PER_WEEK === 0;

/** The first day and the number of days a view covers around its anchor. */
export function viewSpan(
  view: ResolvedAgendaView,
  anchor: AgendaDayKey,
  weekStartsOn: number,
  exactStart = false,
): { first: AgendaDayKey; count: number } {
  if (view.type === "week")
    return { first: startOfWeek(anchor, weekStartsOn), count: DAYS_PER_WEEK };
  if (view.type === "month")
    return {
      first: startOfWeek(startOfMonth(anchor), weekStartsOn),
      count: MONTH_WEEKS * DAYS_PER_WEEK,
    };
  if (view.type === "year") {
    const { year } = parseDayKey(anchor);
    const first = dayKeyOf(year, 1, 1);
    return { first, count: daysBetween(first, dayKeyOf(year + 1, 1, 1)) };
  }
  if (view.type === "day") return { first: anchor, count: 1 };
  const first =
    startsOnWeek(view) && !exactStart
      ? startOfWeek(anchor, weekStartsOn)
      : anchor;
  return { first, count: view.duration };
}

/** A day of a range: its bounds in the zone and its calendar facts. */
export function buildAgendaDay(
  key: AgendaDayKey,
  settings: AgendaRangeSettings,
  shownMonth?: number,
): AgendaDay {
  const { year, month, day } = parseDayKey(key);
  return {
    key,
    start: dayStartEpoch(key, settings.timeZone),
    end: dayStartEpoch(addDays(key, 1), settings.timeZone),
    weekday: weekdayOf(key),
    dayOfMonth: day,
    month: month - 1,
    year,
    isToday: key === settings.today,
    inMonth: shownMonth === undefined || shownMonth === month,
    week: isoWeekOf(key),
  };
}

/**
 * The range a view shows around `anchor`: its days, hidden days left out (a
 * `year` view keeps every day: its planner is a cell per day of the month),
 * and its bounds in the zone. A view whose days are all hidden shows them.
 */
export function buildAgendaRange(
  view: ResolvedAgendaView,
  anchor: AgendaDayKey,
  settings: AgendaRangeSettings,
): AgendaRange {
  const { first, count } = viewSpan(
    view,
    anchor,
    settings.weekStartsOn,
    settings.exactStart,
  );
  const shownMonth =
    view.type === "month" ? parseDayKey(anchor).month : undefined;
  const hidden = new Set(view.type === "year" ? [] : view.hiddenDays);
  const keys: AgendaDayKey[] = [];
  for (let index = 0; index < count; index++) keys.push(addDays(first, index));
  const shown = keys.filter((key) => !hidden.has(weekdayOf(key)));
  const days = (shown.length ? shown : keys).map((key) =>
    buildAgendaDay(key, settings, shownMonth),
  );
  const firstDay = days[0]!;
  const lastDay = days.at(-1)!;
  return {
    from: firstDay.key,
    to: lastDay.key,
    days,
    start: firstDay.start,
    end: lastDay.end,
  };
}

/** The next day from `key` (backwards with `step` -1) that the view shows. */
export function visibleDay(
  key: AgendaDayKey,
  hiddenDays: number[],
  step: 1 | -1 = 1,
): AgendaDayKey {
  if (hiddenDays.length >= DAYS_PER_WEEK) return key;
  const hidden = new Set(hiddenDays);
  let day = key;
  while (hidden.has(weekdayOf(day))) day = addDays(day, step);
  return day;
}

/** The anchor ‹ (`-1`) or › (`1`) moves to. */
export function stepAnchor(
  view: ResolvedAgendaView,
  anchor: AgendaDayKey,
  step: 1 | -1,
): AgendaDayKey {
  if (view.type === "month") return addMonths(anchor, step);
  if (view.type === "year") return addMonths(anchor, step * 12);
  if (view.type === "week") return addDays(anchor, step * DAYS_PER_WEEK);
  const next = addDays(anchor, step * view.duration);
  return startsOnShownDay(view)
    ? visibleDay(next, view.hiddenDays, step)
    : next;
}

/**
 * Whether a view shorter than a week starts on a day it shows: a one-day
 * `day`, `resources` or `timeline` never lands on a hidden Saturday, where
 * it would show nothing of its own.
 */
export function startsOnShownDay(view: ResolvedAgendaView): boolean {
  if (view.type === "day") return true;
  return DURATION_VIEWS.has(view.type) && view.duration < DAYS_PER_WEEK;
}

/** Navigation bounds (inclusive days); either may be absent. */
export interface AgendaBounds {
  min?: AgendaDayKey;
  max?: AgendaDayKey;
}

/** A day held within the bounds. */
export function clampDay(
  key: AgendaDayKey,
  bounds: AgendaBounds,
): AgendaDayKey {
  let day = key;
  if (bounds.min) day = maxDayKey(day, bounds.min);
  if (bounds.max) day = minDayKey(day, bounds.max);
  return day;
}

/** Whether a range around `anchor` shows any day within the bounds. */
export function rangeMeetsBounds(
  view: ResolvedAgendaView,
  anchor: AgendaDayKey,
  weekStartsOn: number,
  bounds: AgendaBounds,
): boolean {
  const { first, count } = viewSpan(view, anchor, weekStartsOn);
  const last = addDays(first, count - 1);
  if (bounds.min && last < bounds.min) return false;
  if (bounds.max && first > bounds.max) return false;
  return true;
}

/**
 * Where ‹ › land: the stepped anchor held within the bounds, or `null` when
 * the stepped range shows nothing within them.
 */
export function navigateAnchor(
  view: ResolvedAgendaView,
  anchor: AgendaDayKey,
  step: 1 | -1,
  weekStartsOn: number,
  bounds: AgendaBounds,
): AgendaDayKey | null {
  const next = stepAnchor(view, anchor, step);
  if (!rangeMeetsBounds(view, next, weekStartsOn, bounds)) return null;
  return clampDay(next, bounds);
}
