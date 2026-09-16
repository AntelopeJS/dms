<script setup lang="ts" generic="T extends Data">
import { injectLocal } from "@vueuse/core";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";
import type { ShallowRef } from "vue";

import type { TableSharedData, Data } from "./Table.vue";

const theme = tv({
  slots: {
    root: "max-h-72 overflow-y-auto",
    list: "p-1.5",
    item: "text-default hover:bg-accented/30 relative flex w-full cursor-pointer select-none items-center gap-1.5 rounded-sm py-1 pl-2 pr-1 text-sm outline-none group",
    itemLabel: "truncate",
    trailing: "ms-auto inline-flex items-center",
    trailingIcon: "size-4 text-dimmed",
    empty: "text-muted px-5 py-4 text-xs",
  },
});

const tableSharedData =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");

const { t } = useI18n();

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableMenuSort: Partial<typeof theme> };
};

const columns = computed(() =>
  (tableSharedData?.value?.labeledColumns.value || [])
    .filter((col) => col.column.getCanSort())
    .map((col) => ({
      id: col.column.id,
      label: col.label,
    })),
);

const sorting = computed(
  () => tableSharedData?.value?.sortingState.value || [],
);

const currentSort = computed(() => sorting.value[0]);

const SORT_ICONS = {
  asc: "i-ph-arrow-up",
  desc: "i-ph-arrow-down",
} as const;

function getSortIcon(columnId: string): string | undefined {
  if (currentSort.value?.id !== columnId) return undefined;
  return currentSort.value.desc ? SORT_ICONS.desc : SORT_ICONS.asc;
}

function toggleSort(columnId: string) {
  if (!tableSharedData?.value) return;

  const active = currentSort.value;
  const isSameColumn = active?.id === columnId;

  if (!isSameColumn) {
    tableSharedData.value.sortingState.value = [{ id: columnId, desc: false }];
    return;
  }

  if (!active.desc) {
    tableSharedData.value.sortingState.value = [{ id: columnId, desc: true }];
    return;
  }

  tableSharedData.value.sortingState.value = [];
}

const uiTableMenuSortVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableMenuSort || {}),
});
const uiTableMenuSort = computed(() => uiTableMenuSortVariant());
</script>

<template>
  <div :class="uiTableMenuSort.root()">
    <ul v-if="columns.length" :class="uiTableMenuSort.list()">
      <li
        v-for="column in columns"
        :key="column.id"
        :class="uiTableMenuSort.item()"
        @click="toggleSort(column.id)"
      >
        <div :class="uiTableMenuSort.itemLabel()">
          {{ column.label }}
        </div>
        <span :class="uiTableMenuSort.trailing()">
          <Icon
            v-if="getSortIcon(column.id)"
            :name="getSortIcon(column.id)!"
            :class="uiTableMenuSort.trailingIcon()"
          />
        </span>
      </li>
    </ul>

    <p v-else :class="uiTableMenuSort.empty()">
      {{ t("dms.sort.no_sorting") }}
    </p>
  </div>
</template>
