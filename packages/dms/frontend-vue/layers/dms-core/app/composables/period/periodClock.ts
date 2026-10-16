import { readerTimeZone } from "../../utils/regional";

/** The fields of a wall-clock time, months counted from 0 as `Date` does. */
export interface WallTime {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

/**
 * A calendar in one time zone: the wall-clock time of an instant, and the
 * instant of a wall-clock time. Fields out of range roll over as `Date`'s do
 * (day 0 is the last day of the month before).
 */
export interface PeriodClock {
  wall(date: Date): WallTime;
  instant(wall: WallTime): Date;
}

/** The calendar of the zone the code runs in, through `Date`'s own methods. */
export const localClock: PeriodClock = {
  wall: (date) => ({
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
    hours: date.getHours(),
    minutes: date.getMinutes(),
    seconds: date.getSeconds(),
    milliseconds: date.getMilliseconds(),
  }),
  instant: (wall) =>
    new Date(
      wall.year,
      wall.month,
      wall.day,
      wall.hours,
      wall.minutes,
      wall.seconds,
      wall.milliseconds,
    ),
};

const WALL_PARTS = ["year", "month", "day", "hour", "minute", "second"];
const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zonedFormatters.get(timeZone);
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
    zonedFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function utcOf(wall: WallTime): number {
  return Date.UTC(
    wall.year,
    wall.month,
    wall.day,
    wall.hours,
    wall.minutes,
    wall.seconds,
    wall.milliseconds,
  );
}

/** The calendar of `timeZone`, through `Intl` whatever zone the code runs in. */
export function zonedClock(timeZone: string): PeriodClock {
  const wall = (date: Date): WallTime => {
    const parts = Object.fromEntries(
      zonedFormatter(timeZone)
        .formatToParts(date)
        .filter((part) => WALL_PARTS.includes(part.type))
        .map((part) => [part.type, Number(part.value)]),
    );
    return {
      year: parts.year!,
      month: parts.month! - 1,
      day: parts.day!,
      hours: parts.hour!,
      minutes: parts.minute!,
      seconds: parts.second!,
      milliseconds: date.getUTCMilliseconds(),
    };
  };
  // The zone's offset at an instant: how far its wall clock is from UTC.
  const offsetAt = (time: number) => utcOf(wall(new Date(time))) - time;
  return {
    wall,
    instant: (target) => {
      const asUtc = utcOf(target);
      // Twice: the offset at the first guess is the right one unless the
      // guess and the answer fall on either side of a daylight saving change.
      const guess = asUtc - offsetAt(asUtc);
      return new Date(asUtc - offsetAt(guess));
    },
  };
}

/**
 * The calendar a period is resolved in: the reader's browser's zone. That is
 * the code's own in the browser; on a server, the zone the browser's cookie
 * names (see `readerTimeZone`), or the server's own without one.
 */
export function readerClock(): PeriodClock {
  const zone = readerTimeZone();
  return zone ? zonedClock(zone) : localClock;
}
