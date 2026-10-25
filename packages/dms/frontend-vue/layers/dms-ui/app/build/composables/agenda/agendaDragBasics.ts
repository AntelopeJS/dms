// The shared pieces of the drag math: what a placement reads, what is
// dragged, the placements an occurrence or a run of days or slots makes,
// and the slot arithmetic of a drag (over `agendaSlots`).

import type { AgendaPendingItem } from "../../../types/full-agenda";
import type {
  AgendaDayKey,
  AgendaDragKind,
  AgendaDropTarget,
  AgendaOccurrence,
  AgendaPlacement,
} from "./agendaModel";
import {
  addDays,
  daysBetween,
  weekdayOf,
  zonedDayKey,
  zonedEpoch,
} from "./agendaTime";
import { slotPositionOf, slotSpan } from "./agendaSlots";
import type { AgendaSlotPosition, ParsedAgendaSlot } from "./agendaSlots";

/** The options a placement reads. */
export interface AgendaDragConfig {
  timeZone: string;
  /** The block's named slots, parsed (`parseSlots`): their indices are the targets' `slotIndex`. */
  slots: ParsedAgendaSlot[];
  hiddenDays: number[];
  snapMinutes: number;
  defaultDurationMinutes: number;
  /** Where a timed item dropped on a day alone starts (minutes). */
  dayDropMinutes: number;
  /** The shortest a resize or a range may make an event. */
  minDurationMinutes: number;
  maxDurationMinutes?: number;
}

/** What is being dragged, and where the pointer went down. */
export interface AgendaDragSource {
  kind: AgendaDragKind;
  occurrence?: AgendaOccurrence;
  item?: AgendaPendingItem;
  origin: AgendaDropTarget | null;
}

/** Rounds `minutes` to the nearest multiple of `step`. */
export function snapTo(minutes: number, step: number): number {
  return step > 0 ? Math.round(minutes / step) * step : minutes;
}

/** The slot an instant falls in (the next one between two, hidden days skipped). */
export function slotAtInstant(
  epoch: number,
  config: Pick<AgendaDragConfig, "slots" | "hiddenDays" | "timeZone">,
): AgendaSlotPosition {
  return (
    slotPositionOf(epoch, config.slots, config.timeZone, config.hiddenDays) ?? {
      day: zonedDayKey(epoch, config.timeZone),
      slotIndex: 0,
    }
  );
}

/** Slots from one slot to another, counting shown days only. */
export function slotsBetween(
  from: AgendaSlotPosition,
  to: AgendaSlotPosition,
  config: Pick<AgendaDragConfig, "slots" | "hiddenDays">,
): number {
  const span = daysBetween(from.day, to.day);
  const step = span < 0 ? -1 : 1;
  let shownDays = 0;
  let day = from.day;
  for (let walked = 0; walked < Math.abs(span); walked += 1) {
    day = addDays(day, step);
    if (!config.hiddenDays.includes(weekdayOf(day))) shownDays += step;
  }
  return shownDays * config.slots.length + to.slotIndex - from.slotIndex;
}

/** A run of `count` slots from a slot, running on into the next shown days. */
export function slotPlacement(
  first: AgendaSlotPosition,
  count: number,
  resourceIds: string[],
  config: AgendaDragConfig,
): AgendaPlacement {
  const span = slotSpan(
    first,
    count,
    config.slots,
    config.timeZone,
    config.hiddenDays,
  );
  return { ...span, allDay: false, resourceIds };
}

export const timedFrom = (
  start: number,
  length: number,
  resourceIds: string[],
): AgendaPlacement => ({
  start,
  end: start + length,
  allDay: false,
  resourceIds,
});

/** The placement an occurrence has now. */
export function occurrencePlacement(
  occurrence: AgendaOccurrence,
): AgendaPlacement {
  return {
    start: occurrence.start,
    end: occurrence.end,
    allDay: occurrence.allDay,
    resourceIds: [...occurrence.resourceIds],
  };
}

/** Both placements put an event at the same place. */
export function samePlacement(a: AgendaPlacement, b: AgendaPlacement): boolean {
  return (
    a.start === b.start &&
    a.end === b.end &&
    a.allDay === b.allDay &&
    a.resourceIds.length === b.resourceIds.length &&
    a.resourceIds.every((id) => b.resourceIds.includes(id))
  );
}

export function allDayPlacement(
  first: AgendaDayKey,
  last: AgendaDayKey,
  resourceIds: string[],
  config: AgendaDragConfig,
): AgendaPlacement {
  const [from, to] = first <= last ? [first, last] : [last, first];
  return {
    start: zonedEpoch(from, 0, config.timeZone),
    end: zonedEpoch(addDays(to, 1), 0, config.timeZone),
    allDay: true,
    resourceIds,
  };
}

/** The last day a placement covers, inclusive. */
export function lastDayOf(
  placement: AgendaPlacement,
  timeZone: string,
): AgendaDayKey {
  return placement.allDay
    ? addDays(zonedDayKey(placement.end, timeZone), -1)
    : zonedDayKey(placement.end - 1, timeZone);
}
