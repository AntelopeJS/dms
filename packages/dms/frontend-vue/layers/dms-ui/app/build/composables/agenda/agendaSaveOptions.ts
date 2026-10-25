// What a FullAgenda save engine is built with: the request it sends, the
// questions it asks, and what it reports.

import type {
  AgendaChange,
  AgendaConfirm,
  AgendaEvent,
  AgendaSaveError,
  AgendaSaveMode,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "../../../types/full-agenda";
import type { AgendaEdit, AgendaGhost } from "./agendaChanges";

/** What a save request carries besides its changes. */
export type AgendaRequestContext = Omit<
  AgendaSaveRequest,
  "changes" | "force" | "overwrite"
>;

export interface AgendaSaveEngineOptions {
  mode: () => AgendaSaveMode;
  /** Posts a request to `saveUrl`; rejects on a non-2xx answer. */
  send: (request: AgendaSaveRequest) => Promise<AgendaSaveResponse | null>;
  /** The conflicts mode, range and view the request carries. */
  context: () => AgendaRequestContext;
  /** Asks what a `confirm` answer asks; resolves whether the user went on. */
  confirm: (confirm: AgendaConfirm) => Promise<boolean>;
  /**
   * Puts an answer on screen: its events and removals, its lists, and the
   * changes it wrote (`written`) that it answers no event for, as sent.
   */
  onAnswer: (response: AgendaSaveResponse, written: AgendaChange[]) => void;
  /** The changes a request wrote, with its answer (Undo, its message). */
  onSaved?: (written: AgendaChange[], response: AgendaSaveResponse) => void;
  /**
   * Changes refused, with their message. In immediate mode they are no
   * longer kept: the event is back where it was, and `resend` writes one
   * again (the toast's Retry).
   */
  onFailed?: (edits: AgendaEdit[]) => void;
  /** A change the route answered a conflict for. */
  onConflict?: (edit: AgendaEdit) => void;
  /** Changes of events the route no longer has (`notFound`): they are removed. */
  onGone?: (edits: AgendaEdit[]) => void;
  /** The message a request that failed as a whole leaves. */
  describeError: (error: unknown) => string;
  /** A message of the answer as text. */
  text: (message: AgendaSaveError["message"]) => string;
  /** The agenda's zone: two changes of one series are merged in the series' zone (else this one). */
  timeZone?: () => string;
  /** Why a change queued behind a new event the route answered no id for is not sent. */
  unaddressed?: () => string;
  /** A `confirm` question the user declined: nothing was written. */
  onDeclined?: () => void;
}

/** What a change brings besides itself. */
export interface AgendaRecordExtras {
  /** The event a new one draws as (`create`, `schedule`). */
  seed?: AgendaEvent;
  /** The event before the change. */
  base?: AgendaEvent;
  /** Where the occurrence was. */
  ghost?: AgendaGhost;
}
