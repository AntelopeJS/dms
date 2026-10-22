import type { DataTypeSelectSource } from "#dms-core/app/composables/data-types/useDataType";
import { pageRequestUrl } from "../page/pageUrlValues";
import { relationIdsQuery } from "./relationValue";

/** The keys a `select` route's row carries its label and value under by default. */
export const RELATION_LABEL_KEY = "label";
export const RELATION_VALUE_KEY = "value";

type RelationRow = Record<string, unknown>;

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
  options: unknown,
): DataTypeSelectSource | undefined {
  const opts = options as RelationSourceOptions | undefined;
  if (typeof opts?.searchUrl !== "string") return undefined;
  return { searchUrl: opts.searchUrl, keyMapping: opts.keyMapping };
}

/** The value a row of the source is picked by. */
export function relationRowValue(
  source: DataTypeSelectSource,
  row: RelationRow,
): unknown {
  return row[source.keyMapping?.value || RELATION_VALUE_KEY];
}

/** The label a row of the source is named by. */
export function relationRowLabel(
  source: DataTypeSelectSource,
  row: RelationRow,
): unknown {
  return row[source.keyMapping?.label || RELATION_LABEL_KEY];
}

/**
 * Reads the rows of a relation's ids from its `select` route, narrowed with
 * `?ids=` to those rows alone (matched on the mapped value key), whatever the
 * route's page size. The one way the picker, the filter chips and the
 * read-only lists name the ids they hold. A failed read answers no rows: the
 * ids then show as they are.
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
