import {
  ALWAYS_PINNED_LEFT_COLUMN_IDS,
  ALWAYS_PINNED_RIGHT_COLUMN_IDS,
} from "../constants";

const EDGE_COLUMN_IDS = new Set([
  ...ALWAYS_PINNED_LEFT_COLUMN_IDS,
  ...ALWAYS_PINNED_RIGHT_COLUMN_IDS,
]);

/**
 * The full column order of a table from a partial one (a view's, a saved
 * one): the columns it names first, in its order, then the others in their
 * declared order. The checkbox, the caret and the row actions keep their
 * edges, and a column the table no longer has is dropped.
 */
export function mergeColumnOrder(
  order: readonly string[],
  declared: readonly string[],
): string[] {
  const isDataColumn = (id: string) => !EDGE_COLUMN_IDS.has(id);
  const named = order.filter(
    (id, index) =>
      isDataColumn(id) && declared.includes(id) && order.indexOf(id) === index,
  );
  const leading = declared.filter((id) =>
    ALWAYS_PINNED_LEFT_COLUMN_IDS.includes(id),
  );
  const trailing = declared.filter((id) =>
    ALWAYS_PINNED_RIGHT_COLUMN_IDS.includes(id),
  );
  const rest = declared.filter((id) => isDataColumn(id) && !named.includes(id));
  return [...leading, ...named, ...rest, ...trailing];
}
