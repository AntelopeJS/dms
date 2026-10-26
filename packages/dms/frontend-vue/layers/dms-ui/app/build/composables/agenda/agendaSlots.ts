// Slot math of the agenda: named parts of the day ("S1" 08:00–10:00), the
// slot an instant falls in, N slots later across days (hidden days skipped,
// past the day's last slot into the next shown day's first), and the
// instants a run of slots covers. Zoned math comes from `agendaTime`.

import type { AgendaSlot } from "../../../types/full-agenda";
import type { AgendaDayKey } from "./agendaModel";
import {
  DAYS_PER_WEEK,
  MINUTES_PER_DAY,
  addDays,
  daysBetween,
  parseTimeOfDay,
  weekdayOf,
  zonedDayKey,
  zonedEpoch,
  zonedMinutes,
} from "./agendaTime";

/** A safety bound on day walks (a range of hidden days only). */
const MAX_DAY_WALK = 3660;

/** A slot of the options with its times as minutes from midnight. */
export interface ParsedAgendaSlot {
  id: string;
  label: AgendaSlot["label"];
  startMinutes: number;
  endMinutes: number;
}

/** A slot of one day: the day and the index of the slot in the day. */
export interface AgendaSlotPosition {
  day: AgendaDayKey;
  slotIndex: number;
}

/** An instant span, epoch ms, end exclusive. */
export interface AgendaEpochSpan {
  start: number;
  end: number;
}

/** A day and a wall-clock time in the agenda's zone. */
export interface AgendaWallClock {
  day: AgendaDayKey;
  minutes: number;
}

/** The day and wall-clock minutes of an instant in a zone. */
export function zonedWallClock(
  epochMs: number,
  timeZone: string,
): AgendaWallClock {
  return {
    day: zonedDayKey(epochMs, timeZone),
    minutes: zonedMinutes(epochMs, timeZone),
  };
}

/** The slots of the options, their times parsed, in order of start. */
export function parseSlots(slots: readonly AgendaSlot[]): ParsedAgendaSlot[] {
  return slots
    .map((slot) => ({
      id: slot.id,
      label: slot.label,
      startMinutes: parseTimeOfDay(slot.start, 0),
      endMinutes: parseTimeOfDay(slot.end, MINUTES_PER_DAY),
    }))
    .filter((slot) => slot.endMinutes > slot.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

/** The day `step` shown days after `day` (hidden weekdays skipped). */
export function shiftShownDay(
  day: AgendaDayKey,
  step: number,
  hiddenDays: readonly number[],
): AgendaDayKey {
  if (hiddenDays.length >= DAYS_PER_WEEK) return addDays(day, step);
  const direction = step < 0 ? -1 : 1;
  let left = Math.abs(step);
  let key = day;
  for (let guard = 0; left > 0 && guard < MAX_DAY_WALK; guard += 1) {
    key = addDays(key, direction);
    if (!hiddenDays.includes(weekdayOf(key))) left -= 1;
  }
  return key;
}

/**
 * The index of the slot holding a wall-clock time, `-1` when it falls
 * between slots (a lunch break) or outside them.
 */
export function slotIndexAt(
  minutes: number,
  slots: readonly ParsedAgendaSlot[],
): number {
  return slots.findIndex(
    (slot) => minutes >= slot.startMinutes && minutes < slot.endMinutes,
  );
}

/**
 * The slot an instant falls in. Between two slots, or after the last one of
 * its day, it takes the next slot (on the next shown day when need be); on a
 * hidden day, the first slot of the next shown day.
 */
export function slotPositionOf(
  epochMs: number,
  slots: readonly ParsedAgendaSlot[],
  timeZone: string,
  hiddenDays: readonly number[] = [],
): AgendaSlotPosition | null {
  if (!slots.length) return null;
  const { day, minutes } = zonedWallClock(epochMs, timeZone);
  if (hiddenDays.includes(weekdayOf(day))) {
    return { day: shiftShownDay(day, 1, hiddenDays), slotIndex: 0 };
  }
  const inside = slotIndexAt(minutes, slots);
  if (inside >= 0) return { day, slotIndex: inside };
  const next = slots.findIndex((slot) => slot.startMinutes > minutes);
  if (next >= 0) return { day, slotIndex: next };
  return { day: shiftShownDay(day, 1, hiddenDays), slotIndex: 0 };
}

/**
 * The slot `count` slots after a position (before, when negative), running
 * on into the next shown days' first slots past the day's last one.
 */
export function addSlots(
  position: AgendaSlotPosition,
  count: number,
  slotCount: number,
  hiddenDays: readonly number[] = [],
): AgendaSlotPosition {
  if (slotCount <= 0) return position;
  const absolute = position.slotIndex + count;
  const dayStep = Math.floor(absolute / slotCount);
  const slotIndex = absolute - dayStep * slotCount;
  const day = dayStep
    ? shiftShownDay(position.day, dayStep, hiddenDays)
    : position.day;
  return { day, slotIndex };
}

/**
 * Slots from one position to another (negative backwards), counting shown
 * days only: the distance a slot drag moved, the length of a picked run.
 */
export function slotsBetween(
  from: AgendaSlotPosition,
  to: AgendaSlotPosition,
  slotCount: number,
  hiddenDays: readonly number[] = [],
): number {
  const span = daysBetween(from.day, to.day);
  const step = span < 0 ? -1 : 1;
  let shownDays = 0;
  let day = from.day;
  for (let walked = 0; walked < Math.abs(span); walked += 1) {
    day = addDays(day, step);
    if (!hiddenDays.includes(weekdayOf(day))) shownDays += step;
  }
  return shownDays * slotCount + to.slotIndex - from.slotIndex;
}

/** The instants a slot of a day covers. */
export function slotEpochRange(
  position: AgendaSlotPosition,
  slots: readonly ParsedAgendaSlot[],
  timeZone: string,
): AgendaEpochSpan {
  const slot = slots[position.slotIndex] ?? slots[0];
  if (!slot) {
    const start = zonedEpoch(position.day, 0, timeZone);
    return { start, end: zonedEpoch(position.day, MINUTES_PER_DAY, timeZone) };
  }
  return {
    start: zonedEpoch(position.day, slot.startMinutes, timeZone),
    end: zonedEpoch(position.day, slot.endMinutes, timeZone),
  };
}

/**
 * The instants `count` slots from a position cover: from the start of the
 * first to the end of the last, which may be days later (an event of six
 * quarter days starting on the afternoon's first slot ends the next day).
 */
export function slotSpan(
  position: AgendaSlotPosition,
  count: number,
  slots: readonly ParsedAgendaSlot[],
  timeZone: string,
  hiddenDays: readonly number[] = [],
): AgendaEpochSpan {
  const last = addSlots(
    position,
    Math.max(1, count) - 1,
    slots.length,
    hiddenDays,
  );
  return {
    start: slotEpochRange(position, slots, timeZone).start,
    end: slotEpochRange(last, slots, timeZone).end,
  };
}

/**
 * How many slots of shown days a span touches (at least 1): the length of
 * an event in slots, kept when it is dragged to another slot.
 */
export function countSlots(
  span: AgendaEpochSpan,
  slots: readonly ParsedAgendaSlot[],
  timeZone: string,
  hiddenDays: readonly number[] = [],
): number {
  const first = slotPositionOf(span.start, slots, timeZone, hiddenDays);
  if (!first) return 1;
  let count = 0;
  let position = first;
  for (let guard = 0; guard < MAX_DAY_WALK; guard += 1) {
    const range = slotEpochRange(position, slots, timeZone);
    if (range.start >= span.end) break;
    count += 1;
    position = addSlots(position, 1, slots.length, hiddenDays);
  }
  return Math.max(1, count);
}
