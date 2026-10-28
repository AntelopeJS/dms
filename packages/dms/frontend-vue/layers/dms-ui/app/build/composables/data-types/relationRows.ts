import type {
  DataType,
  DataTypeFormatter,
  DataTypeSelectSource,
} from "#dms-core/app/composables/data-types/useDataType";
import { isString } from "#dms-core/app/utils/type-check";
import { pageRequestUrl } from "../page/pageUrlValues";
import { relationIdsQuery } from "./relationValue";

/** The keys a `select` route's row carries its label and value under by default. */
export const RELATION_LABEL_KEY = "label";
export const RELATION_VALUE_KEY = "value";

type RelationRow = NonNullable<Parameters<DataTypeFormatter>[3]>;

interface RelationSelectResponse {
  results?: RelationRow[];
}

interface RelationSourceOptions {
  searchUrl?: unknown;
  keyMapping?: DataTypeSelectSource["keyMapping"];
}

/**
 * The `select` route a relation's control reads its rows from, and their key
 * mapping: the relation data type's {@link DataTypeSelectSource}.
 */
export function relationSelectSource(
  options: Parameters<NonNullable<DataType["selectSource"]>>[0],
): DataTypeSelectSource | undefined {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The plugin contract erases options; only searchUrl is checked below, not keyMapping or the whole asserted shape.
  const opts = options as RelationSourceOptions | undefined;
  if (!isString(opts?.searchUrl)) return undefined;
  return { searchUrl: opts.searchUrl, keyMapping: opts.keyMapping };
}

/** The value a row of the source is picked by. */
export function relationRowValue(
  source: DataTypeSelectSource,
  row: RelationRow,
): RelationRow[string] {
  return row[source.keyMapping?.value || RELATION_VALUE_KEY];
}

/** The label a row of the source is named by. */
export function relationRowLabel(
  source: DataTypeSelectSource,
  row: RelationRow,
): RelationRow[string] {
  return row[source.keyMapping?.label || RELATION_LABEL_KEY];
}

/**
 * An id a relation's `select` route did not answer: a deleted row, or one out
 * of the reader's reach — it cannot tell which, so it is shown as "Not
 * found", never as "Deleted", with the id itself in its tooltip.
 */
export class NotFoundRelation {
  constructor(readonly id: string) {}
}

/** The ids of a read that its rows do not answer. */
export function notFoundRelationIds(
  source: DataTypeSelectSource,
  ids: string[],
  rows: RelationRow[],
): string[] {
  const answered = new Set(
    rows.map((row) => String(relationRowValue(source, row))),
  );
  return ids.filter((id) => !answered.has(id));
}

/**
 * Reads the rows of a relation's ids from its `select` route, narrowed with
 * `?ids=` to those rows alone (matched on the mapped value key), whatever the
 * route's page size. The one way the picker, the filter chips and the
 * read-only lists name the ids they hold. A failed read answers no rows: the
 * ids then show as not found, as a row out of the reader's reach does.
 */
export function useRelationRows() {
  const { $authFetch } = useAuthFetch();

  async function readRelationRows(
    source: DataTypeSelectSource,
    ids: string[],
  ): Promise<RelationRow[]> {
    const url = pageRequestUrl(source.searchUrl);
    if (!url || ids.length === 0) return [];
    const response = await $authFetch<RelationSelectResponse>(url, {
      params: relationIdsQuery(ids, source.keyMapping),
    }).catch(() => undefined);
    return response?.results ?? [];
  }

  return { readRelationRows };
}
