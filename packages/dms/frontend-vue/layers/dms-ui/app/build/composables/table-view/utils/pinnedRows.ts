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
