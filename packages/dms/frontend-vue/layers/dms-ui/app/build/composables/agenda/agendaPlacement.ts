// Where a new event goes: a click on an empty spot, a `twoClicks` range of
// days, the toolbar's "+ New", and what `selectAction` reads of it.

import type {
  AgendaDayKey,
  AgendaDropTarget,
  AgendaPlacement,
  AgendaRange,
  AgendaRangeAnchor,
  ResolvedAgendaOptions,
} from "./agendaModel";
import {
  addDays,
  dayStartEpoch,
  maxDayKey,
  minDayKey,
  MINUTE_MS,
  parseTimeOfDay,
  zonedDayKey,
  zonedEpoch,
  zonedIso,
  zonedMinutes,
} from "./agendaTime";

const MINUTES_PER_HOUR = 60;
const DEFAULT_NEW_MINUTES = 9 * MINUTES_PER_HOUR;
const LATEST_NEW_MINUTES = 23 * MINUTES_PER_HOUR;

/** Where a click on an empty spot creates: a slot, a day, or a time with the default length. */
export function placementOfTarget(
  target: AgendaDropTarget,
  options: ResolvedAgendaOptions,
): AgendaPlacement {
  const { timeZone } = options;
  const resourceIds = target.resourceId ? [target.resourceId] : [];
  const slot =
    target.slotIndex === undefined
      ? undefined
      : options.slots[target.slotIndex];
  if (slot) {
    return {
      start: zonedEpoch(target.day, parseTimeOfDay(slot.start, 0), timeZone),
      end: zonedEpoch(target.day, parseTimeOfDay(slot.end, 0), timeZone),
      allDay: false,
      resourceIds,
    };
  }
  if (target.allDay || target.minutes === undefined) {
    return {
      start: dayStartEpoch(target.day, timeZone),
      end: dayStartEpoch(addDays(target.day, 1), timeZone),
      allDay: true,
      resourceIds,
    };
  }
  const start = zonedEpoch(target.day, target.minutes, timeZone);
  return {
    start,
    end: start + options.defaultDurationMinutes * MINUTE_MS,
    allDay: false,
    resourceIds,
  };
}

/** The days of a `twoClicks` range, in order, as one all-day placement. */
export function placementOfDays(
  first: AgendaRangeAnchor,
  second: AgendaDropTarget,
  timeZone: string,
): AgendaPlacement {
  const from = minDayKey(first.day, second.day);
  const to = maxDayKey(first.day, second.day);
  const resourceId = first.resourceId ?? second.resourceId;
  return {
    start: dayStartEpoch(from, timeZone),
    end: dayStartEpoch(addDays(to, 1), timeZone),
    allDay: true,
    resourceIds: resourceId ? [resourceId] : [],
  };
}

/** What `{{row.X}}` of `selectAction` reads on a placement: days for all-day (the last inclusive), instants otherwise. */
export function placementRow(
  placement: AgendaPlacement,
  timeZone: string,
): Record<string, unknown> {
  const from = placement.allDay
    ? zonedDayKey(placement.start, timeZone)
    : zonedIso(placement.start, timeZone);
  const to = placement.allDay
    ? zonedDayKey(placement.end - 1, timeZone)
    : zonedIso(placement.end, timeZone);
  return {
    from,
    to,
    allDay: placement.allDay,
    resourceId: placement.resourceIds[0],
    resourceIds: placement.resourceIds,
  };
}

/**
 * The toolbar's "+ New": the next whole hour of today when the range shows
 * today, else 09:00 on the range's first day, never before `dayStart`.
 */
export function newEventPlacement(
  range: Pick<AgendaRange, "from" | "to">,
  today: AgendaDayKey,
  now: number,
  options: ResolvedAgendaOptions,
): AgendaPlacement {
  const isTodayShown = today >= range.from && today <= range.to;
  const day = isTodayShown ? today : range.from;
  const nextHour =
    (Math.floor(zonedMinutes(now, options.timeZone) / MINUTES_PER_HOUR) + 1) *
    MINUTES_PER_HOUR;
  const minutes = Math.max(
    isTodayShown ? nextHour : DEFAULT_NEW_MINUTES,
    options.dayStartMinutes,
  );
  return placementOfTarget(
    { day, minutes: Math.min(minutes, LATEST_NEW_MINUTES) },
    options,
  );
}
