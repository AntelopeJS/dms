// Wall clocks of the details form ("2026-10-25T09:30") in the agenda's zone:
// read from an instant, turned back into one, through the agenda's own zone
// math (`agendaTime`): a day of a DST change is not 24 h long.

import {
  addDays,
  formatTimeOfDay,
  isDayKey,
  parseTimeOfDay,
  zonedDayKey,
  zonedEpoch,
  zonedIso,
  zonedMinutes,
} from "./agendaTime";

const DAY_LENGTH = 10;
const TIME_START = 11;
const TIME_END = 16;
const NO_TIME = -1;
const MIDNIGHT = "00:00";

/** The wall clock of an instant in a zone, `YYYY-MM-DDTHH:mm`. */
export function wallClockOf(epochMs: number, timeZone: string): string {
  return `${zonedDayKey(epochMs, timeZone)}T${formatTimeOfDay(zonedMinutes(epochMs, timeZone))}`;
}

/** The instant of a wall clock in a zone; `null` when it does not read. */
export function wallClockEpoch(value: string, timeZone: string): number | null {
  const day = dayOfWallClock(value);
  const minutes = parseTimeOfDay(timeOfWallClock(value), NO_TIME);
  if (!isDayKey(day) || minutes === NO_TIME) return null;
  return zonedEpoch(day, minutes, timeZone);
}

/** A wall clock as an ISO instant with its offset ("2026-10-25T09:30:00+01:00"). */
export function wallClockIso(value: string, timeZone: string): string | null {
  const epoch = wallClockEpoch(value, timeZone);
  return epoch === null ? null : zonedIso(epoch, timeZone);
}

/** The day of a wall clock, `YYYY-MM-DD`. */
export const dayOfWallClock = (value: string): string =>
  value.slice(0, DAY_LENGTH);

/** The time of a wall clock, `HH:mm` (`00:00` without one). */
export const timeOfWallClock = (value: string): string =>
  value.length > TIME_START ? value.slice(TIME_START, TIME_END) : MIDNIGHT;

/** A wall clock with its time replaced. */
export const withTime = (value: string, time: string): string =>
  `${dayOfWallClock(value)}T${time}`;

/** A wall clock with its day replaced. */
export const withDay = (value: string, day: string): string =>
  `${day}T${timeOfWallClock(value)}`;

/** The day before a `YYYY-MM-DD` day. */
export const previousDay = (day: string): string => addDays(day, -1);
