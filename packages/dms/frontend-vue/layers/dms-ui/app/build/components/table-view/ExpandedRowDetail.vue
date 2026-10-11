<script setup lang="ts">
import { computed, type Component, type VNodeChild } from "vue";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import DmsKeyValueList, {
  type KeyValueItem,
} from "../../../components/key-value-list/KeyValueList.vue";
import DmsEyebrow from "../../../components/section-header/Eyebrow.vue";
import { useColumnValueRenderer } from "../../composables/data-types/useColumnValueRenderer";
import type {
  TableViewColumn,
  TableViewExpandableConfig,
  TableViewExpandedRowProps,
} from "../../../composables/table-view/types";
import type { ExpandedRowLoadState } from "../../composables/table-view/useExpandedRowDetails";

/**
 * Detail band of an expanded TableView row: the configured `component`, which
 * draws the whole band, or else the configured `fields` as a label/value list
 * (each value drawn by its column's data type, like a cell). While a
 * `lazyLoad` row loads, or if it fails, the band says so in its place.
 */
interface ExpandedRowDetailProps {
  /** What the band details, as a custom band receives it. */
  rowProps: TableViewExpandedRowProps;
  /** The table view's `expandable` configuration. */
  config: TableViewExpandableConfig;
  /** Where the row a `lazyLoad` band shows stands. */
  loadState?: ExpandedRowLoadState;
}

const props = withDefaults(defineProps<ExpandedRowDetailProps>(), {
  loadState: "ready",
});
const emit = defineEmits<{ retry: [] }>();

const { processI18n } = useTranslation();
const { t } = useI18n();

const SKELETON_LINE_COUNT = 2;
const { renderColumnValue } = useColumnValueRenderer();

const EMPTY_VALUE = "—";

interface DetailField {
  item: KeyValueItem;
  column: TableViewColumn;
}

const fields = computed<DetailField[]>(() =>
  (props.config.fields ?? []).flatMap((field) => {
    const column = props.rowProps.columns.find(
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
  const row = props.rowProps.row;
  if (get(row, column.accessorKey) === "") return EMPTY_VALUE;
  return renderColumnValue(column, row, "detail");
}

// The value slot renders a VNode tree; a functional wrapper keeps it in the
// template's flow.
const FieldValue = (fieldProps: { item: KeyValueItem }) =>
  renderField(fieldProps.item.id);
</script>

<template>
  <div
    v-if="props.loadState === 'loading'"
    class="grid min-w-0 gap-2"
    aria-busy="true"
  >
    <USkeleton
      :aria-label="t('dms.a11y.loading')"
      v-for="line in SKELETON_LINE_COUNT"
      :key="line"
      class="h-4 w-full max-w-md"
    />
  </div>
  <div
    v-else-if="props.loadState === 'error'"
    class="flex items-center justify-between gap-2"
    role="alert"
  >
    <p class="text-error flex min-w-0 items-center gap-1.5 text-[12.5px]">
      <UIcon name="i-ph-warning-circle" class="size-4 shrink-0" />
      <span class="truncate">{{ t("dms.table.load_error_title") }}</span>
    </p>
    <UButton
      :label="t('dms.table.load_error_retry')"
      icon="i-ph-arrows-clockwise"
      color="neutral"
      variant="outline"
      size="xs"
      @click="emit('retry')"
    />
  </div>
  <component
    :is="detailComponent"
    v-else-if="detailComponent"
    v-bind="{ ...(props.config.component?.options ?? {}), ...props.rowProps }"
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
