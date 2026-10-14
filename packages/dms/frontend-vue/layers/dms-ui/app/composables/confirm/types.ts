import type { VNodeChild } from "vue";
import type {
  ConfirmDialog,
  ConfirmDialogColor,
  ConfirmDialogImpact,
} from "#dms-core/app/types/confirm-dialog";

export type ConfirmColor = ConfirmDialogColor;

/** The footer button a confirm dialog focuses when it opens. */
export type ConfirmInitialFocus = "cancel" | "confirm";

/** Extra body content rendered between the impact list and the typed check. */
export type ConfirmBodyRender = () => VNodeChild;

/** One dependent affected by the confirmed action. */
export type ConfirmImpact = ConfirmDialogImpact;

/** The values the dialog's fields hold when the user confirms. */
export type ConfirmValues = Record<string, unknown>;

/**
 * A confirmation dialog as `useConfirm()` opens it: a {@link ConfirmDialog}
 * whose texts are already resolved, plus what only a caller in the browser
 * can give (render functions, handlers).
 */
export interface ConfirmOptions
  extends Omit<ConfirmDialog, "params" | "icon" | "secondaryAction"> {
  /**
   * A button next to cancel and confirm that leaves the dialog open (a
   * download before removing): its `run` is awaited, the button loading,
   * and a rejection is shown in the dialog's alert.
   */
  secondaryAction?: ConfirmSecondaryAction;
  /**
   * The button focused on open (`"cancel"` for a dialog whose safe answer
   * is to stay); left out, the dialog's first focusable element.
   */
  initialFocus?: ConfirmInitialFocus;
  /** Leading icon of the confirm button. */
  confirmIcon?: string;
  /** Header icon; defaults per colour, `false` gives the minimal layout. */
  icon?: string | false;
  /**
   * Extra content (a select, a note…) as a render function, re-run
   * reactively: state it reads can be refs owned by the caller.
   */
  body?: ConfirmBodyRender;
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
   * the action went only part of the way. It receives the values of the
   * dialog's `fields`; a field error the server answers shows under its
   * field.
   */
  onConfirm?: (
    values: ConfirmValues,
  ) => Promise<void | boolean | ConfirmPartialOutcome>;
}

/**
 * How `useConfirmFrom().confirmFrom(url, options)` asks a dialog the server
 * words, as a declarative action's `confirm: { from }` does.
 */
export interface ConfirmFromOptions {
  /**
   * Fill-ins of the URL's `{{row.X}}` tokens and of the dialog's texts (a
   * record's fields); the dialog's own `params` win in its texts.
   */
  params?: Record<string, unknown>;
  /** What the dialog leaves out (a colour, an icon, a confirm label). */
  fallback?: Partial<ConfirmOptions>;
  /**
   * Runs the action from inside the dialog with its fields' values, as
   * {@link ConfirmOptions.onConfirm}; left out, run it once `confirmFrom`
   * resolved `true`.
   */
  onConfirm?: ConfirmOptions["onConfirm"];
}

/** A secondary button of the confirm modal: its text resolved, its handler. */
export interface ConfirmSecondaryAction {
  label: string;
  icon?: string;
  run: () => Promise<void> | void;
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
