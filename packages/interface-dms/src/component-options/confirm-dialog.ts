import type { Component, ComponentInfoSerialized } from "../component";
import { serializeFormField } from "./internal/form-field";
import type { ActionTarget } from "./action-target";
import type { ButtonColor } from "./button";
import type { FormField, FormFieldSerialized } from "./form-field";

/** One dependent a confirmed action affects, listed in its dialog. */
export interface ConfirmDialogImpact {
  icon: string;
  /** `$`-prefixed: an i18n key, receiving the dialog's `params`. */
  label: string;
  count?: number | string;
}

/**
 * A file a dialog's secondary action downloads, the dialog staying open. The
 * URL is fetched with the user's session, like an `api` target: a path is
 * read from the DMS API, an absolute URL as it is.
 */
export interface ConfirmDialogDownloadTarget {
  type: "download";
  /**
   * Takes the page URL tokens (`{{params.X}}`, `{{query.X}}`), then the
   * dialog's parameters and the row's fields (`{{row.field}}`).
   */
  url: string;
  /**
   * Name the file is saved under, with the same tokens as `url`, written as
   * they are. Defaults to the name the response's
   * `Content-Disposition` gives, else the URL's last path segment.
   */
  filename?: string;
}

/**
 * Where a dialog's secondary action leads: a link (`external`, as on an
 * action), or a file to download.
 */
export type ConfirmDialogSecondaryTarget =
  | Extract<ActionTarget, { type: "external" }>
  | ConfirmDialogDownloadTarget;

/**
 * A button drawn next to cancel and confirm that neither answers the
 * dialog: it runs its target and leaves the dialog open ("Download a backup"
 * before removing).
 */
export interface ConfirmDialogSecondaryAction {
  /** Text of the button, interpolated like the dialog's other texts. */
  label: string;
  icon?: string;
  /**
   * Its URL is filled in with the dialog's `params` and, on a row action,
   * the row's fields (`{name}`).
   */
  target: ConfirmDialogSecondaryTarget;
}

/**
 * The dialog an action asks in before it runs, the same for every action:
 * built-in (delete, archive, edit…) and custom, whatever its target. Texts
 * are i18n keys (with `$`) or literals, both interpolated with `params` —
 * and, on a row action, with the row's fields ("Remove {name}?").
 *
 * @docsApi
 */
export interface ConfirmDialog {
  title: string;
  description?: string;
  /** Values the texts are interpolated with, besides the row's fields. */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published interpolation payloads accept application-defined values; no fixed message schema exists here.
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
   * A button next to cancel and confirm, leaving the dialog open: a link,
   * or a file to download first.
   */
  secondaryAction?: ConfirmDialogSecondaryAction;
  /**
   * The action cannot run (the last owner, a locked row): the dialog only
   * explains why, with a close button.
   */
  blocked?: boolean;
  /**
   * Text the user must type to confirm (type-to-confirm). A `$`-prefixed i18n
   * key is translated, and `{field}` reads the row like the other texts
   * (`"{name}"`: the row's name).
   */
  confirmText?: string;
  /**
   * Compares the typed text with `confirmText` ignoring case (`acme` matches
   * `ACME`): for a name the user reads but would not care to retype exactly.
   */
  confirmTextCaseInsensitive?: boolean;
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
 * answering a {@link ConfirmDialogSerialized}. On a row action, built-in or
 * custom, `{{row.id}}` is filled in with the row's id (read through the
 * table's `rowIdKey`) and `{{row.<field>}}` with any of the row's fields;
 * a bulk custom action appends its selection to the query instead.
 * The page URL's `{{params.X}}` / `{{query.X}}` are filled first, as in an
 * action's target URL.
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

/**
 * A confirmation dialog as the client reads it: its fields and component
 * serialized. A route answering a `confirm: { from }` request returns this.
 */
export function serializeConfirmDialog(
  dialog: ConfirmDialog,
): ConfirmDialogSerialized {
  const { fields, component, ...texts } = dialog;
  const serialized: ConfirmDialogSerialized = texts;
  if (fields) serialized.fields = fields.map(serializeFormField);
  if (component) serialized.component = component.serializeSync();
  return serialized;
}
