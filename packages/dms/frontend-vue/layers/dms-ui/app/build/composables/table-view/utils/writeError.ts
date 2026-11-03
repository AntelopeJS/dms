import type { I18nTranslate } from "#dms-core/app/composables/translation/useTranslation";
import type { TableViewColumn } from "../../../../composables/table-view/types/column";
import { describeFieldErrors } from "#dms-core/app/composables/useFieldErrors";

/**
 * Why a table view's write failed (a card moved on the board, a row moved
 * by hand, a row action), for its toast: the server's reason, a field the
 * data API refused named by its column's label ("Loss reason is
 * required."). Never the raw ofetch error line.
 */
export function tableWriteErrorOptions(
  error: unknown,
  translate: I18nTranslate,
  columns: ReadonlyArray<Pick<TableViewColumn, "accessorKey" | "header">>,
  processI18n: (text: string) => string,
  fallbackKey = "dms.action_error.generic",
): ResolveApiErrorOptions {
  const summary = describeFieldErrors(error, translate, (field) => {
    const column = columns.find((entry) => entry.accessorKey === field);
    return column ? processI18n(column.header) : undefined;
  });
  return summary
    ? { fallbackKey: "dms.action_error.fields", params: { summary } }
    : { fallbackKey };
}
