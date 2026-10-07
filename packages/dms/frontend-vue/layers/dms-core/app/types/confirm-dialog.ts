/** One dependent a confirmed action affects, listed in its dialog. */
export interface ConfirmDialogImpact {
  icon: string;
  /** `$`-prefixed: an i18n key, receiving the dialog's params. */
  label: string;
  count?: number | string;
}

/** A field the user fills in before confirming (a serialized form field). */
export interface ConfirmDialogField {
  id: string;
  label?: string;
  description?: string;
  /** Id of the field's data type. */
  type: string;
  /** Input component drawing the field. */
  component: ComponentInfo;
  required?: boolean;
  disabled?: boolean;
  defaultValue?: unknown;
}

/** Colors of a confirmation dialog's confirm button and header well. */
export type ConfirmDialogColor =
  | "primary"
  | "secondary"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "neutral";

/**
 * The dialog an action asks in before it runs (backend `ConfirmDialog`),
 * the same for every action. Texts are i18n keys (with `$`) or literals,
 * interpolated with `params` and, on a row action, the row's fields.
 */
export interface ConfirmDialog {
  title: string;
  description?: string;
  params?: Record<string, unknown>;
  icon?: string;
  color?: ConfirmDialogColor;
  confirmLabel?: string;
  cancelLabel?: string;
  impact?: ConfirmDialogImpact[];
  /** The action cannot run: the dialog only explains why. */
  blocked?: boolean;
  /** Text the user must type to confirm. */
  confirmText?: string;
  /** Fields whose values are sent with the action's request. */
  fields?: ConfirmDialogField[];
  /** A component drawn in the dialog's body. */
  component?: ComponentInfo;
}

/** A confirmation the server words: a URL answering a {@link ConfirmDialog}. */
export interface ConfirmDialogFrom {
  from: string;
}

/** The confirmation of an action (backend `confirm`). */
export type ActionConfirm = ConfirmDialog | ConfirmDialogFrom;

/** Whether a confirmation is worded by the server. */
export const isConfirmFrom = (
  confirm: ActionConfirm,
): confirm is ConfirmDialogFrom => "from" in confirm;
