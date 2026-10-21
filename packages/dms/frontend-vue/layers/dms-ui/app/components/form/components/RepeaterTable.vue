<script setup lang="ts">
import type { VNodeChild } from "vue";
import { EYEBROW_CLASS } from "../../../build/utils/eyebrow";
import {
  relationRowValue,
  useRelationRows,
} from "../../../build/composables/data-types/relationRows";
import { unlabeledRelationIds } from "../../../build/composables/data-types/relationValue";
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
 * relation's name), text wrapping between words. In a narrow container
 * (a phone's drawer) a list of more than two fields reads each row as a
 * block of `label value` lines instead, so no amount is ever cut; a wider
 * table still too narrow for its words scrolls sideways.
 */
interface RepeaterTableProps {
  columns: RepeaterTableColumn[];
  rows: Record<string, unknown>[];
}

const props = defineProps<RepeaterTableProps>();
const { renderValue } = useColumnValueRenderer();
const { getDataType } = useDataTypes();
const { readRelationRows } = useRelationRows();

/**
 * The related rows of a relation column, by the value its cells hold: read
 * once for the ids the rows hold, narrowed to them with `?ids=`.
 */
function useColumnRelationRows(columnId: string, source: RelationLabelSource) {
  const ids = computed(() =>
    unlabeledRelationIds(
      props.rows.flatMap((row) => [row[columnId]].flat()),
      NO_LABELS,
    ),
  );
  const { data } = useDmsAsyncData(
    `repeater-table-relation-${source.searchUrl}`,
    () => readRelationRows(source, ids.value),
    // Names for the cells, not the page's data.
    { lazy: true, refreshOnPageRefresh: false, watch: [ids] },
  );
  return computed(
    () =>
      new Map(
        (data.value ?? []).map((row) => [relationRowValue(source, row), row]),
      ),
  );
}

const NO_LABELS: ReadonlySet<string> = new Set();

// The columns are the field's own and do not change while it is shown.
const relationRows = new Map(
  props.columns.flatMap((column) => {
    const source = relationLabelSource(column, getDataType(column.type ?? ""));
    return source
      ? [
          [
            column.id,
            { source, rows: useColumnRelationRows(column.id, source) },
          ],
        ]
      : [];
  }),
);

// Two fields (a key and its value) fit any width as a table; more stack
// below the container's `@md` width.
const TABLE_FITS_COLUMNS = 2;
const stacksWhenNarrow = computed(
  () => props.columns.length > TABLE_FITS_COLUMNS,
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
  <div class="@container min-w-0">
    <div
      class="min-w-0 overflow-x-auto"
      :class="stacksWhenNarrow && 'hidden @md:block'"
    >
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
    <!-- The narrow reading: a row per block, a field per line, its label
         beside its value. A value has the line's remaining width, an amount
         never wraps. -->
    <ul v-if="stacksWhenNarrow" class="text-sm @md:hidden">
      <li
        v-for="(row, rowIndex) in props.rows"
        :key="rowIndex"
        class="border-default border-t py-2 first:border-t-0 first:pt-0"
      >
        <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
          <template v-for="(column, index) in props.columns" :key="column.id">
            <dt class="text-dimmed pt-0.5 font-semibold" :class="EYEBROW_CLASS">
              {{ column.label }}
            </dt>
            <dd
              class="text-default min-w-0"
              :class="
                isNumeric(column)
                  ? 'text-end whitespace-nowrap'
                  : '[overflow-wrap:break-word]'
              "
            >
              <Cell :index :row-index="rowIndex" />
            </dd>
          </template>
        </dl>
      </li>
    </ul>
  </div>
</template>
