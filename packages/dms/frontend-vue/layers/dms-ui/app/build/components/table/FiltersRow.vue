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
import { formatFilterValue } from "../../composables/table/utils/formatFilterValue";
import { clearTableFiltersLabelKey } from "../../composables/table/utils/clearTableFilters";

// v2 filters band: a muted strip of segmented chips (field │ mode │ value │ ×);
// a chip opens its value editor in a popover.
const theme = tv({
  slots: {
    root: "flex flex-wrap items-center gap-2 border-b border-default bg-(--dms-bg-muted) py-2.5 ps-[18px] pe-3.5",
    list: "flex min-w-0 flex-wrap items-center gap-2",
    // A chip never outgrows the row: on a phone its compare mode and value
    // shrink to an ellipsis (the chip's tooltip spells them out).
    item: "flex h-7 max-w-full min-w-0 items-stretch divide-x divide-default overflow-hidden rounded-md border border-accented bg-(--ui-bg) text-[12.5px] shadow-xs has-[[data-state=open]]:border-primary has-[[data-state=open]]:ring-[3px] has-[[data-state=open]]:ring-primary/16",
    chip: "flex min-w-0 items-stretch divide-x divide-default hover:bg-elevated/60",
    label:
      "flex shrink-0 items-center gap-1.5 px-2 font-[550] whitespace-nowrap text-highlighted [&>svg]:size-3.5 [&>svg]:text-dimmed",
    mode: "min-w-0 shrink-[3] truncate px-2 font-mono text-[11px] leading-[26px] font-medium text-muted",
    value:
      "max-w-48 min-w-9 truncate px-2 leading-[26px] font-[550] text-primary",
    remove:
      "grid w-[26px] place-items-center text-dimmed hover:bg-elevated hover:text-highlighted [&>svg]:size-3.5",
    editor: "grid w-72 gap-2 p-3",
    editorLabel:
      "font-mono text-[10.5px] font-semibold tracking-[0.12em] text-dimmed uppercase",
    inputWrapper: "w-full",
    emptyValue: "text-muted",
    actions: "ms-auto flex shrink-0 items-center gap-1.5",
    popover: "w-72",
  },
  variants: {
    pinned: {
      true: { item: "border-dashed" },
    },
  },
});

const EMPTY_FILTER_VALUE = "—";

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

// The "clear all" action: offered while something narrows the rows, named
// after what it clears (filters, search or both).
const clearable = computed(
  () => tableSharedData?.value?.clearableFilters.value,
);
const canClear = computed(
  () => !!clearable.value?.filters || !!clearable.value?.search,
);
const reset = () => {
  tableSharedData?.value?.resetFilters();
};

const addFilterOpen = ref(false);

const { locale } = useI18n();
const { getDataType } = useDataTypes();

// Select-like filters show the option labels, not the raw stored values
// (their formatter renders a pill, which a chip can't hold).
const itemLabels = (filter: TableFilter): string | undefined => {
  const items = resolveFilterComponent(filter)?.options?.items;
  if (!Array.isArray(items) || filter.value === undefined) return undefined;
  const values = Array.isArray(filter.value) ? filter.value : [filter.value];
  const labels = values.map((value) => {
    const item = items.find(
      (candidate) => (candidate as { value?: unknown })?.value === value,
    ) as { label?: unknown } | undefined;
    return item?.label !== undefined ? String(item.label) : String(value);
  });
  return labels.length ? labels.join(", ") : undefined;
};

const displayValue = (filter: TableFilter): string => {
  const labels = itemLabels(filter);
  if (labels) return labels;
  const formatted = formatFilterValue(
    filter,
    columns.value.map((column) => ({ ...column, value: column.id })),
    getDataType,
    locale.value,
  );
  return formatted || EMPTY_FILTER_VALUE;
};

// The whole filter in words, for a chip shrunk to an ellipsis.
const chipTitle = (filter: TableFilter): string =>
  [
    getColumn(filter.accessorKey)?.label,
    t(`dms.table.compare_mode.${filter.mode}`),
    displayValue(filter),
  ]
    .filter(Boolean)
    .join(" · ");
</script>

<template>
  <div :class="ui.root()">
    <ul :class="ui.list()">
      <li
        v-for="(filter, index) in filters"
        :key="`${filter.accessorKey}-${index}`"
        :class="ui.item({ pinned: !!filter.pinned })"
      >
        <UPopover :content="{ align: 'start', sideOffset: 6 }">
          <button type="button" :class="ui.chip()" :title="chipTitle(filter)">
            <span :class="ui.label()">
              {{ getColumn(filter.accessorKey)?.label }}
            </span>
            <span :class="ui.mode()">
              {{ t(`dms.table.compare_mode.${filter.mode}`) }}
            </span>
            <span :class="ui.value()">{{ displayValue(filter) }}</span>
          </button>

          <template #content>
            <div :class="ui.editor()">
              <span :class="ui.editorLabel()">
                {{ getColumn(filter.accessorKey)?.label }} ·
                {{ t(`dms.table.compare_mode.${filter.mode}`) }}
              </span>
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
                <span v-else :class="ui.emptyValue()">
                  {{ EMPTY_FILTER_VALUE }}
                </span>
              </Suspense>
            </div>
          </template>
        </UPopover>

        <button
          v-if="!filter.pinned"
          type="button"
          :class="ui.remove()"
          :aria-label="t('dms.button.delete')"
          @click="deleteFilter(index)"
        >
          <UIcon :name="appConfig.ui.icons.close" />
        </button>
      </li>

      <li>
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
      </li>
    </ul>

    <div v-if="canClear && clearable" :class="ui.actions()">
      <UButton
        :label="t(clearTableFiltersLabelKey(clearable))"
        :icon="appConfig.ui.icons.close"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="reset"
      />
    </div>
  </div>
</template>
