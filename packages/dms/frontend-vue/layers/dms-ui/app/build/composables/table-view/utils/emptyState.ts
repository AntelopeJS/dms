export interface TableEmptyState {
  /** Title shown when the table holds no row; `$`-prefixed for an i18n key. */
  title?: string;
  /** Description shown when the table holds no row; `$`-prefixed for an i18n key. */
  description?: string;
}

export interface TableEmptyStateText {
  title: string;
  description: string;
}

const DEFAULT_EMPTY_STATE: Required<TableEmptyState> = {
  title: "$dms.table.empty_title",
  description: "$dms.table.empty_message",
};

/** The text of an empty table: the table's own strings, else the generic ones. */
export const resolveTableEmptyState = (
  emptyState: TableEmptyState | undefined,
  translate: (key: string) => string,
): TableEmptyStateText => ({
  title: translate(emptyState?.title || DEFAULT_EMPTY_STATE.title),
  description: translate(
    emptyState?.description || DEFAULT_EMPTY_STATE.description,
  ),
});
