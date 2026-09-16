<script setup lang="ts" generic="T extends Data">
import { injectLocal } from "@vueuse/core";

import type {
  Data,
  TableColumn,
  TableFilter,
  TableSharedData,
} from "./Table.vue";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";
import type { ShallowRef } from "vue";
import defu from "defu";
import type { SelectItem } from "@nuxt/ui";
import { formatFilterValue as formatFilterValueUtil } from "../../composables/table/utils/formatFilterValue";

const theme = tv({
  slots: {
    root: "divide-default divide-y",

    list: "px-3 py-2",
    item: "flex items-center justify-between gap-1.5 mt-1.5",
    filter: "truncate",
    compareMode: "text-dimmed lowercase",

    form: "px-3 py-2",
    input: "mt-2 w-full",

    formActions: "flex gap-2 mt-2",

    actions: "text-muted px-1.5 py-1",
    actionButton: "justify-start",
  },
});

interface MenuFilterProps {
  isFormOnly?: boolean;
}

const props = withDefaults(defineProps<MenuFilterProps>(), {
  isFormOnly: false,
});

const emit = defineEmits<{ submit: [] }>();

const tableSharedDataRef =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");
const tableSharedData = computed(() => tableSharedDataRef?.value);
const { getDataType } = useDataTypes();
const { t, locale } = useI18n();

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableMenuFilter: Partial<typeof theme> };
};

const usedAccessorKeys = computed(() => {
  const filtersValue = tableSharedData.value?.columnFiltersState.value || [];
  return new Set(filtersValue.map((f) => f.accessorKey));
});

const columns = computed(() =>
  (tableSharedData.value?.labeledColumns.value || [])
    .filter((col) => col.column.getCanFilter())
    .map((col) => ({
      value: col.column.id,
      label: col.label,
      type: (col.column.columnDef as TableColumn<unknown>).type,
    })),
);

const availableColumns = computed(() => {
  const editingKey =
    formState.value === "edit" ? filterForm.value.accessorKey : null;
  return columns.value.filter(
    (col) => col.value === editingKey || !usedAccessorKeys.value.has(col.value),
  );
});

const currentDataType = computed(() => {
  const column = columns.value.find(
    (col) => col.value === filterForm.value.accessorKey,
  );
  if (!column) {
    return null;
  }

  return column.type;
});

const getCompareModesForColumn = (columnId: string) => {
  const column = columns.value.find((col) => col.value === columnId);

  if (!column || !column.type) {
    return [];
  }

  if (!column.type.compareModes) {
    return [];
  }

  return column.type.compareModes.map((compareMode: string) => ({
    value: compareMode,
    label: t(`dms.table.compare_mode.${compareMode}`),
  }));
};

const tableCompareModes = computed(() => {
  if (!filterForm.value.accessorKey) {
    return [];
  }
  return getCompareModesForColumn(filterForm.value.accessorKey);
});

const currentInputComponent = computed(() => {
  if (!currentDataType.value) {
    return null;
  }

  const component =
    currentDataType.value.filterComponents?.[filterForm.value.mode] ||
    currentDataType.value.filterComponents?.["default"];

  if (component === "noInput") {
    return null;
  }

  return component;
});

const filters = computed(
  () => tableSharedData.value?.columnFiltersState.value || [],
);

const formState = ref<"idle" | "new" | "edit">("idle");

const filterForm = ref<TableFilter>({
  accessorKey: "",
  mode: "",
  value: undefined,
});

const resetForm = () => {
  formState.value = "idle";
  filterForm.value = {
    accessorKey: "",
    mode: "",
    value: undefined,
  };
};

const addFilter = () => {
  const filtersValue = tableSharedData.value?.columnFiltersState.value;

  if (!filtersValue || !currentDataType.value) return;

  const existingFilterIndex = filtersValue.findIndex(
    (f) => f.accessorKey === filterForm.value.accessorKey,
  );

  const value = unref(filterForm.value);

  if (
    currentInputComponent.value === null &&
    currentDataType.value.filterComponents?.[filterForm.value.mode] ===
      undefined
  ) {
    value.value = "";
  }

  if (existingFilterIndex > -1) {
    const existing = filtersValue[existingFilterIndex];
    filtersValue[existingFilterIndex] = {
      ...value,
      pinned: existing?.pinned,
      initialValue: existing?.initialValue,
    };
  } else {
    filtersValue.push({ ...value, pinned: false });
  }

  tableSharedData.value!.columnFiltersState.value = [...filtersValue];

  resetForm();

  if (props.isFormOnly) {
    emit("submit");
  }
};

const editFilter = (filter: TableFilter) => {
  formState.value = "edit";
  filterForm.value = defu(filter, {});
};

watch(
  () => filterForm.value.accessorKey,
  (newAccessor) => {
    if (newAccessor) {
      const availableModes = getCompareModesForColumn(newAccessor);
      const currentMode = filterForm.value.mode;
      const modeExists = availableModes.some(
        (mode: { value: string }) => mode.value === currentMode,
      );

      if (!modeExists && availableModes.length > 0) {
        const column = columns.value.find((col) => col.value === newAccessor);
        if (column && column.type) {
          const defaultMode = column.type.defaultCompareMode;
          if (
            defaultMode &&
            availableModes.some(
              (mode: { value: string }) => mode.value === defaultMode,
            )
          ) {
            filterForm.value.mode = defaultMode;
          } else {
            filterForm.value.mode = availableModes[0]?.value || "";
          }
        } else {
          filterForm.value.mode = availableModes[0]?.value || "";
        }
      }
    }
  },
);

watch(
  () => filters.value.length,
  (length) => {
    if (length === 0 && formState.value === "idle") {
      formState.value = "new";
    }
  },
  { immediate: true },
);

if (props.isFormOnly) {
  formState.value = "new";
}

const uiTableMenuFilterVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableMenuFilter || {}),
});
const uiTableMenuFilter = computed(() => uiTableMenuFilterVariant());

const formatFilterValue = (filter: TableFilter): string => {
  return formatFilterValueUtil(
    filter,
    columns.value,
    getDataType,
    locale.value,
  );
};
</script>

<template>
  <div :class="uiTableMenuFilter.root()">
    <ul v-if="!isFormOnly && filters.length" :class="uiTableMenuFilter.list()">
      <li
        v-for="(filter, index) in filters"
        :key="index"
        :class="uiTableMenuFilter.item()"
      >
        <UButton
          :ui="{ base: uiTableMenuFilter.filter() }"
          variant="outline"
          color="neutral"
          size="sm"
          @click="editFilter(filter)"
        >
          <span>
            {{ columns.find((x) => x.value === filter.accessorKey)?.label }}
          </span>
          <span :class="uiTableMenuFilter.compareMode()">
            {{ t(`dms.table.compare_mode.${filter.mode}`) }}
          </span>
          <span v-if="filter.value" class="truncate">
            {{ formatFilterValue(filter) }}
          </span>
        </UButton>

        <UButton
          :icon="appConfig.ui.icons.close"
          variant="ghost"
          color="neutral"
          size="xs"
          square
          @click="tableSharedData?.deleteFilter(index)"
        />
      </li>
    </ul>

    <form
      v-if="formState !== 'idle'"
      :class="uiTableMenuFilter.form()"
      @submit.prevent="addFilter"
    >
      <USelect
        id="filter-key"
        v-model="filterForm.accessorKey"
        :class="uiTableMenuFilter.input()"
        :placeholder="t('dms.table.filter_accessor')"
        :items="
          availableColumns.map((col) => ({
            value: col.value,
            label: col.label,
          })) as SelectItem[]
        "
      />

      <USelect
        id="filter-comparator"
        v-model="filterForm.mode"
        :class="uiTableMenuFilter.input()"
        :placeholder="t('dms.table.filter_comparator')"
        :items="tableCompareModes"
        :disabled="!filterForm.accessorKey"
      />

      <div :class="uiTableMenuFilter.formActions()">
        <UButton
          :label="t('dms.button.add')"
          :disabled="!filterForm.accessorKey"
          color="neutral"
          variant="outline"
          size="sm"
          type="submit"
          block
        />
        <UButton
          :disabled="!filterForm.accessorKey"
          icon="i-ph-trash"
          color="neutral"
          variant="outline"
          size="sm"
          type="reset"
          @click="resetForm"
        />
      </div>
    </form>

    <div
      v-if="!isFormOnly && (filters.length || formState === 'idle')"
      :class="uiTableMenuFilter.actions()"
    >
      <UButton
        v-if="formState === 'idle'"
        :icon="appConfig.ui.icons.plus"
        :ui="{ base: uiTableMenuFilter.actionButton() }"
        :label="t('dms.table.add_filter')"
        color="neutral"
        variant="ghost"
        size="sm"
        block
        @click="formState = 'new'"
      />
      <UButton
        v-if="filters.length"
        icon="i-ph-trash"
        :ui="{ base: uiTableMenuFilter.actionButton() }"
        :label="t('dms.table.delete_filters')"
        color="neutral"
        variant="ghost"
        size="sm"
        block
        @click="tableSharedData?.resetFilters"
      />
    </div>
  </div>
</template>
