import type {
  ActionConfirm,
  ActionConfirmSerialized,
  ConfirmDialogFrom,
} from "../types/confirm-dialog";
import { serializeConfirmDialog } from "../confirm-dialog";

/**
 * Whether a confirmation is worded by the server (`{ from }`).
 *
 * @internal
 */
export function isConfirmFrom(
  confirm: ActionConfirm | ActionConfirmSerialized,
): confirm is ConfirmDialogFrom {
  return "from" in confirm;
}

/**
 * An action's confirmation as its options carry it.
 *
 * @internal
 */
export function serializeActionConfirm(
  confirm: ActionConfirm | undefined,
): ActionConfirmSerialized | undefined {
  if (!confirm) return undefined;
  return isConfirmFrom(confirm) ? confirm : serializeConfirmDialog(confirm);
}
