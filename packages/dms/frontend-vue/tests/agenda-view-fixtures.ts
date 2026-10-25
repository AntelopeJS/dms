// Builders the timeline, year and list tests share: days of a range and
// occurrences as `useAgenda` would hand them to the views.

import type {
  AgendaDay,
  AgendaOccurrence,
} from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import { zonedWallClock } from "../layers/dms-ui/app/build/composables/agenda/agendaSlots";
import {
  addDays,
  isoWeekOf,
  weekdayOf,
  zonedEpoch,
} from "../layers/dms-ui/app/build/composables/agenda/agendaTime";

export const BRUSSELS = "Europe/Brussels";

/** `count` shown days from `from`, hidden weekdays left out. */
export function makeDays(
  from: string,
  count: number,
  options: { timeZone?: string; hiddenDays?: number[]; today?: string } = {},
): AgendaDay[] {
  const timeZone = options.timeZone ?? BRUSSELS;
  const hidden = options.hiddenDays ?? [];
  const days: AgendaDay[] = [];
  let key = from;
  while (days.length < count) {
    const weekday = weekdayOf(key);
    if (!hidden.includes(weekday)) {
      days.push({
        key,
        start: zonedEpoch(key, 0, timeZone),
        end: zonedEpoch(addDays(key, 1), 0, timeZone),
        weekday,
        dayOfMonth: Number(key.slice(8, 10)),
        month: Number(key.slice(5, 7)) - 1,
        year: Number(key.slice(0, 4)),
        isToday: key === options.today,
        inMonth: true,
        week: isoWeekOf(key),
      });
    }
    key = addDays(key, 1);
  }
  return days;
}

export interface OccurrenceSpec {
  key: string;
  start: string;
  end: string;
  allDay?: boolean;
  resourceIds?: string[];
  title?: string;
  short?: string;
  timeZone?: string;
}

/** An occurrence of an event, timed (ISO instants) or all-day (days, end inclusive). */
export function makeOccurrence(spec: OccurrenceSpec): AgendaOccurrence {
  const timeZone = spec.timeZone ?? BRUSSELS;
  const allDay = !!spec.allDay;
  const start = allDay
    ? zonedEpoch(spec.start, 0, timeZone)
    : Date.parse(spec.start);
  const end = allDay
    ? zonedEpoch(addDays(spec.end, 1), 0, timeZone)
    : Date.parse(spec.end);
  return {
    key: spec.key,
    event: {
      id: spec.key,
      title: spec.title ?? spec.key,
      start: spec.start,
      end: spec.end,
      allDay,
      short: spec.short,
    },
    allDay,
    start,
    end,
    startDay: allDay ? spec.start : zonedWallClock(start, timeZone).day,
    endDay: allDay ? spec.end : zonedWallClock(end - 1, timeZone).day,
    startMinutes: zonedWallClock(start, timeZone).minutes,
    endMinutes: zonedWallClock(end, timeZone).minutes,
    resourceIds: spec.resourceIds ?? [],
    paint: {
      background: "rgb(220, 230, 250)",
      bar: "rgb(26, 61, 153)",
      text: "rgb(10, 30, 80)",
      onBar: "rgb(255, 255, 255)",
    },
    canMove: true,
    canResize: true,
    canDelete: true,
    details: "drawer",
  };
}
