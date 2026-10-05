import type { Component, ComponentInfoSerialized } from "../../component";
import type { FormField, FormFieldSerialized } from "../form-types";
import type { ButtonColor } from "./custom-button";

/** One dependent a confirmed action affects, listed in its dialog. */
export interface ConfirmDialogImpact {
  icon: string;
  /** `$`-prefixed: an i18n key, receiving the dialog's `params`. */
  label: string;
  count?: number | string;
}

/**
 * The dialog an action asks in before it runs, the same for every action:
 * built-in (delete, archive, edit…) and custom, whatever its target. Texts
 * are i18n keys (with `$`) or literals, interpolated with `params` — and, on
 * a row action, with the row's fields ("Remove {name}?").
 */
export interface ConfirmDialog {
  title: string;
  description?: string;
  /** Values the texts are interpolated with, besides the row's fields. */
  params?: Record<string, unknown>;
  /** Header icon. */
  icon?: string;
  /** Color of the confirm button and the header icon well. */
  color?: ButtonColor;
  /** Text of the confirm button. */
  confirmLabel?: string;
  /** Text of the cancel button. */
  cancelLabel?: string;
  /** What the action takes with it, listed above the buttons. */
  impact?: ConfirmDialogImpact[];
  /**
   * The action cannot run (the last owner, a locked row): the dialog only
   * explains why, with a close button.
   */
  blocked?: boolean;
  /** Text the user must type to confirm (type-to-confirm). */
  confirmText?: string;
  /**
   * Fields the user fills in before confirming. Their values are sent with
   * the action's request — merged into an `api` target's `body`, the input
   * winning — and a field error the server answers shows under its field.
   */
  fields?: FormField[];
  /**
   * Escape hatch: a frontend component drawn in the dialog's body, resolved
   * by name from the global registry.
   */
  component?: Component;
}

/**
 * A confirmation the server words for the row an action targets: a URL
 * (`{id}` and the row's fields are filled in) answering a
 * {@link ConfirmDialogSerialized}.
 */
export interface ConfirmDialogFrom {
  from: string;
}

/** The confirmation of an action: a fixed dialog, or one the server words. */
export type ActionConfirm = ConfirmDialog | ConfirmDialogFrom;

/** A confirmation dialog as it reaches the client. */
export interface ConfirmDialogSerialized extends Omit<
  ConfirmDialog,
  "fields" | "component"
> {
  fields?: FormFieldSerialized[];
  component?: ComponentInfoSerialized;
}

/** The confirmation of an action as it reaches the client. */
export type ActionConfirmSerialized =
  | ConfirmDialogSerialized
  | ConfirmDialogFrom;
