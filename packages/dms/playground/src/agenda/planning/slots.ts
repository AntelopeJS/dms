import { addDays, dayOf, timeOf, weekdayOf, zonedInstant } from "../time";
import { PLANNING_SLOTS } from "./data";

const SATURDAY = 6;
const SUNDAY = 0;

/** Whether the planning counts a day: Monday to Friday. */
export function isWorkingDay(day: string): boolean {
  const weekday = weekdayOf(day);
  return weekday !== SATURDAY && weekday !== SUNDAY;
}

/** The working day after a day. */
export function nextWorkingDay(day: string): string {
  let next = addDays(day, 1);
  while (!isWorkingDay(next)) next = addDays(next, 1);
  return next;
}

/** The working day `count` working days after a Monday (0 is the Monday). */
export function workingDayFrom(monday: string, count: number): string {
  let day = monday;
  for (let step = 0; step < count; step += 1) day = nextWorkingDay(day);
  return day;
}

/** A slot of a day: the day and the slot's index (0 for S1). */
interface SlotPlace {
  day: string;
  index: number;
}

function slotAfter(place: SlotPlace): SlotPlace {
  if (place.index + 1 < PLANNING_SLOTS.length) {
    return { day: place.day, index: place.index + 1 };
  }
  return { day: nextWorkingDay(place.day), index: 0 };
}

/** Start and end of a task. */
export interface TaskSpan {
  start: string;
  end: string;
}

/**
 * The start and end of a task of `count` slots starting at slot `index` of
 * `day`: past the day's last slot, it runs on into the next working day.
 */
export function slotSpan(day: string, index: number, count: number): TaskSpan {
  let last: SlotPlace = { day, index };
  for (let step = 1; step < count; step += 1) last = slotAfter(last);
  const first = PLANNING_SLOTS[index] ?? PLANNING_SLOTS[0];
  const final = PLANNING_SLOTS[last.index] ?? PLANNING_SLOTS[0];
  return {
    start: zonedInstant(day, first?.start ?? "08:00"),
    end: zonedInstant(last.day, final?.end ?? "10:00"),
  };
}

/** The slot an instant starts, or `undefined` off a slot start. */
export function slotAt(instant: string): SlotPlace | undefined {
  const index = PLANNING_SLOTS.findIndex(
    (slot) => slot.start === timeOf(instant),
  );
  return index < 0 ? undefined : { day: dayOf(instant), index };
}

/** A task of `count` slots moved to start one slot later. */
export function oneSlotLater(
  start: string,
  count: number,
): TaskSpan | undefined {
  const place = slotAt(start);
  if (!place) return undefined;
  const next = slotAfter(place);
  return slotSpan(next.day, next.index, count);
}

const MAX_SLOTS = 40;

/** How many slots a task spans, from its start to its end. */
export function slotCount(start: string, end: string): number {
  const place = slotAt(start);
  if (!place) return 1;
  const until = Date.parse(end);
  let count = 1;
  let current = place;
  while (count < MAX_SLOTS) {
    const span = slotSpan(current.day, current.index, 1);
    if (Date.parse(span.end) >= until) break;
    current = slotAfter(current);
    count += 1;
  }
  return count;
}

/** "jeudi S2": the day and slot a task starts, as the planners say it. */
export function slotLabel(instant: string): string {
  const day = new Intl.DateTimeFormat("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${dayOf(instant)}T12:00:00Z`));
  const slot = slotAt(instant);
  return slot ? `${day}, ${PLANNING_SLOTS[slot.index]?.id ?? ""}` : day;
}
