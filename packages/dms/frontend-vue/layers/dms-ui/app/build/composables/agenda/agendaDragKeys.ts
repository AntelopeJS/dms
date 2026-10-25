// The keyboard alternative to dragging: Alt+↑/↓ moves a focused event by
// the snap, Alt+←/→ by a day, Alt+Shift+↑/↓ moves its end. Each key is read
// as a drag from where the event is to where the key sends it.

import type { AgendaDropTarget, AgendaOccurrence } from "./agendaModel";
import type { AgendaDragSource } from "./agendaDragMath";
import { MINUTES_PER_DAY, addDays } from "./agendaTime";

/** What a key moves: whole days, or snaps of time. */
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

/** The step of a key event, when it is one (Alt held, an arrow). */
export function keyStep(event: KeyboardEvent): AgendaKeyStep | null {
  if (!event.altKey) return null;
  return AGENDA_KEY_STEPS[event.key] ?? null;
}

/** The drag a key stands for, from where the event is. */
export function nudgeSource(
  occurrence: AgendaOccurrence,
  isResize: boolean,
): AgendaDragSource {
  const origin: AgendaDropTarget = occurrence.allDay
    ? { day: occurrence.startDay, asAllDay: true }
    : { day: occurrence.startDay, minutes: occurrence.startMinutes };
  return { kind: isResize ? "resizeEnd" : "move", occurrence, origin };
}

/** Where a key sends the event (or its end). */
export function nudgeTarget(
  occurrence: AgendaOccurrence,
  step: AgendaKeyStep,
  isResize: boolean,
  snapMinutes: number,
): AgendaDropTarget {
  const delta = step.snaps * Math.max(snapMinutes, 1);
  if (isResize) {
    const end =
      occurrence.endMinutes === 0 ? MINUTES_PER_DAY : occurrence.endMinutes;
    return { day: occurrence.endDay, minutes: end + delta };
  }
  const day = addDays(occurrence.startDay, step.days);
  return occurrence.allDay
    ? { day, asAllDay: true }
    : { day, minutes: occurrence.startMinutes + delta };
}
