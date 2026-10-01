import type { VNodeChild } from "vue";

export type ConfirmColor = "primary" | "error" | "warning";

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
  /** Text the user must type (exactly, trimmed) before confirming. */
  confirmText?: string;
  /**
   * Awaited on confirm: the modal shows a loading confirm button, blocks
   * dismissal, and resolves `true` only once it succeeds; a rejection is
   * shown inline and the modal stays open. Resolving `false` also keeps it
   * open, for a handler that already reported the problem itself (toast).
   */
  onConfirm?: () => Promise<void | boolean>;
}
