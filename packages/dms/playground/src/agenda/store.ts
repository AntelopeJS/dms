import type {
  AgendaChange,
  AgendaChangeKind,
  AgendaConfirm,
  AgendaEvent,
  AgendaEventPatch,
  AgendaPendingItem,
  AgendaSavedEvent,
  AgendaSaveError,
  AgendaSaveResponse,
} from "@antelopejs/interface-dms/base/full-agenda-types";
import { applyPatch } from "./patch";
import { occurrenceEvent, recurringChange, withException } from "./recurring";
import {
  type AgendaSaveInput,
  conflict,
  notFound,
  refused,
  stillAsRead,
} from "./save";

/** What a demo keeps in memory: its events and the items left to plan. */
export interface AgendaState {
  events: AgendaEvent[];
  pending: AgendaPendingItem[];
}

/** What a rule reads: the change, the event before it, the state around. */
export interface RuleContext {
  change: AgendaChange;
  before?: AgendaEvent;
  state: AgendaState;
}

/**
 * The server rules of a demo. Each is optional: an agenda without rules
 * writes every change as sent.
 */
export interface AgendaRules {
  /** Prefix of the ids the route gives new events (`team-12`). */
  idPrefix: string;
  /** Why the event, as the change would leave it, may not be written. */
  refuse?: (next: AgendaEvent, context: RuleContext) => string | undefined;
  /** A question to ask before writing it, unless the user confirmed. */
  confirm?: (
    next: AgendaEvent,
    context: RuleContext,
  ) => AgendaConfirm | undefined;
  /** Fills what a created event leaves out (its calendar, its data). */
  complete?: (event: AgendaEvent) => AgendaEvent;
  /** The event a pending item becomes once dropped. */
  schedule?: (
    item: AgendaPendingItem,
    patch: AgendaEventPatch,
    id: string,
  ) => AgendaEvent;
  /** The pending item an event becomes once dragged back. */
  unschedule?: (event: AgendaEvent) => AgendaPendingItem;
  /** What the route derives on each answer (icons, badges, issues). */
  decorate?: (event: AgendaEvent, state: AgendaState) => AgendaEvent;
  /** Events to answer again with a written one (the successors of a task). */
  related?: (event: AgendaEvent, state: AgendaState) => AgendaEvent[];
  /** The message of a conflict on an event moved since it was read. */
  conflictMessage?: (current: AgendaEvent) => string;
  /**
   * What the seed's dates hang on (the Monday of the current week): when it
   * changes while the server runs, the demo reseeds before it is read again.
   */
  anchor?: () => string;
  /** Called after each reset, for what a demo keeps beside its store. */
  onReset?: () => void;
}

/** What the changes of one request did, gathered while they apply. */
interface SaveOutcome {
  written: Map<string, AgendaSavedEvent>;
  removed: Set<string>;
  errors: AgendaSaveError[];
  confirm?: AgendaConfirm;
}

/** One change applied to a draft of the state. */
interface ChangeStep {
  change: AgendaChange;
  index: number;
  input: AgendaSaveInput;
  draft: AgendaState;
  outcome: SaveOutcome;
}

type ChangeApplier = (store: AgendaStore, step: ChangeStep) => void;

const DEFAULT_CONFLICT = "This event was changed by someone else meanwhile.";
const GONE = "This event no longer exists.";
const GONE_PENDING = "This item is no longer waiting to be planned.";
const NO_START = "A new event needs a start.";
const OCCURRENCE_SEPARATOR = "@";

/**
 * A change named by an occurrence's id (`<series id>@<day>`) as one naming
 * its series and that day.
 */
function normalized(change: AgendaChange): AgendaChange {
  const [id, day] = change.id?.split(OCCURRENCE_SEPARATOR) ?? [];
  if (!day) return change;
  return { ...change, id, occurrence: change.occurrence ?? day };
}

function write(step: ChangeStep, event: AgendaEvent, tempId?: string): void {
  const { draft, outcome } = step;
  const index = draft.events.findIndex(
    (candidate) => candidate.id === event.id,
  );
  if (index < 0) draft.events.push(event);
  else draft.events[index] = event;
  outcome.removed.delete(event.id);
  outcome.written.set(event.id, tempId ? { ...event, tempId } : event);
}

function drop(step: ChangeStep, id: string): void {
  const { draft, outcome } = step;
  draft.events = draft.events.filter((event) => event.id !== id);
  outcome.written.delete(id);
  outcome.removed.add(id);
}

/**
 * Whether the rules let the event be written as the change leaves it: a
 * refusal is answered as an error, a question as the request's `confirm`.
 */
function rulesAllow(
  store: AgendaStore,
  step: ChangeStep,
  next: AgendaEvent,
  before?: AgendaEvent,
): boolean {
  const context: RuleContext = {
    change: step.change,
    before,
    state: step.draft,
  };
  const reason = store.rules.refuse?.(next, context);
  if (reason) {
    step.outcome.errors.push(refused(step.index, reason));
    return false;
  }
  const question = step.input.force
    ? undefined
    : store.rules.confirm?.(next, context);
  if (question && !step.outcome.confirm) step.outcome.confirm = question;
  return true;
}

/** The stored event a change names, or the error saying it is gone or moved. */
function targetOf(
  store: AgendaStore,
  step: ChangeStep,
): AgendaEvent | undefined {
  const current = step.draft.events.find(
    (event) => event.id === step.change.id,
  );
  if (!current) {
    step.outcome.errors.push(notFound(step.index, GONE));
    return undefined;
  }
  /** An occurrence is compared by the series rules, not by its own fields. */
  const checks = step.input.detectsConflicts && !step.change.occurrence;
  if (checks && !stillAsRead(step.change.previous, current)) {
    const message = store.rules.conflictMessage?.(current) ?? DEFAULT_CONFLICT;
    step.outcome.errors.push(
      conflict(step.index, message, store.decorate(current, step.draft)),
    );
    return undefined;
  }
  return current;
}

function createEvent(store: AgendaStore, step: ChangeStep): void {
  const patch = step.change.patch ?? {};
  if (!patch.start) {
    step.outcome.errors.push(refused(step.index, NO_START));
    return;
  }
  const base = applyPatch(
    { id: store.nextId(), title: "", start: patch.start },
    patch,
  );
  const next = store.rules.complete?.(base) ?? base;
  if (!rulesAllow(store, step, next)) return;
  write(step, next, step.change.tempId);
}

function changeEvent(store: AgendaStore, step: ChangeStep): void {
  const current = targetOf(store, step);
  if (!current) return;
  if (step.change.occurrence && current.recurrence) {
    const detachedId = `${current.id}-${step.change.occurrence}`;
    const written = recurringChange(current, step.change, detachedId);
    if (!written.every((event) => rulesAllow(store, step, event, current))) {
      return;
    }
    for (const event of written) write(step, event);
    return;
  }
  const next = applyPatch(current, step.change.patch);
  if (!rulesAllow(store, step, next, current)) return;
  write(step, next);
}

function deleteEvent(store: AgendaStore, step: ChangeStep): void {
  const current = targetOf(store, step);
  if (!current) return;
  const { occurrence, scope } = step.change;
  if (occurrence && current.recurrence && scope !== "series") {
    const exceptions = [...(current.recurrence.exceptions ?? []), occurrence];
    write(step, {
      ...current,
      recurrence: { ...current.recurrence, exceptions },
    });
    return;
  }
  drop(step, current.id);
}

function defaultSchedule(
  item: AgendaPendingItem,
  patch: AgendaEventPatch,
  id: string,
): AgendaEvent {
  return applyPatch(
    {
      id,
      title: item.title,
      subtitle: item.subtitle,
      calendarId: item.calendarId,
      color: item.color,
      icon: item.icon,
      badges: item.badges,
      allowedResourceIds: item.allowedResourceIds,
      allDay: item.allDay,
      data: item.data,
      start: patch.start ?? "",
    },
    patch,
  );
}

function scheduleItem(store: AgendaStore, step: ChangeStep): void {
  const item = step.draft.pending.find(
    (candidate) => candidate.id === step.change.id,
  );
  if (!item) {
    step.outcome.errors.push(notFound(step.index, GONE_PENDING));
    return;
  }
  const patch = step.change.patch ?? {};
  const schedule = store.rules.schedule ?? defaultSchedule;
  const fresh = store.nextId();
  const proposed = schedule(item, patch, fresh);
  /** An item never takes the place of an event still planned. */
  const taken = step.draft.events.some((event) => event.id === proposed.id);
  const next = taken ? { ...proposed, id: fresh } : proposed;
  if (!rulesAllow(store, step, next)) return;
  step.draft.pending = step.draft.pending.filter(
    (candidate) => candidate.id !== item.id,
  );
  write(step, next, step.change.tempId);
}

function defaultUnschedule(event: AgendaEvent): AgendaPendingItem {
  return {
    id: event.id,
    title: event.title,
    subtitle: event.subtitle,
    calendarId: event.calendarId,
    color: event.color,
    icon: event.icon,
    allowedResourceIds: event.allowedResourceIds,
    data: event.data,
  };
}

function unscheduleEvent(store: AgendaStore, step: ChangeStep): void {
  const current = targetOf(store, step);
  if (!current) return;
  const unschedule = store.rules.unschedule ?? defaultUnschedule;
  const { occurrence } = step.change;
  /**
   * One occurrence goes back to the list: its day leaves the series, the
   * rest of the series stays planned.
   */
  const single =
    occurrence && current.recurrence
      ? occurrenceEvent(current, occurrence, `${current.id}-${occurrence}`)
      : current;
  const item = unschedule(single);
  step.draft.pending = [
    ...step.draft.pending.filter((other) => other.id !== item.id),
    item,
  ];
  if (single === current) drop(step, current.id);
  else write(step, withException(current, occurrence ?? ""));
}

const APPLIERS: Record<AgendaChangeKind, ChangeApplier> = {
  create: createEvent,
  update: changeEvent,
  move: changeEvent,
  resize: changeEvent,
  delete: deleteEvent,
  schedule: scheduleItem,
  unschedule: unscheduleEvent,
};

/**
 * A demo agenda kept in memory: its events and pending items, reset to a
 * seed, and the changes of a save request applied on a draft, so a
 * question (`confirm`) writes nothing and the user's answer posts them all
 * again.
 */
export class AgendaStore {
  private stored: AgendaState;
  private sequence = 0;
  private anchoredOn: string | undefined;

  constructor(
    private readonly seed: () => AgendaState,
    readonly rules: AgendaRules,
  ) {
    this.stored = seed();
    this.anchoredOn = rules.anchor?.();
  }

  /**
   * The state, reseeded first when the week it was seeded for is over: a
   * demo relative to "this week" never shows last week's data.
   */
  private get state(): AgendaState {
    this.reanchor();
    return this.stored;
  }

  /**
   * Reseeds the demo when the week it was seeded for is over; a route calls
   * it before reading what it keeps beside the store.
   */
  reanchor(): void {
    const anchor = this.rules.anchor?.();
    if (anchor !== undefined && anchor !== this.anchoredOn) this.reset(anchor);
  }

  get events(): AgendaEvent[] {
    return this.state.events;
  }

  get pending(): AgendaPendingItem[] {
    return this.state.pending;
  }

  /**
   * Back to the seed, its dates computed again from today. The anchor is
   * read before the seed: across midnight on Sunday the seed may already be
   * next week's, and the next read reseeds it once more, never the other
   * way round.
   */
  reset(anchor = this.rules.anchor?.()): void {
    this.anchoredOn = anchor;
    this.stored = this.seed();
    this.sequence = 0;
    this.rules.onReset?.();
  }

  /** A fresh id for an event the route creates. */
  nextId(): string {
    this.sequence += 1;
    return `${this.rules.idPrefix}-new-${this.sequence}`;
  }

  find(id: string): AgendaEvent | undefined {
    return this.state.events.find((event) => event.id === id);
  }

  /** Writes an event outside a save request (an event action). */
  put(event: AgendaEvent): void {
    const index = this.state.events.findIndex(
      (candidate) => candidate.id === event.id,
    );
    if (index < 0) this.state.events.push(event);
    else this.state.events[index] = event;
  }

  /** An event as the route answers it, with what it derives. */
  decorate(event: AgendaEvent, state: AgendaState = this.state): AgendaEvent {
    return this.rules.decorate?.(event, state) ?? event;
  }

  /** Events as the route answers them. */
  answer(events: AgendaEvent[]): AgendaEvent[] {
    return events.map((event) => this.decorate(event));
  }

  /** Applies a save request; a question writes nothing. */
  save(input: AgendaSaveInput): AgendaSaveResponse {
    const draft: AgendaState = structuredClone(this.state);
    const outcome: SaveOutcome = {
      written: new Map(),
      removed: new Set(),
      errors: [],
    };
    input.changes.forEach((sent, index) => {
      const change = normalized(sent);
      APPLIERS[change.kind](this, { change, index, input, draft, outcome });
    });
    if (outcome.confirm) return { confirm: outcome.confirm };
    this.stored = draft;
    return {
      events: this.answerWritten(outcome),
      removed: [...outcome.removed],
      errors: outcome.errors,
      ...(this.rules.schedule && { unscheduled: this.state.pending }),
    };
  }

  private answerWritten(outcome: SaveOutcome): AgendaSavedEvent[] {
    const answered = new Map<string, AgendaSavedEvent>();
    for (const event of outcome.written.values()) {
      answered.set(event.id, { ...this.decorate(event), tempId: event.tempId });
      for (const other of this.rules.related?.(event, this.state) ?? []) {
        if (!outcome.written.has(other.id)) {
          answered.set(other.id, this.decorate(other));
        }
      }
    }
    return [...answered.values()];
  }
}
