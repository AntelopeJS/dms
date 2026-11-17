import type { Data } from "../../components/table/Table.types";
import type {
  AgendaBackground,
  AgendaResource,
} from "../../../types/full-agenda";
import { backgroundAppliesTo, backgroundSpans } from "./agendaBackgroundSpans";
import type {
  AgendaDayKey,
  AgendaPlacement,
  AgendaRange,
  AgendaRangeAnchor,
  ResolvedAgendaOptions,
} from "./agendaModel";
import type { AgendaDropTarget } from "./agendaDragModel";
import {
  addDays,
  dayStartEpoch,
  isDayKey,
  maxDayKey,
  minDayKey,
  MINUTE_MS,
  zonedDayKey,
  zonedEpoch,
  zonedIso,
  zonedMinutes,
} from "./agendaTime";
import { parseSlots } from "./agendaSlots";

const MINUTES_PER_HOUR = 60;
const DEFAULT_NEW_MINUTES = 9 * MINUTES_PER_HOUR;
const LATEST_NEW_MINUTES = 23 * MINUTES_PER_HOUR;

/**
 * Where a click on an empty spot creates: a slot (its index among the slots
 * as `parseSlots` orders them, as the views do), a day, or a time with the
 * default length, at the instant under the pointer when the view knows it
 * (the second 02:30 of a fall-back day). The "no resource" row gives none.
 */
export function placementOfTarget(
  target: AgendaDropTarget,
  options: ResolvedAgendaOptions,
): AgendaPlacement {
  const { timeZone } = options;
  const resourceIds =
    target.resourceId && !target.unassigned ? [target.resourceId] : [];
  const slot =
    target.slotIndex === undefined
      ? undefined
      : parseSlots(options.slots)[target.slotIndex];
  if (slot) {
    return {
      start: zonedEpoch(target.day, slot.startMinutes, timeZone),
      end: zonedEpoch(target.day, slot.endMinutes, timeZone),
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
  const start =
    target.instant ?? zonedEpoch(target.day, target.minutes, timeZone);
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
  const resourceId =
    first.resourceId ?? (second.unassigned ? undefined : second.resourceId);
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
): Data {
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

/** What decides whether the agenda is open: the resources shown and the shading behind them. */
export interface AgendaOpenness {
  resourceIds: readonly string[];
  backgrounds: readonly AgendaBackground[];
}

/**
 * The first instant of `day` from `fromMinutes` on where at least one shown
 * resource has no timed `closed` background; `null`
 * when every instant until the day's end is closed. A background with no
 * `resourceIds` closes every resource.
 */
export function firstOpenInstant(
  day: AgendaDayKey,
  fromMinutes: number,
  timeZone: string,
  openness: AgendaOpenness,
): number | null {
  const closed = backgroundSpans(
    openness.backgrounds.filter(
      (background) =>
        background.kind === "closed" &&
        !background.allDay &&
        !isDayKey(background.start),
    ),
    timeZone,
  );
  const rows: Array<string | null> = openness.resourceIds.length
    ? [...openness.resourceIds]
    : [null];
  const isOpenAt = (instant: number) =>
    rows.some(
      (row) =>
        !closed.some(
          (span) =>
            backgroundAppliesTo(span, row) &&
            span.start <= instant &&
            instant < span.end,
        ),
    );
  const from = zonedEpoch(day, fromMinutes, timeZone);
  const dayEnd = dayStartEpoch(addDays(day, 1), timeZone);
  const candidates = [
    from,
    ...closed.map((span) => span.end).filter((end) => end > from),
  ]
    .filter((instant) => instant < dayEnd)
    .sort((a, b) => a - b);
  return candidates.find(isOpenAt) ?? null;
}

/**
 * The toolbar's "+ New": the next whole hour of today when the range shows
 * today, else 09:00 on the range's first day, never before `dayStart`, then
 * moved to the first minute at or after it where the agenda is open (see
 * `firstOpenInstant`), so a new event does not start in a closed zone.
 */
export function newEventPlacement(
  range: Pick<AgendaRange, "from" | "to">,
  today: AgendaDayKey,
  now: number,
  options: ResolvedAgendaOptions,
  openness?: AgendaOpenness,
): AgendaPlacement {
  const isTodayShown = today >= range.from && today <= range.to;
  const day = isTodayShown ? today : range.from;
  const nextHour =
    (Math.floor(zonedMinutes(now, options.timeZone) / MINUTES_PER_HOUR) + 1) *
    MINUTES_PER_HOUR;
  const minutes = Math.min(
    Math.max(
      isTodayShown ? nextHour : DEFAULT_NEW_MINUTES,
      options.dayStartMinutes,
    ),
    LATEST_NEW_MINUTES,
  );
  const open = openness
    ? firstOpenInstant(day, minutes, options.timeZone, openness)
    : null;
  return placementOfTarget(
    {
      day,
      minutes: open === null ? minutes : zonedMinutes(open, options.timeZone),
      instant: open ?? undefined,
    },
    options,
  );
}

/**
 * The resource a new event placed on none starts on (`create.defaultResource`):
 * the first of `resources` (the shown ones, in
 * order) that its calendar usually works on, else the first that takes
 * events; `undefined` when none does.
 */
export function defaultResourceOf(
  resources: readonly AgendaResource[],
  calendarId: string | undefined,
): string | undefined {
  const open = resources.filter((resource) => resource.editable !== false);
  const usual =
    calendarId === undefined
      ? undefined
      : open.find((resource) => resource.calendarId === calendarId);
  return (usual ?? open[0])?.id;
}
