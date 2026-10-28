import type { I18nTranslate } from "#dms-core/app/composables/translation/useTranslation";
import type { TableViewColumn } from "../../../../composables/table-view/types/column";
import { resolveActionError } from "../../confirm/actionError";

/**
 * Why a table view's write failed (a card moved on the board, a row moved
 * by hand, a row action), for its toast: the server's reason, a field the
 * data API refused named by its column's label ("Loss reason is
 * required."). Never the raw ofetch error line.
 */
export function describeTableWriteError(
  error: Parameters<typeof resolveActionError>[0],
  translate: I18nTranslate,
  columns: ReadonlyArray<Pick<TableViewColumn, "accessorKey" | "header">>,
  processI18n: (text: string) => string,
): string {
  return resolveActionError(error, translate, (field) => {
    const column = columns.find((entry) => entry.accessorKey === field);
    return column ? processI18n(column.header) : undefined;
  });
}
