import type { RowActionRule } from "#dms-core/app/types/row-action";
import { evaluateRowActionRule } from "#dms-core/app/utils/row-action-rule-evaluator";

interface PartitionedRows<T> {
  pinned: T[];
  rest: T[];
}

/**
 * The rows a table view's `pinnedRows` accepts first, then the others, each
 * in the order they came in: the sort keeps ordering both, it no longer
 * decides which rows lead.
 */
export function pinRows<T extends Record<string, unknown>>(
  rows: T[],
  pinnedRows: RowActionRule | undefined,
): T[] {
  if (!pinnedRows) return rows;
  const { pinned, rest } = rows.reduce<PartitionedRows<T>>(
    (parts, row) => {
      (evaluateRowActionRule(pinnedRows, row) ? parts.pinned : parts.rest).push(
        row,
      );
      return parts;
    },
    { pinned: [], rest: [] },
  );
  return pinned.length === 0 ? rows : [...pinned, ...rest];
}

/**
 * `rows` as a table reading `span` of them at a time shows them: the pinned
 * rows lead each read, not the whole list. `rows` starts at a read's first.
 */
export function pinRowsBySpan<T extends Record<string, unknown>>(
  rows: T[],
  span: number,
  pinnedRows: RowActionRule | undefined,
): T[] {
  if (!pinnedRows || span <= 0) return pinRows(rows, pinnedRows);
  const spans: T[][] = [];
  for (let start = 0; start < rows.length; start += span) {
    spans.push(pinRows(rows.slice(start, start + span), pinnedRows));
  }
  return spans.flat();
}
