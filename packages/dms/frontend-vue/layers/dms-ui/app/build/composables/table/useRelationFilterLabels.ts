import { onMounted, shallowRef, watch } from "vue";
import type { DataTypeSelectSource } from "#dms-core/app/composables/data-types/useDataType";
import { unlabeledRelationIds } from "../data-types/relationValue";
import {
  relationRowLabel,
  relationRowValue,
  useRelationRows,
} from "../data-types/relationRows";

/** A relation filter of a table: where its rows are read, and its value. */
export interface RelationFilterSource extends DataTypeSelectSource {
  value: unknown;
}

const labelKey = (searchUrl: string, id: string) => `${searchUrl}\n${id}`;

// The plain ids a filter value holds, each once.
const NO_LABELS: ReadonlySet<string> = new Set();
const idsOf = (value: unknown) => unlabeledRelationIds(value, NO_LABELS);

/**
 * The labels of the ids a table's relation filters hold: a chip names the
 * related row ("Acme"), not the raw id it filters on ("cust-060"). Each id is
 * read once from the relation's `select` route, as its picker does; an id the
 * route does not answer (deleted, out of reach) keeps showing as is.
 */
export function useRelationFilterLabels(sources: () => RelationFilterSource[]) {
  const { readRelationRows } = useRelationRows();
  const labels = shallowRef<Record<string, string>>({});
  const requested = new Set<string>();

  async function loadLabels(source: RelationFilterSource, ids: string[]) {
    for (const id of ids) requested.add(labelKey(source.searchUrl, id));
    const rows = await readRelationRows(source, ids);
    const found: Record<string, string> = {};
    for (const row of rows) {
      const id = relationRowValue(source, row);
      const label = relationRowLabel(source, row);
      if (id === undefined || label === undefined) continue;
      found[labelKey(source.searchUrl, String(id))] = String(label);
    }
    if (Object.keys(found).length) {
      labels.value = { ...labels.value, ...found };
    }
  }

  const pending = () =>
    sources().flatMap((source) => {
      const ids = idsOf(source.value).filter(
        (id) => !requested.has(labelKey(source.searchUrl, id)),
      );
      return ids.length ? [{ source, ids }] : [];
    });

  // In the browser only: a server render draws the chips with their ids.
  onMounted(() => {
    watch(
      pending,
      (batches) => {
        for (const { source, ids } of batches) void loadLabels(source, ids);
      },
      { immediate: true },
    );
  });

  /** The labels of a relation filter's ids, in order; an unknown id as is. */
  const labelsOf = (source: RelationFilterSource): string[] =>
    idsOf(source.value).map(
      (id) => labels.value[labelKey(source.searchUrl, id)] ?? id,
    );

  return { labelsOf };
}
