import {
  addDays,
  formatTimeOfDay,
  isDayKey,
  zonedDayKey,
  zonedEpoch,
  zonedIso,
  zonedMinutes,
} from "./agendaTime";

const DAY_LENGTH = 10;
const TIME_START = 11;
const TIME_END = 16;
const MIDNIGHT = "00:00";
const MINUTES_PER_HOUR = 60;
/** The time of a wall clock that reads: `HH:mm`, from 00:00 to 23:59. */
const WALL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The wall clock of an instant in a zone, `YYYY-MM-DDTHH:mm`. */
export function wallClockOf(epochMs: number, timeZone: string): string {
  return `${zonedDayKey(epochMs, timeZone)}T${formatTimeOfDay(zonedMinutes(epochMs, timeZone))}`;
}

/**
 * The instant of a wall clock in a zone; `null` when it does not read. A
 * time past 23:59 ("25:00") does not read: it is never taken for another
 * hour.
 */
export function wallClockEpoch(value: string, timeZone: string): number | null {
  const day = dayOfWallClock(value);
  const time = WALL_TIME.exec(timeOfWallClock(value));
  if (!isDayKey(day) || !time) return null;
  return zonedEpoch(
    day,
    Number(time[1]) * MINUTES_PER_HOUR + Number(time[2]),
    timeZone,
  );
}

/** Whether a wall clock names a real day but a time that is not a time of day ("2026-10-26T25:00"). */
export const hasUnreadTime = (value: string): boolean =>
  isDayKey(dayOfWallClock(value)) && !WALL_TIME.test(timeOfWallClock(value));

/** A wall clock as an ISO instant with its offset ("2026-10-25T09:30:00+01:00"). */
export function wallClockIso(value: string, timeZone: string): string | null {
  const epoch = wallClockEpoch(value, timeZone);
  return epoch === null ? null : zonedIso(epoch, timeZone);
}

/** The day of a wall clock, `YYYY-MM-DD`. */
export const dayOfWallClock = (value: string): string =>
  value.slice(0, DAY_LENGTH);

/**
 * The time of a wall clock, `HH:mm`: `00:00` for a bare day, and an empty
 * text for a day whose time was emptied ("2026-10-26T"), which is no time at
 * all and never midnight.
 */
export const timeOfWallClock = (value: string): string =>
  value.length > DAY_LENGTH ? value.slice(TIME_START, TIME_END) : MIDNIGHT;

/** Whether a wall clock names a real day with its time emptied ("2026-10-26T"). */
export const hasEmptiedTime = (value: string): boolean =>
  isDayKey(dayOfWallClock(value)) &&
  value.length > DAY_LENGTH &&
  timeOfWallClock(value) === "";

/** A wall clock with its time replaced. */
export const withTime = (value: string, time: string): string =>
  `${dayOfWallClock(value)}T${time}`;

/** A wall clock with its day replaced. */
export const withDay = (value: string, day: string): string =>
  `${day}T${timeOfWallClock(value)}`;

/** The day before a `YYYY-MM-DD` day. */
export const previousDay = (day: string): string => addDays(day, -1);

const HOURS_PER_DAY = 24;
/**
 * A clock as typed: hours, then two minute digits after a separator or as the
 * last two digits ("9:45", "9h45", "0945", "9"). A separator with fewer
 * digits ("9h", "9.5") is not read: guessing its minutes would save a time
 * the member did not mean.
 */
const TYPED_CLOCK = /^(\d{1,2})(?:\s*[:h.]\s*(\d{2})|(\d{2}))?$/i;

/**
 * A clock time as the member typed it, read as `HH:mm`; `undefined` when it is not a time of day. The form's time field is a text field of the page's language, not the native time input Chrome names
 * in the browser's language.
 */
export function readClock(typed: string): string | undefined {
  const match = TYPED_CLOCK.exec(typed.trim());
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? match[3] ?? 0);
  if (hours >= HOURS_PER_DAY || minutes >= MINUTES_PER_HOUR) return undefined;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
