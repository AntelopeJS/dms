<script setup lang="ts">
import { computed, type Component, type VNodeChild } from "vue";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import DmsKeyValueList, {
  type KeyValueItem,
} from "../key-value-list/KeyValueList.vue";
import DmsEyebrow from "../section-header/Eyebrow.vue";
import { useColumnValueRenderer } from "../../build/composables/data-types/useColumnValueRenderer";
import type {
  TableViewColumn,
  TableViewExpandableConfig,
} from "../../composables/table-view/types";

/**
 * Detail band of an expanded TableView row: the configured `component`, which
 * draws the whole band, or else the configured `fields` as a label/value list
 * (each value drawn by its column's data type, like a cell).
 */
interface ExpandedRowDetailProps {
  /** The listed row the band details. */
  row: Record<string, unknown>;
  /** Id of the row (its `rowIdKey` value). */
  rowId: string;
  /** Column metadata of the table view. */
  columns: TableViewColumn[];
  /** The table view's `expandable` configuration. */
  config: TableViewExpandableConfig;
}

const props = defineProps<ExpandedRowDetailProps>();

const { processI18n } = useTranslation();
const { renderColumnValue } = useColumnValueRenderer();

const EMPTY_VALUE = "—";

interface DetailField {
  item: KeyValueItem;
  column: TableViewColumn;
}

const fields = computed<DetailField[]>(() =>
  (props.config.fields ?? []).flatMap((field) => {
    const column = props.columns.find(
      (candidate) => candidate.accessorKey === field.key,
    );
    if (!column) return [];
    return [
      {
        column,
        item: {
          id: field.key,
          label: processI18n(field.label ?? column.header),
          value: "",
        },
      },
    ];
  }),
);

const columnByKey = computed(
  () => new Map(fields.value.map(({ column }) => [column.accessorKey, column])),
);

const detailComponent = computed<Component | string | undefined>(() => {
  const name = props.config.component?.componentName;
  if (!name) return undefined;
  return resolveDmsComponent(name) || name;
});

function renderField(key: string | undefined): VNodeChild {
  const column = key ? columnByKey.value.get(key) : undefined;
  if (!column) return EMPTY_VALUE;
  if (get(props.row, column.accessorKey) === "") return EMPTY_VALUE;
  return renderColumnValue(column, props.row, "detail");
}

// The value slot renders a VNode tree; a functional wrapper keeps it in the
// template's flow.
const FieldValue = (fieldProps: { item: KeyValueItem }) =>
  renderField(fieldProps.item.id);
</script>

<template>
  <component
    :is="detailComponent"
    v-if="detailComponent"
    v-bind="props.config.component?.options ?? {}"
    :row="props.row"
    :row-id="props.rowId"
    :columns="props.columns"
  />
  <section
    v-else-if="fields.length > 0"
    class="grid min-w-0 content-start gap-2"
  >
    <DmsEyebrow
      v-if="props.config.fieldsLabel"
      :label="processI18n(props.config.fieldsLabel)"
    />
    <DmsKeyValueList
      :items="fields.map((field) => field.item)"
      :columns="2"
      dense
    >
      <template #value="{ item }">
        <span class="text-highlighted min-w-0 truncate">
          <FieldValue :item="item" />
        </span>
      </template>
    </DmsKeyValueList>
  </section>
</template>
