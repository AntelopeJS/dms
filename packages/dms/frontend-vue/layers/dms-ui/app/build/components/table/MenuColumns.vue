<script setup lang="ts" generic="T extends Data">
import { injectLocal } from "@vueuse/core";
import type { Column } from "@tanstack/vue-table";
import { tv } from "tailwind-variants";
import type { ShallowRef } from "vue";

import type { TableSharedData, Data } from "./Table.vue";
import SortableList from "../sortable/SortableList.vue";

const theme = tv({
  slots: {
    root: "divide-default divide-y max-h-72 overflow-y-auto",

    list: "p-1.5",
    item: "text-default relative flex w-full cursor-default select-none items-center gap-1.5 py-1 pl-2 pr-1 text-sm",
    handler: "cursor-grab",
    checkbox: "text-sm grow",
    pinButton: "ms-auto",

    actions: "text-default px-1.5 py-1",
    actionButton: "justify-start",
  },
});

const tableSharedData =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");

const { t } = useI18n();

// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Module theme configuration is unchecked; retain its existing contract derived from this component's normalized theme.
const appConfig = useDmsAppConfig() as ReturnType<typeof useDmsAppConfig> & {
  ui: { tableMenuColumn: Partial<typeof theme> };
};

const order = computed(
  () => tableSharedData?.value?.columnOrderState.value || [],
);
const rawColumns = computed(
  () => tableSharedData?.value?.table.getAllColumns() || [],
);

const columns = computed(() => mapColumns());
type ListedColumn = (typeof columns.value)[number];

function applyColumnOrder(ordered: ListedColumn[]) {
  if (!tableSharedData?.value) return;
  tableSharedData.value.columnOrderState.value = [
    "select",
    ...ordered.map((col) => col.id),
    "actions",
  ];
}

const columnKey = (column: ListedColumn) => column.id;

function mapColumns() {
  return order.value
    .map((id) => rawColumns.value.find((col) => col.id === id))
    .filter((col): col is Column<T> => !!col?.columnDef.meta?.label)
    .map((col) => ({
      label: col.columnDef.meta!.label!,
      id: col.id,
      column: col,
    }));
}

function toggleColumnVisibility(
  column: Column<T>,
  visibility?: boolean | "indeterminate",
) {
  column.toggleVisibility(!!visibility);
}

const PIN_ICONS = {
  pinned: "i-ph-push-pin-fill",
  unpinned: "i-ph-push-pin",
} as const;

function togglePin(column: Column<T>) {
  column.pin(column.getIsPinned() ? false : "left");
}

function resetColumns() {
  if (!tableSharedData?.value) return;

  tableSharedData.value.columnOrderState.value =
    tableSharedData.value.table.getAllColumns().map((col) => col.id) || [];
}

const uiTableMenuColumnVariant = tv({
  extend: tv(theme),
  ...appConfig.ui?.tableMenuColumn,
});
const uiTableMenuColumn = computed(() => uiTableMenuColumnVariant());
</script>

<template>
  <div :class="uiTableMenuColumn.root()">
    <SortableList
      :list="columns"
      :item-key="columnKey"
      :class="uiTableMenuColumn.list()"
      handle="#column-handler"
      @update:list="applyColumnOrder"
    >
      <template #item="{ element: column }">
        <li :class="uiTableMenuColumn.item()">
          <UButton
            id="column-handler"
            icon="i-ph-dots-six-vertical"
            :ui="{ base: uiTableMenuColumn.handler() }"
            :aria-label="t('dms.table.organize_columns')"
            square
            color="neutral"
            variant="ghost"
            size="xs"
          />
          <UCheckbox
            :model-value="column.column.getIsVisible()"
            :ui="{ base: uiTableMenuColumn.checkbox() }"
            :label="column.label"
            @update:model-value="toggleColumnVisibility(column.column, $event)"
          />
          <UButton
            v-if="column.column.getCanPin()"
            :icon="
              column.column.getIsPinned()
                ? PIN_ICONS.pinned
                : PIN_ICONS.unpinned
            "
            :aria-label="
              t(
                column.column.getIsPinned()
                  ? 'dms.table.unpin_column'
                  : 'dms.table.pin_column',
              )
            "
            :ui="{ base: uiTableMenuColumn.pinButton() }"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            @click="togglePin(column.column)"
          />
        </li>
      </template>
    </SortableList>

    <div :class="uiTableMenuColumn.actions()">
      <UButton
        icon="i-ph-arrow-clockwise"
        :ui="{ base: uiTableMenuColumn.actionButton() }"
        :label="t('dms.table.reset_column_order')"
        color="neutral"
        variant="ghost"
        size="sm"
        block
        @click="resetColumns"
      />
    </div>
  </div>
</template>
