<script setup lang="ts" generic="T extends Data">
import { injectLocal } from "@vueuse/core";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";
import type { ShallowRef } from "vue";

import type { TableSharedData, Data, TableColumn } from "./Table.vue";
import {
  sortDirectionLabelKey,
  sortValueKind,
  type SortValueKind,
} from "../../composables/table-view/utils/sortableColumns";

const theme = tv({
  slots: {
    root: "max-h-72 overflow-y-auto",
    status:
      "border-b-default text-muted border-b px-3.5 py-2 text-xs leading-snug",
    statusColumn: "text-highlighted font-medium",
    statusDefault: "text-dimmed",
    list: "p-1.5",
    item: "text-default hover:bg-accented/30 relative flex w-full cursor-pointer select-none items-center gap-1.5 rounded-sm py-1 pl-2 pr-1 text-sm outline-none group",
    itemLabel: "truncate",
    trailing: "ms-auto inline-flex items-center",
    trailingIcon: "size-4 text-primary",
    trailingIconDefault: "size-4 text-dimmed",
    footer: "border-t-default border-t p-1.5",
    reset:
      "text-default hover:bg-accented/30 flex w-full cursor-pointer select-none items-center gap-1.5 rounded-sm py-1 pl-2 pr-1 text-sm outline-none",
    resetIcon: "text-dimmed size-4 shrink-0",
    empty: "text-muted px-5 py-4 text-xs",
  },
});

const tableSharedData =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");

const { t } = useI18n();

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableMenuSort: Partial<typeof theme> };
};

interface SortableColumnItem {
  id: string;
  label: string;
  kind: SortValueKind;
}

const columns = computed<SortableColumnItem[]>(() =>
  (tableSharedData?.value?.labeledColumns.value || [])
    .filter((col) => col.column.getCanSort())
    .map((col) => ({
      id: col.column.id,
      label: col.label,
      kind: sortValueKind(
        (col.column.columnDef as TableColumn<T>).type?.id as string | undefined,
      ),
    })),
);

const sorting = computed(
  () => tableSharedData?.value?.sortingState.value || [],
);

const currentSort = computed(() => sorting.value[0]);

const isUsingDefaultSort = computed(
  () => !!tableSharedData?.value?.isUsingDefaultSort.value,
);

// "Sorted by: Due date, oldest → newest · default". The default sort's field
// may not be a displayed column: the table view names it.
const sortStatus = computed(() => {
  const active = currentSort.value;
  if (!active) return undefined;
  const shared = tableSharedData?.value;
  const column = columns.value.find((col) => col.id === active.id);
  const isDefaultField = shared?.defaultSort?.field === active.id;
  const label =
    column?.label ??
    (isDefaultField ? shared?.defaultSortLabel : undefined) ??
    active.id;
  const kind =
    column?.kind ??
    (isDefaultField ? shared?.defaultSortKind : undefined) ??
    "text";
  return {
    column: label,
    direction: t(sortDirectionLabelKey(kind, !!active.desc)),
    isDefault: isUsingDefaultSort.value,
  };
});

// Offered while the user's sort replaces the table's default one.
const canResetToDefault = computed(
  () =>
    !!tableSharedData?.value?.defaultSort &&
    !!tableSharedData.value.hasCustomSort.value,
);

const SORT_ICONS = {
  asc: "i-ph-arrow-up",
  desc: "i-ph-arrow-down",
} as const;

function getSortIcon(columnId: string): string | undefined {
  if (currentSort.value?.id !== columnId) return undefined;
  return currentSort.value.desc ? SORT_ICONS.desc : SORT_ICONS.asc;
}

// Same cycle as the column headers: ascending, descending, then off.
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

function resetToDefault() {
  tableSharedData?.value?.resetSorting();
}

const uiTableMenuSortVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableMenuSort || {}),
});
const uiTableMenuSort = computed(() => uiTableMenuSortVariant());
</script>

<template>
  <div :class="uiTableMenuSort.root()">
    <p v-if="sortStatus" :class="uiTableMenuSort.status()">
      {{ t("dms.sort.sorted_by") }}
      <span :class="uiTableMenuSort.statusColumn()">
        {{ sortStatus.column }}
      </span>
      , {{ sortStatus.direction }}
      <span
        v-if="sortStatus.isDefault"
        :class="uiTableMenuSort.statusDefault()"
      >
        · {{ t("dms.sort.default_suffix") }}
      </span>
    </p>

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
            :class="
              isUsingDefaultSort
                ? uiTableMenuSort.trailingIconDefault()
                : uiTableMenuSort.trailingIcon()
            "
          />
        </span>
      </li>
    </ul>

    <p v-else :class="uiTableMenuSort.empty()">
      {{ t("dms.sort.no_sorting") }}
    </p>

    <div v-if="canResetToDefault" :class="uiTableMenuSort.footer()">
      <button
        type="button"
        :class="uiTableMenuSort.reset()"
        @click="resetToDefault"
      >
        <Icon
          name="i-ph-arrow-counter-clockwise"
          :class="uiTableMenuSort.resetIcon()"
        />
        {{ t("dms.sort.reset_default") }}
      </button>
    </div>
  </div>
</template>
