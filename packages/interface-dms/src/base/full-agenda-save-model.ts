import type { BlockText } from "./types/composed-text";
import type {
  AgendaBackground,
  AgendaChangeKind,
  AgendaEvent,
  AgendaEventPatch,
  AgendaNotice,
  AgendaPendingItem,
} from "./full-agenda-model";

/** Which part of a recurring event a change applies to. */
export type AgendaRecurringScope = "occurrence" | "series";

/**
 * One change:
 * - `create`: a new event, `tempId` names it until the route answers it;
 * - `update`: the details form saved;
 * - `move` / `resize`: dragged (start, end, resources);
 * - `delete`;
 * - `schedule`: a pending item (`id`) dropped onto the agenda;
 * - `unschedule`: an event dragged back to the pending items.
 * `previous` holds the fields as they were before the change: the route
 * compares it with what it stores under `conflicts: "detect"`, and Undo
 * sends it back.
 */
export interface AgendaChange {
  kind: AgendaChangeKind;
  id?: string;
  tempId?: string;
  patch?: AgendaEventPatch;
  previous?: AgendaEventPatch;
  /** On an occurrence of a recurring event: the day of the occurrence's start. */
  occurrence?: string;
  scope?: AgendaRecurringScope;
  /** The `revision` of the event as the user saw it when they made the change. */
  revision?: string;
}

/** What the block posts to `saveUrl`. */
export interface AgendaSaveRequest {
  /** One change in `immediate` mode, every staged one in `staged` mode. */
  changes: AgendaChange[];
  /** The user confirmed what a `confirm` answer asked: the route writes without asking again. */
  force?: boolean;
  /**
   * The user chose Overwrite on a conflict: the route writes these changes
   * over what moved meanwhile. It still asks its `confirm` questions unless
   * `force` is set too.
   */
  overwrite?: boolean;
  /** The block's `conflicts` mode. */
  conflicts: AgendaConflictMode;
  /** The range and view shown, so the route can answer the notices that follow. */
  from: string;
  to: string;
  view: string;
}

/** Why a change was not written. */
export interface AgendaSaveError {
  /** The change, by its place in `changes`. */
  index: number;
  message: BlockText;
  /** `conflict`: the event moved since it was read (`current`); `notFound`: it is gone. */
  code?: "refused" | "conflict" | "notFound";
  current?: AgendaEvent;
  /** The form field the refusal is about: the form shows the message under it. */
  field?: string;
  /** `false`: sending the same change again cannot succeed (a decision of the route), so no Retry is offered. */
  retryable?: boolean;
}

/** A question the route asks before it writes (a task moved before its predecessor). */
export interface AgendaConfirm {
  title: BlockText;
  message?: BlockText;
  confirmLabel?: BlockText;
}

/** An event the route wrote, with the `tempId` of the change that created it. */
export interface AgendaSavedEvent extends AgendaEvent {
  tempId?: string;
}

/**
 * What `saveUrl` answers. An answered `confirm` writes nothing: the block asks
 * the user and posts the same changes again with `force`, or puts the events
 * back. A change neither answered in `events`/`removed` nor named in `errors`
 * counts as written as sent. The optional lists replace the block's.
 */
export interface AgendaSaveResponse {
  events?: AgendaSavedEvent[];
  /** Ids of events gone (deleted, unscheduled, or removed by the change). */
  removed?: string[];
  errors?: AgendaSaveError[];
  confirm?: AgendaConfirm;
  /** A toast after the save ("Planning published to 43 people"). */
  message?: BlockText;
  /**
   * The message names something the user must read in full (a day the change left as it was or removed): its toast
   * stays until the user closes it, with no timer.
   */
  messageStays?: boolean;
  unscheduled?: AgendaPendingItem[];
  notices?: AgendaNotice[];
  backgrounds?: AgendaBackground[];
  /**
   * The data changed beyond the changes sent (another user's edit, found when a change was refused): the block reads
   * its range again.
   */
  refresh?: boolean;
}

/** When a change reaches the server. `staged` keeps them, events drawn at their new place with the old one ghosted, until Save. */
export type AgendaSaveMode = "immediate" | "staged";

/** `detect`: each change carries `previous`; the route answers a conflict when the event moved meanwhile. */
export type AgendaConflictMode = "overwrite" | "detect";
