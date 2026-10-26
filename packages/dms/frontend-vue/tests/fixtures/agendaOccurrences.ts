// Days and occurrences of a FullAgenda built in a zone, for the layout and
// drag tests: what dev A's normalization hands the views.

import type { AgendaEvent } from "../../layers/dms-ui/app/types/full-agenda";
import type {
  AgendaDay,
  AgendaOccurrence,
} from "../../layers/dms-ui/app/build/composables/agenda/agendaModel";
import {
  addDays,
  MINUTES_PER_DAY,
  weekdayOf,
  zonedDayKey,
  zonedEpoch,
  zonedMinutes,
} from "../../layers/dms-ui/app/build/composables/agenda/agendaTime";

export const BRUSSELS = "Europe/Brussels";

function isoWeek(key: string): number {
  const date = new Date(`${key}T00:00:00Z`);
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  return (
    1 +
    Math.round(
      ((thursday.getTime() - yearStart.getTime()) / 86_400_000 -
        3 +
        ((yearStart.getUTCDay() + 6) % 7)) /
        7,
    )
  );
}

/** A day of the range in `timeZone`. */
export function agendaDay(key: string, timeZone = BRUSSELS): AgendaDay {
  const [year, month, dayOfMonth] = key.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return {
    key,
    start: zonedEpoch(key, 0, timeZone),
    end: zonedEpoch(addDays(key, 1), 0, timeZone),
    weekday: weekdayOf(key),
    dayOfMonth,
    month: month - 1,
    year,
    isToday: false,
    inMonth: true,
    week: isoWeek(key),
  };
}

/** `count` consecutive days from `from`, leaving out `hiddenDays`. */
export function agendaDays(
  from: string,
  count: number,
  hiddenDays: number[] = [],
  timeZone = BRUSSELS,
): AgendaDay[] {
  return Array.from({ length: count }, (_, index) => addDays(from, index))
    .filter((key) => !hiddenDays.includes(weekdayOf(key)))
    .map((key) => agendaDay(key, timeZone));
}

const PAINT = { background: "bg", bar: "bar", text: "text", onBar: "on" };

/** An occurrence as the views receive it; timed times are wall times in `timeZone` ("2026-10-26T09:00"). */
export function occurrence(
  key: string,
  start: string,
  end: string,
  extra: Partial<AgendaEvent> & { timeZone?: string } = {},
): AgendaOccurrence {
  const timeZone = extra.timeZone ?? BRUSSELS;
  const allDay = extra.allDay ?? !start.includes("T");
  const toEpoch = (value: string, isEnd: boolean) => {
    if (allDay)
      return zonedEpoch(isEnd ? addDays(value, 1) : value, 0, timeZone);
    const [dayKey, time] = value.split("T") as [string, string];
    const [hours, minutes] = time.split(":").map(Number) as [number, number];
    return zonedEpoch(dayKey, hours * 60 + minutes, timeZone);
  };
  const startMs = toEpoch(start, false);
  const endMs = toEpoch(end, true);
  const event: AgendaEvent = {
    id: key,
    title: `Event ${key}`,
    start,
    end,
    allDay,
    ...extra,
  };
  return {
    key,
    event,
    allDay,
    start: startMs,
    end: endMs,
    startDay: zonedDayKey(startMs, timeZone),
    // As the engine: a zero-length event ends on the day it starts.
    endDay:
      endMs > startMs
        ? zonedDayKey(endMs - 1, timeZone)
        : zonedDayKey(startMs, timeZone),
    startMinutes: allDay ? 0 : zonedMinutes(startMs, timeZone),
    // As the engine: 1440 for an all-day event and for one ending at midnight.
    endMinutes:
      allDay ||
      zonedDayKey(endMs, timeZone) !==
        (endMs > startMs
          ? zonedDayKey(endMs - 1, timeZone)
          : zonedDayKey(startMs, timeZone))
        ? MINUTES_PER_DAY
        : zonedMinutes(endMs, timeZone),
    resourceIds: extra.resourceIds ?? [],
    paint: PAINT,
    canMove: extra.editable !== false,
    canResize: extra.editable !== false,
    canDelete: true,
    details: "drawer",
  };
}
