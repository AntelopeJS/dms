// Where a drag puts an event: the placement of a move, a resize, a range
// picked on empty time or a pending item dropped in, from the point the
// pointer went down (`origin`) and the one it is over (`target`). Pure: the
// drag engine calls it on each pointer move, the tests call it directly.
//
// A target is one of three kinds: a time (`minutes`, time grids and
// timelines by hour), a named slot (`slotIndex`), or a day alone (month,
// year, timeline by day, the all-day row). Over a day alone an event keeps
// its kind and time of day; only the time grid's all-day row (`asAllDay`)
// turns a timed event into an all-day one.

import type { AgendaPendingItem } from "../../../types/full-agenda";
import type {
  AgendaDayKey,
  AgendaDragKind,
  AgendaDropTarget,
  AgendaOccurrence,
  AgendaPlacement,
} from "./agendaModel";
import {
  MINUTE_MS,
  addDays,
  daysBetween,
  zonedDayKey,
  zonedEpoch,
} from "./agendaTime";
import { addSlots, countSlots, slotEpochRange } from "./agendaSlots";
import type { AgendaSlotPosition } from "./agendaSlots";
import { slotDistance, slotOfTime, slotPlacement } from "./agendaDragSlots";
import type { AgendaSlotConfig } from "./agendaDragSlots";

/** The options a placement reads. */
export interface AgendaDragConfig extends AgendaSlotConfig {
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

const isTimeTarget = (target: AgendaDropTarget | null) =>
  target?.minutes !== undefined;

const isSlotTarget = (
  target: AgendaDropTarget | null,
  config: AgendaDragConfig,
) =>
  target?.slotIndex !== undefined &&
  target.minutes === undefined &&
  config.slots.length > 0;

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

function allDayPlacement(
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

/** The resources after a move: the one grabbed swapped for the one hovered. */
function movedResources(
  source: AgendaDragSource,
  target: AgendaDropTarget,
): string[] {
  const current = source.occurrence?.resourceIds ?? [];
  if (!target.resourceId) return [...current];
  const from = source.origin?.resourceId;
  if (!from || !current.includes(from)) return [target.resourceId];
  return [
    ...new Set(current.map((id) => (id === from ? target.resourceId! : id))),
  ];
}

const durationMs = (occurrence: AgendaOccurrence) =>
  occurrence.end - occurrence.start;

/** The occurrence moved by whole days, keeping its kind and time of day. */
function shiftDays(
  occurrence: AgendaOccurrence,
  days: number,
  resourceIds: string[],
  config: AgendaDragConfig,
): AgendaPlacement {
  if (occurrence.allDay) {
    return allDayPlacement(
      addDays(occurrence.startDay, days),
      addDays(occurrence.endDay, days),
      resourceIds,
      config,
    );
  }
  const start = zonedEpoch(
    addDays(occurrence.startDay, days),
    occurrence.startMinutes,
    config.timeZone,
  );
  return {
    start,
    end: start + durationMs(occurrence),
    allDay: false,
    resourceIds,
  };
}

function placeMoveAtTime(
  occurrence: AgendaOccurrence,
  origin: AgendaDropTarget,
  target: AgendaDropTarget,
  resourceIds: string[],
  config: AgendaDragConfig,
): AgendaPlacement {
  const minutes = target.minutes!;
  // From the all-day row, or a day cell: the event starts where it is dropped.
  if (occurrence.allDay || origin.minutes === undefined) {
    const start = zonedEpoch(
      target.day,
      snapTo(minutes, config.snapMinutes),
      config.timeZone,
    );
    const length = occurrence.allDay
      ? config.defaultDurationMinutes * MINUTE_MS
      : durationMs(occurrence);
    return { start, end: start + length, allDay: false, resourceIds };
  }
  // The grab point keeps its place in the event: the delta snaps, not the start.
  const delta = snapTo(minutes - origin.minutes, config.snapMinutes);
  const start = zonedEpoch(
    addDays(occurrence.startDay, daysBetween(origin.day, target.day)),
    occurrence.startMinutes + delta,
    config.timeZone,
  );
  return {
    start,
    end: start + durationMs(occurrence),
    allDay: false,
    resourceIds,
  };
}

function placeMoveOnSlot(
  occurrence: AgendaOccurrence,
  origin: AgendaDropTarget,
  target: AgendaDropTarget,
  resourceIds: string[],
  config: AgendaDragConfig,
): AgendaPlacement {
  const count = occurrence.allDay
    ? 1
    : countSlots(occurrence, config.slots, config.timeZone, config.hiddenDays);
  const hovered: AgendaSlotPosition = {
    day: target.day,
    slotIndex: target.slotIndex!,
  };
  if (origin.slotIndex === undefined || occurrence.allDay) {
    return slotPlacement(hovered, count, resourceIds, config);
  }
  // The slot grabbed keeps its place in the event.
  const own = slotOfTime(occurrence.startDay, occurrence.startMinutes, config);
  const moved = slotDistance(
    { day: origin.day, slotIndex: origin.slotIndex },
    hovered,
    config,
  );
  return slotPlacement(
    addSlots(own, moved, config.slots.length, config.hiddenDays),
    count,
    resourceIds,
    config,
  );
}

function placeMove(
  source: AgendaDragSource,
  target: AgendaDropTarget,
  config: AgendaDragConfig,
): AgendaPlacement {
  const occurrence = source.occurrence!;
  const origin: AgendaDropTarget = source.origin ?? {
    day: occurrence.startDay,
    minutes: occurrence.allDay ? undefined : occurrence.startMinutes,
  };
  if (target.pending) return occurrencePlacement(occurrence);
  const resourceIds = movedResources(source, target);
  const days = daysBetween(origin.day, target.day);
  if (target.asAllDay) {
    return origin.asAllDay || occurrence.allDay
      ? shiftDays(occurrence, days, resourceIds, config)
      : allDayPlacement(target.day, target.day, resourceIds, config);
  }
  if (isTimeTarget(target)) {
    return placeMoveAtTime(occurrence, origin, target, resourceIds, config);
  }
  if (isSlotTarget(target, config)) {
    return placeMoveOnSlot(occurrence, origin, target, resourceIds, config);
  }
  return shiftDays(occurrence, days, resourceIds, config);
}

/** Keeps a timed length between the shortest and the longest allowed. */
function clampLength(length: number, config: AgendaDragConfig): number {
  const min = Math.max(config.minDurationMinutes, 1) * MINUTE_MS;
  const max = config.maxDurationMinutes
    ? config.maxDurationMinutes * MINUTE_MS
    : Infinity;
  return Math.min(Math.max(length, min), max);
}

/** The instant a resize edge is dragged to, or `null` over a day alone. */
function edgeInstant(
  target: AgendaDropTarget,
  edge: "start" | "end",
  config: AgendaDragConfig,
): number | null {
  if (isTimeTarget(target)) {
    return zonedEpoch(
      target.day,
      snapTo(target.minutes!, config.snapMinutes),
      config.timeZone,
    );
  }
  if (!isSlotTarget(target, config)) return null;
  const range = slotEpochRange(
    { day: target.day, slotIndex: target.slotIndex! },
    config.slots,
    config.timeZone,
  );
  return edge === "start" ? range.start : range.end;
}

function placeResize(
  source: AgendaDragSource,
  target: AgendaDropTarget,
  config: AgendaDragConfig,
): AgendaPlacement {
  const occurrence = source.occurrence!;
  const isEnd = source.kind === "resizeEnd";
  const resourceIds = [...occurrence.resourceIds];
  if (occurrence.allDay) {
    return isEnd
      ? allDayPlacement(
          occurrence.startDay,
          target.day < occurrence.startDay ? occurrence.startDay : target.day,
          resourceIds,
          config,
        )
      : allDayPlacement(
          target.day > occurrence.endDay ? occurrence.endDay : target.day,
          occurrence.endDay,
          resourceIds,
          config,
        );
  }
  const edge =
    edgeInstant(target, isEnd ? "end" : "start", config) ??
    zonedEpoch(
      target.day,
      isEnd ? occurrence.endMinutes : occurrence.startMinutes,
      config.timeZone,
    );
  if (isEnd) {
    const end = occurrence.start + clampLength(edge - occurrence.start, config);
    return { start: occurrence.start, end, allDay: false, resourceIds };
  }
  const start = occurrence.end - clampLength(occurrence.end - edge, config);
  return { start, end: occurrence.end, allDay: false, resourceIds };
}

/** Orders two targets in time (day, then minutes or slot). */
function ordered(
  a: AgendaDropTarget,
  b: AgendaDropTarget,
): [AgendaDropTarget, AgendaDropTarget] {
  const rank = (target: AgendaDropTarget) =>
    target.minutes ?? target.slotIndex ?? 0;
  if (a.day !== b.day) return a.day < b.day ? [a, b] : [b, a];
  return rank(a) <= rank(b) ? [a, b] : [b, a];
}

function placeRange(
  source: AgendaDragSource,
  target: AgendaDropTarget,
  config: AgendaDragConfig,
): AgendaPlacement {
  const origin = source.origin ?? target;
  const resourceIds = origin.resourceId ? [origin.resourceId] : [];
  const [low, high] = ordered(origin, target);
  if (isTimeTarget(origin) && isTimeTarget(target)) {
    const snap = Math.max(config.snapMinutes, 1);
    const start = zonedEpoch(
      low.day,
      Math.floor(low.minutes! / snap) * snap,
      config.timeZone,
    );
    // The cell under the pointer is part of the range.
    const end = zonedEpoch(
      high.day,
      Math.floor(high.minutes! / snap) * snap + snap,
      config.timeZone,
    );
    return {
      start,
      end: start + clampLength(end - start, config),
      allDay: false,
      resourceIds,
    };
  }
  if (isSlotTarget(origin, config) && isSlotTarget(target, config)) {
    const first: AgendaSlotPosition = {
      day: low.day,
      slotIndex: low.slotIndex!,
    };
    const count =
      slotDistance(
        first,
        { day: high.day, slotIndex: high.slotIndex! },
        config,
      ) + 1;
    return slotPlacement(first, count, resourceIds, config);
  }
  return allDayPlacement(low.day, high.day, resourceIds, config);
}

function itemLength(item: AgendaPendingItem, config: AgendaDragConfig): number {
  return (item.durationMinutes ?? config.defaultDurationMinutes) * MINUTE_MS;
}

function placeExternal(
  source: AgendaDragSource,
  target: AgendaDropTarget,
  config: AgendaDragConfig,
): AgendaPlacement {
  const item = source.item!;
  const resourceIds = target.resourceId ? [target.resourceId] : [];
  if (item.allDay || target.asAllDay) {
    return allDayPlacement(target.day, target.day, resourceIds, config);
  }
  const bySlots = item.durationSlots !== undefined && config.slots.length > 0;
  if (isSlotTarget(target, config) || (bySlots && isTimeTarget(target))) {
    const first =
      target.slotIndex !== undefined
        ? { day: target.day, slotIndex: target.slotIndex }
        : slotOfTime(target.day, target.minutes!, config);
    if (bySlots)
      return slotPlacement(first, item.durationSlots!, resourceIds, config);
    const start = slotEpochRange(first, config.slots, config.timeZone).start;
    return {
      start,
      end: start + itemLength(item, config),
      allDay: false,
      resourceIds,
    };
  }
  const minutes = isTimeTarget(target)
    ? snapTo(target.minutes!, config.snapMinutes)
    : config.dayDropMinutes;
  const start = zonedEpoch(target.day, minutes, config.timeZone);
  return {
    start,
    end: start + itemLength(item, config),
    allDay: false,
    resourceIds,
  };
}

type Placer = (
  source: AgendaDragSource,
  target: AgendaDropTarget,
  config: AgendaDragConfig,
) => AgendaPlacement;

const PLACERS: Record<AgendaDragKind, Placer> = {
  move: placeMove,
  resizeStart: placeResize,
  resizeEnd: placeResize,
  create: placeRange,
  select: placeRange,
  external: placeExternal,
};

/** The placement a drag gives over `target`. */
export function placeDrag(
  source: AgendaDragSource,
  target: AgendaDropTarget,
  config: AgendaDragConfig,
): AgendaPlacement {
  return PLACERS[source.kind](source, target, config);
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
