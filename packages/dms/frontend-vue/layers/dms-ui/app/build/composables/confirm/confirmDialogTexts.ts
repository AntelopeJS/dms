import type { ConfirmDialog } from "#dms-core/app/types/confirm-dialog";
import { readTranslationKey } from "#dms-core/app/composables/translation/useTranslation";
import type { ConfirmOptions } from "../../../composables/confirm/types";
import { processFieldI18n } from "../../utils/fieldOptionsI18n";
import { interpolateLiteral } from "../../utils/literalText";

/** `t` as vue-i18n gives it: named parameters, then the plural count. */
export type ConfirmTranslate = (
  key: string,
  params: Record<string, unknown>,
  plural?: number,
) => string;

/**
 * One text of a confirmation dialog: an i18n key (with `$`) translated with
 * `params` — pluralized on `params.count` when it is a number — or a literal
 * filled in with the same `params`.
 */
export function resolveConfirmText(
  text: string,
  params: Record<string, unknown>,
  t: ConfirmTranslate,
): string {
  const { isKey, key } = readTranslationKey(text);
  if (!isKey) return interpolateLiteral(text, params);
  return typeof params.count === "number"
    ? t(key, params, params.count)
    : t(key, params);
}

/**
 * A confirmation dialog with its texts resolved, ready for `useConfirm()`:
 * interpolated with the row's fields (`row`) and the dialog's own `params`.
 */
export function resolveConfirmDialog(
  dialog: ConfirmDialog,
  row: Record<string, unknown> | undefined,
  t: ConfirmTranslate,
): ConfirmOptions {
  const params = { ...row, ...dialog.params };
  const text = (value: string | undefined) =>
    value === undefined ? undefined : resolveConfirmText(value, params, t);
  const { params: _params, ...rest } = dialog;
  return {
    ...rest,
    title: text(dialog.title) ?? "",
    description: text(dialog.description),
    confirmLabel: text(dialog.confirmLabel),
    cancelLabel: text(dialog.cancelLabel),
    impact: dialog.impact?.map((entry) => ({
      ...entry,
      label: text(entry.label) ?? "",
      count: typeof entry.count === "string" ? text(entry.count) : entry.count,
    })),
    fields: dialog.fields?.map((field) =>
      processFieldI18n(
        {
          ...field,
          label: text(field.label),
          description: text(field.description),
        },
        (key) => resolveConfirmText(key, params, t),
      ),
    ),
  };
}
