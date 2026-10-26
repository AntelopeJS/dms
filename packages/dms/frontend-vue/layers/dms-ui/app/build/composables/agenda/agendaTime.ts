// Zoned time math of the agenda. Days are `YYYY-MM-DD` keys: calendar
// arithmetic on them runs in UTC (a day key has no zone). Instants are epoch
// milliseconds, turned into wall-clock times of an IANA zone through `Intl`,
// so a DST day (23 or 25 h) is right in any zone.

import type { AgendaDayKey } from "./agendaModel";

export const MINUTES_PER_DAY = 1440;
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export const DAYS_PER_WEEK = 7;
const MINUTES_PER_HOUR = 60;
const MONTHS_PER_YEAR = 12;
const DAY_KEY_LENGTH = 10;
const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})/;
const PAD = 2;
const YEAR_PAD = 4;
/**
 * Every zone's offset is a multiple of 15 minutes, and it changes on a
 * quarter hour: the offset of a quarter hour holds for all of it.
 */
const OFFSET_BUCKET_MS = 15 * MINUTE_MS;
const OFFSET_CACHE_LIMIT = 20_000;
const THURSDAY = 4;
const ISO_WEEK_DAYS = 7;

/** A wall-clock date and time of a zone. */
export interface ZonedParts {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** A day key's parts (month 1–12). */
export interface DayParts {
  year: number;
  month: number;
  day: number;
}

const pad = (value: number, length = PAD) =>
  String(value).padStart(length, "0");

/** `YYYY-MM-DD` of a date. */
export function dayKeyOf(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${pad(date.getUTCFullYear(), YEAR_PAD)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Whether `text` is a day key that exists (`2026-02-30` is not). */
export function isDayKey(text: unknown): text is string {
  if (typeof text !== "string") return false;
  const match = DAY_KEY_PATTERN.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  return dayKeyOf(year, month, day) === text;
}

export function parseDayKey(key: AgendaDayKey): DayParts {
  const [year = 1970, month = 1, day = 1] = key
    .slice(0, DAY_KEY_LENGTH)
    .split("-")
    .map(Number);
  return { year, month, day };
}

const utcOfDay = (key: AgendaDayKey) => {
  const { year, month, day } = parseDayKey(key);
  return Date.UTC(year, month - 1, day);
};

const keyOfUtc = (utc: number) => new Date(utc).toISOString().slice(0, 10);

export function addDays(key: AgendaDayKey, days: number): AgendaDayKey {
  return keyOfUtc(utcOfDay(key) + days * DAY_MS);
}

/** Days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: AgendaDayKey, to: AgendaDayKey): number {
  return Math.round((utcOfDay(to) - utcOfDay(from)) / DAY_MS);
}

/** 0 Sunday … 6 Saturday. */
export function weekdayOf(key: AgendaDayKey): number {
  return new Date(utcOfDay(key)).getUTCDay();
}

/** The first day of the week holding `key`, weeks starting on `weekStartsOn`. */
export function startOfWeek(
  key: AgendaDayKey,
  weekStartsOn: number,
): AgendaDayKey {
  const back = (weekdayOf(key) - weekStartsOn + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return addDays(key, -back);
}

export function startOfMonth(key: AgendaDayKey): AgendaDayKey {
  const { year, month } = parseDayKey(key);
  return dayKeyOf(year, month, 1);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function endOfMonth(key: AgendaDayKey): AgendaDayKey {
  const { year, month } = parseDayKey(key);
  return dayKeyOf(year, month, daysInMonth(year, month));
}

/** `months` later (earlier when negative), the day kept or the month's last. */
export function addMonths(key: AgendaDayKey, months: number): AgendaDayKey {
  const { year, month, day } = parseDayKey(key);
  const index = year * MONTHS_PER_YEAR + (month - 1) + months;
  const nextYear = Math.floor(index / MONTHS_PER_YEAR);
  const nextMonth = (index % MONTHS_PER_YEAR) + 1;
  return dayKeyOf(
    nextYear,
    nextMonth,
    Math.min(day, daysInMonth(nextYear, nextMonth)),
  );
}

/** The ISO 8601 week number of a day (weeks from Monday, week 1 holds 4 January). */
export function isoWeekOf(key: AgendaDayKey): number {
  const weekday = weekdayOf(key) || ISO_WEEK_DAYS;
  const thursday = addDays(key, THURSDAY - weekday);
  const { year } = parseDayKey(thursday);
  return Math.floor(daysBetween(dayKeyOf(year, 1, 1), thursday) / 7) + 1;
}

export const minDayKey = (a: AgendaDayKey, b: AgendaDayKey) => (a < b ? a : b);
export const maxDayKey = (a: AgendaDayKey, b: AgendaDayKey) => (a > b ? a : b);

/** "07:30" as minutes from midnight; "24:00" is 1440. `fallback` when it is not a time. */
export function parseTimeOfDay(
  text: string | undefined,
  fallback: number,
): number {
  const match = text ? TIME_PATTERN.exec(text) : null;
  if (!match) return fallback;
  const minutes = Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
  return Math.min(Math.max(minutes, 0), MINUTES_PER_DAY);
}

/** Minutes from midnight as "07:30" (1440 as "24:00"). */
export function formatTimeOfDay(minutes: number): string {
  const whole = Math.round(minutes);
  return `${pad(Math.floor(whole / MINUTES_PER_HOUR))}:${pad(whole % MINUTES_PER_HOUR)}`;
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, number>();

function partFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    partFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function readOffset(epoch: number, timeZone: string): number {
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of partFormatter(timeZone).formatToParts(epoch)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  const wall = Date.UTC(
    values.year ?? 1970,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    // Some runtimes write midnight as hour 24.
    (values.hour ?? 0) % 24,
    values.minute ?? 0,
    values.second ?? 0,
  );
  return wall - (epoch - (((epoch % 1000) + 1000) % 1000));
}

/** Milliseconds the zone's wall clock is ahead of UTC at `epoch`. */
export function zoneOffset(epoch: number, timeZone: string): number {
  const bucket = Math.floor(epoch / OFFSET_BUCKET_MS);
  const cacheKey = `${timeZone}|${bucket}`;
  const cached = offsetCache.get(cacheKey);
  if (cached !== undefined) return cached;
  if (offsetCache.size > OFFSET_CACHE_LIMIT) offsetCache.clear();
  const offset = readOffset(bucket * OFFSET_BUCKET_MS, timeZone);
  offsetCache.set(cacheKey, offset);
  return offset;
}

/** The wall-clock date and time of `epoch` in the zone. */
export function zonedParts(epoch: number, timeZone: string): ZonedParts {
  const wall = new Date(epoch + zoneOffset(epoch, timeZone));
  return {
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth() + 1,
    day: wall.getUTCDate(),
    hour: wall.getUTCHours(),
    minute: wall.getUTCMinutes(),
    second: wall.getUTCSeconds(),
  };
}

/** The day `epoch` falls on in the zone. */
export function zonedDayKey(epoch: number, timeZone: string): AgendaDayKey {
  return keyOfUtc(epoch + zoneOffset(epoch, timeZone));
}

/** Wall-clock minutes from midnight of `epoch` in the zone (09:30 is 570). */
export function zonedMinutes(epoch: number, timeZone: string): number {
  const shifted = epoch + zoneOffset(epoch, timeZone);
  return Math.floor((((shifted % DAY_MS) + DAY_MS) % DAY_MS) / MINUTE_MS);
}

/**
 * The instant of a wall-clock time of a day in the zone. `minutes` may pass
 * 1440 (the next day). A time a DST change skips (02:30 on a spring-forward
 * day) is read with the offset before the change, landing after the gap; a
 * time it repeats (02:30 on a fall-back day) is its first occurrence.
 */
export function zonedEpoch(
  key: AgendaDayKey,
  minutes: number,
  timeZone: string,
): number {
  const wall = utcOfDay(key) + minutes * MINUTE_MS;
  const before = zoneOffset(wall - DAY_MS, timeZone);
  const after = zoneOffset(wall + DAY_MS, timeZone);
  const early = wall - before;
  if (before === after) return early;
  const late = wall - after;
  const valid = [early, late].filter(
    (candidate) => candidate + zoneOffset(candidate, timeZone) === wall,
  );
  return valid.length ? Math.min(...valid) : early;
}

const dayStartCache = new Map<string, number>();

/** The instant a day starts in the zone (its midnight, or the first time after a gap). */
export function dayStartEpoch(key: AgendaDayKey, timeZone: string): number {
  const cacheKey = `${timeZone}|${key}`;
  const cached = dayStartCache.get(cacheKey);
  if (cached !== undefined) return cached;
  if (dayStartCache.size > OFFSET_CACHE_LIMIT) dayStartCache.clear();
  const start = zonedEpoch(key, 0, timeZone);
  dayStartCache.set(cacheKey, start);
  return start;
}

/** How long a day lasts in the zone, in minutes (1380 or 1500 on a DST day). */
export function dayLengthMinutes(key: AgendaDayKey, timeZone: string): number {
  return (
    (dayStartEpoch(addDays(key, 1), timeZone) - dayStartEpoch(key, timeZone)) /
    MINUTE_MS
  );
}

/** An instant as an ISO string with the zone's offset ("2026-10-25T09:00:00+01:00"). */
export function zonedIso(epoch: number, timeZone: string): string {
  const offsetMinutes = Math.round(zoneOffset(epoch, timeZone) / MINUTE_MS);
  const parts = zonedParts(epoch, timeZone);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(absolute / MINUTES_PER_HOUR))}:${pad(absolute % MINUTES_PER_HOUR)}`;
  return `${dayKeyOf(parts.year, parts.month, parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}${offset}`;
}

/**
 * An event bound as an instant: an ISO date-time (with its offset or `Z`),
 * or a bare day read as its midnight in the zone. `null` when it is neither.
 */
export function parseInstant(
  text: string | undefined,
  timeZone: string,
): number | null {
  if (!text) return null;
  if (isDayKey(text)) return dayStartEpoch(text, timeZone);
  const epoch = Date.parse(text);
  return Number.isNaN(epoch) ? null : epoch;
}

/** The day an all-day bound names: a day key, or the day of an ISO date-time in the zone. */
export function parseDay(
  text: string | undefined,
  timeZone: string,
): AgendaDayKey | null {
  if (!text) return null;
  const head = text.slice(0, DAY_KEY_LENGTH);
  if (text.length === DAY_KEY_LENGTH) return isDayKey(head) ? head : null;
  const epoch = Date.parse(text);
  return Number.isNaN(epoch) ? null : zonedDayKey(epoch, timeZone);
}

/** Whether a zone name is one this runtime knows. */
export function isTimeZone(timeZone: string | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
