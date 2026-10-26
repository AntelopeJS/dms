// The layout of a `year` view: twelve months from the first month of the
// range, as a planner (a row per month, 31 day cells, the days a month does
// not have left as blanks) or as twelve small month grids. Each day carries
// the occurrences and backgrounds covering it; pure, fed by the view.

import type { AgendaDayKey, AgendaOccurrence } from "./agendaModel";
import type { AgendaBackgroundSpan } from "./agendaBackgroundSpans";
import { occurrencesByDay } from "./agendaListLayout";
import {
  DAYS_PER_WEEK,
  addDays,
  daysInMonth as monthLength,
  isoWeekOf,
  weekdayOf,
} from "./agendaTime";

export const MONTHS_PER_YEAR = 12;
export const PLANNER_DAYS = 31;
const SATURDAY = 6;
const SUNDAY = 0;
const THURSDAY = 4;

/** A month of a year view. */
export interface YearMonthRef {
  year: number;
  /** 0–11. */
  month: number;
}

/** What one day of a year view shows. */
export interface YearDayCell {
  key: string;
  /** `null`: a day the month does not have (a planner's 30 February), or a blank of a month grid. */
  day: AgendaDayKey | null;
  dayOfMonth: number;
  weekday: number;
  weekend: boolean;
  isToday: boolean;
  /** Planner: the all-day occurrences covering it; month grid: every occurrence. */
  occurrences: AgendaOccurrence[];
  backgrounds: AgendaBackgroundSpan[];
}

export interface YearPlannerMonth extends YearMonthRef {
  key: string;
  cells: YearDayCell[];
}

export interface YearMonthWeek {
  key: string;
  /** ISO week number of the week's Thursday. */
  week: number;
  days: YearDayCell[];
}

export interface YearMonthGrid extends YearMonthRef {
  key: string;
  weeks: YearMonthWeek[];
}

export interface YearLayoutInput {
  /** A day of the first month shown (the range's first day). */
  from: AgendaDayKey;
  today: AgendaDayKey;
  occurrences: readonly AgendaOccurrence[];
  /** The backgrounds behind every resource (no `resourceIds`). */
  backgrounds: readonly AgendaBackgroundSpan[];
}

export interface YearMonthsInput extends YearLayoutInput {
  weekStartsOn: number;
}

/**
 * The number of a week starting on `weekFirst` (weeks from `weekStartsOn`):
 * the ISO week of its Thursday, so a Sunday-start week Sun 25 – Sat 31
 * October 2026 is week 44, as six of its days are.
 */
export function weekNumberOf(
  weekFirst: AgendaDayKey,
  weekStartsOn: number,
): number {
  const toThursday = (THURSDAY - weekStartsOn + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return isoWeekOf(addDays(weekFirst, toThursday));
}

/** A pending `twoClicks` range, its days in order. */
export interface YearPendingRange {
  from: AgendaDayKey;
  to: AgendaDayKey;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The day key of a day of a month, `month` 0–11. */
export function monthDayKey(
  year: number,
  month: number,
  day: number,
): AgendaDayKey {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** Days of a month, `month` 0–11. */
export function daysInMonth(year: number, month: number): number {
  return monthLength(year, month + 1);
}

/** The twelve months from the month of `from`. */
export function yearMonths(from: AgendaDayKey): YearMonthRef[] {
  const [year, month] = from.split("-").map(Number);
  return Array.from({ length: MONTHS_PER_YEAR }, (_, offset) => {
    const index = month! - 1 + offset;
    return {
      year: year! + Math.floor(index / MONTHS_PER_YEAR),
      month: index % MONTHS_PER_YEAR,
    };
  });
}

function backgroundsByDay(
  spans: readonly AgendaBackgroundSpan[],
  from: AgendaDayKey,
  to: AgendaDayKey,
): Map<AgendaDayKey, AgendaBackgroundSpan[]> {
  const byDay = new Map<AgendaDayKey, AgendaBackgroundSpan[]>();
  for (const span of spans) {
    let day = span.startDay < from ? from : span.startDay;
    const last = span.endDay > to ? to : span.endDay;
    while (day <= last) {
      const list = byDay.get(day);
      if (list) list.push(span);
      else byDay.set(day, [span]);
      day = addDays(day, 1);
    }
  }
  return byDay;
}

interface DayIndex {
  occurrences: Map<AgendaDayKey, AgendaOccurrence[]>;
  backgrounds: Map<AgendaDayKey, AgendaBackgroundSpan[]>;
  today: AgendaDayKey;
}

function yearBounds(months: readonly YearMonthRef[]): YearPendingRange {
  const first = months[0]!;
  const last = months.at(-1)!;
  return {
    from: monthDayKey(first.year, first.month, 1),
    to: monthDayKey(last.year, last.month, daysInMonth(last.year, last.month)),
  };
}

function dayIndexOf(
  input: YearLayoutInput,
  months: readonly YearMonthRef[],
  allDayOnly: boolean,
): DayIndex {
  const bounds = yearBounds(months);
  const occurrences = allDayOnly
    ? input.occurrences.filter((occurrence) => occurrence.allDay)
    : input.occurrences;
  return {
    occurrences: occurrencesByDay(occurrences, bounds.from, bounds.to),
    backgrounds: backgroundsByDay(input.backgrounds, bounds.from, bounds.to),
    today: input.today,
  };
}

function dayCell(key: string, day: AgendaDayKey, index: DayIndex): YearDayCell {
  const weekday = weekdayOf(day);
  return {
    key,
    day,
    dayOfMonth: Number(day.slice(8, 10)),
    weekday,
    weekend: weekday === SATURDAY || weekday === SUNDAY,
    isToday: day === index.today,
    occurrences: index.occurrences.get(day) ?? [],
    backgrounds: index.backgrounds.get(day) ?? [],
  };
}

function blankCell(key: string, dayOfMonth: number): YearDayCell {
  return {
    key,
    day: null,
    dayOfMonth,
    weekday: -1,
    weekend: false,
    isToday: false,
    occurrences: [],
    backgrounds: [],
  };
}

/**
 * The planner: a row per month with 31 cells; a day the month does not have
 * is a blank (drawn hatched). Cells hold the all-day occurrences covering
 * them, in the order given, and the backgrounds.
 */
export function buildYearPlanner(input: YearLayoutInput): YearPlannerMonth[] {
  const months = yearMonths(input.from);
  const index = dayIndexOf(input, months, true);
  return months.map(({ year, month }) => {
    const length = daysInMonth(year, month);
    const monthKey = `${year}-${pad(month + 1)}`;
    const cells = Array.from({ length: PLANNER_DAYS }, (_, offset) => {
      const dayOfMonth = offset + 1;
      const key = `${monthKey}-${pad(dayOfMonth)}`;
      if (dayOfMonth > length) return blankCell(key, dayOfMonth);
      return dayCell(key, monthDayKey(year, month, dayOfMonth), index);
    });
    return { key: monthKey, year, month, cells };
  });
}

function monthWeeks(
  ref: YearMonthRef,
  weekStartsOn: number,
  index: DayIndex,
): YearMonthWeek[] {
  const first = monthDayKey(ref.year, ref.month, 1);
  const length = daysInMonth(ref.year, ref.month);
  const lead =
    (weekdayOf(first) - weekStartsOn + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const weekCount = Math.ceil((lead + length) / DAYS_PER_WEEK);
  return Array.from({ length: weekCount }, (_, row) => {
    const weekFirst = addDays(first, row * DAYS_PER_WEEK - lead);
    const days = Array.from({ length: DAYS_PER_WEEK }, (_, column) => {
      const day = addDays(weekFirst, column);
      const inMonth = day.slice(0, 7) === first.slice(0, 7);
      const key = `${first.slice(0, 7)}:${row}:${column}`;
      return inMonth ? dayCell(key, day, index) : blankCell(key, 0);
    });
    return {
      key: `${first.slice(0, 7)}:${row}`,
      week: weekNumberOf(weekFirst, weekStartsOn),
      days,
    };
  });
}

/** Twelve small month grids (weeks from `weekStartsOn`), days holding every occurrence covering them. */
export function buildYearMonths(input: YearMonthsInput): YearMonthGrid[] {
  const months = yearMonths(input.from);
  const index = dayIndexOf(input, months, false);
  return months.map((ref) => ({
    ...ref,
    key: `${ref.year}-${pad(ref.month + 1)}`,
    weeks: monthWeeks(ref, input.weekStartsOn, index),
  }));
}

/** The range between the first day picked and the day hovered, in order. */
export function pendingRange(
  anchor: AgendaDayKey | null | undefined,
  hover: AgendaDayKey | null | undefined,
): YearPendingRange | null {
  if (!anchor) return null;
  const other = hover ?? anchor;
  return anchor <= other
    ? { from: anchor, to: other }
    : { from: other, to: anchor };
}

/** A day lies in a pending range. */
export function inPendingRange(
  day: AgendaDayKey | null,
  range: YearPendingRange | null,
): boolean {
  return !!day && !!range && day >= range.from && day <= range.to;
}
