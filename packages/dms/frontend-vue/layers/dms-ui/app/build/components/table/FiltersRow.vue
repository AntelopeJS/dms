<script setup lang="ts" generic="T extends Data">
import { injectLocal } from "@vueuse/core";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";
import type { ShallowRef } from "vue";
import type {
  Data,
  TableColumn,
  TableFilter,
  TableSharedData,
} from "./Table.vue";
import TableMenuFilter from "./MenuFilter.vue";

const theme = tv({
  slots: {
    root: "border-default bg-elevated/30 flex items-end gap-3 rounded-md border px-3 py-2 mt-3",
    list: "flex flex-wrap items-end gap-3",
    item: "relative flex min-w-40 flex-col gap-1",
    header: "flex items-center gap-1.5",
    label:
      "text-dimmed font-mono text-[10px] font-medium uppercase tracking-widest",
    mode: "text-muted text-[10px] not-italic normal-case",
    deleteManual: "size-4",
    inputWrapper: "w-full",
    inputDisplay:
      "text-default text-sm py-1.5 px-2 rounded-md border border-default bg-default min-h-9 flex items-center",
    actions: "ms-auto flex shrink-0 items-center gap-1.5 min-h-9",
    popover:
      "bg-default text-default ring-default w-72 rounded-sm shadow ring-1",
  },
});

const tableSharedData =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");
const { t } = useI18n();
const { processI18n } = useTranslation();

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableFiltersRow: Partial<typeof theme> };
};

const uiVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableFiltersRow || {}),
});
const ui = computed(() => uiVariant());

const filters = computed({
  get: () => tableSharedData?.value?.columnFiltersState.value || [],
  set: (val) => {
    if (tableSharedData?.value) {
      tableSharedData.value.columnFiltersState.value = val;
    }
  },
});

const columns = computed(() =>
  (tableSharedData?.value?.labeledColumns.value || []).map((col) => ({
    id: col.column.id,
    label: col.label,
    type: (col.column.columnDef as TableColumn<unknown>).type,
  })),
);

const getColumn = (accessorKey: string) =>
  columns.value.find((col) => col.id === accessorKey);

const resolveFilterComponent = (filter: TableFilter) => {
  const column = getColumn(filter.accessorKey);
  if (!column?.type) return null;
  const candidate =
    column.type.filterComponents?.[filter.mode] ||
    column.type.filterComponents?.default;
  if (!candidate || candidate === "noInput") return null;

  const opts = candidate.options;
  if (!opts) return candidate;

  const placeholder = isString(opts.placeholder)
    ? processI18n(opts.placeholder)
    : opts.placeholder;
  const items = Array.isArray(opts.items)
    ? opts.items.map((item) => {
        const obj = item as Record<string, unknown>;
        return {
          ...obj,
          label: isString(obj.label) ? processI18n(obj.label) : obj.label,
        };
      })
    : opts.items;

  return { ...candidate, options: { ...opts, placeholder, items } };
};

const resolveAsyncComponent = (componentName?: string) => {
  if (!componentName) return null;
  return resolveDmsComponent(componentName) || componentName;
};

const updateFilterValue = (index: number, value: unknown) => {
  const updated = [...filters.value];
  const current = updated[index];
  if (!current) return;
  updated[index] = { ...current, value };
  filters.value = updated;
};

const deleteFilter = (index: number) => {
  tableSharedData?.value?.deleteFilter(index);
};

const reset = () => {
  tableSharedData?.value?.resetFilters();
};

const addFilterOpen = ref(false);
</script>

<template>
  <div :class="ui.root()">
    <ul :class="ui.list()">
      <li
        v-for="(filter, index) in filters"
        :key="`${filter.accessorKey}-${index}`"
        :class="ui.item()"
      >
        <div :class="ui.header()">
          <span :class="ui.label()">
            {{ getColumn(filter.accessorKey)?.label }}
          </span>
          <span :class="ui.mode()">
            {{ t(`dms.table.compare_mode.${filter.mode}`) }}
          </span>
          <UButton
            v-if="!filter.pinned"
            :ui="{ base: ui.deleteManual() }"
            :icon="appConfig.ui.icons.close"
            :aria-label="t('dms.button.delete')"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            @click="deleteFilter(index)"
          />
        </div>

        <Suspense>
          <Component
            :is="
              resolveAsyncComponent(
                resolveFilterComponent(filter)?.componentName,
              )
            "
            v-if="resolveFilterComponent(filter)"
            :model-value="filter.value"
            :class="ui.inputWrapper()"
            v-bind="
              JSON.parse(
                JSON.stringify({
                  ...(resolveFilterComponent(filter)?.options || {}),
                }),
              )
            "
            @update:model-value="updateFilterValue(index, $event)"
          />
          <span v-else :class="ui.inputDisplay()">—</span>
        </Suspense>
      </li>
    </ul>

    <div :class="ui.actions()">
      <UPopover v-model:open="addFilterOpen">
        <UButton
          :icon="appConfig.ui.icons.plus"
          :label="t('dms.table.add_filter')"
          color="neutral"
          :variant="addFilterOpen ? 'soft' : 'ghost'"
          size="sm"
        />
        <template #content>
          <div :class="ui.popover()">
            <TableMenuFilter is-form-only @submit="addFilterOpen = false" />
          </div>
        </template>
      </UPopover>

      <UButton
        :label="t('dms.button.reset')"
        :icon="appConfig.ui.icons.close"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="reset"
      />
    </div>
  </div>
</template>
