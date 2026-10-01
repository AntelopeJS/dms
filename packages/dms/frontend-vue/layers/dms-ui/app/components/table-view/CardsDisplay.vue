<script setup lang="ts" generic="T extends Record<string, unknown>">
import { get } from "@nuxt/ui/runtime/utils/index.js";
import TablePagination from "../../build/components/table/Pagination.vue";
import TableEmpty from "../../build/components/table/Empty.vue";
import type { TableViewColumn } from "../../composables/table-view/types/column";
import type { TableViewDisplayContext } from "../../composables/table-view/types/display";

interface CardsDisplayProps {
  context: TableViewDisplayContext<T>;
}

const props = defineProps<CardsDisplayProps>();

const MAX_CARD_FIELDS = 4;
const SKELETON_CARD_COUNT = 6;
const INITIALS_LENGTH = 2;
const EMPTY_VALUE = "—";

const { locale } = useI18n();
const { processI18n } = useTranslation();
const { getDataType } = useDataTypes();

const rowId = (item: T): string =>
  String(get(item, props.context.rowIdKey) ?? "");

const titleOf = (item: T): string => {
  const label = props.context.labelKey
    ? get(item, props.context.labelKey)
    : undefined;
  return label !== undefined && label !== null && label !== ""
    ? String(label)
    : rowId(item);
};

const initialsOf = (item: T): string =>
  titleOf(item)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, INITIALS_LENGTH)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

// The first listable columns besides the title make the card's field grid.
const fieldColumns = computed<TableViewColumn[]>(() =>
  props.context.columns
    .filter(
      (column) =>
        column.listable !== false &&
        column.accessorKey !== props.context.labelKey &&
        column.accessorKey !== props.context.rowIdKey,
    )
    .slice(0, MAX_CARD_FIELDS),
);

// A field renders the same way a table cell does: through the formatter of
// the column's data type (status pills, links, dates…).
const FieldValue = (fieldProps: { column: TableViewColumn; item: T }) => {
  const value = get(fieldProps.item, fieldProps.column.accessorKey);
  if (value === null || value === undefined || value === "") {
    return h("span", { class: "text-dimmed" }, EMPTY_VALUE);
  }
  const options = fieldProps.column.type.inputComponent?.options as
    | Record<string, unknown>
    | undefined;
  const formatter = getDataType(fieldProps.column.type.id)?.formatter;
  const rendered = formatter
    ? formatter.default(value, locale.value, options)
    : value;
  if (typeof rendered === "string" || typeof rendered === "number") {
    return h("span", { class: "truncate" }, String(rendered));
  }
  return rendered as ReturnType<typeof h>;
};

const openItem = (item: T) => {
  const { actions } = props.context;
  if (actions.canDetails) actions.details(item);
  else if (actions.canEditRow(item)) actions.edit(item);
};
</script>

<template>
  <div>
    <!-- v2 cards display: an auto-fill grid inside the table card, sharing
         its selection and its pagination footer. -->
    <div
      v-if="props.context.loading && props.context.items.length === 0"
      class="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 px-[18px] pt-4 pb-[18px]"
    >
      <USkeleton
        v-for="n in SKELETON_CARD_COUNT"
        :key="n"
        class="h-36 w-full rounded-[10px]"
      />
    </div>

    <TableEmpty
      v-else-if="props.context.items.length === 0"
      :can-add-row="props.context.actions.canAdd"
    />

    <div
      v-else
      class="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 px-[18px] pt-4 pb-[18px]"
    >
      <article
        v-for="item in props.context.items"
        :key="rowId(item)"
        class="group border-default hover:border-primary/35 cursor-pointer rounded-[10px] border bg-(--ui-bg) p-3.5 text-[12.5px] transition-colors"
        :class="{
          'border-primary ring-primary ring-1':
            props.context.selection.isSelected(rowId(item)),
        }"
        @click="openItem(item)"
      >
        <header class="flex items-center gap-2.5">
          <span
            class="bg-accented text-default grid size-7 shrink-0 place-items-center rounded-[7px] font-mono text-[10.5px] font-bold"
          >
            {{ initialsOf(item) }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-highlighted truncate text-[13px] font-semibold">
              {{ titleOf(item) }}
            </div>
            <div class="text-dimmed truncate font-mono text-[11px]">
              {{ rowId(item) }}
            </div>
          </div>
          <UCheckbox
            :model-value="props.context.selection.isSelected(rowId(item))"
            :aria-label="titleOf(item)"
            @click.stop
            @update:model-value="
              props.context.selection.toggle(rowId(item), !!$event)
            "
          />
        </header>

        <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
          <div v-for="column in fieldColumns" :key="column.id" class="min-w-0">
            <DmsEyebrow as="dt" truncate :label="processI18n(column.header)" />
            <dd class="text-default mt-0.5 flex min-w-0">
              <FieldValue :column="column" :item="item" />
            </dd>
          </div>
        </dl>
      </article>
    </div>

    <TablePagination />
  </div>
</template>
