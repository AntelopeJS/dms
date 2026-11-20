import { Logging } from "@antelopejs/interface-core/logging";
import { type AutomationEventPayload, emitAutomationEvent } from "./events";
import { automationOriginFields } from "./origin";

export const LOOP_GUARD_LIMIT = 5;
export const LOOP_GUARD_WINDOW_MS = 60_000;

/**
 * Circuit breaker for events caused by procedures: past
 * {@link LOOP_GUARD_LIMIT} events of one subject within
 * {@link LOOP_GUARD_WINDOW_MS}, later ones are dropped, so a procedure
 * reacting to its own writes, or two procedures answering each other, stop.
 * Counts are per process: the write and the trigger it fires run in the
 * process that ran the action.
 */
export class AutomationLoopGuard {
  private readonly emissions = new Map<string, number[]>();

  constructor(
    private readonly limit = LOOP_GUARD_LIMIT,
    private readonly windowMs = LOOP_GUARD_WINDOW_MS,
  ) {}

  admit(subject: string, now = Date.now()): boolean {
    const since = now - this.windowMs;
    for (const [key, times] of this.emissions) {
      if (times.every((time) => time <= since)) this.emissions.delete(key);
    }
    const recent = (this.emissions.get(subject) ?? []).filter(
      (time) => time > since,
    );
    if (recent.length >= this.limit) {
      this.emissions.set(subject, recent);
      return false;
    }
    recent.push(now);
    this.emissions.set(subject, recent);
    return true;
  }

  reset(): void {
    this.emissions.clear();
  }
}

export const automationLoopGuard = new AutomationLoopGuard();

/**
 * Whether an event a procedure caused may fire, logging a warning when the
 * breaker drops it.
 */
function admitAutomationEvent(event: string, subject: string): boolean {
  if (automationLoopGuard.admit(`${event}|${subject}`)) return true;
  Logging.Warn(
    `[dms] automation loop guard dropped ${event} for ${subject}: more than ${LOOP_GUARD_LIMIT} procedure-made changes within ${LOOP_GUARD_WINDOW_MS / 1000} s`,
  );
  return false;
}

type OriginatedEventName =
  | "dms.member-removed"
  | "dms.invite-resolved"
  | "dms.member-roles-changed";

/**
 * Emits an event that a procedure's write may have caused: it then carries
 * the procedure, and passes the circuit breaker on `subject` first.
 */
export function emitOriginatedEvent<E extends OriginatedEventName>(
  event: E,
  subject: string,
  payload: AutomationEventPayload<E>,
): void {
  const origin = automationOriginFields();
  if (origin.originProcedureId && !admitAutomationEvent(event, subject)) return;
  emitAutomationEvent(event, { ...payload, ...origin });
}
