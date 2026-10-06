import { serializeFormField } from "./internal/form-schema";
import type {
  ConfirmDialog,
  ConfirmDialogSerialized,
} from "./types/confirm-dialog";

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
