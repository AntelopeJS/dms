<script setup lang="ts">
import type { VNodeChild } from "vue";
import { EYEBROW_CLASS } from "../../../build/utils/eyebrow";
import { pageRequestUrl } from "../../../build/composables/page/pageUrlValues";
import {
  NUMERIC_TYPE_IDS,
  useColumnValueRenderer,
} from "../../../build/composables/data-types/useColumnValueRenderer";
import {
  type RelationLabelSource,
  type RepeaterTableColumn,
  joinRelationValue,
  relationLabelSource,
  renderableColumn,
} from "../../../build/composables/form/repeaterTable";

/**
 * The rows of a read-only list (an array or key-value field shown, not
 * edited) as a table: each value drawn as a grid cell draws it (amounts
 * right-aligned in the form's tabular figures, a select's label, a
 * relation's name), text wrapping between words, the table scrolling
 * sideways when its columns cannot fit.
 */
interface RepeaterTableProps {
  columns: RepeaterTableColumn[];
  rows: Record<string, unknown>[];
}

const props = defineProps<RepeaterTableProps>();
const { renderValue } = useColumnValueRenderer();
const { $authFetch } = useAuthFetch();

// The picker of a relation reads its rows from its `select` endpoint, as
// many as a cascader does: the table names its ids from the same rows.
const RELATION_FETCH_LIMIT = 1000;

interface RelationResponse {
  results: Record<string, unknown>[];
}

/** The related rows of a relation column, by the value its cells hold. */
function useRelationRows(source: RelationLabelSource) {
  const { data } = useDmsAsyncData(
    `repeater-table-relation-${source.url}`,
    () => {
      const url = pageRequestUrl(source.url);
      return url
        ? $authFetch<RelationResponse>(url, {
            params: { limit: RELATION_FETCH_LIMIT },
          })
        : Promise.resolve(undefined);
    },
    // Names for the cells, not the page's data.
    { lazy: true, refreshOnPageRefresh: false },
  );
  return computed(
    () =>
      new Map(
        (data.value?.results ?? []).map((row) => [row[source.valueKey], row]),
      ),
  );
}

// The columns are the field's own and do not change while it is shown.
const relationRows = new Map(
  props.columns.flatMap((column) => {
    const source = relationLabelSource(column);
    return source
      ? [[column.id, { source, rows: useRelationRows(source) }]]
      : [];
  }),
);

const renderables = computed(() => props.columns.map(renderableColumn));

function isNumeric(column: RepeaterTableColumn): boolean {
  return NUMERIC_TYPE_IDS.has(column.type ?? "");
}

function cellValue(column: RepeaterTableColumn, row: Record<string, unknown>) {
  const value = row[column.id];
  const relation = relationRows.get(column.id);
  if (!relation) return value;
  return joinRelationValue(
    value,
    relation.rows.value,
    relation.source.multiple,
  );
}

// A cell renders a VNode tree; a functional wrapper keeps it in the
// template's flow.
interface CellProps {
  index: number;
  rowIndex: number;
}
const Cell = ({ index, rowIndex }: CellProps): VNodeChild => {
  const column = props.columns[index]!;
  const row = props.rows[rowIndex]!;
  return renderValue(
    renderables.value[index]!,
    cellValue(column, row),
    row,
    "detail",
  );
};
// Declared, so `row-index` reaches it camelized, as a component's props do.
Cell.props = ["index", "rowIndex"];
</script>

<template>
  <div class="min-w-0 overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr :class="[EYEBROW_CLASS, 'text-dimmed']">
          <th
            v-for="column in props.columns"
            :key="column.id"
            scope="col"
            class="pe-4 pb-1.5 text-start align-bottom font-semibold whitespace-nowrap last:pe-0"
            :class="isNumeric(column) && 'text-end'"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, rowIndex) in props.rows"
          :key="rowIndex"
          class="border-default border-t"
        >
          <!-- A text cell wraps between words: `break-word`, unlike
               `anywhere`, keeps a column at least as wide as its longest
               word, so a narrow table scrolls instead of splitting one. -->
          <td
            v-for="(column, index) in props.columns"
            :key="column.id"
            class="text-default py-2 pe-4 align-top last:pe-0"
            :class="
              isNumeric(column)
                ? 'text-end whitespace-nowrap'
                : 'min-w-24 [overflow-wrap:break-word]'
            "
          >
            <Cell :index :row-index="rowIndex" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
