<script setup lang="ts">
// Example project-contributed table view display: a responsive card grid.
//
// It receives the single normalized `context` prop every display gets. It
// leaves `selfManagedData` unset in the page config (the default), so it
// consumes the shared list query and inherits search/filters/sorting/pagination
// for free.
//
// The context type is mirrored locally so this example stays decoupled from the
// dms package's internal type paths (same approach as KanbanTaskCard.vue).
interface ColumnMeta {
  id: string;
  header: string;
  accessorKey: string;
  listable?: boolean;
  type?: { id: string };
}

interface DisplayContext {
  items: Record<string, unknown>[];
  columns: ColumnMeta[];
  loading: boolean;
  labelKey?: string;
  rowIdKey: string;
  selection: {
    isSelected: (id: string) => boolean;
    toggle: (id: string, value?: boolean) => void;
  };
  pagination: {
    pageIndex: number;
    pageSize: number;
    total: number;
    setPage: (index: number) => void;
  };
  actions: {
    canAdd: boolean;
    canEdit: boolean;
    canDelete: boolean;
    add: () => void;
    edit: (item: Record<string, unknown>) => void;
    delete: (ids: string[]) => void;
  };
}

const props = defineProps<{ context: DisplayContext }>();

const { locale } = useI18n();

const getValue = (item: Record<string, unknown>, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc == null ? undefined : (acc as Record<string, unknown>)[key],
      item,
    );

const rowId = (item: Record<string, unknown>): string =>
  String(getValue(item, props.context.rowIdKey) ?? "");

const title = (item: Record<string, unknown>): string => {
  const value = props.context.labelKey
    ? getValue(item, props.context.labelKey)
    : undefined;
  return value !== undefined && value !== null && value !== ""
    ? String(value)
    : rowId(item);
};

const fieldColumns = computed(() =>
  props.context.columns
    .filter(
      (col) =>
        col.listable !== false && col.accessorKey !== props.context.labelKey,
    )
    .slice(0, 4),
);

const formatValue = (item: Record<string, unknown>, col: ColumnMeta): string => {
  const value = getValue(item, col.accessorKey);
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (col.type?.id === "date") {
    const date = new Date(value as string);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString(locale.value);
  }
  return String(value);
};

const pageCount = computed(() =>
  Math.max(
    1,
    Math.ceil(props.context.pagination.total / props.context.pagination.pageSize),
  ),
);
const currentPage = computed({
  get: () => props.context.pagination.pageIndex + 1,
  set: (page: number) => props.context.pagination.setPage(page - 1),
});
</script>

<template>
  <div class="mt-4">
    <div
      v-if="context.loading"
      class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <USkeleton v-for="n in 6" :key="n" class="h-32 w-full" />
    </div>

    <div
      v-else-if="context.items.length === 0"
      class="text-muted py-10 text-center text-sm"
    >
      No items
      <div v-if="context.actions.canAdd" class="mt-2">
        <UButton
          size="sm"
          icon="i-ph-plus"
          label="New"
          @click="context.actions.add()"
        />
      </div>
    </div>

    <div
      v-else
      class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div
        v-for="item in context.items"
        :key="rowId(item)"
        class="border-default bg-(--dms-surface-card) hover:border-primary group relative rounded-lg border p-4 transition-colors"
        :class="{
          'border-primary': context.selection.isSelected(rowId(item)),
          'cursor-pointer': context.actions.canEdit,
        }"
        @click="context.actions.canEdit && context.actions.edit(item)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <UCheckbox
              :model-value="context.selection.isSelected(rowId(item))"
              @click.stop
              @update:model-value="
                (value: unknown) =>
                  context.selection.toggle(rowId(item), Boolean(value))
              "
            />
            <p class="truncate text-sm font-semibold">{{ title(item) }}</p>
          </div>
          <UButton
            v-if="context.actions.canDelete"
            icon="i-ph-trash"
            color="error"
            variant="ghost"
            size="xs"
            square
            class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            @click.stop="context.actions.delete([rowId(item)])"
          />
        </div>

        <dl class="mt-3 space-y-1">
          <div
            v-for="col in fieldColumns"
            :key="col.id"
            class="flex justify-between gap-2 text-xs"
          >
            <dt class="text-muted shrink-0 truncate">{{ col.header }}</dt>
            <dd class="truncate">{{ formatValue(item, col) }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <div v-if="pageCount > 1" class="mt-4 flex justify-center">
      <UPagination
        v-model:page="currentPage"
        :total="context.pagination.total"
        :items-per-page="context.pagination.pageSize"
      />
    </div>
  </div>
</template>
