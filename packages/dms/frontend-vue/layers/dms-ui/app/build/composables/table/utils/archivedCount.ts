type Translate = (
  key: string,
  named: Record<string, unknown>,
  plural: number,
) => string;

/**
 * The caption count while a table lists its archived rows. The default
 * ("Archived: 13", "Archives : 13") agrees with no noun, so it reads right
 * over invoices as over members; a table view's `archivedCountLabel` names
 * its rows instead: a `$` key receiving `{ count }` and pluralized on it, or
 * a text whose `{count}` is replaced.
 */
export function formatArchivedCount(
  translate: Translate,
  count: number,
  formattedCount: string,
  label?: string,
): string {
  if (!label) {
    return translate(
      "dms.table.archived_count",
      { count: formattedCount },
      count,
    );
  }
  if (label.startsWith("$")) {
    return translate(label.slice(1), { count: formattedCount }, count);
  }
  return label.replaceAll("{count}", formattedCount);
}
