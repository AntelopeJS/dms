import { serializeFormField } from "./form-schema";
import type {
  ActionConfirm,
  ActionConfirmSerialized,
  ConfirmDialog,
  ConfirmDialogFrom,
  ConfirmDialogSerialized,
} from "./types/confirm-dialog";

/** Whether a confirmation is worded by the server (`{ from }`). */
export function isConfirmFrom(
  confirm: ActionConfirm | ActionConfirmSerialized,
): confirm is ConfirmDialogFrom {
  return "from" in confirm;
}

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

/** An action's confirmation as its options carry it. */
export function serializeActionConfirm(
  confirm: ActionConfirm | undefined,
): ActionConfirmSerialized | undefined {
  if (!confirm) return undefined;
  return isConfirmFrom(confirm) ? confirm : serializeConfirmDialog(confirm);
}
