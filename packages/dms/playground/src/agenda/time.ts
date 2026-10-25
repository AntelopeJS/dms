/*
 * Days and instants of the demos, in the zone of the stores and offices they
 * describe. The server may run in any zone (UTC in a container): every wall
 * time is turned into an instant through Intl, so a day of 23 or 25 hours
 * (the last Sunday of March and of October) keeps its shifts at the right
 * hour.
 */

/** The zone the demos' data is written in. */
export const DEMO_TIME_ZONE = "Europe/Brussels";

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const DAY_KEY_LENGTH = 10;
const PAD = 2;
const MONDAY = 1;
// ISO 8601: week 1 holds the year's first Thursday.
const THURSDAY = 4;

const ZONE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: DEMO_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** A wall-clock reading of an instant in the demo zone. */
interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function wallTime(ms: number): WallTime {
  const parts: Record<string, number> = {};
  for (const part of ZONE_FORMAT.formatToParts(new Date(ms))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
  };
}

function pad(value: number): string {
  return String(Math.abs(value)).padStart(PAD, "0");
}

/** Minutes the demo zone is ahead of UTC at an instant. */
function offsetMinutes(ms: number): number {
  const wall = wallTime(ms);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
  );
  const floored = Math.floor(ms / MS_PER_MINUTE) * MS_PER_MINUTE;
  return Math.round((asUtc - floored) / MS_PER_MINUTE);
}

function dayKeyOf(wall: WallTime): string {
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
}

/** An instant written with the demo zone's offset ("2026-10-26T09:30:00+01:00"). */
export function isoInstant(ms: number): string {
  const offset = offsetMinutes(ms);
  const wall = wallTime(ms);
  const sign = offset < 0 ? "-" : "+";
  const hours = Math.floor(Math.abs(offset) / MINUTES_PER_HOUR);
  const minutes = Math.abs(offset) % MINUTES_PER_HOUR;
  return `${dayKeyOf(wall)}T${pad(wall.hour)}:${pad(wall.minute)}:00${sign}${pad(hours)}:${pad(minutes)}`;
}

function splitDay(day: string): [number, number, number] {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return [year, month, date];
}

/** The instant of a wall time ("09:30", "24:00") on a day, in the demo zone. */
export function zonedInstant(day: string, time: string): string {
  const [year, month, date] = splitDay(day);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  // Twice: the offset at the first guess may be the other side of a change.
  const guess = wall - offsetMinutes(wall) * MS_PER_MINUTE;
  return isoInstant(wall - offsetMinutes(guess) * MS_PER_MINUTE);
}

/** Whether a start or end is a day (`YYYY-MM-DD`), not an instant. */
export function isDayKey(value: string): boolean {
  return value.length === DAY_KEY_LENGTH;
}

/** The day an instant falls on in the demo zone; a day is its own. */
export function dayOf(value: string): string {
  if (isDayKey(value)) return value;
  return dayKeyOf(wallTime(Date.parse(value)));
}

/** Minutes since midnight of an instant, in the demo zone. */
export function minutesOfDay(value: string): number {
  const wall = wallTime(Date.parse(value));
  return wall.hour * MINUTES_PER_HOUR + wall.minute;
}

/** "HH:MM" of an instant, in the demo zone. */
export function timeOf(value: string): string {
  const minutes = minutesOfDay(value);
  return `${pad(Math.floor(minutes / MINUTES_PER_HOUR))}:${pad(minutes % MINUTES_PER_HOUR)}`;
}

/** The instant `minutes` after another one. */
export function addMinutes(value: string, minutes: number): string {
  return isoInstant(Date.parse(value) + minutes * MS_PER_MINUTE);
}

/** Minutes from one instant to another. */
export function minutesBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_MINUTE);
}

/** The day `count` days after another one (before, when negative). */
export function addDays(day: string, count: number): string {
  const [year, month, date] = splitDay(day);
  return new Date(Date.UTC(year, month - 1, date + count))
    .toISOString()
    .slice(0, DAY_KEY_LENGTH);
}

/** Days from one day to another. */
export function daysBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDate] = splitDay(from);
  const [toYear, toMonth, toDate] = splitDay(to);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDate) -
      Date.UTC(fromYear, fromMonth - 1, fromDate)) /
      MS_PER_DAY,
  );
}

/** The day of the week of a day: 0 Sunday … 6 Saturday. */
export function weekdayOf(day: string): number {
  const [year, month, date] = splitDay(day);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}

/** The Monday of the week a day falls in. */
export function mondayOf(day: string): string {
  const weekday = weekdayOf(day);
  return addDays(day, weekday === 0 ? -6 : MONDAY - weekday);
}

/** Today in the demo zone. */
export function todayKey(): string {
  return dayKeyOf(wallTime(Date.now()));
}

/** The ISO week number of a day. */
export function isoWeekOf(day: string): number {
  const thursday = addDays(mondayOf(day), THURSDAY - MONDAY);
  const firstThursday = addDays(
    mondayOf(`${thursday.slice(0, 4)}-01-04`),
    THURSDAY - MONDAY,
  );
  return daysBetween(firstThursday, thursday) / DAYS_PER_WEEK + 1;
}

/** Both days, inclusive, as an agenda names a range. */
export interface DayRange {
  from: string;
  to: string;
}

/**
 * The first and last day an event covers: an all-day event's `end` is its
 * last day, a timed event's `end` is exclusive (a shift ending at midnight
 * does not cover the next day).
 */
export function eventDays(
  start: string,
  end: string | undefined,
  allDay: boolean | undefined,
): DayRange {
  if (allDay || isDayKey(start)) return { from: start, to: end ?? start };
  if (!end || Date.parse(end) <= Date.parse(start)) {
    return { from: dayOf(start), to: dayOf(start) };
  }
  return { from: dayOf(start), to: dayOf(addMinutes(end, -1)) };
}
