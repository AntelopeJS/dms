// The keyboard alternative to dragging: Alt+↑/↓ moves a focused event by
// the snap (by a slot on a timeline by slot), Alt+←/→ by a shown day,
// Alt+Shift+↑/↓ moves its end. Each key is read as a drag from where the
// event is to where the key sends it.

import type { AgendaDropTarget, AgendaOccurrence } from "./agendaModel";
import type { AgendaDragSource } from "./agendaDragBasics";
import { slotAtInstant, slotEndingAt } from "./agendaDragBasics";
import { MINUTES_PER_DAY, MINUTE_MS } from "./agendaTime";
import { addSlots, shiftShownDay } from "./agendaSlots";
import type { ParsedAgendaSlot } from "./agendaSlots";

/** What a key moves: whole days, or snaps of time (slots on a timeline by slot). */
export interface AgendaKeyStep {
  days: number;
  snaps: number;
}

export const AGENDA_KEY_STEPS: Record<string, AgendaKeyStep> = {
  ArrowUp: { days: 0, snaps: -1 },
  ArrowDown: { days: 0, snaps: 1 },
  ArrowLeft: { days: -1, snaps: 0 },
  ArrowRight: { days: 1, snaps: 0 },
};

/** What a key's move reads of the view. */
export interface AgendaNudgeContext {
  snapMinutes: number;
  /** The days the view leaves out: a day step jumps over them. */
  hiddenDays: number[];
  timeZone: string;
  /** The parsed slots of a timeline by slot (empty elsewhere: time grids snap to minutes). */
  slots: ParsedAgendaSlot[];
}

/** The step of a key event, when it is one (Alt held, an arrow). */
export function keyStep(event: KeyboardEvent): AgendaKeyStep | null {
  if (!event.altKey) return null;
  return AGENDA_KEY_STEPS[event.key] ?? null;
}

const bySlot = (occurrence: AgendaOccurrence, context: AgendaNudgeContext) =>
  context.slots.length > 0 && !occurrence.allDay;

/** The drag a key stands for, from where the event is. */
export function nudgeSource(
  occurrence: AgendaOccurrence,
  isResize: boolean,
  context: AgendaNudgeContext,
): AgendaDragSource {
  const kind = isResize ? "resizeEnd" : "move";
  if (bySlot(occurrence, context)) {
    const slot = slotAtInstant(occurrence.start, context);
    return {
      kind,
      occurrence,
      origin: { day: slot.day, slotIndex: slot.slotIndex },
    };
  }
  const origin: AgendaDropTarget = occurrence.allDay
    ? { day: occurrence.startDay, asAllDay: true }
    : {
        day: occurrence.startDay,
        minutes: occurrence.startMinutes,
        // Keys move instants: the repeated DST hour does not run backwards.
        instant: isResize ? occurrence.end : occurrence.start,
      };
  return { kind, occurrence, origin };
}

function slotTarget(
  occurrence: AgendaOccurrence,
  step: AgendaKeyStep,
  isResize: boolean,
  context: AgendaNudgeContext,
): AgendaDropTarget {
  const count = context.slots.length;
  if (isResize) {
    // The end's own slot (the one before when it ends in a gap) steps on.
    const last = slotEndingAt(occurrence.end, context);
    const slot = addSlots(last, step.snaps, count, context.hiddenDays);
    return { day: slot.day, slotIndex: slot.slotIndex };
  }
  const first = slotAtInstant(occurrence.start, context);
  const slot = step.snaps
    ? addSlots(first, step.snaps, count, context.hiddenDays)
    : {
        day: shiftShownDay(first.day, step.days, context.hiddenDays),
        slotIndex: first.slotIndex,
      };
  return { day: slot.day, slotIndex: slot.slotIndex };
}

/** Where a key sends the event (or its end). */
export function nudgeTarget(
  occurrence: AgendaOccurrence,
  step: AgendaKeyStep,
  isResize: boolean,
  context: AgendaNudgeContext,
): AgendaDropTarget {
  if (bySlot(occurrence, context)) {
    return slotTarget(occurrence, step, isResize, context);
  }
  const delta = step.snaps * Math.max(context.snapMinutes, 1);
  if (isResize) {
    const end =
      occurrence.endMinutes === 0 ? MINUTES_PER_DAY : occurrence.endMinutes;
    return {
      day: occurrence.endDay,
      minutes: end + delta,
      instant: occurrence.end + delta * MINUTE_MS,
    };
  }
  if (occurrence.allDay || step.days) {
    const day = step.days
      ? shiftShownDay(occurrence.startDay, step.days, context.hiddenDays)
      : occurrence.startDay;
    return occurrence.allDay
      ? { day, asAllDay: true }
      : { day, minutes: occurrence.startMinutes };
  }
  return {
    day: occurrence.startDay,
    minutes: occurrence.startMinutes + delta,
    instant: occurrence.start + delta * MINUTE_MS,
  };
}
