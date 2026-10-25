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
  MINUTES_PER_DAY,
  MINUTE_MS,
  zonedMinutes,
  zonedDayKey,
  zonedEpoch,
} from "./agendaTime";
import {
  addSlots,
  slotEpochRange,
  slotPositionOf,
  slotSpan,
} from "./agendaSlots";
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

/**
 * The last slot an event ending at `end` covers: the slot holding the
 * minute before its end, or the one before when it ends in a gap (lunch).
 */
export function slotEndingAt(
  end: number,
  config: Pick<AgendaDragConfig, "slots" | "hiddenDays" | "timeZone">,
): AgendaSlotPosition {
  const holding = slotAtInstant(end - 1, config);
  const range = slotEpochRange(holding, config.slots, config.timeZone);
  return range.start >= end
    ? addSlots(holding, -1, config.slots.length, config.hiddenDays)
    : holding;
}

/**
 * An instant snapped to `step` minutes of its zone's wall clock, moved by
 * the snap's difference: the second 02:30 of a fall-back day snaps to the
 * second 02:30, which a wall time read back would turn into the first.
 */
export function snapInstant(
  epoch: number,
  step: number,
  timeZone: string,
  mode: "round" | "floor" = "round",
): number {
  if (step <= 0) return epoch;
  const seconds = (((epoch % MINUTE_MS) + MINUTE_MS) % MINUTE_MS) / MINUTE_MS;
  const exact = zonedMinutes(epoch, timeZone) + seconds;
  const snapped = Math[mode](exact / step) * step;
  const moved = epoch + (snapped - exact) * MINUTE_MS;
  // Moving by the difference keeps a repeated hour's pass, but across a
  // spring-forward gap (a step over an hour) the wall clock jumped: land on
  // the snapped wall time itself, past the gap.
  const wall =
    ((snapped % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (zonedMinutes(moved, timeZone) === wall) return moved;
  return zonedEpoch(zonedDayKey(epoch, timeZone), snapped, timeZone);
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
