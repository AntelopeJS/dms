<script setup lang="ts">
// Example project-contributed table view display: a responsive card grid.
//
// It receives the single normalized `context` prop every display gets. It
// leaves `selfManagedData` unset in the page config (the default), so it
// consumes the shared list query and inherits search/filters/sorting/pagination
// for free. It renders inside the table card, so the shared footer
// (`DmsPagination`) and empty state (`DmsEmpty`) plug straight in.
//
// The context type is mirrored locally so this example stays decoupled from the
// dms package's internal type paths (same approach as KanbanTaskCard.vue).
interface ColumnMeta {
  id: string;
  header: string;
  accessorKey: string;
  listable?: boolean;
  type?: { id: string; inputComponent?: { options?: unknown } };
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

const MAX_CARD_FIELDS = 4;
const SKELETON_CARD_COUNT = 6;
const INITIALS_LENGTH = 2;
const EMPTY_VALUE = "—";

const { locale } = useI18n();
const { processI18n } = useTranslation();
const { getDataType } = useDataTypes();

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

const initials = (item: Record<string, unknown>): string =>
  title(item)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, INITIALS_LENGTH)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

const fieldColumns = computed(() =>
  props.context.columns
    .filter(
      (col) =>
        col.listable !== false &&
        col.accessorKey !== props.context.labelKey &&
        col.accessorKey !== props.context.rowIdKey,
    )
    .slice(0, MAX_CARD_FIELDS),
);

// Values go through the column's data type formatter, like table cells do
// (status pills, links, dates, amounts).
const FieldValue = (fieldProps: {
  column: ColumnMeta;
  item: Record<string, unknown>;
}) => {
  const value = getValue(fieldProps.item, fieldProps.column.accessorKey);
  if (value === null || value === undefined || value === "") {
    return h("span", { class: "text-dimmed" }, EMPTY_VALUE);
  }
  const typeId = fieldProps.column.type?.id;
  const formatter = typeId ? getDataType(typeId)?.formatter : undefined;
  const rendered = formatter
    ? formatter.default(
        value,
        locale.value,
        fieldProps.column.type?.inputComponent?.options,
      )
    : value;
  if (typeof rendered === "string" || typeof rendered === "number") {
    return h("span", { class: "truncate" }, String(rendered));
  }
  return rendered as ReturnType<typeof h>;
};

const openItem = (item: Record<string, unknown>) => {
  if (props.context.actions.canEdit) props.context.actions.edit(item);
};
</script>

<template>
  <div>
    <div
      v-if="context.loading && context.items.length === 0"
      class="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 px-[18px] pt-4 pb-[18px]"
    >
      <USkeleton
        v-for="n in SKELETON_CARD_COUNT"
        :key="n"
        class="h-36 w-full rounded-[10px]"
      />
    </div>

    <DmsEmpty
      v-else-if="context.items.length === 0"
      :can-add-row="context.actions.canAdd"
    />

    <div
      v-else
      class="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 px-[18px] pt-4 pb-[18px]"
    >
      <article
        v-for="item in context.items"
        :key="rowId(item)"
        class="group border-default hover:border-primary/35 relative rounded-[10px] border bg-(--ui-bg) p-3.5 text-[12.5px] transition-colors"
        :class="{
          'border-primary ring-primary ring-1': context.selection.isSelected(
            rowId(item),
          ),
          'cursor-pointer': context.actions.canEdit,
        }"
        @click="openItem(item)"
      >
        <header class="flex items-center gap-2.5">
          <span
            class="grid size-7 shrink-0 place-items-center rounded-[7px] font-mono text-[10.5px] font-bold"
            :class="
              context.selection.isSelected(rowId(item))
                ? 'bg-primary/15 text-primary'
                : 'bg-accented text-default'
            "
          >
            {{ initials(item) }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-highlighted truncate text-[13px] font-semibold">
              {{ title(item) }}
            </div>
            <div class="text-dimmed truncate font-mono text-[11px]">
              #{{ rowId(item) }}
            </div>
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
          <UCheckbox
            :model-value="context.selection.isSelected(rowId(item))"
            :aria-label="title(item)"
            @click.stop
            @update:model-value="
              (value: unknown) =>
                context.selection.toggle(rowId(item), Boolean(value))
            "
          />
        </header>

        <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
          <div v-for="col in fieldColumns" :key="col.id" class="min-w-0">
            <dt
              class="text-dimmed truncate font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
            >
              {{ processI18n(col.header) }}
            </dt>
            <dd class="text-default mt-0.5 flex min-w-0">
              <FieldValue :column="col" :item="item" />
            </dd>
          </div>
        </dl>
      </article>
    </div>

    <DmsPagination />
  </div>
</template>
