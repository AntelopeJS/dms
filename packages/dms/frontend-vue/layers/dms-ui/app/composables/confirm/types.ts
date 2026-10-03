import type { VNodeChild } from "vue";

export type ConfirmColor = "primary" | "error" | "warning";

/** The footer button a confirm dialog focuses when it opens. */
export type ConfirmInitialFocus = "cancel" | "confirm";

/** Extra body content rendered between the impact list and the typed check. */
export type ConfirmBodyRender = () => VNodeChild;

/** One dependent affected by the confirmed action. */
export interface ConfirmImpact {
  icon: string;
  label: string;
  count?: number | string;
}

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * The button focused on open (`"cancel"` for a dialog whose safe answer
   * is to stay); left out, the dialog's first focusable element.
   */
  initialFocus?: ConfirmInitialFocus;
  confirmColor?: ConfirmColor;
  /** Leading icon of the confirm button. */
  confirmIcon?: string;
  /**
   * Acknowledge-only dialog (a guard that explains why the action can't run):
   * no confirm button, the cancel button closes it (resolves `false`).
   */
  hideConfirm?: boolean;
  /** Header icon; defaults per colour, `false` gives the minimal layout. */
  icon?: string | false;
  /** Dependents listed above the actions. */
  impact?: ConfirmImpact[];
  /**
   * Extra content (a select, a note…) as a render function, re-run
   * reactively: state it reads can be refs owned by the caller.
   */
  body?: ConfirmBodyRender;
  /**
   * Text the user must type (exactly, trimmed) to confirm. Confirming with
   * the field empty or different flags it (required / mismatch) instead.
   */
  confirmText?: string;
  /**
   * Checks the `body` fields on confirm, before `onConfirm`: returns `false`
   * after flagging the empty or wrong ones (and focusing the first), which
   * keeps the modal open.
   */
  validate?: () => boolean | Promise<boolean>;
  /**
   * Awaited on confirm: the modal shows a loading confirm button, blocks
   * dismissal, and resolves `true` only once it succeeds; a rejection is
   * shown inline and the modal stays open (a {@link ConfirmTextError} under
   * the typed field), its confirm button ready for a retry. The alert words
   * the error for users (see `resolveActionError`): the server's message when
   * it is user-facing, else a translated fallback. Resolving `false` also
   * keeps it open, for a handler that already reported the problem itself
   * (toast); resolving a {@link ConfirmPartialOutcome} keeps it open to say
   * the action went only part of the way.
   */
  onConfirm?: () => Promise<void | boolean | ConfirmPartialOutcome>;
}

/** A summary shown in the confirm modal's alert: a title and its detail. */
export interface ConfirmNotice {
  title: string;
  description?: string;
}

/**
 * Resolved by `onConfirm` when the action ran only part of the way (a bulk
 * action some rows refused): what went through is done, so the modal turns
 * into an acknowledgement — the summary in a warning alert, no confirm button
 * — and resolves `true` once closed.
 */
export interface ConfirmPartialOutcome {
  partial: ConfirmNotice;
}

/**
 * Thrown by `onConfirm` with a message already worded for users (a title and
 * its reason): the modal shows both in its error alert, as they are.
 */
export class ConfirmActionError extends Error {
  readonly description?: string;

  constructor(notice: ConfirmNotice) {
    super(notice.title);
    this.description = notice.description;
  }
}

/**
 * Thrown by `onConfirm` when the server refused the typed confirmation text:
 * the modal shows the message under the typed field (marked invalid, then
 * focused) instead of its error alert.
 */
export class ConfirmTextError extends Error {
  readonly field = "confirmText";
}
