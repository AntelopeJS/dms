import type { SortingState } from "@tanstack/vue-table";
import {
  regionalDateTimeFormat,
  regionalDayKey,
  regionalDayNumber,
  regionalWeekStart,
} from "#dms-core/app/utils/regional";
import { nameCalendarDay } from "../../../components/activity-feed/activityFeedDays";
import type {
  TableViewGroupBy,
  TableViewGroupedConfig,
} from "../../../../composables/table-view/types";
import type { TableFilter } from "../../../components/table/Table.vue";

/** Key of the group of rows without a value. */
export const NO_GROUP_KEY = "";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;
// 1970-01-01, day 0, was a Thursday.
const EPOCH_WEEKDAY = 4;
const DAY_KEY_LENGTH = 10;

const toDate = (value: unknown): Date | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const dayKeyOfNumber = (dayNumber: number): string =>
  new Date(dayNumber * DAY_MS).toISOString().slice(0, DAY_KEY_LENGTH);

/** The first day of the week `dayNumber` falls in, as a day number. */
function weekStartDay(dayNumber: number, weekStart: number): number {
  const weekday = (dayNumber + EPOCH_WEEKDAY) % DAYS_PER_WEEK;
  return dayNumber - ((weekday - weekStart + DAYS_PER_WEEK) % DAYS_PER_WEEK);
}

function valueKey(value: unknown): string {
  if (value === null || value === undefined) return NO_GROUP_KEY;
  if (Array.isArray(value)) return value.map(valueKey).join(",");
  if (typeof value === "object") {
    const id = (value as Record<string, unknown>)._id;
    return id === undefined ? JSON.stringify(value) : String(id);
  }
  return String(value);
}

type GroupKeyReader = (value: unknown, locale: string) => string;

const GROUP_KEY_READERS: Record<TableViewGroupBy, GroupKeyReader> = {
  value: (value) => valueKey(value),
  day: (value) => {
    const date = toDate(value);
    return date ? regionalDayKey(date) : NO_GROUP_KEY;
  },
  week: (value, locale) => {
    const date = toDate(value);
    if (!date) return NO_GROUP_KEY;
    const start = weekStartDay(
      regionalDayNumber(date),
      regionalWeekStart(locale),
    );
    return dayKeyOfNumber(start);
  },
};

/**
 * The group a row's value files it under: the value itself (a relation by
 * its id), or the calendar day or week (`YYYY-MM-DD` of its first day) a date
 * falls on in the reader's time zone.
 */
export function rowGroupKey(
  value: unknown,
  by: TableViewGroupBy,
  locale: string,
): string {
  return GROUP_KEY_READERS[by](value, locale);
}

/** Texts a date group heading reads. */
export interface DateGroupLabels {
  today: string;
  yesterday: string;
  /** "Week of {date}". */
  weekOf: (date: string) => string;
}

const keyDate = (key: string): Date => new Date(`${key}T12:00:00Z`);

/** Heading of a day or week group: "Today · Sep 29", "Week of Sep 22". */
export function dateGroupLabel(
  key: string,
  by: Exclude<TableViewGroupBy, "value">,
  locale: string,
  labels: DateGroupLabels,
  now: Date = new Date(),
): string {
  const date = keyDate(key);
  if (by === "week") {
    return labels.weekOf(
      regionalDateTimeFormat(locale, { month: "short", day: "numeric" }).format(
        date,
      ),
    );
  }
  const day = nameCalendarDay(date, now, locale, labels);
  return day.date ? `${day.name} · ${day.date}` : (day.name ?? key);
}

/**
 * The filter that lists a group's rows, for its count: the value itself, or
 * the group's days. Days are compared on calendar dates, as the date filter
 * does.
 */
export function groupFilter(
  accessorKey: string,
  key: string,
  by: TableViewGroupBy,
): TableFilter | undefined {
  if (key === NO_GROUP_KEY) return undefined;
  if (by === "value") return { accessorKey, mode: "is", value: key };
  const firstDay = Date.parse(`${key}T00:00:00Z`) / DAY_MS;
  const lastDay = by === "week" ? firstDay + DAYS_PER_WEEK - 1 : firstDay;
  return {
    accessorKey,
    mode: "is_between",
    value: `${key},${dayKeyOfNumber(lastDay)}`,
  };
}

/**
 * The sort the grouped display lists by, so a group's rows follow each other:
 * on its column, in the direction the user picked on it, else the newest
 * dates or the first values first.
 */
export function groupedSorting(
  sorting: SortingState,
  grouped: TableViewGroupedConfig,
): SortingState {
  const { groupByField, by = "value" } = grouped;
  const own = sorting.find((entry) => entry.id === groupByField);
  return [{ id: groupByField, desc: own ? !!own.desc : by !== "value" }];
}
